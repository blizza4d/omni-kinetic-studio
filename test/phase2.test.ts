import assert from 'node:assert';
import test from 'node:test';
import { LocalSimulationRunner } from '../lib/telemetry/local_runner';
import { TelemetryFrameSchema, TelemetryBatchSchema } from '../contracts';

test('Phase 2 Acceptance: Local runner generates 60 seconds (3600 frames) of valid TelemetryFrames without schema errors', () => {
  const runner = new LocalSimulationRunner('acceptance_test_job', 60);

  const totalFrames = 3600; // 60 seconds @ 60 FPS
  const batchSize = 30;
  const numBatches = totalFrames / batchSize;

  let totalValidFrames = 0;
  let collisionCount = 0;

  for (let b = 0; b < numBatches; b++) {
    const batch = runner.getNextBatch(batchSize);

    // Validate entire batch against schema
    const parsedBatch = TelemetryBatchSchema.parse(batch);
    assert.strictEqual(parsedBatch.frames.length, batchSize);

    for (const frame of parsedBatch.frames) {
      // Validate individual frame structure
      TelemetryFrameSchema.parse(frame);
      assert.strictEqual(frame.joints.length, 12, '12 joints expected for quadruped');
      assert.ok(frame.bodies.some((b) => b.id === 'torso'), 'Torso body state required');

      if (frame.collisions.length > 0) {
        collisionCount += frame.collisions.length;
      }
      totalValidFrames++;
    }
  }

  assert.strictEqual(totalValidFrames, 3600, 'Must have validated exactly 3600 frames');
  assert.ok(collisionCount > 0, 'Should have registered simulated obstacle collisions');
  console.log(`[Phase 2 Verified] 60 seconds (${totalValidFrames} frames) validated with 0 schema errors. Collisions registered: ${collisionCount}`);
});
