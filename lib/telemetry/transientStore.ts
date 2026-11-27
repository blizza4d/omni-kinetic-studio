/**
 * Non-Reactive Transient Robotics Store (60 Hz Physics -> 15-20 Hz Throttled UI)
 *
 * Isolates high-frequency simulation state from React's reconciliation tree:
 * - Mutated in-place by SimEngine at 60 Hz with zero GC heap churn
 * - UI consumers read via throttled 18 Hz subscriptions or direct getState()
 * - Tracks pose, quaternion, linear/angular velocities, pitch/roll, wheel slip,
 *   slope traction, suspension clamping, >30 deg tilt safety flag, and tier FPS
 */

export type WorkbenchPerformanceTier = 'high' | 'balanced' | 'low';

export interface TransientRoverState {
  timestampMs: number;
  step: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  linearVelocity: [number, number, number];
  angularVelocity: [number, number, number]; // [rollRate, pitchRate, yawRate] deg/s
  pitch: number; // degrees
  roll: number; // degrees
  yaw: number; // degrees
  wheelSlip: number; // m/s aggregate slip metric
  slopeDeg: number;
  slopeTractionFactor: number;
  groundContactCount: number;
  suspensionClamped: boolean;
  tiltWarning: boolean; // True when |pitch| > 30 deg, |roll| > 30 deg, or total tilt > 30 deg
  gravityMps2: number;
  eStopActive: boolean;
  performanceTier: WorkbenchPerformanceTier;
  mediapipeTargetFps: number;
}

export const PERFORMANCE_TIER_CONFIG: Record<
  WorkbenchPerformanceTier,
  { qualityTier: 'high' | 'medium' | 'low'; maxPixelRatio: number; shadows: boolean; mediapipeFps: number; label: string }
> = {
  high: { qualityTier: 'high', maxPixelRatio: 2, shadows: true, mediapipeFps: 30, label: 'High' },
  balanced: { qualityTier: 'medium', maxPixelRatio: 1.5, shadows: true, mediapipeFps: 18, label: 'Balanced' },
  low: { qualityTier: 'low', maxPixelRatio: 1, shadows: false, mediapipeFps: 10, label: 'Low' },
};

export type TransientSubscriber = (snapshot: TransientRoverState) => void;

export class TransientRoboticsStore {
  private static instance: TransientRoboticsStore | null = null;

  private readonly state: TransientRoverState = {
    timestampMs: 0,
    step: 0,
    position: [0, 0.385, 0],
    quaternion: [0, 0, 0, 1],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    pitch: 0,
    roll: 0,
    yaw: 0,
    wheelSlip: 0,
    slopeDeg: 0,
    slopeTractionFactor: 1.0,
    groundContactCount: 4,
    suspensionClamped: false,
    tiltWarning: false,
    gravityMps2: 1.62,
    eStopActive: false,
    performanceTier: 'high',
    mediapipeTargetFps: 30,
  };

  private readonly subscribers = new Set<TransientSubscriber>();
  private notifyTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  public static getInstance(): TransientRoboticsStore {
    if (!TransientRoboticsStore.instance) {
      TransientRoboticsStore.instance = new TransientRoboticsStore();
    }
    return TransientRoboticsStore.instance;
  }

  /**
   * Mutates transient state in-place at 60 Hz without triggering React renders.
   */
  public writePhysicsFrame(input: {
    timestampMs: number;
    step: number;
    pos: readonly [number, number, number];
    quat: readonly [number, number, number, number];
    vel: readonly [number, number, number];
    angVelDegS: readonly [number, number, number];
    pitchDeg: number;
    rollDeg: number;
    yawDeg: number;
    wheelSlip: number;
    slopeDeg: number;
    slopeTractionFactor: number;
    groundContactCount: number;
    suspensionClamped: boolean;
    gravityMps2: number;
    eStopActive: boolean;
  }): void {
    const s = this.state;
    s.timestampMs = input.timestampMs;
    s.step = input.step;
    s.position[0] = input.pos[0];
    s.position[1] = input.pos[1];
    s.position[2] = input.pos[2];
    s.quaternion[0] = input.quat[0];
    s.quaternion[1] = input.quat[1];
    s.quaternion[2] = input.quat[2];
    s.quaternion[3] = input.quat[3];
    s.linearVelocity[0] = input.vel[0];
    s.linearVelocity[1] = input.vel[1];
    s.linearVelocity[2] = input.vel[2];
    s.angularVelocity[0] = input.angVelDegS[0];
    s.angularVelocity[1] = input.angVelDegS[1];
    s.angularVelocity[2] = input.angVelDegS[2];
    s.pitch = input.pitchDeg;
    s.roll = input.rollDeg;
    s.yaw = input.yawDeg;
    s.wheelSlip = input.wheelSlip;
    s.slopeDeg = input.slopeDeg;
    s.slopeTractionFactor = input.slopeTractionFactor;
    s.groundContactCount = input.groundContactCount;
    s.suspensionClamped = input.suspensionClamped;
    s.tiltWarning =
      Math.abs(input.pitchDeg) > 30 ||
      Math.abs(input.rollDeg) > 30 ||
      Math.hypot(input.pitchDeg, input.rollDeg) > 30;
    s.gravityMps2 = input.gravityMps2;
    s.eStopActive = input.eStopActive;
  }

  public setPerformanceTier(tier: WorkbenchPerformanceTier): void {
    this.state.performanceTier = tier;
    this.state.mediapipeTargetFps = PERFORMANCE_TIER_CONFIG[tier].mediapipeFps;
  }

  public getState(): TransientRoverState {
    return this.state;
  }

  public getSnapshotCopy(): TransientRoverState {
    const s = this.state;
    return {
      ...s,
      position: [s.position[0], s.position[1], s.position[2]],
      quaternion: [s.quaternion[0], s.quaternion[1], s.quaternion[2], s.quaternion[3]],
      linearVelocity: [s.linearVelocity[0], s.linearVelocity[1], s.linearVelocity[2]],
      angularVelocity: [s.angularVelocity[0], s.angularVelocity[1], s.angularVelocity[2]],
    };
  }

  /**
   * Subscribes UI listeners on a fixed 18 Hz (~55 ms) throttle independent of 60 FPS WebGL ticks.
   */
  public subscribeThrottled(cb: TransientSubscriber, hz = 18): () => void {
    this.subscribers.add(cb);
    if (!this.notifyTimer) {
      const intervalMs = Math.max(50, Math.round(1000 / Math.max(10, Math.min(20, hz))));
      this.notifyTimer = setInterval(() => {
        if (this.subscribers.size === 0) return;
        const copy = this.getSnapshotCopy();
        for (const sub of this.subscribers) {
          sub(copy);
        }
      }, intervalMs);
    }

    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0 && this.notifyTimer) {
        clearInterval(this.notifyTimer);
        this.notifyTimer = null;
      }
    };
  }
}
