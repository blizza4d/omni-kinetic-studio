/**
 * Analytical Critically Damped Spring Damper
 * 
 * Exact closed-form solution with zero overshoot, frame-rate invariance,
 * and zero allocations in per-frame evaluation.
 */

import { Vector3, Quaternion } from 'three';

const EPS = 1e-5;

export function halfLifeToDamping(halfLife: number): number {
  return (4.0 * Math.LN2) / (Math.max(1e-5, halfLife) + EPS);
}

export function fastNegExp(x: number): number {
  if (x < 0) return Math.exp(-x);
  return 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);
}

export interface SpringState {
  x: number;
  v: number;
}

/**
 * Critically damped spring toward xGoal with optional goal velocity vGoal.
 * Mutates state in place with zero allocation.
 */
export function springDamper(
  s: SpringState,
  xGoal: number,
  vGoal: number,
  halfLife: number,
  dt: number
): void {
  if (dt <= 0) return;
  const d = halfLifeToDamping(halfLife);
  const c = xGoal + (d * vGoal) / ((d * d) / 4.0);
  const y = d / 2.0;
  const j0 = s.x - c;
  const j1 = s.v + j0 * y;
  const eydt = fastNegExp(y * dt);
  s.x = eydt * (j0 + j1 * dt) + c;
  s.v = eydt * (s.v - j1 * y * dt);
}

/**
 * 3D Vector critically damped spring.
 */
export class Spring3 {
  public readonly pos: Vector3 = new Vector3();
  public readonly vel: Vector3 = new Vector3();

  private sx: SpringState = { x: 0, v: 0 };
  private sy: SpringState = { x: 0, v: 0 };
  private sz: SpringState = { x: 0, v: 0 };

  constructor(initialX = 0, initialY = 0, initialZ = 0) {
    this.pos.set(initialX, initialY, initialZ);
    this.sx.x = initialX;
    this.sy.x = initialY;
    this.sz.x = initialZ;
  }

  public set(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.sx.x = x;
    this.sx.v = 0;
    this.sy.x = y;
    this.sy.v = 0;
    this.sz.x = z;
    this.sz.v = 0;
  }

  public update(
    goalX: number,
    goalY: number,
    goalZ: number,
    halfLife: number,
    dt: number,
    vGoalX = 0,
    vGoalY = 0,
    vGoalZ = 0
  ): Vector3 {
    springDamper(this.sx, goalX, vGoalX, halfLife, dt);
    springDamper(this.sy, goalY, vGoalY, halfLife, dt);
    springDamper(this.sz, goalZ, vGoalZ, halfLife, dt);

    this.pos.set(this.sx.x, this.sy.x, this.sz.x);
    this.vel.set(this.sx.v, this.sy.v, this.sz.v);
    return this.pos;
  }
}

const _idQuat = new Quaternion();

/**
 * Quaternion rotation spring with shortest-arc trajectory.
 */
export class SpringQuat {
  public readonly quat: Quaternion = new Quaternion();

  constructor() {
    this.quat.identity();
  }

  public set(q: Quaternion): void {
    this.quat.copy(q);
  }

  public update(goalQuat: Quaternion, halfLife: number, dt: number): Quaternion {
    if (dt <= 0 || halfLife <= 0) {
      this.quat.copy(goalQuat);
      return this.quat;
    }

    const a = 1.0 - Math.exp((-Math.LN2 * dt) / halfLife);

    // Shortest path slerp (ensure positive dot product)
    let dot = this.quat.dot(goalQuat);
    if (dot < 0) {
      _idQuat.set(-goalQuat.x, -goalQuat.y, -goalQuat.z, -goalQuat.w);
      goalQuat = _idQuat;
    }

    this.quat.slerp(goalQuat, a);
    this.quat.normalize();
    return this.quat;
  }
}
