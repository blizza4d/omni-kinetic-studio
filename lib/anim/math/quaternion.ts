/**
 * High-Performance Quaternion Mathematics
 * 
 * Allocation-free shortest-arc slerp, angular velocity estimation,
 * and lookRotation utilities.
 */

import { Quaternion, Vector3, Matrix4 } from 'three';

const _tmpQuat = new Quaternion();
const _tmpMat = new Matrix4();
const _xVec = new Vector3();
const _yVec = new Vector3();
const _zVec = new Vector3();

/**
 * Shortest-arc spherical linear interpolation (negates b when dot < 0).
 */
export function slerpShortest(
  a: Quaternion,
  b: Quaternion,
  t: number,
  out: Quaternion
): Quaternion {
  let dot = a.dot(b);
  if (dot < 0.0) {
    _tmpQuat.set(-b.x, -b.y, -b.z, -b.w);
    out.copy(a).slerp(_tmpQuat, t);
  } else {
    out.copy(a).slerp(b, t);
  }
  return out.normalize();
}

/**
 * Build look-rotation quaternion from forward and up vectors without allocation.
 */
export function lookRotation(forward: Vector3, up: Vector3, out: Quaternion): Quaternion {
  _zVec.copy(forward).normalize();
  _xVec.crossVectors(up, _zVec).normalize();
  if (_xVec.lengthSq() < 1e-6) {
    _xVec.set(1, 0, 0);
  }
  _yVec.crossVectors(_zVec, _xVec).normalize();

  _tmpMat.makeBasis(_xVec, _yVec, _zVec);
  return out.setFromRotationMatrix(_tmpMat);
}
