/**
 * Pure Pursuit Path Follower & Polyline Lookahead (v2)
 *
 * Adapted strictly to Omni-Kinetic Single Frame Convention:
 * - World: Right-handed Y-up (+X East, +Y Up, +Z South)
 * - Heading theta = 0 faces +X; forward = (cos(theta), 0, -sin(theta))
 * - Positive yawRate turns counter-clockwise (left, toward -Z when theta = 0)
 * - headingFromVector(dx, dz) = Math.atan2(-dz, dx)
 *
 * Zero allocations in hot path.
 */

import { Waypoint } from './types';

export interface PursuitOut {
  vx: number;
  yawRate: number;
  reached: boolean;
  distToTarget: number;
}

export interface ObstaclePoint {
  x: number;
  z: number;
  radius: number;
}

/**
 * Pure pursuit steering from current droid pose (px, pz, heading) to lookahead target (tx, tz).
 */
export function purePursuit(
  px: number,
  pz: number,
  heading: number,
  tx: number,
  tz: number,
  speed: number,
  lookahead: number,
  arrivalRadius: number,
  out: PursuitOut
): PursuitOut {
  const dx = tx - px;
  const dz = tz - pz;
  const dist = Math.hypot(dx, dz);
  out.distToTarget = dist;

  if (!Number.isFinite(dist) || dist < arrivalRadius) {
    out.vx = 0;
    out.yawRate = 0;
    out.reached = true;
    return out;
  }

  // Canonical Single Frame Convention: heading = atan2(-dz, dx)
  const targetHeading = Math.atan2(-dz, dx);
  let alpha = targetHeading - heading;
  alpha = Math.atan2(Math.sin(alpha), Math.cos(alpha)); // wrap to [-pi, pi]

  // Pivot in place cleanly when target is nearly directly behind (> 125 deg)
  if (Math.abs(alpha) > 2.18) {
    out.vx = 0.08 * speed;
    out.yawRate = (alpha >= 0 ? 1 : -1) * 1.8;
    out.reached = false;
    return out;
  }

  const ld = Math.max(lookahead, 0.25);
  const curvature = (2 * Math.sin(alpha)) / ld;

  // Slow down for sharp turns and near arrival
  const turnFactor = Math.max(0.22, Math.cos(Math.min(Math.abs(alpha), Math.PI * 0.48)));
  const arriveFactor = Math.min(1, dist / Math.max(arrivalRadius * 3.0, 0.3));
  out.vx = speed * turnFactor * arriveFactor;
  out.yawRate = Math.max(-2.2, Math.min(2.2, out.vx * curvature + alpha * 0.65));
  out.reached = false;
  return out;
}

/**
 * Finds the polyline lookahead point along an ordered waypoint queue without heap allocations.
 */
export function findPolylineLookahead(
  px: number,
  pz: number,
  waypoints: readonly Waypoint[],
  lookahead: number,
  out: { x: number; z: number }
): boolean {
  if (waypoints.length === 0) return false;
  if (waypoints.length === 1) {
    out.x = waypoints[0].x;
    out.z = waypoints[0].z;
    return true;
  }

  // Walk segments starting from [robot -> wp[0] -> wp[1] ...]
  let prevX = px;
  let prevZ = pz;
  let remaining = Math.max(0.25, lookahead);

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const segDx = wp.x - prevX;
    const segDz = wp.z - prevZ;
    const segLen = Math.hypot(segDx, segDz);
    if (segLen >= remaining && segLen > 1e-6) {
      const t = remaining / segLen;
      out.x = prevX + segDx * t;
      out.z = prevZ + segDz * t;
      return true;
    }
    remaining -= segLen;
    prevX = wp.x;
    prevZ = wp.z;
  }

  const last = waypoints[waypoints.length - 1];
  out.x = last.x;
  out.z = last.z;
  return true;
}

/**
 * Computes optional local boulder avoidance yaw bias using nearby hazard rocks.
 */
export function computeObstacleAvoidanceYaw(
  px: number,
  pz: number,
  heading: number,
  obstacles: readonly ObstaclePoint[],
  lookaheadDist = 2.2
): number {
  const fwdX = Math.cos(heading);
  const fwdZ = -Math.sin(heading);
  const rightX = Math.sin(heading);
  const rightZ = Math.cos(heading);

  let yawBias = 0;
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const dx = obs.x - px;
    const dz = obs.z - pz;
    const distSq = dx * dx + dz * dz;
    const maxR = lookaheadDist + obs.radius;
    if (distSq > maxR * maxR || distSq < 1e-4) continue;

    // Project obstacle into body frame: fwd (+X), right (+Z)
    const localFwd = dx * fwdX + dz * fwdZ;
    if (localFwd <= 0.05) continue; // behind droid
    const localRight = dx * rightX + dz * rightZ;
    const clearance = obs.radius + 0.55;
    if (Math.abs(localRight) > clearance) continue;

    const urgency = 1.0 - Math.min(1.0, localFwd / maxR);
    // If obstacle is to our right (+localRight), steer left (+yawRate); else steer right (-yawRate)
    const steerSign = localRight >= 0 ? 1 : -1;
    yawBias += steerSign * urgency * 1.4;
  }

  return Math.max(-1.6, Math.min(1.6, yawBias));
}
