import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bodyToWorld,
  worldToBody,
  bodyVectorToWorld,
  worldVectorToBody,
  yawToQuaternion,
  quaternionToYaw,
  eulerToQuaternion,
  quaternionToEuler,
  transformPoint,
  transformVector,
  RobotPose,
} from '../lib/frames';

test('Frames: Chirality and Basis Vectors at theta=0', () => {
  const pose: RobotPose = {
    position: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    roll: 0,
  };

  // At theta=0, body frame aligned with world frame
  const forward = bodyVectorToWorld([1, 0, 0], pose);
  assert.ok(Math.abs(forward[0] - 1.0) < 1e-6);
  assert.ok(Math.abs(forward[1] - 0.0) < 1e-6);
  assert.ok(Math.abs(forward[2] - 0.0) < 1e-6);

  const up = bodyVectorToWorld([0, 1, 0], pose);
  assert.ok(Math.abs(up[0] - 0.0) < 1e-6);
  assert.ok(Math.abs(up[1] - 1.0) < 1e-6);
  assert.ok(Math.abs(up[2] - 0.0) < 1e-6);

  const right = bodyVectorToWorld([0, 0, 1], pose);
  assert.ok(Math.abs(right[0] - 0.0) < 1e-6);
  assert.ok(Math.abs(right[1] - 0.0) < 1e-6);
  assert.ok(Math.abs(right[2] - 1.0) < 1e-6);
});

test('Frames: Forward vector maps to (cos(theta), 0, -sin(theta)) under pure yaw', () => {
  const angles = [0, Math.PI / 6, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 3];

  for (const yaw of angles) {
    const pose: RobotPose = { position: [10, 2, -5], yaw, pitch: 0, roll: 0 };
    const forward = bodyVectorToWorld([1, 0, 0], pose);

    const expectedX = Math.cos(yaw);
    const expectedZ = -Math.sin(yaw);

    assert.ok(Math.abs(forward[0] - expectedX) < 1e-5, `Yaw ${yaw}: expected X ${expectedX}, got ${forward[0]}`);
    assert.ok(Math.abs(forward[1] - 0.0) < 1e-5);
    assert.ok(Math.abs(forward[2] - expectedZ) < 1e-5, `Yaw ${yaw}: expected Z ${expectedZ}, got ${forward[2]}`);
  }
});

test('Frames: 1,000 Random Round-Trip Transforms (World <-> Body)', () => {
  let maxError = 0;

  for (let i = 0; i < 1000; i++) {
    const pose: RobotPose = {
      position: [(Math.random() - 0.5) * 40, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 40],
      yaw: (Math.random() - 0.5) * 2 * Math.PI,
      pitch: (Math.random() - 0.5) * 0.4,
      roll: (Math.random() - 0.5) * 0.4,
    };

    const worldPoint: [number, number, number] = [
      (Math.random() - 0.5) * 50,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 50,
    ];

    const bodyPoint = worldToBody(worldPoint, pose);
    const roundTrip = bodyToWorld(bodyPoint, pose);

    const err = Math.hypot(
      worldPoint[0] - roundTrip[0],
      worldPoint[1] - roundTrip[1],
      worldPoint[2] - roundTrip[2]
    );

    if (err > maxError) maxError = err;
    assert.ok(err < 1e-5, `Round-trip error ${err} exceeded tolerance 1e-5 at step ${i}`);
  }

  assert.ok(maxError < 1e-5);
});

test('Frames: Quaternion and Euler conversions round-trip accurately', () => {
  for (let i = 0; i < 200; i++) {
    const yaw = (Math.random() - 0.5) * 2 * Math.PI;
    const pitch = (Math.random() - 0.5) * 0.5;
    const roll = (Math.random() - 0.5) * 0.5;

    const q = eulerToQuaternion(yaw, pitch, roll);
    const [yOut, pOut, rOut] = quaternionToEuler(q);

    // Normalize yaw difference to [-pi, pi]
    let dy = yOut - yaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;

    assert.ok(Math.abs(dy) < 1e-4, `Yaw error ${dy}`);
    assert.ok(Math.abs(pOut - pitch) < 1e-4, `Pitch error ${pOut - pitch}`);
    assert.ok(Math.abs(rOut - roll) < 1e-4, `Roll error ${rOut - roll}`);
  }
});
