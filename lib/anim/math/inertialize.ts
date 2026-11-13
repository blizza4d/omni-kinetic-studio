/**
 * Inertialization Transition Engine
 * 
 * Provides instantaneous, continuous transitions without traditional cross-fading.
 * Offsets between the incoming and outgoing poses are captured and decayed toward zero
 * using critically damped springs.
 */

import { Quaternion } from 'three';
import { springDamper, SpringState } from './spring';

/**
 * Scalar offset decaying toward zero with a critically damped spring.
 */
export class OffsetScalar {
  private readonly s: SpringState = { x: 0, v: 0 };

  /**
   * Trigger inertialization at state change.
   * @param oldValue Value from outgoing animation state
   * @param oldVelocity Velocity from outgoing animation state
   * @param newValue Value from incoming animation state
   * @param newVelocity Velocity from incoming animation state
   */
  public trigger(oldValue: number, oldVelocity: number, newValue: number, newVelocity: number): void {
    this.s.x = oldValue - newValue;
    this.s.v = oldVelocity - newVelocity;
  }

  public update(halfLife: number, dt: number): number {
    springDamper(this.s, 0.0, 0.0, halfLife, dt);
    return this.s.x;
  }

  public getOffset(): number {
    return this.s.x;
  }

  public reset(): void {
    this.s.x = 0;
    this.s.v = 0;
  }
}

const _id = new Quaternion();

/**
 * Quaternion rotation offset decaying toward identity: q_out = offset * q_new.
 */
export class OffsetQuat {
  public readonly offset: Quaternion = new Quaternion();

  /**
   * Trigger rotation inertialization at state change.
   * offset = qOld * inverse(qNew)
   */
  public trigger(qOld: Quaternion, qNew: Quaternion): void {
    this.offset.copy(qNew).invert().premultiply(qOld).normalize();
  }

  public update(halfLife: number, dt: number): void {
    if (dt <= 0) return;
    const a = 1.0 - Math.exp((-Math.LN2 * dt) / Math.max(halfLife, 1e-5));

    // Ensure shortest path arc to identity
    if (this.offset.w < 0) {
      this.offset.x = -this.offset.x;
      this.offset.y = -this.offset.y;
      this.offset.z = -this.offset.z;
      this.offset.w = -this.offset.w;
    }

    this.offset.slerp(_id.identity(), a);
    this.offset.normalize();
  }

  public apply(qNew: Quaternion, out: Quaternion): Quaternion {
    return out.copy(qNew).premultiply(this.offset);
  }

  public reset(): void {
    this.offset.identity();
  }
}
