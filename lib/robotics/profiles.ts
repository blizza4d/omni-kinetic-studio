/**
 * Multi-Robot Profile Registry & Hardware Spec Abstraction
 *
 * Defines unified physical, kinematic, sensor-mount, and safety-envelope parameters
 * across multiple robotic platforms:
 * - Omni-Quadruped Scout (12-DOF Baseline — preserves canonical golden gait)
 * - Lunar Rover (4WD Differential Rocker-Bogie)
 * - Agile Lab Bot (Compact Indoor High-Agility Platform)
 */

export type RobotProfileId = 'quadruped_scout' | 'lunar_rover_4wd' | 'agile_lab_bot';

export type LocomotionArchitecture = 'quadruped' | 'differential_4wd' | 'compact_quadruped';

export interface RobotDimensions {
  lengthM: number;
  widthM: number;
  heightM: number;
  clearanceM: number;
  standingHeightM: number;
}

export interface SensorMountSpec {
  lidar: {
    offsetLocal: [number, number, number]; // [x fwd, y up, z right] in meters
    defaultRays: number;
    defaultFovDeg: number;
    defaultRangeM: number;
  };
  camera: {
    offsetLocal: [number, number, number];
    lookAheadLocal: [number, number, number];
    fovDeg: number;
  };
}

export interface SafetyEnvelopeLimits {
  tiltWarningDeg: number;
  tiltCriticalDeg: number;
  maxSafePitchDeg: number;
  maxSafeRollDeg: number;
  maxSafeSpeedMps: number;
  minObstacleClearanceM: number;
}

export interface RobotProfile {
  id: RobotProfileId;
  name: string;
  shortLabel: string;
  description: string;
  locomotionType: LocomotionArchitecture;
  dimensions: RobotDimensions;
  massKg: number;
  maxTorqueNm: number;
  maxLinearVelMps: number;
  maxBackwardVelMps: number;
  maxLateralVelMps: number;
  maxAngularVelRadS: number;
  wheelbaseM: number;
  trackWidthM: number;
  wheelRadiusM: number; // Used by 4WD differential kinematics and wheel rotation animation
  actuatorCount: number;
  sensorMounts: SensorMountSpec;
  safetyLimits: SafetyEnvelopeLimits;
  visualStyle: {
    chassisColor: number;
    accentColor: number;
    visorColor: number;
    scaleFactor: number;
  };
}

export const PROFILE_QUADRUPED_SCOUT: RobotProfile = {
  id: 'quadruped_scout',
  name: 'Omni-Quadruped Scout (12-DOF)',
  shortLabel: 'Scout 12-DOF',
  description: 'Canonical 12-DOF legged lunar explorer. Baseline golden-gait compliance with articulated torque servos.',
  locomotionType: 'quadruped',
  dimensions: {
    lengthM: 0.65,
    widthM: 0.28,
    heightM: 0.44,
    clearanceM: 0.24,
    standingHeightM: 0.385,
  },
  massKg: 18.0,
  maxTorqueNm: 45.0,
  maxLinearVelMps: 2.2,
  maxBackwardVelMps: 1.0,
  maxLateralVelMps: 0.9,
  maxAngularVelRadS: 2.2,
  wheelbaseM: 0.48,
  trackWidthM: 0.30,
  wheelRadiusM: 0.032,
  actuatorCount: 12,
  sensorMounts: {
    lidar: {
      offsetLocal: [0.32, 0.14, 0],
      defaultRays: 48,
      defaultFovDeg: 210,
      defaultRangeM: 15.0,
    },
    camera: {
      offsetLocal: [0.38, 0.04, 0],
      lookAheadLocal: [6.0, -0.35, 0],
      fovDeg: 68,
    },
  },
  safetyLimits: {
    tiltWarningDeg: 15.0,
    tiltCriticalDeg: 25.0,
    maxSafePitchDeg: 24.0,
    maxSafeRollDeg: 22.0,
    maxSafeSpeedMps: 2.2,
    minObstacleClearanceM: 0.45,
  },
  visualStyle: {
    chassisColor: 0x383836,
    accentColor: 0x6b705c,
    visorColor: 0x8ea48c,
    scaleFactor: 1.0,
  },
};

