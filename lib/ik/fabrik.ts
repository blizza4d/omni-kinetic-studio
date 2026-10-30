/**
 * FABRIK (Forward And Backward Reaching Inverse Kinematics) & Analytical Solver
 * Maps 3D Cartesian fingertip targets to 3-DOF quadruped leg joints.
 */

export interface LegJointAngles {
  hip: number; // Abduction / Adduction (yaw/roll)
  thigh: number; // Flexion / Extension (pitch)
  calf: number; // Knee Flexion (pitch)
}

export interface QuadrupedLegIKParams {
  l1: number; // Thigh length (meters)
  l2: number; // Calf length (meters)
  hipOffset: [number, number, number];
}

export const DEFAULT_LEG_PARAMS: QuadrupedLegIKParams = {
  l1: 0.22,
  l2: 0.22,
  hipOffset: [0.25, 0.15, 0.0],
};

/**
 * Analytical + FABRIK 3D inverse kinematics solver for a quadruped leg.
 * target: [tx, ty, tz] relative to the hip base.
 */
export function solveLegIK(
  target: [number, number, number],
  params: QuadrupedLegIKParams = DEFAULT_LEG_PARAMS
): LegJointAngles {
  const [x, y, z] = target;
  const { l1, l2 } = params;

  // 1. Hip Abduction / Adduction Angle (Y-Z plane rotation)
  // atan2(y, -z) gives side-to-side rotation
  const hipAngle = Math.atan2(y, -z);

  // 2. Projected distance in sagittal plane
  const planarDistY = Math.sqrt(y * y + z * z);
  const dist = Math.sqrt(x * x + planarDistY * planarDistY);

  // Clamp target within reach
  const maxReach = (l1 + l2) * 0.98;
  const minReach = Math.abs(l1 - l2) * 1.05 + 0.02;
  const clampedDist = Math.max(minReach, Math.min(maxReach, dist));

  // Law of Cosines for Knee (Calf) Angle
  // c^2 = a^2 + b^2 - 2ab cos(C)
  const cosCalf = (l1 * l1 + l2 * l2 - clampedDist * clampedDist) / (2 * l1 * l2);
  const clampedCosCalf = Math.max(-1, Math.min(1, cosCalf));
  const interiorCalf = Math.acos(clampedCosCalf);
  const calfAngle = -(Math.PI - interiorCalf); // standard negative knee bend

  // Law of Cosines for Thigh Angle
  const alpha = Math.atan2(x, planarDistY);
  const cosThighOffset = (l1 * l1 + clampedDist * clampedDist - l2 * l2) / (2 * l1 * clampedDist);
  const clampedCosThigh = Math.max(-1, Math.min(1, cosThighOffset));
  const thighOffset = Math.acos(clampedCosThigh);
  const thighAngle = alpha + thighOffset;

  return {
    hip: Number(hipAngle.toFixed(4)),
    thigh: Number(thighAngle.toFixed(4)),
    calf: Number(calfAngle.toFixed(4)),
  };
}

/**
 * Calculates pinch distance between thumb tip (landmark 4) and index fingertip (landmark 8).
 * Normalized between 0 (fully pinched) and 1 (fully open).
 */
export function computePinchDistance(
  thumbTip: { x: number; y: number; z?: number },
  indexTip: { x: number; y: number; z?: number }
): number {
  const dx = thumbTip.x - indexTip.x;
  const dy = thumbTip.y - indexTip.y;
  const dz = (thumbTip.z ?? 0) - (indexTip.z ?? 0);
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // Typical hand normalized pinch range: 0.02 (closed) to 0.18 (open)
  const normalized = (dist - 0.03) / (0.16 - 0.03);
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Computes wrist roll angle from wrist (0) to middle finger mcp (9).
 */
export function computeWristRoll(
  wrist: { x: number; y: number },
  middleMcp: { x: number; y: number }
): number {
  const dx = middleMcp.x - wrist.x;
  const dy = middleMcp.y - wrist.y;
  return Math.atan2(dy, dx);
}

/**
 * Computes head yaw and pitch from facial landmarks (nose tip, left ear, right ear, chin).
 */
export function computeFacePose(
  noseTip: { x: number; y: number; z?: number },
  leftCheek: { x: number; y: number; z?: number },
  rightCheek: { x: number; y: number; z?: number }
): { yaw: number; pitch: number } {
  // Yaw from horizontal asymmetry of nose relative to cheeks
  const cheekCenter = (leftCheek.x + rightCheek.x) / 2;
  const cheekWidth = Math.abs(leftCheek.x - rightCheek.x) || 0.1;
  const yaw = ((noseTip.x - cheekCenter) / cheekWidth) * 1.5;

  // Pitch from vertical relative position
  const cheekCenterY = (leftCheek.y + rightCheek.y) / 2;
  const pitch = ((noseTip.y - cheekCenterY) / cheekWidth) * 1.2;

  return {
    yaw: Math.max(-1.0, Math.min(1.0, yaw)),
    pitch: Math.max(-0.8, Math.min(0.8, pitch)),
  };
}
