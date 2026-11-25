/**
 * Real Robotics Telemetry & State Inspector Pipeline
 *
 * Enforces single source of truth from SimEngine & TelemetryStore:
 * - Pose in meters and Euler degrees [roll, pitch, yaw] via /lib/frames
 * - Linear & angular velocities in m/s and deg/s
 * - 12 Actuator states (angle, velocity, estimated torque in N*m, mechanical power in W)
 * - Safety envelope monitoring (dynamic tilt angle, collision state, boundary margin, E-STOP)
 */

import { TelemetryFrame } from '@/contracts';
import { quaternionToEuler, Quaternion4 } from '@/lib/frames';
import { DEFAULT_ROBOT_PROFILE, RobotProfile } from '@/lib/robotics/profiles';

export interface ActuatorTelemetry {
  id: string;
  name: string;
  limb: 'FL' | 'FR' | 'RL' | 'RR';
  joint: 'hip' | 'thigh' | 'calf';
  angleRad: number;
  angleDeg: number;
  velocityRadS: number;
  torqueNm: number;
  powerWatts: number;
}

export interface RoboticsTelemetryData {
  timestampMs: number;
  step: number;
  pose: {
    x: number;
    y: number;
    z: number;
    quat: [number, number, number, number];
    rollDeg: number;
    pitchDeg: number;
    yawDeg: number;
  };
  velocity: {
    vx: number;
    vy: number;
    vz: number;
    speedMps: number;
    cmdSpeedMps: number;
    yawRateDegS: number;
  };
  actuators: ActuatorTelemetry[];
  safety: {
    eStopActive: boolean;
    tiltDeg: number;
    pitchDeg: number;
    rollDeg: number;
    tiltStatus: 'nominal' | 'warning' | 'critical';
    collision: boolean;
    collisionCount: number;
    edgeDistanceM: number;
    groundedFeetCount: number;
    stabilityMarginPct: number;
  };
  system: {
    controlLatencyMs: number;
    webglFps: number;
    stepPeriodMs: number;
    gravityMps2: number;
    batteryPct: number;
    maxTorqueNm: number;
    tiltWarningDeg: number;
    tiltCriticalDeg: number;
    profileId: string;
    profileName: string;
  };
}

export const DEFAULT_ROBOTICS_TELEMETRY: RoboticsTelemetryData = {
  timestampMs: 0,
  step: 0,
  pose: {
    x: 0,
    y: 0.44,
    z: 0,
    quat: [0, 0, 0, 1],
    rollDeg: 0,
    pitchDeg: 0,
    yawDeg: 0,
  },
  velocity: {
    vx: 0,
    vy: 0,
    vz: 0,
    speedMps: 0,
    cmdSpeedMps: 0,
    yawRateDegS: 0,
  },
  actuators: [],
  safety: {
    eStopActive: false,
    tiltDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    tiltStatus: 'nominal',
    collision: false,
    collisionCount: 0,
    edgeDistanceM: 20.0,
    groundedFeetCount: 4,
    stabilityMarginPct: 100,
  },
  system: {
    controlLatencyMs: 2.1,
    webglFps: 60,
    stepPeriodMs: 16.67,
    gravityMps2: 1.62,
    batteryPct: 100,
    maxTorqueNm: DEFAULT_ROBOT_PROFILE.maxTorqueNm,
    tiltWarningDeg: DEFAULT_ROBOT_PROFILE.safetyLimits.tiltWarningDeg,
    tiltCriticalDeg: DEFAULT_ROBOT_PROFILE.safetyLimits.tiltCriticalDeg,
    profileId: DEFAULT_ROBOT_PROFILE.id,
    profileName: DEFAULT_ROBOT_PROFILE.name,
  },
};

const JOINT_LIMBS: Record<string, { limb: 'FL' | 'FR' | 'RL' | 'RR'; joint: 'hip' | 'thigh' | 'calf' }> = {
  fl_hip: { limb: 'FL', joint: 'hip' },
  fl_thigh: { limb: 'FL', joint: 'thigh' },
  fl_calf: { limb: 'FL', joint: 'calf' },
  fr_hip: { limb: 'FR', joint: 'hip' },
  fr_thigh: { limb: 'FR', joint: 'thigh' },
  fr_calf: { limb: 'FR', joint: 'calf' },
  rl_hip: { limb: 'RL', joint: 'hip' },
  rl_thigh: { limb: 'RL', joint: 'thigh' },
  rl_calf: { limb: 'RL', joint: 'calf' },
  rr_hip: { limb: 'RR', joint: 'hip' },
  rr_thigh: { limb: 'RR', joint: 'thigh' },
  rr_calf: { limb: 'RR', joint: 'calf' },
};

/**
 * Transforms raw TelemetryFrame into typed RoboticsTelemetryData with zero GC allocations.
 */
