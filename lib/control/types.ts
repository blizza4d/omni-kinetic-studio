/**
 * Unified Locomotion Command & Control Architecture Types (v2)
 *
 * Single command contract between ALL input sources (policy, keyboard, gamepad,
 * touch, pointer, click-to-move, CV teleop, replay, scripts) and the gait controller.
 */

export type GaitMode = 'auto' | 'walk' | 'trot' | 'bound' | 'pronk';

export type ControlSource =
  | 'policy'
  | 'keyboard'
  | 'gamepad'
  | 'touch'
  | 'pointer'
  | 'cv'
  | 'replay'
  | 'script';

export interface LocomotionCommand {
  vx: number;         // forward speed, m/s, body frame (+X)
  vy: number;         // lateral speed, m/s, body frame (+Z right, -Z left)
  yawRate: number;    // rad/s (+CCW / left turn in Y-up right-handed frame)
  bodyHeight: number; // 0..1 crouch to tall, 0.5 default
  gait: GaitMode;
  hop: boolean;       // edge-triggered hop launch request
  hopCharge: number;  // 0..1 normalized hop charge (0 = tap, 1 = full 0.6s charge)
  stop: boolean;      // emergency stop / recover request
}

export interface CommandFrame {
  step: number;
  source: ControlSource;
  cmd: LocomotionCommand;
}

export interface SafetyEvent {
  step: number;
  time: number;
  kind: 'edge_attenuation' | 'tilt_clamp' | 'speed_cap' | 'nan_rejected' | 'emergency_stop';
  severity: 'warn' | 'info';
  message: string;
}

export interface Waypoint {
  id: string;
  x: number;
  z: number;
  label?: string;
  reachable?: boolean;
  maxSlopeDeg?: number;
}

export interface ControlArbiterSnapshot {
  activeSource: ControlSource;
  isManual: boolean;
  modeLabel: string;
  blendWeight: number; // 0 = autonomous, 1 = manual
  emergencyStop: boolean;
  lastManualTimeSec: number;
}

export function createNeutralCommand(gait: GaitMode = 'auto'): LocomotionCommand {
  return {
    vx: 0,
    vy: 0,
    yawRate: 0,
    bodyHeight: 0.5,
    gait,
    hop: false,
    hopCharge: 0,
    stop: false,
  };
}

export function cloneCommand(src: LocomotionCommand, dst?: LocomotionCommand): LocomotionCommand {
  if (dst) {
    dst.vx = src.vx;
    dst.vy = src.vy;
    dst.yawRate = src.yawRate;
    dst.bodyHeight = src.bodyHeight;
    dst.gait = src.gait;
    dst.hop = src.hop;
    dst.hopCharge = src.hopCharge;
    dst.stop = src.stop;
    return dst;
  }
  return { ...src };
}
