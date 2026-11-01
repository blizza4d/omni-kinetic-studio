/**
 * Canonical Frame Conventions for Omni-Kinetic
 * Enforces strict single source of truth (AGENTS.md):
 * - World: Right-handed, Y-up, meters (+X East, +Y Up, +Z South).
 * - Body: +X forward, +Y up, +Z right (left legs have negative Z).
 * - Yaw θ rotates body forward (+X) to (cos θ, 0, -sin θ) in World.
 * - Zero ad-hoc coordinate axis permutations.
 */

import * as THREE from 'three';

export interface RobotPose {
  position: [number, number, number]; // [x, y, z] in World frame (meters)
  yaw: number;   // Heading angle in radians (rotates +X towards -Z)
  pitch: number; // Pitch angle in radians (nose up/down around body right +Z)
  roll: number;  // Roll angle in radians (tilt left/right around body forward +X)
}

export type Quaternion4 = [number, number, number, number]; // [x, y, z, w]

/**
 * Quaternion multiplication: qA * qB
 */
export function quatMultiply(a: Quaternion4, b: Quaternion4): Quaternion4 {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * Quaternion conjugate (inverse for unit quaternions)
 */
export function quatConjugate(q: Quaternion4): Quaternion4 {
  return [-q[0], -q[1], -q[2], q[3]];
}

/**
 * Rotate a 3D vector by a quaternion: v' = q * v * q^-1
 */
export function quatRotateVector(q: Quaternion4, v: [number, number, number]): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  // v' = v + qw * t + cross(q.xyz, t)
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/**
 * Convert pure yaw to quaternion [x, y, z, w].
 * Yaw rotates body forward (+X) toward -Z in World frame (around +Y).
 */
export function yawToQuaternion(yaw: number): Quaternion4 {
  const half = yaw * 0.5;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

/**
 * Convert Euler angles (yaw, pitch, roll) to quaternion [x, y, z, w].
 * Composition: Yaw (Y) * Pitch (Z) * Roll (X) -> 'YZX'
 */
export function eulerToQuaternion(yaw: number, pitch: number, roll: number): Quaternion4 {
  const hy = yaw * 0.5;
  const hp = pitch * 0.5;
  const hr = roll * 0.5;

  const qYaw: Quaternion4 = [0, Math.sin(hy), 0, Math.cos(hy)];
  const qPitch: Quaternion4 = [0, 0, Math.sin(hp), Math.cos(hp)];
  const qRoll: Quaternion4 = [Math.sin(hr), 0, 0, Math.cos(hr)];

  return quatMultiply(qYaw, quatMultiply(qPitch, qRoll));
}

/**
 * Convert quaternion [x, y, z, w] to Euler angles [yaw, pitch, roll].
 */
export function quaternionToEuler(q: Quaternion4): [number, number, number] {
  const tQ = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
  const e = new THREE.Euler().setFromQuaternion(tQ, 'YZX');
  return [e.y, e.z, e.x];
}

/**
 * Extract yaw from quaternion
 */
export function quaternionToYaw(q: Quaternion4): number {
  const [yaw] = quaternionToEuler(q);
  return yaw;
}

/**
 * Transform a direction vector from Body frame to World frame.
 * Body: +X fwd, +Y up, +Z right.
 */
export function bodyVectorToWorld(vBody: [number, number, number], pose: RobotPose | Quaternion4): [number, number, number] {
  const q = Array.isArray(pose) ? (pose as Quaternion4) : eulerToQuaternion(pose.yaw, pose.pitch, pose.roll);
  return quatRotateVector(q, vBody);
}

/**
 * Transform a direction vector from World frame to Body frame.
 */
export function worldVectorToBody(vWorld: [number, number, number], pose: RobotPose | Quaternion4): [number, number, number] {
  const q = Array.isArray(pose) ? (pose as Quaternion4) : eulerToQuaternion(pose.yaw, pose.pitch, pose.roll);
  const qInv = quatConjugate(q);
  return quatRotateVector(qInv, vWorld);
}

/**
 * Transform a point from Body frame to World frame (includes translation).
 */
export function bodyToWorld(pBody: [number, number, number], pose: RobotPose): [number, number, number] {
  const rotated = bodyVectorToWorld(pBody, pose);
  return [
    rotated[0] + pose.position[0],
    rotated[1] + pose.position[1],
    rotated[2] + pose.position[2],
  ];
}

/**
 * Transform a point from World frame to Body frame (includes inverse translation).
 */
export function worldToBody(pWorld: [number, number, number], pose: RobotPose): [number, number, number] {
  const translated: [number, number, number] = [
    pWorld[0] - pose.position[0],
    pWorld[1] - pose.position[1],
    pWorld[2] - pose.position[2],
  ];
  return worldVectorToBody(translated, pose);
}

export const transformPoint = bodyToWorld;
export const transformVector = bodyVectorToWorld;