export const PROFILE_LUNAR_ROVER_4WD: RobotProfile = {
  id: 'lunar_rover_4wd',
  name: 'Lunar Rover (4WD Differential)',
  shortLabel: 'Lunar 4WD',
  description: 'High-payload 4-wheel differential regolith rover with mast stereo cam, dome LiDAR, and 65 N·m hub motors.',
  locomotionType: 'differential_4wd',
  dimensions: {
    lengthM: 0.84,
    widthM: 0.56,
    heightM: 0.46,
    clearanceM: 0.16,
    standingHeightM: 0.28,
  },
  massKg: 42.0,
  maxTorqueNm: 65.0,
  maxLinearVelMps: 1.85,
  maxBackwardVelMps: 1.2,
  maxLateralVelMps: 0.0, // Non-holonomic differential drive
  maxAngularVelRadS: 1.8,
  wheelbaseM: 0.58,
  trackWidthM: 0.52,
  wheelRadiusM: 0.15,
  actuatorCount: 4,
  sensorMounts: {
    lidar: {
      offsetLocal: [0.22, 0.22, 0],
      defaultRays: 72,
      defaultFovDeg: 270,
      defaultRangeM: 18.0,
    },
    camera: {
      offsetLocal: [0.26, 0.34, 0], // Elevated mast cam
      lookAheadLocal: [6.5, -0.38, 0],
      fovDeg: 74,
    },
  },
  safetyLimits: {
    tiltWarningDeg: 18.0,
    tiltCriticalDeg: 28.0,
    maxSafePitchDeg: 26.0,
    maxSafeRollDeg: 24.0,
    maxSafeSpeedMps: 1.85,
    minObstacleClearanceM: 0.58,
  },
  visualStyle: {
    chassisColor: 0xd8d5cc,
    accentColor: 0xd97706,
    visorColor: 0x38bdf8,
    scaleFactor: 1.0,
  },
};

export const PROFILE_AGILE_LAB_BOT: RobotProfile = {
  id: 'agile_lab_bot',
  name: 'Agile Lab Bot (Compact Indoor)',
  shortLabel: 'Lab Bot',
  description: 'Lightweight compact indoor quadruped tuned for tight obstacle slalom, precision docking, and fast agile turns.',
  locomotionType: 'compact_quadruped',
  dimensions: {
    lengthM: 0.46,
    widthM: 0.23,
    heightM: 0.34,
    clearanceM: 0.18,
    standingHeightM: 0.30,
  },
  massKg: 11.5,
  maxTorqueNm: 28.0,
  maxLinearVelMps: 2.55,
  maxBackwardVelMps: 1.4,
  maxLateralVelMps: 1.15,
  maxAngularVelRadS: 3.1,
  wheelbaseM: 0.34,
  trackWidthM: 0.22,
  wheelRadiusM: 0.026,
  actuatorCount: 12,
  sensorMounts: {
    lidar: {
      offsetLocal: [0.18, 0.12, 0],
      defaultRays: 48,
      defaultFovDeg: 240,
      defaultRangeM: 12.0,
    },
    camera: {
      offsetLocal: [0.24, 0.04, 0],
      lookAheadLocal: [5.0, -0.25, 0],
      fovDeg: 78,
    },
  },
  safetyLimits: {
    tiltWarningDeg: 14.0,
    tiltCriticalDeg: 22.0,
    maxSafePitchDeg: 20.0,
    maxSafeRollDeg: 18.0,
    maxSafeSpeedMps: 2.55,
    minObstacleClearanceM: 0.34,
  },
  visualStyle: {
    chassisColor: 0x22272e,
    accentColor: 0xe67e22,
    visorColor: 0x22d3ee,
    scaleFactor: 0.76,
  },
};

export const ROBOT_PROFILES: Record<RobotProfileId, RobotProfile> = {
  quadruped_scout: PROFILE_QUADRUPED_SCOUT,
  lunar_rover_4wd: PROFILE_LUNAR_ROVER_4WD,
  agile_lab_bot: PROFILE_AGILE_LAB_BOT,
};

export const ROBOT_PROFILE_LIST: readonly RobotProfile[] = [
  PROFILE_QUADRUPED_SCOUT,
  PROFILE_LUNAR_ROVER_4WD,
  PROFILE_AGILE_LAB_BOT,
];

export const DEFAULT_ROBOT_PROFILE: RobotProfile = PROFILE_QUADRUPED_SCOUT;

export function getRobotProfile(id: RobotProfileId | string): RobotProfile {
  if (id in ROBOT_PROFILES) {
    return ROBOT_PROFILES[id as RobotProfileId];
  }
  return DEFAULT_ROBOT_PROFILE;
}
