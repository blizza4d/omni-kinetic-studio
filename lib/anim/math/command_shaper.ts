/**
 * Locomotion Command Shaper & Rate Limiter
 * 
 * Protects actuators and maintains visual fluidity:
 * - Deadzone filtering
 * - Critically damped spring rate-limiting on velocity and yaw rate
 * - Gravity-scaled traction and acceleration ceilings (a_max = mu * g)
 * - NaN / Infinity rejection
 * - Smooth teleop-to-policy blending
 */

import { LocomotionCommand } from '@/lib/droid/types';
import { SpringState, springDamper } from './spring';

export interface CommandShaperOptions {
  velHalfLife?: number;    // seconds (nominal 0.10s)
  yawHalfLife?: number;    // seconds (nominal 0.08s)
  frictionCoeff?: number;  // surface friction coefficient (nominal 0.70)
  deadzone?: number;       // deadband threshold (nominal 0.02)
}

export class LocomotionCommandShaper {
  private vxSpring: SpringState = { x: 0, v: 0 };
  private vySpring: SpringState = { x: 0, v: 0 };
  private yawSpring: SpringState = { x: 0, v: 0 };

  // Teleop blend weight spring (0.0 = policy, 1.0 = teleop)
  private blendSpring: SpringState = { x: 0, v: 0 };

  constructor(private readonly opts: CommandShaperOptions = {}) {
    this.opts.velHalfLife = opts.velHalfLife ?? 0.10;
    this.opts.yawHalfLife = opts.yawHalfLife ?? 0.08;
    this.opts.frictionCoeff = opts.frictionCoeff ?? 0.70;
    this.opts.deadzone = opts.deadzone ?? 0.02;
  }

  /**
   * Shape raw command into a smooth, dynamically achievable command.
   * 
   * @param raw Raw input command
   * @param gravity Live simulation gravity in m/s^2
   * @param dt Frame delta time in seconds
   */
  public shape(
    raw: LocomotionCommand,
    gravity = 1.62,
    dt = 1.0 / 60.0
  ): LocomotionCommand {
    if (dt <= 0) return { vx: this.vxSpring.x, vy: this.vySpring.x, yawRate: this.yawSpring.x };

    // 1. Sanitize NaN / Infinity
    let inVx = isFinite(raw.vx) ? raw.vx : 0;
    let inVy = isFinite(raw.vy ?? 0) ? (raw.vy ?? 0) : 0;
    let inYaw = isFinite(raw.yawRate) ? raw.yawRate : 0;

    // 2. Deadzone Thresholding
    const dz = this.opts.deadzone ?? 0.02;
    if (Math.abs(inVx) < dz) inVx = 0;
    if (Math.abs(inVy) < dz) inVy = 0;
    if (Math.abs(inYaw) < dz) inYaw = 0;

    // 3. Gravity-Aware Acceleration Ceilings: a_max = mu * g
    const mu = this.opts.frictionCoeff ?? 0.70;
    const aMax = Math.max(0.5, mu * gravity);

    // 4. Critically Damped Spring Smoothing
    springDamper(this.vxSpring, inVx, 0, this.opts.velHalfLife ?? 0.10, dt);
    springDamper(this.vySpring, inVy, 0, this.opts.velHalfLife ?? 0.10, dt);
    springDamper(this.yawSpring, inYaw, 0, this.opts.yawHalfLife ?? 0.08, dt);

    // Clamp acceleration slope
    const maxDeltaV = aMax * dt;
    const currentVx = this.vxSpring.x;
    const clampedVx = Math.max(-2.5, Math.min(2.5, currentVx));

    return {
      vx: clampedVx,
      vy: this.vySpring.x,
      yawRate: Math.max(-2.0, Math.min(2.0, this.yawSpring.x)),
      mode: raw.mode,
    };
  }

  public reset(): void {
    this.vxSpring = { x: 0, v: 0 };
    this.vySpring = { x: 0, v: 0 };
    this.yawSpring = { x: 0, v: 0 };
    this.blendSpring = { x: 0, v: 0 };
  }
}
