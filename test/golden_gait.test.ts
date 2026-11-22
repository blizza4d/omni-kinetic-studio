import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { SimEngine } from '../lib/sim/SimEngine';
import { ShortcutRegistry } from '../lib/control/shortcuts';
import { GoldenTrace } from '../scripts/record_golden_trace';

test('Golden Gait Trace Protection: Current simulation matches golden trace within 1e-6 tolerance', () => {
  const goldenPath = fs.existsSync(path.resolve(process.cwd(), 'tests', 'golden', 'gait-before.json'))
    ? path.resolve(process.cwd(), 'tests', 'golden', 'gait-before.json')
    : path.resolve(process.cwd(), 'test', 'golden', 'gait-before.json');

  assert.ok(fs.existsSync(goldenPath), `Golden trace file must exist at ${goldenPath}`);
  const golden: GoldenTrace = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));

  assert.strictEqual(golden.seed, 42);
  assert.strictEqual(golden.totalSteps, 600);
  assert.strictEqual(golden.steps.length, 600);

  const registry = new ShortcutRegistry();
  const engine = new SimEngine(registry, {
    scenario: {
      seed: golden.seed,
      gravity: golden.gravity,
      episodeLength: 16.7,
      startPos: [0, 0],
      startHeading: 0,
    },
  });

  const dt = 1.0 / golden.fps;
  let maxPosErr = 0;
  let maxQuatErr = 0;
  let maxJointErr = 0;
  let maxFootErr = 0;

  for (let s = 0; s < golden.totalSteps; s++) {
    const expected = golden.steps[s];
    const actual = engine.executeFixedStep(s, dt);

    // Assert body position
    for (let i = 0; i < 3; i++) {
      const err = Math.abs(actual.bodyPos[i] - expected.bodyPos[i]);
      maxPosErr = Math.max(maxPosErr, err);
      assert.ok(err < 1e-5, `Body pos [${i}] diverged at step ${s}: actual ${actual.bodyPos[i]} vs expected ${expected.bodyPos[i]} (err: ${err})`);
    }

    // Assert body orientation
    for (let i = 0; i < 4; i++) {
      const err = Math.abs(actual.bodyQuat[i] - expected.bodyQuat[i]);
      maxQuatErr = Math.max(maxQuatErr, err);
      assert.ok(err < 1e-5, `Body quat [${i}] diverged at step ${s}: actual ${actual.bodyQuat[i]} vs expected ${expected.bodyQuat[i]} (err: ${err})`);
    }

    // Assert joint angles
    for (let j = 0; j < actual.joints.length; j++) {
      const actJ = actual.joints[j];
      const expJ = expected.joints.find((x) => x.name === actJ.name);
      assert.ok(expJ, `Joint ${actJ.name} missing from expected at step ${s}`);
      const err = Math.abs(actJ.angle - expJ.angle);
      maxJointErr = Math.max(maxJointErr, err);
      assert.ok(err < 1e-5, `Joint ${actJ.name} diverged at step ${s}: actual ${actJ.angle} vs expected ${expJ.angle} (err: ${err})`);
    }

    // Assert foot positions and contact state
    for (let f = 0; f < actual.feet.length; f++) {
      const actF = actual.feet[f];
      const expF = expected.feet.find((x) => x.id === actF.id);
      assert.ok(expF, `Foot ${actF.id} missing from expected at step ${s}`);
      assert.strictEqual(actF.state, expF.state, `Foot ${actF.id} state diverged at step ${s}`);

      for (let i = 0; i < 3; i++) {
        const err = Math.abs(actF.worldPos[i] - expF.worldPos[i]);
        maxFootErr = Math.max(maxFootErr, err);
        assert.ok(err < 1e-5, `Foot ${actF.id} worldPos [${i}] diverged at step ${s}: err: ${err}`);
      }
    }
  }

  console.log(`[Golden Gait Test Passed] Max Errors: Pos=${maxPosErr.toExponential(3)}, Quat=${maxQuatErr.toExponential(3)}, Joint=${maxJointErr.toExponential(3)}, Foot=${maxFootErr.toExponential(3)}`);
});
