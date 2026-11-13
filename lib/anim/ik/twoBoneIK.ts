/**
 * Analytical Two-Bone Inverse Kinematics with Soft Extension Limiting & Pole Vector
 * 
 * Features:
 * - Exponential soft extension limiter prevents knee popping near singularities
 * - Stable pole vector alignment prevents knee flipping
 * - Zero allocations on hot paths (scratch vectors preallocated)
 */

import { Vector3, Matrix4, Quaternion } from 'three';

const _dir = new Vector3();
const _perp = new Vector3();
const _tmp = new Vector3();
const _kneeRel = new Vector3();
const _footRel = new Vector3();
const _mat = new Matrix4();

export interface TwoBoneResult {
  knee: Vector3;
  foot: Vector3;
  reach: number;
  extension: number;
  hipAngle: number;   // Lateral roll
  thighAngle: number; // Sagittal pitch
  calfAngle: number;  // Sagittal knee flexion
}

/**
 * Solve positional two-bone IK chain.
 * 
 * @param hip Chain root position in world or body frame
 * @param target Desired foot position in same frame
 * @param pole Knee bend direction hint (unit vector)
 * @param l1 Upper link (thigh) length
 * @param l2 Lower link (calf) length
 * @param softness Fraction of reach used for soft limiting (0.0 to 0.3)
 * @param out Output result object
 */
export function solveTwoBone(
  hip: Vector3,
  target: Vector3,
  pole: Vector3,
  l1: number,
  l2: number,
  softness = 0.15,
  out?: TwoBoneResult
): TwoBoneResult {
  const result: TwoBoneResult = out || {
    knee: new Vector3(),
    foot: new Vector3(),
    reach: l1 + l2,
    extension: 0,
    hipAngle: 0,
    thighAngle: 0,
    calfAngle: 0,
  };

  const reachMax = l1 + l2;
  const reachMin = Math.abs(l1 - l2) + 1e-4;

  _dir.subVectors(target, hip);
  let dist = _dir.length();

  if (dist < 1e-6) {
    _dir.set(0, -1, 0);
    dist = reachMin;
  } else {
    _dir.multiplyScalar(1.0 / dist);
  }

  // Soft clamp near full extension: exponential decay prevents knee popping
  const softStart = reachMax * (1.0 - softness);
  if (softness > 0 && dist > softStart) {
    const span = reachMax - softStart;
    dist = softStart + span * (1.0 - Math.exp(-(dist - softStart) / span));
  }
  dist = Math.min(Math.max(dist, reachMin), reachMax - 1e-4);

  // Law of cosines: hip-knee-foot triangle
  let cosA = (l1 * l1 + dist * dist - l2 * l2) / (2.0 * l1 * dist);
  cosA = Math.min(1.0, Math.max(-1.0, cosA));
  const sinA = Math.sqrt(Math.max(0.0, 1.0 - cosA * cosA));

  // Knee bend plane: perpendicular component of pole vector to hip->target axis
  _perp.copy(pole);
  _perp.addScaledVector(_dir, -_perp.dot(_dir));

  if (_perp.lengthSq() < 1e-8) {
    // Pole collinear with axis: select stable perpendicular fallback
    _perp.set(1, 0, 0);
    _perp.addScaledVector(_dir, -_perp.dot(_dir));
    if (_perp.lengthSq() < 1e-8) {
      _perp.set(0, 0, 1);
      _perp.addScaledVector(_dir, -_perp.dot(_dir));
    }
  }
  _perp.normalize();

  // Knee position
  result.knee.copy(hip)
    .addScaledVector(_dir, l1 * cosA)
    .addScaledVector(_perp, l1 * sinA);

  // Foot position actually reached
  _tmp.copy(_dir).multiplyScalar(dist);
  result.foot.copy(hip).add(_tmp);
  result.reach = reachMax;
  result.extension = dist / reachMax;

  // Joint Angles for 12-DOF Quadruped
  // In body frame: +X = forward, +Y = up, +Z = right
  const dx = target.x - hip.x;
  const dy = target.y - hip.y;
  const dz = target.z - hip.z;

  // 1. Hip Roll (Y-Z plane)
  result.hipAngle = Math.atan2(dz, -dy);

  // 2. Calf (Knee Flexion) via Law of Cosines
  let cosKnee = (l1 * l1 + l2 * l2 - dist * dist) / (2.0 * l1 * l2);
  cosKnee = Math.min(0.9999, Math.max(-0.9999, cosKnee));
  result.calfAngle = -(Math.PI - Math.acos(cosKnee));

  // 3. Thigh Pitch (Sagittal Plane)
  const sagDist = Math.hypot(dy, dz);
  const sagAngle = Math.atan2(dx, sagDist);
  const alphaHip = Math.acos(cosA);
  result.thighAngle = sagAngle - alphaHip;

  return result;
}
