import test from 'node:test';
import assert from 'node:assert/strict';
import { TwoBoneIK } from '../lib/droid/ik/TwoBoneIK';
import { GaitPhaseTracker } from '../lib/droid/gait/Phase';
import { GaitParamsCalculator } from '../lib/droid/gait/GaitParams';
import { FootPlanner } from '../lib/droid/gait/FootPlanner';
import { GaitController } from '../lib/droid/gait/GaitController';
import { RobotPose } from '../lib/frames';

test('TwoBoneIK: Reachability, numeric stability and zero-NaN safety', () => {
  const ik = new TwoBoneIK(0.22, 0.22);

  // 1. Nominal standing pose (dy = -0.385m)
  const nominal = ik.solve(0.0, -0.385, 0.0);
  assert.ok(nominal.isValid, 'Nominal reach must be valid');
  assert.ok(!isNaN(nominal.thighAngle), 'Thigh angle must not be NaN');
  assert.ok(!isNaN(nominal.calfAngle), 'Calf angle must not be NaN');
  assert.ok(nominal.calfAngle < -0.2, 'Calf angle must be negative (backwards knee flexion)');

  // 2. Maximum singular extension (dy = -0.44m)
  const extended = ik.solve(0.0, -0.44, 0.0);
  assert.ok(!isNaN(extended.thighAngle), 'Extended thigh angle must not be NaN');
  assert.ok(!isNaN(extended.calfAngle), 'Extended calf angle must not be NaN');

  // 3. Unreachable target (dy = -0.60m)
  const overreach = ik.solve(0.0, -0.60, 0.0);
  assert.ok(!isNaN(overreach.thighAngle), 'Overreach thigh angle must not be NaN');
  assert.ok(!isNaN(overreach.calfAngle), 'Overreach calf angle must not be NaN');
  assert.equal(overreach.isValid, false, 'Overreach must be flagged as invalid');

  // 4. Zero reach fold-back (dy = 0.0m)
  const foldback = ik.solve(0.0, -0.02, 0.0);
  assert.ok(!isNaN(foldback.thighAngle), 'Foldback thigh angle must not be NaN');
  assert.ok(!isNaN(foldback.calfAngle), 'Foldback calf angle must not be NaN');
});

test('GaitPhase: Distance-driven advancement, freeze at zero velocity, and continuity', () => {
  const phase = new GaitPhaseTracker();

  // 1. Advance by distance
  const p1 = phase.advance(0.10, 0.40);
  assert.ok(p1 > 0, 'Phase must advance with distance');
  assert.equal(phase.getTotalDistance(), 0.10);

  // 2. Freeze at zero velocity
  const pFreeze = phase.advance(0.0, 0.40);
  assert.equal(pFreeze, p1, 'Phase must freeze when displacement is zero');

  // 3. Diagonal trot offsets
  const flPhase = phase.getLegPhase('FL');
  const frPhase = phase.getLegPhase('FR');
  const rlPhase = phase.getLegPhase('RL');
  const rrPhase = phase.getLegPhase('RR');

  assert.equal(flPhase, rrPhase, 'Diagonal pair FL and RR must have identical phase');
  assert.equal(frPhase, rlPhase, 'Diagonal pair FR and RL must have identical phase');
  const phaseDiff = Math.abs(flPhase - frPhase);
  assert.ok(Math.abs(phaseDiff - Math.PI) < 1e-4, 'Diagonal pairs must be separated by PI radians');
});