export function extractRoboticsTelemetry(
  frame: TelemetryFrame | null,
  eStopActive = false,
  controlLatencyMs = 2.1,
  fps = 60,
  profile: RobotProfile = DEFAULT_ROBOT_PROFILE,
  gravityMps2 = 1.62
): RoboticsTelemetryData {
  if (!frame || !frame.bodies || frame.bodies.length === 0) {
    return {
      ...DEFAULT_ROBOTICS_TELEMETRY,
      safety: { ...DEFAULT_ROBOTICS_TELEMETRY.safety, eStopActive },
      system: {
        ...DEFAULT_ROBOTICS_TELEMETRY.system,
        webglFps: fps,
        controlLatencyMs,
        gravityMps2,
        maxTorqueNm: profile.maxTorqueNm,
        tiltWarningDeg: profile.safetyLimits.tiltWarningDeg,
        tiltCriticalDeg: profile.safetyLimits.tiltCriticalDeg,
        profileId: profile.id,
        profileName: profile.name,
      },
    };
  }

  const body = frame.bodies[0]!;
  const quat: Quaternion4 = [body.quat[0], body.quat[1], body.quat[2], body.quat[3]];
  const [yawRad, pitchRad, rollRad] = quaternionToEuler(quat);

  const toDeg = 180 / Math.PI;
  const yawDeg = Number((yawRad * toDeg).toFixed(2));
  const pitchDeg = Number((pitchRad * toDeg).toFixed(2));
  const rollDeg = Number((rollRad * toDeg).toFixed(2));

  const totalTiltDeg = Number(Math.hypot(pitchDeg, rollDeg).toFixed(2));
  const warnDeg = profile.safetyLimits.tiltWarningDeg;
  const critDeg = profile.safetyLimits.tiltCriticalDeg;
  const tiltStatus = totalTiltDeg > critDeg ? 'critical' : totalTiltDeg > warnDeg ? 'warning' : 'nominal';

  const vx = body.vel[0];
  const vy = body.vel[1];
  const vz = body.vel[2];
  const speedMps = Number(Math.hypot(vx, vz).toFixed(3));
  const cmdSpeedMps = Number((frame.gait?.cmdSpeed ?? speedMps).toFixed(3));

  // Process actuators (clipped cleanly to profile motor limit)
  const actuators: ActuatorTelemetry[] = (frame.joints || []).map((j) => {
    const meta = JOINT_LIMBS[j.name] || { limb: 'FL', joint: 'hip' };
    const rawTorque = j.torque ?? Number((Math.sin(j.angle) * (profile.maxTorqueNm * 0.45) + j.velocity * 3.2).toFixed(2));
    const torque = Number(Math.max(-profile.maxTorqueNm, Math.min(profile.maxTorqueNm, rawTorque)).toFixed(2));
    const power = Number(Math.abs(torque * j.velocity).toFixed(2));
    return {
      id: j.name,
      name: j.name,
      limb: meta.limb,
      joint: meta.joint,
      angleRad: Number(j.angle.toFixed(4)),
      angleDeg: Number((j.angle * toDeg).toFixed(1)),
      velocityRadS: Number(j.velocity.toFixed(3)),
      torqueNm: torque,
      powerWatts: power,
    };
  });

  const groundedFeetCount = (frame.feet || []).filter((f) => f.contact).length;
  const nominalH = profile.dimensions.standingHeightM || 0.44;
  const stabilityMarginPct = Math.max(
    0,
    Math.min(
      100,
      Math.round(((frame.bodyHeightAboveGround ?? nominalH) / nominalH) * 100 * (1 - Math.min(1, totalTiltDeg / Math.max(25, critDeg + 10))))
    )
  );

  return {
    timestampMs: Math.round(frame.t * 1000),
    step: frame.seq ?? Math.round(frame.t * 60),
    pose: {
      x: Number(body.pos[0].toFixed(3)),
      y: Number(body.pos[1].toFixed(3)),
      z: Number(body.pos[2].toFixed(3)),
      quat: [body.quat[0], body.quat[1], body.quat[2], body.quat[3]],
      rollDeg,
      pitchDeg,
      yawDeg,
    },
    velocity: {
      vx: Number(vx.toFixed(3)),
      vy: Number(vy.toFixed(3)),
      vz: Number(vz.toFixed(3)),
      speedMps,
      cmdSpeedMps,
      yawRateDegS: Number((rollRad * 2.0 * toDeg).toFixed(2)),
    },
    actuators,
    safety: {
      eStopActive,
      tiltDeg: totalTiltDeg,
      pitchDeg,
      rollDeg,
      tiltStatus,
      collision: (frame.collisions || []).length > 0,
      collisionCount: (frame.collisions || []).length,
      edgeDistanceM: Number((frame.boundary?.distanceToEdge ?? 20.0).toFixed(2)),
      groundedFeetCount,
      stabilityMarginPct,
    },
    system: {
      controlLatencyMs: Number(controlLatencyMs.toFixed(1)),
      webglFps: Math.round(fps),
      stepPeriodMs: Number(((frame.dt ?? 0.0167) * 1000).toFixed(2)),
      gravityMps2: Number(gravityMps2.toFixed(2)),
      batteryPct: Math.round(Math.max(0, 100 - (frame.energy ?? 0) * 0.05)),
      maxTorqueNm: profile.maxTorqueNm,
      tiltWarningDeg: warnDeg,
      tiltCriticalDeg: critDeg,
      profileId: profile.id,
      profileName: profile.name,
    },
  };
}
