/**
 * Command Shaping, Gravity-Aware Traction Limits, and Safety Layer (v2)
 *
 * Every command from ANY source (policy, manual, replay, script) passes through
 * CommandShaper.shape() before reaching the gait controller.
 *
 * Hot path is strictly zero-allocation and NaN-proof.
 */

import { LocomotionCommand, SafetyEvent, createNeutralCommand } from './types';

export interface ShapeParams {
  maxForward: number;      // m/s
  maxBackward: number;     // m/s
  maxLateral: number;      // m/s
  maxYawRate: number;      // rad/s
  frictionMu: number;      // surface friction coefficient (default 0.8)
  realism: number;         // 0 = arcade responsive, 1 = strict lunar traction
  deadzone: number;        // 0..1 analog stick deadzone
  halfLifeVel: number;     // s, velocity exponential approach half-life
  halfLifeYaw: number;     // s, yaw rate half-life
  halfLifeHeight: number;  // s, crouch/stand height half-life
  arenaHalfExtent: number; // m (default 18.0)
  edgeWarnMargin: number;  // m (default 4.0)
  maxSafeTiltRad: number;  // rad (~0.45 rad = 25.8 deg)
  speedLimiter: number;    // 0.3..1.0 accessibility / assist multiplier
  brakeAssist: boolean;    // strong edge braking assist
}

export const DEFAULT_SHAPE_PARAMS: ShapeParams = {
  maxForward: 2.2,
  maxBackward: 1.0,
  maxLateral: 0.9,
  maxYawRate: 2.2,
  frictionMu: 0.8,
  realism: 0.5,
  deadzone: 0.15,
  halfLifeVel: 0.08,
  halfLifeYaw: 0.07,
  halfLifeHeight: 0.12,
  arenaHalfExtent: 18.0,
  edgeWarnMargin: 4.0,
  maxSafeTiltRad: 0.45,
  speedLimiter: 1.0,
  brakeAssist: true,
};

export interface SafetyContext {
  x: number;
  z: number;
  heading: number;
  gravity: number;
  tiltRad: number;
  stabilityMargin: number;
  step: number;
  time: number;
}

/**
 * Radial deadzone with smooth rescale from 0 at the deadzone edge to 1 at full deflection.
 */
export function radialDeadzone(
  x: number,
  y: number,
  dz: number,
  out: { x: number; y: number }
): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const safeDz = Math.max(0, Math.min(0.9, dz));
  const m = Math.hypot(x, y);
  if (m <= safeDz || m < 1e-9) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const s = (Math.min(m, 1) - safeDz) / (1 - safeDz) / m;
  out.x = x * s;
  out.y = y * s;
}

/**
 * Frame-rate independent exponential approach.
 */
export function approach(current: number, target: number, halfLife: number, dt: number): number {
  if (dt <= 0) return current;
  const a = 1 - Math.exp((-Math.LN2 * dt) / Math.max(halfLife, 1e-5));
  return current + (target - current) * a;
}

/**
 * Slew limiter: caps maximum rate of change per second.
 */
export function slew(current: number, target: number, maxRate: number, dt: number): number {
  if (dt <= 0) return current;
  const d = target - current;
  const step = Math.max(0, maxRate) * dt;
  return Math.abs(d) <= step ? target : current + Math.sign(d) * step;
}

/**
 * Computes gravity-aware acceleration limit (m/s^2) blended between arcade and realistic traction.
 */
export function computeGravityAccelLimit(gravity: number, frictionMu: number, realism: number): number {
  const g = Math.max(0.2, Math.min(25.0, Number.isFinite(gravity) ? Math.abs(gravity) : 1.62));
  const mu = Math.max(0.1, Math.min(2.0, frictionMu));
  const r = Math.max(0, Math.min(1, realism));
  const realisticAccel = Math.max(0.9, mu * g * 1.4); // floor keeps lunar driving responsive
  const arcadeAccel = 6.5;
  return arcadeAccel * (1 - r) + realisticAccel * r;
}