test('GaitParams: Froude dynamic similarity and gravity-aware transition velocities', () => {
  const calc = new GaitParamsCalculator();

  // 1. Earth Gravity (g = 9.81 m/s^2, L = 0.385m)
  const earthWalk = calc.calculate(0.60, 9.81);
  const earthTrans = earthWalk.transitionSpeed; // sqrt(0.5 * 9.81 * 0.385) ~ 1.374 m/s
  assert.ok(Math.abs(earthTrans - 1.374) < 0.02, `Earth transition speed expected ~1.37 m/s, got ${earthTrans}`);
  assert.equal(earthWalk.isBounding, false, '0.60 m/s on Earth must be in walk regime');

  // 2. Lunar Gravity (g = 1.62 m/s^2, L = 0.385m)
  const moonFast = calc.calculate(0.95, 1.62);
  const moonTrans = moonFast.transitionSpeed; // sqrt(0.5 * 1.62 * 0.385) ~ 0.558 m/s
  assert.ok(Math.abs(moonTrans - 0.558) < 0.02, `Moon transition speed expected ~0.558 m/s, got ${moonTrans}`);
  assert.equal(moonFast.isBounding, true, '0.95 m/s at Lunar gravity must be in bounding regime (Fr > 0.5)');

  // 3. Transition speed ratio must match sqrt(1.62 / 9.81)
  const expectedRatio = Math.sqrt(1.62 / 9.81);
  const actualRatio = moonTrans / earthTrans;
  assert.ok(Math.abs(actualRatio - expectedRatio) < 0.02, 'Transition speed must scale strictly with sqrt(g)');

  // 4. Duty factor monotonic decrease with speed
  const slow = calc.calculate(0.20, 1.62);
  const mid = calc.calculate(0.60, 1.62);
  const fast = calc.calculate(1.20, 1.62);
  assert.ok(slow.dutyFactor > mid.dutyFactor, 'Duty factor must decrease as speed increases');
  assert.ok(mid.dutyFactor > fast.dutyFactor, 'Duty factor must continue decreasing in bound regime');
});

test('FootPlanner: Strict zero stance slip (world-space anchor locking)', () => {
  const planner = new FootPlanner(() => 0.0);
  const bodyPose: RobotPose = { position: [0, 0.385, 0], yaw: 0, pitch: 0, roll: 0 };
  const linearVel: [number, number, number] = [0.8, 0, 0];
  const legPhases = { FL: 0.1, FR: Math.PI + 0.1, RL: Math.PI + 0.1, RR: 0.1 };

  // Step 1: Initialize in stance
  const feet1 = planner.update(bodyPose, linearVel, legPhases, 0.55, 0.05, () => 0.0, 1 / 60);
  const flFoot1 = feet1.find((f) => f.id === 'FL')!;
  assert.equal(flFoot1.state, 'stance');
  assert.equal(flFoot1.slipDistance, 0.0, 'Stance foot slip must be strictly 0.0m at start');

  // Step 2: Body moves forward by 0.10m, foot remains in stance
  bodyPose.position[0] += 0.10;
  const feet2 = planner.update(bodyPose, linearVel, legPhases, 0.55, 0.05, () => 0.0, 1 / 60);
  const flFoot2 = feet2.find((f) => f.id === 'FL')!;
  assert.equal(flFoot2.state, 'stance');
  assert.equal(flFoot2.worldPos[0], flFoot1.worldPos[0], 'World X position of stance foot must remain rigidly locked');
  assert.equal(flFoot2.worldPos[2], flFoot1.worldPos[2], 'World Z position of stance foot must remain rigidly locked');
  assert.ok(flFoot2.slipDistance < 1e-4, 'Measured slip must be < 1e-4 meters');
});

test('GaitController: Determinism, loop continuity, and zero NaNs over 300 steps', () => {
  const controllerA = new GaitController(0, 0, 0);
  const controllerB = new GaitController(0, 0, 0);

  const statesA = [];
  const statesB = [];

  for (let i = 0; i < 300; i++) {
    const sA = controllerA.step({ vx: 0.95, yawRate: 0.1 }, 1.62, () => 0.0, 1 / 60);
    const sB = controllerB.step({ vx: 0.95, yawRate: 0.1 }, 1.62, () => 0.0, 1 / 60);
    statesA.push(sA);
    statesB.push(sB);
  }

  // Determinism check
  for (let i = 0; i < 300; i++) {
    assert.equal(statesA[i].bodyPos[0], statesB[i].bodyPos[0], `Deterministic position mismatch at step ${i}`);
    assert.equal(statesA[i].bodyPos[2], statesB[i].bodyPos[2], `Deterministic position mismatch at step ${i}`);
    for (let j = 0; j < statesA[i].joints.length; j++) {
      assert.equal(statesA[i].joints[j].angle, statesB[i].joints[j].angle, `Joint angle mismatch at step ${i}`);
    }
  }

  // Zero NaN check
  const lastState = statesA[299];
  assert.ok(!isNaN(lastState.bodyPos[0]));
  assert.ok(!isNaN(lastState.bodyPos[1]));
  assert.ok(!isNaN(lastState.bodyPos[2]));
  for (const j of lastState.joints) {
    assert.ok(!isNaN(j.angle), `Joint ${j.name} angle must not be NaN`);
  }
});
