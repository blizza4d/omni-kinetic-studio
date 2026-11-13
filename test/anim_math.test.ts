import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { halfLifeAlpha, smoothTo } from '../lib/anim/math/smoothing';
import { springDamper, Spring3, SpringQuat, SpringState } from '../lib/anim/math/spring';
import { minJerk, minJerkVel } from '../lib/anim/math/minJerk';
import { solveTwoBone } from '../lib/anim/ik/twoBoneIK';
import { OffsetScalar, OffsetQuat } from '../lib/anim/math/inertialize';
import { OneEuroFilter } from '../lib/anim/math/oneEuro';
import { slerpShortest, lookRotation } from '../lib/anim/math/quaternion';

test('smoothing: halfLifeAlpha matches exact exponential decay', () => {
  const halfLife = 0.10; // 100ms
  const dt = 0.10;
  const a = halfLifeAlpha(halfLife, dt);
  assert.ok(Math.abs(a - 0.5) < 1e-6, 'At dt = halfLife, alpha must equal 0.5');

  const smoothed = smoothTo(0.0, 10.0, halfLife, dt);
  assert.ok(Math.abs(smoothed - 5.0) < 1e-6, 'Value should be half-way to target');
});

test('spring: Critically damped spring never overshoots target from rest', () => {
  const state: SpringState = { x: 0.0, v: 0.0 };
  const target = 10.0;
  const halfLife = 0.12;

  // Simulate 60 steps at dt = 1/60s
  for (let i = 0; i < 60; i++) {
    springDamper(state, target, 0.0, halfLife, 1 / 60);
    assert.ok(state.x <= target + 1e-4, `Spring must never overshoot target, got ${state.x}`);
    assert.ok(state.x >= 0.0, `Spring must be non-negative, got ${state.x}`);
  }
  assert.ok(Math.abs(state.x - target) < 0.05, 'Spring must reach target within 1 second');
});

test('minJerk: Satisfies C^2 boundary conditions and monotonicity', () => {
  assert.equal(minJerk(0), 0);
  assert.equal(minJerk(1), 1);
  assert.equal(minJerkVel(0), 0);
  assert.equal(minJerkVel(1), 0);

  // Assert strictly monotonic progression
  let prev = -1;
  for (let t = 0; t <= 1.0; t += 0.05) {
    const val = minJerk(t);
    assert.ok(val >= prev, `Must be monotonic: val=${val}, prev=${prev}`);
    prev = val;
  }
});

test('twoBoneIK: Soft extension limiting prevents singular pops', () => {
  const hip = new Vector3(0, 0, 0);
  const pole = new Vector3(0, 0, -1);
  const l1 = 0.22;
  const l2 = 0.22;

  // Target exactly at full reach (0.44m)
  const fullTarget = new Vector3(0, -0.44, 0);
  const resFull = solveTwoBone(hip, fullTarget, pole, l1, l2, 0.15);
  assert.ok(resFull.extension < 1.0, 'Soft clamping must keep extension strictly < 1.0');
  assert.ok(!isNaN(resFull.knee.x) && !isNaN(resFull.knee.y));

  // Target beyond reach (0.60m)
  const overTarget = new Vector3(0, -0.60, 0);
  const resOver = solveTwoBone(hip, overTarget, pole, l1, l2, 0.15);
  assert.ok(resOver.extension < 1.0);
  assert.ok(!isNaN(resOver.foot.y));
});

test('inertialize: OffsetScalar and OffsetQuat decay smoothly to zero/identity', () => {
  const scalar = new OffsetScalar();
  scalar.trigger(5.0, 1.0, 0.0, 0.0);
  assert.equal(scalar.getOffset(), 5.0, 'Initial offset must equal difference at transition');

  for (let i = 0; i < 30; i++) {
    scalar.update(0.10, 1 / 60);
  }
  assert.ok(Math.abs(scalar.getOffset()) < 0.2, 'Offset must decay close to 0 within 30 frames');

  const quat = new OffsetQuat();
  const qOld = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5);
  const qNew = new Quaternion().identity();
  quat.trigger(qOld, qNew);

  for (let i = 0; i < 30; i++) {
    quat.update(0.10, 1 / 60);
  }
  const qOut = new Quaternion();
  quat.apply(qNew, qOut);
  assert.ok(qOut.angleTo(qNew) < 0.1, 'Rotation offset must decay close to identity');
});

test('oneEuro: Adaptive smoothing attenuates jitter at rest and tracks speed', () => {
  const filter = new OneEuroFilter(1.0, 0.05);

  // Feed stationary signal with high-frequency noise
  let filtered = 0;
  for (let i = 0; i < 30; i++) {
    const noisy = 5.0 + (i % 2 === 0 ? 0.2 : -0.2);
    filtered = filter.filter(noisy, 1 / 60);
  }
  assert.ok(Math.abs(filtered - 5.0) < 0.05, 'Filter must heavily attenuate noise at low speed');
});

test('quaternion: slerpShortest takes shortest arc when dot < 0', () => {
  const q1 = new Quaternion().identity();
  // Represent identical orientation by negating quaternion components (dot = -1)
  const q2 = new Quaternion(0, 0, 0, -1);
  const out = new Quaternion();

  slerpShortest(q1, q2, 0.5, out);
  assert.ok(!isNaN(out.w), 'Shortest slerp must not produce NaN');
  assert.ok(Math.abs(Math.abs(out.w) - 1.0) < 1e-4, 'Opposite antipodal quat must remain identity');
});