export class CommandShaper {
  public params: ShapeParams;
  private curVx = 0;
  private curVy = 0;
  private curYaw = 0;
  private curHeight = 0.5;
  private lastWarnStep = -120;
  private readonly safetyEvents: SafetyEvent[] = [];
  private readonly maxSafetyEvents = 200;

  constructor(params?: Partial<ShapeParams>) {
    this.params = { ...DEFAULT_SHAPE_PARAMS, ...(params || {}) };
  }

  public reset(): void {
    this.curVx = 0;
    this.curVy = 0;
    this.curYaw = 0;
    this.curHeight = 0.5;
    this.lastWarnStep = -120;
  }

  public getSafetyEvents(): readonly SafetyEvent[] {
    return this.safetyEvents;
  }

  public clearSafetyEvents(): void {
    this.safetyEvents.length = 0;
  }

  private pushSafety(
    ctx: SafetyContext,
    kind: SafetyEvent['kind'],
    message: string,
    severity: 'warn' | 'info' = 'warn'
  ): void {
    // Rate-limit repetitive safety warnings to once every 60 ticks (1s)
    if (ctx.step - this.lastWarnStep < 60 && kind !== 'emergency_stop') return;
    this.lastWarnStep = ctx.step;
    this.safetyEvents.push({
      step: ctx.step,
      time: ctx.time,
      kind,
      severity,
      message,
    });
    if (this.safetyEvents.length > this.maxSafetyEvents) {
      this.safetyEvents.shift();
    }
  }

