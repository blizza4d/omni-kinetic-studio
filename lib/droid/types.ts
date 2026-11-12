/**
 * Omni-Kinetic Droid Morphology and Kinematic Contracts
 * 12-DOF Quadruped Specification under Varying Gravitational Regimes
 */

export type LegId = 'FL' | 'FR' | 'RL' | 'RR';

export type GaitState = 'stand' | 'walk' | 'bound' | 'turnInPlace' | 'stop' | 'stumbleRecover';

export type FootPhaseState = 'stance' | 'swing';

export interface LegMorphology {
  id: LegId;
  name: string;
  hipOffset: [number, number, number]; // [x, y, z] in body frame
  thighLength: number; // meters (0.22m)
  calfLength: number; // meters (0.22m)
  maxReach: number; // thighLength + calfLength (0.44m)
  phaseOffset: number; // Radians (0 for FL/RR, PI for FR/RL in trot)
  isLeft: boolean;
  isFront: boolean;
}

export interface JointState {
  name: string;
  angle: number; // Radians
  velocity: number; // rad/s
  torque?: number;
}

export interface FootTarget {
  id: LegId;
  state: FootPhaseState;
  worldPos: [number, number, number];
  localPos: [number, number, number];
  contact: boolean;
  phase: number;
  slipDistance: number;
}

export interface DroidKinematicState {
  bodyPos: [number, number, number];
  bodyQuat: [number, number, number, number];
  bodyLinearVel: [number, number, number];
  bodyAngularVel: [number, number, number];
  gaitState: GaitState;
  froudeNumber: number;
  cadenceHz: number;
  dutyFactor: number;
  joints: JointState[];
  feet: FootTarget[];
}

export interface LocomotionCommand {
  vx: number; // Forward velocity (m/s)
  vy?: number; // Vertical velocity (m/s)
  vz?: number; // Lateral velocity (m/s)
  yawRate: number; // Turn rate (rad/s)
  mode?: 'policy' | 'teleop' | 'stumble_recovery';
}

export const QUADRUPED_MORPHOLOGY: Record<LegId, LegMorphology> = {
  FL: {
    id: 'FL',
    name: 'Front-Left',
    hipOffset: [0.24, 0.0, -0.15],
    thighLength: 0.22,
    calfLength: 0.22,
    maxReach: 0.44,
    phaseOffset: 0.0,
    isLeft: true,
    isFront: true,
  },
  FR: {
    id: 'FR',
    name: 'Front-Right',
    hipOffset: [0.24, 0.0, 0.15],
    thighLength: 0.22,
    calfLength: 0.22,
    maxReach: 0.44,
    phaseOffset: Math.PI,
    isLeft: false,
    isFront: true,
  },
  RL: {
    id: 'RL',
    name: 'Rear-Left',
    hipOffset: [-0.24, 0.0, -0.15],
    thighLength: 0.22,
    calfLength: 0.22,
    maxReach: 0.44,
    phaseOffset: Math.PI,
    isLeft: true,
    isFront: false,
  },
  RR: {
    id: 'RR',
    name: 'Rear-Right',
    hipOffset: [-0.24, 0.0, 0.15],
    thighLength: 0.22,
    calfLength: 0.22,
    maxReach: 0.44,
    phaseOffset: 0.0,
    isLeft: false,
    isFront: false,
  },
};

export const STANDING_HEIGHT = 0.385; // Calibrated hip standing height in meters
