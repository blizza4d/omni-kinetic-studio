import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepLoop } from '../lib/sim/fixedStep';

test('FixedStepLoop: Steps accurately at fixed rate and yields bounded alpha in [0, 1)', () => {
  let stepCount = 0;
  let totalSimTime = 0;

  const loop = new FixedStepLoop(
    { step: 1 / 120, maxSteps: 6, maxFrame: 0.1 },
    (dt) => {
      stepCount++;
      totalSimTime += dt;
    }
  );

  // Advance by 1/60s (approx 2 simulation steps)
  const steps1 = loop.advance(1 / 60);
  assert.equal(steps1, 2);
  assert.equal(stepCount, 2);
  assert.ok(Math.abs(totalSimTime - 2 / 120) < 1e-6);
  assert.ok(loop.alpha >= 0.0 && loop.alpha < 1.0);

  // Advance by small sub-frame delta (1/240s): should execute 0 steps and advance alpha
  const steps2 = loop.advance(1 / 240);
  assert.equal(steps2, 0);
  assert.equal(stepCount, 2);
  assert.ok(loop.alpha > 0.0);
});

test('FixedStepLoop: Spiral of death protection drops excess backlog', () => {
  let stepCount = 0;
  const loop = new FixedStepLoop(
    { step: 1 / 120, maxSteps: 4, maxFrame: 0.1 },
    () => {
      stepCount++;
    }
  );

  // Deliver a large frame hitch of 0.10s (would require 12 steps, capped at maxSteps=4)
  const steps = loop.advance(0.10);
  assert.equal(steps, 4, 'Must clamp to maxSteps to prevent death spiral');
  assert.ok(loop.alpha >= 0.0 && loop.alpha < 1.0);
});

test('FixedStepLoop: Time-scaling accelerates/decelerates steps without changing dt', () => {
  const recordedDts: number[] = [];
  const loop = new FixedStepLoop(
    { step: 1 / 120, maxSteps: 10, maxFrame: 0.1 },
    (dt) => {
      recordedDts.push(dt);
    }
  );

  // Advance 1/60s with 2x time scale -> should execute 4 steps, each with exact dt = 1/120
  const steps = loop.advance(1 / 60, 2.0);
  assert.equal(steps, 4);
  assert.equal(recordedDts.length, 4);
  assert.ok(recordedDts.every((dt) => Math.abs(dt - 1 / 120) < 1e-6));
});