  /**
   * Shape, rate-limit, and safety-filter raw command into `out` (zero allocations).
   */
  public shape(
    raw: LocomotionCommand,
    ctx: SafetyContext,
    dt: number,
    out: LocomotionCommand = createNeutralCommand()
  ): LocomotionCommand {
    // 1. Validate finite inputs (reject NaN / Infinity)
    const badInput =
      !Number.isFinite(raw.vx) ||
      !Number.isFinite(raw.vy) ||
      !Number.isFinite(raw.yawRate) ||
      !Number.isFinite(raw.bodyHeight);

    if (badInput) {
      this.pushSafety(ctx, 'nan_rejected', 'Non-finite command rejected by safety layer.');
    }

    let targetVx = Number.isFinite(raw.vx) ? raw.vx : 0;
    let targetVy = Number.isFinite(raw.vy) ? raw.vy : 0;
    let targetYaw = Number.isFinite(raw.yawRate) ? raw.yawRate : 0;
    let targetHeight = Number.isFinite(raw.bodyHeight) ? Math.max(0, Math.min(1, raw.bodyHeight)) : 0.5;
    let hop = Boolean(raw.hop);
    let hopCharge = Number.isFinite(raw.hopCharge) ? Math.max(0, Math.min(1, raw.hopCharge)) : 0;

    // 2. Emergency stop overrides everything
    if (raw.stop) {
      targetVx = 0;
      targetVy = 0;
      targetYaw = 0;
      hop = false;
      hopCharge = 0;
      this.pushSafety(ctx, 'emergency_stop', 'Emergency stop engaged — settling to neutral stance.', 'info');
    }

    // 3. Clamp to speed limits (with accessibility speed limiter)
    const lim = Math.max(0.25, Math.min(1.0, this.params.speedLimiter));
    targetVx = Math.max(-this.params.maxBackward * lim, Math.min(this.params.maxForward * lim, targetVx));
    targetVy = Math.max(-this.params.maxLateral * lim, Math.min(this.params.maxLateral * lim, targetVy));
    targetYaw = Math.max(-this.params.maxYawRate * lim, Math.min(this.params.maxYawRate * lim, targetYaw));

    // 4. Safety Layer: Arena Edge Attenuation (smooth starting edgeWarnMargin from rim)
    const edgeDistX = this.params.arenaHalfExtent - Math.abs(ctx.x);
    const edgeDistZ = this.params.arenaHalfExtent - Math.abs(ctx.z);
    const distToEdge = Math.min(edgeDistX, edgeDistZ);

    if (distToEdge < this.params.edgeWarnMargin) {
      const fwdX = Math.cos(ctx.heading);
      const fwdZ = -Math.sin(ctx.heading);
      const rightX = Math.sin(ctx.heading);
      const rightZ = Math.cos(ctx.heading);

      const worldVx = fwdX * targetVx + rightX * targetVy;
      const worldVz = fwdZ * targetVx + rightZ * targetVy;

      // Dot product with outward direction (positive = moving further toward edge)
      const outX = Math.abs(ctx.x) >= Math.abs(ctx.z) ? Math.sign(ctx.x) : 0;
      const outZ = Math.abs(ctx.z) > Math.abs(ctx.x) ? Math.sign(ctx.z) : 0;
      const outwardVel = worldVx * outX + worldVz * outZ;

      if (outwardVel > 0) {
        const margin = Math.max(0.01, this.params.edgeWarnMargin);
        const factor = this.params.brakeAssist
          ? Math.max(0, Math.min(1, (distToEdge - 0.5) / (margin - 0.5)))
          : Math.max(0.15, Math.min(1, distToEdge / margin));
        targetVx *= factor;
        targetVy *= factor;
        if (distToEdge < 1.5) hop = false;
        this.pushSafety(
          ctx,
          'edge_attenuation',
          `Arena edge proximity (${Math.max(0, distToEdge).toFixed(1)}m): attenuating outward velocity.`
        );
      }
    }

    // 5. Safety Layer: Tilt & Stability Margin Speed Cap
    if (Math.abs(ctx.tiltRad) > this.params.maxSafeTiltRad || ctx.stabilityMargin < 0.2) {
      const capFactor = Math.abs(ctx.tiltRad) > this.params.maxSafeTiltRad ? 0.45 : 0.65;
      targetVx *= capFactor;
      targetVy *= capFactor;
      hop = false;
      this.pushSafety(
        ctx,
        Math.abs(ctx.tiltRad) > this.params.maxSafeTiltRad ? 'tilt_clamp' : 'speed_cap',
        `High tilt (${((ctx.tiltRad * 180) / Math.PI).toFixed(1)} deg) — capping locomotion speed.`
      );
    }

    // 6. Exponential smoothing + Gravity-aware slew limiting
    const smoothedVx = approach(this.curVx, targetVx, this.params.halfLifeVel, dt);
    const smoothedVy = approach(this.curVy, targetVy, this.params.halfLifeVel, dt);
    const smoothedYaw = approach(this.curYaw, targetYaw, this.params.halfLifeYaw, dt);
    const smoothedHeight = approach(this.curHeight, targetHeight, this.params.halfLifeHeight, dt);

    const maxAccel = computeGravityAccelLimit(ctx.gravity, this.params.frictionMu, this.params.realism);
    const maxYawAccel = 9.0;

    // Emergency stop uses stronger braking deceleration
    const brakeBoost = raw.stop ? 2.2 : 1.0;
    this.curVx = slew(this.curVx, smoothedVx, maxAccel * brakeBoost, dt);
    this.curVy = slew(this.curVy, smoothedVy, maxAccel * brakeBoost, dt);
    this.curYaw = slew(this.curYaw, smoothedYaw, maxYawAccel * brakeBoost, dt);
    this.curHeight = smoothedHeight;

    // 7. Write into output command (zero allocation)
    out.vx = this.curVx;
    out.vy = this.curVy;
    out.yawRate = this.curYaw;
    out.bodyHeight = this.curHeight;
    out.gait = raw.gait;
    out.hop = hop;
    out.hopCharge = hopCharge;
    out.stop = raw.stop;
    return out;
  }
}
