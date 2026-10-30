import assert from 'node:assert';
import test from 'node:test';
import { solveLegIK, computePinchDistance, computeFacePose, DEFAULT_LEG_PARAMS } from '../lib/ik/fabrik';
import { OneEuroFilter, Vector3OneEuroFilter } from '../lib/filters/one_euro';
import { TeleopCommandSchema } from '../contracts';

test('FABRIK IK Solver: solves 3D leg joint angles within kinematic limits', () => {
  // Target position: reachable point under torso [0.1, 0.05, -0.3]
  const target: [number, number, number] = [0.1, 0.05, -0.3];
  const angles = solveLegIK(target, DEFAULT_LEG_PARAMS);

  assert.ok(typeof angles.hip === 'number', 'Hip angle must be number');
  assert.ok(typeof angles.thigh === 'number', 'Thigh angle must be number');
  assert.ok(typeof angles.calf === 'number', 'Calf angle must be number');

  // Verify joint angle limits
  assert.ok(angles.hip >= -Math.PI && angles.hip <= Math.PI, 'Hip within bounds');
  assert.ok(angles.thigh >= -Math.PI && angles.thigh <= Math.PI, 'Thigh within bounds');
  assert.ok(angles.calf <= 0, 'Calf must have negative knee bend angle');
});

test('Pinch & Face Pose Computation: accurately extracts biomechanical signals', () => {
  // Pinch computation: closed fingers
  const thumbClosed = { x: 0.5, y: 0.5, z: 0.0 };
  const indexClosed = { x: 0.51, y: 0.51, z: 0.0 };
  const pinchValClosed = computePinchDistance(thumbClosed, indexClosed);
  assert.strictEqual(pinchValClosed, 0, 'Closed pinch should yield 0 stiffness');

  // Open hand
  const thumbOpen = { x: 0.3, y: 0.5, z: 0.0 };
  const indexOpen = { x: 0.6, y: 0.5, z: 0.0 };
  const pinchValOpen = computePinchDistance(thumbOpen, indexOpen);
  assert.strictEqual(pinchValOpen, 1, 'Open pinch should yield 1 stiffness');

  // Face pose computation
  const nose = { x: 0.5, y: 0.5 };
  const leftCheek = { x: 0.4, y: 0.5 };
  const rightCheek = { x: 0.6, y: 0.5 };
  const pose = computeFacePose(nose, leftCheek, rightCheek);
  assert.ok(Math.abs(pose.yaw) < 0.1, 'Centered nose gives 0 yaw');
  assert.ok(Math.abs(pose.pitch) < 0.1, 'Centered nose gives 0 pitch');
});

test('One Euro Filter: eliminates jitter while responding instantly to rapid movement', () => {
  const filter = new OneEuroFilter(1.0, 0.01);

  // Constant signal with micro-jitter
  let t = 0.0;
  const filteredJitter: number[] = [];
  for (let i = 0; i < 20; i++) {
    t += 0.016;
    const noisyVal = 0.5 + (i % 2 === 0 ? 0.02 : -0.02);
    filteredJitter.push(filter.filter(noisyVal, t));
  }

  // Jitter amplitude should be heavily dampened
  const lastFiltered = filteredJitter[filteredJitter.length - 1];
  assert.ok(Math.abs(lastFiltered - 0.5) < 0.015, 'Filter dampened micro-jitter');

  // Large rapid movement (derivative spike)
  t += 0.016;
  const rapidJump = 1.8;
  const jumpResult = filter.filter(rapidJump, t);
  assert.ok(jumpResult > 0.6, `Filter adapts dynamically to fast movements (got ${jumpResult})`);
  
  // Within 3 frames (48ms), filter reaches high fidelity
  t += 0.016;
  filter.filter(rapidJump, t);
  t += 0.016;
  const settled = filter.filter(rapidJump, t);
  assert.ok(settled > 0.8, `Settles toward target rapidly (got ${settled})`);
});

test('Teleop Command Schema: validates generated teleop payload', () => {
  const cmd = {
    t: 12.45,
    jointTargets: {
      FL_hip_joint: 0.05,
      FL_thigh_joint: 0.35,
      FL_calf_joint: -0.72,
    },
    cameraPose: { yaw: 0.12, pitch: -0.08 },
    confidence: 0.94,
    stiffness: 0.85,
    activeLimb: 'FL' as const,
  };

  const parsed = TeleopCommandSchema.parse(cmd);
  assert.strictEqual(parsed.activeLimb, 'FL');
  assert.strictEqual(parsed.confidence, 0.94);
});
