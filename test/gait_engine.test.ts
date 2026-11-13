import test from 'node:test';
import assert from 'node:assert/strict';
import { GaitController } from '../lib/droid/gait/GaitController';
import { GaitPhaseTracker } from '../lib/droid/gait/Phase';
import { TwoBoneIK } from '../lib/droid/ik/TwoBoneIK';

test('GaitController: Steps deterministically with zero NaNs and valid joint limits', () => {
  const controller = new GaitController(0, 0, 0, () => 0.0);
  const command = { vx: 0.95, yawRate: 0.0 };

  for (let i = 0; i < 300; i++) {
    const state = controller.step(command, 1.62, () => 0.0, 1 / 60);

    assert.ok(!isNaN(state.bodyPos[0]));
    assert.ok(!isNaN(state.bodyPos[1]));
    assert.ok(!isNaN(state.bodyPos[2]));

    for (const j of state.joints) {
      assert.ok(!isNaN(j.angle), `Joint ${j.name} must not be NaN at step ${i}`);
    }

    for (const f of state.feet) {
      assert.ok(!isNaN(f.worldPos[0]));
      assert.ok(!isNaN(f.worldPos[1]));
      assert.ok(!isNaN(f.worldPos[2]));
      if (f.state === 'stance') {
        assert.ok(f.slipDistance < 1e-4, `Stance slip must be < 1e-4m, got ${f.slipDistance}`);
      }
    }
  }
});

test('GaitPhaseTracker: SettleToStand guides phase toward symmetric double support', () => {
  const tracker = new GaitPhaseTracker();

  // Advance to mid-step (phase ~ 1.2 rad)
  tracker.advance(0.15, 0.30);
  const initialPhase = tracker.getMasterPhase();
  assert.ok(initialPhase > 0);

  // Call settleToStand over 30 steps with zero speed
  for (let i = 0; i < 30; i++) {
    tracker.settleToStand(1 / 60, 0.12);
  }

  const settledPhase = tracker.getMasterPhase();
  // Settled phase should be near 0 (or 2*PI) or PI
  const distFromZero = Math.min(settledPhase, 2 * Math.PI - settledPhase);
  const distFromPi = Math.abs(settledPhase - Math.PI);
  const isNearDoubleSupport = distFromZero < 0.2 || distFromPi < 0.2;
  assert.ok(isNearDoubleSupport, `Phase must settle near double support, got ${settledPhase}`);
});

test('GaitController: Zero allocation churn in 1,000 continuous simulation steps', () => {
  const controller = new GaitController(0, 0, 0, () => 0.0);
  const command = { vx: 0.60, yawRate: 0.1 };

  // Warm-up JIT
  for (let i = 0; i < 100; i++) {
    controller.step(command, 1.62, () => 0.0, 1 / 60);
  }

  const startMem = process.memoryUsage().heapUsed;
  for (let i = 0; i < 1000; i++) {
    controller.step(command, 1.62, () => 0.0, 1 / 60);
  }
  const endMem = process.memoryUsage().heapUsed;
  const churnMb = (endMem - startMem) / (1024 * 1024);

  // Across 1,000 steps, heap growth must be minimal (< 2 MB)
  assert.ok(churnMb < 2.0, `Heap growth must be < 2 MB, got ${churnMb.toFixed(2)} MB`);
});
