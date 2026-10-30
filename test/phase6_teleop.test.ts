import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLegIK, computePinchDistance, computeWristRoll } from '../lib/ik/fabrik';
import { DAggerRecorder } from '../components/teleop/Recorder';
import { LocalSimulationRunner } from '../lib/telemetry/local_runner';
import { generateDeterministicEnvironmentSpec } from '../lib/nebius/prompts';

test('Phase 6 IK Solver: FABRIK maps 3D reach targets to valid joint angles within limits', () => {
  const target: [number, number, number] = [0.1, -0.05, -0.25];
  const ik = solveLegIK(target);

  assert.ok(typeof ik.hip === 'number');
  assert.ok(typeof ik.thigh === 'number');
  assert.ok(typeof ik.calf === 'number');

  // Verify joint limits (quadruped kinematic ranges)
  assert.ok(ik.hip >= -Math.PI / 2 && ik.hip <= Math.PI / 2, `Hip angle out of range: ${ik.hip}`);
  assert.ok(ik.thigh >= -Math.PI && ik.thigh <= Math.PI, `Thigh angle out of range: ${ik.thigh}`);
  assert.ok(ik.calf <= 0.05 && ik.calf >= -Math.PI, `Calf knee flexion angle out of range: ${ik.calf}`);
});

test('Phase 6 Biomechanical Signals: Pinch distance and wrist roll calculate normalized values', () => {
  const thumbClosed = { x: 0.5, y: 0.5, z: 0.0 };
  const indexClosed = { x: 0.52, y: 0.51, z: 0.0 };
  const pinchClosed = computePinchDistance(thumbClosed, indexClosed);
  assert.ok(pinchClosed < 0.25, `Expected tight pinch < 0.25, got ${pinchClosed}`);

  const thumbOpen = { x: 0.4, y: 0.4, z: 0.0 };
  const indexOpen = { x: 0.6, y: 0.6, z: 0.0 };
  const pinchOpen = computePinchDistance(thumbOpen, indexOpen);
  assert.ok(pinchOpen > 0.8, `Expected wide pinch > 0.8, got ${pinchOpen}`);

  const roll = computeWristRoll({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 });
  assert.ok(Math.abs(roll) < 0.1, `Expected near-zero horizontal roll, got ${roll}`);
});

test('Phase 6 DAgger Recorder: records episodes, steps, and formats valid dataset', () => {
  const recorder = new DAggerRecorder();
  recorder.startRecording();

  recorder.recordStep(
    [0, 0, 0.4],
    [0, 0, 0, 1],
    { FL_hip_joint: 0.1, FL_thigh_joint: 0.4, FL_calf_joint: -0.8 },
    { FL_hip_joint: 0.15, FL_thigh_joint: 0.45, FL_calf_joint: -0.85 }
  );
  recorder.recordStep(
    [0.1, 0, 0.4],
    [0, 0, 0, 1],
    { FL_hip_joint: 0.15, FL_thigh_joint: 0.45, FL_calf_joint: -0.85 },
    { FL_hip_joint: 0.2, FL_thigh_joint: 0.5, FL_calf_joint: -0.9 }
  );

  assert.equal(recorder.getRecordedStepCount(), 2);
  const finished = recorder.stopRecording();
  assert.equal(finished.length, 2);
  assert.equal(recorder.getActiveEpisodeCount(), 1);

  const dataset = recorder.exportDataset();
  assert.equal(dataset.totalEpisodes, 1);
  assert.equal(dataset.episodes[0].length, 2);
});

test('Phase 6 Iteration 2 Dynamics: Demonstrations / Iteration 2 yield faster velocity and higher stability', () => {
  const spec = generateDeterministicEnvironmentSpec('crater debris');
  const runnerIter1 = new LocalSimulationRunner('iter1', 60, 1);
  runnerIter1.setEnvironmentSpec(spec);

  const runnerIter2 = new LocalSimulationRunner('iter2', 60, 2);
  runnerIter2.setEnvironmentSpec(spec);

  const frame1 = runnerIter1.generateFrame(100);
  const frame2 = runnerIter2.generateFrame(100);

  const vel1 = frame1.bodies[0].vel[0];
  const vel2 = frame2.bodies[0].vel[0];

  assert.ok(
    vel2 > vel1 * 1.15,
    `Expected Iteration 2 velocity (${vel2}) to be > 15% higher than Iteration 1 (${vel1})`
  );
  assert.equal(frame2.iteration, 2);
  assert.equal(frame1.iteration, 1);
  assert.ok(frame2.reward >= frame1.reward, 'Iteration 2 reward should be >= Iteration 1 reward');
});
