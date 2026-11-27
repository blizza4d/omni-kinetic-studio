/**
 * Stabilized MediaPipe Gesture Teleop Controller
 *
 * Implements:
 * - Exponential Moving Average (EMA) smoothing filter to suppress landmark jitter
 * - Configurable radial/axis deadzone with smooth linear rescaling
 * - Signal-Loss Failsafe (>300ms): smoothly ramps linear/angular velocities to zero
 *   when hand confidence drops below threshold or hand leaves camera frame
 */

export interface GestureFilterConfig {
  emaAlpha: number; // 0.05..0.95 (higher = faster response, lower = smoother)
  deadzone: number; // 0..0.4
  minConfidence: number; // 0..1 (default 0.6)
  failsafeTimeoutMs: number; // default 300 ms
  maxLinearVelMps: number; // default 1.5 m/s
  maxAngularVelRadS: number; // default 1.8 rad/s
}

export const DEFAULT_GESTURE_FILTER_CONFIG: GestureFilterConfig = {
  emaAlpha: 0.28,
  deadzone: 0.08,
  minConfidence: 0.6,
  failsafeTimeoutMs: 300,
  maxLinearVelMps: 1.5,
  maxAngularVelRadS: 1.8,
};

export interface GestureControlOutput {
  throttle: number; // normalized [-1..1]
  steering: number; // normalized [-1..1]
  vx: number; // m/s
  yawRate: number; // rad/s
  signalValid: boolean;
  failsafeActive: boolean;
  signalLostMs: number;
}

function applyDeadzone(val: number, dz: number): number {
  const abs = Math.abs(val);
  if (abs <= dz) return 0;
  const clampedDz = Math.min(0.85, Math.max(0, dz));
  const scaled = (Math.min(1, abs) - clampedDz) / (1 - clampedDz);
  return Math.sign(val) * Math.max(0, Math.min(1, scaled));
}

export class GestureTeleopStabilizer {
  private config: GestureFilterConfig;
  private emaThrottle = 0;
  private emaSteering = 0;
  private lastValidSignalMs = 0;
  private lastStepMs = 0;
  private hasSeenValid = false;

  constructor(config?: Partial<GestureFilterConfig>) {
    this.config = { ...DEFAULT_GESTURE_FILTER_CONFIG, ...(config || {}) };
  }

  public updateConfig(patch: Partial<GestureFilterConfig>): void {
    this.config = {
      ...this.config,
      ...patch,
      emaAlpha: Math.max(0.05, Math.min(0.95, patch.emaAlpha ?? this.config.emaAlpha)),
      deadzone: Math.max(0, Math.min(0.45, patch.deadzone ?? this.config.deadzone)),
      failsafeTimeoutMs: Math.max(50, Math.min(2000, patch.failsafeTimeoutMs ?? this.config.failsafeTimeoutMs)),
    };
  }

  public getConfig(): GestureFilterConfig {
    return { ...this.config };
  }

  public reset(): void {
    this.emaThrottle = 0;
    this.emaSteering = 0;
    this.lastValidSignalMs = 0;
    this.lastStepMs = 0;
    this.hasSeenValid = false;
  }

  /**
   * Processes raw hand displacement [-1..1] with confidence and timestamp in ms.
   */
  public step(input: {
    rawThrottle: number; // +1 forward, -1 backward
    rawSteering: number; // +1 left turn, -1 right turn
    handPresent: boolean;
    confidence: number;
    nowMs: number;
  }): GestureControlOutput {
    const dtSec = this.lastStepMs > 0 ? Math.max(0.001, Math.min(0.25, (input.nowMs - this.lastStepMs) / 1000)) : 0.033;
    this.lastStepMs = input.nowMs;

    const signalValid = input.handPresent && input.confidence >= this.config.minConfidence;

    if (signalValid) {
      this.lastValidSignalMs = input.nowMs;
      this.hasSeenValid = true;

      const dzT = applyDeadzone(Math.max(-1, Math.min(1, input.rawThrottle)), this.config.deadzone);
      const dzS = applyDeadzone(Math.max(-1, Math.min(1, input.rawSteering)), this.config.deadzone);

      const a = this.config.emaAlpha;
      this.emaThrottle = a * dzT + (1 - a) * this.emaThrottle;
      this.emaSteering = a * dzS + (1 - a) * this.emaSteering;

      return {
        throttle: Number(this.emaThrottle.toFixed(3)),
        steering: Number(this.emaSteering.toFixed(3)),
        vx: Number((this.emaThrottle * this.config.maxLinearVelMps).toFixed(3)),
        yawRate: Number((this.emaSteering * this.config.maxAngularVelRadS).toFixed(3)),
        signalValid: true,
        failsafeActive: false,
        signalLostMs: 0,
      };
    }

    // Signal lost or low confidence
    const signalLostMs = this.hasSeenValid ? Math.max(0, input.nowMs - this.lastValidSignalMs) : this.config.failsafeTimeoutMs + 1;
    const failsafeActive = signalLostMs > this.config.failsafeTimeoutMs;

    if (failsafeActive) {
      // Smooth exponential ramp-to-zero over ~0.18s so actuators settle cleanly without jerk
      const decay = Math.exp(-dtSec * 14.0);
      this.emaThrottle = Math.abs(this.emaThrottle) < 0.004 ? 0 : this.emaThrottle * decay;
      this.emaSteering = Math.abs(this.emaSteering) < 0.004 ? 0 : this.emaSteering * decay;
    }

    return {
      throttle: Number(this.emaThrottle.toFixed(3)),
      steering: Number(this.emaSteering.toFixed(3)),
      vx: Number((this.emaThrottle * this.config.maxLinearVelMps).toFixed(3)),
      yawRate: Number((this.emaSteering * this.config.maxAngularVelRadS).toFixed(3)),
      signalValid: false,
      failsafeActive,
      signalLostMs: Math.round(signalLostMs),
    };
  }
}
