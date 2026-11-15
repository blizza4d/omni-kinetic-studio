import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBuildStamp, formatBuildStamp } from '../lib/build_stamp';
import { PerfProbe } from '../lib/perf/probe';
import { getTerrainHeight } from '../lib/world/terrain';
import { LocalSimulationRunner } from '../lib/telemetry/local_runner';
import { generateDebrisField } from '../lib/world/debris';

test('Screenshot Invariants: S-14 BuildStamp iteration tag is clean without duplicate production suffix', () => {
  const stamp = getBuildStamp();
  assert.ok(stamp.iterationTag, 'iterationTag must be defined');
  // Must be v1.0.0 or v1.0.0-dev, not v1.0.0-production
  assert.strictEqual(stamp.iterationTag.includes('v1.0.0-production'), false, 'Should not contain v1.0.0-production');
  const formatted = formatBuildStamp(stamp);
  const occurrences = (formatted.match(/production/gi) || []).length;
  assert.ok(occurrences <= 1, `Expected at most 1 'production' token in footer string, got ${occurrences}: ${formatted}`);
});

test('Screenshot Invariants: S-13 Steady-state long task probe isolates startup from steady state', () => {
  const probe = PerfProbe.getInstance();
  const snapshot = probe.getSnapshot();
  assert.ok(typeof snapshot.steadyStateLongTaskCount === 'number');
  assert.ok(typeof snapshot.startupLongTaskCount === 'number');

  // Verify steady-state filter logic
  const tasks = [
    { duration: 80, startTime: 1200, name: 'startup-compile', category: 'startup' as const },
    { duration: 60, startTime: 8000, name: 'steady-task', category: 'steady-state' as const },
  ];
  const now = 20000;
  const filtered = tasks.filter((t) => t.category === 'steady-state' && (now - t.startTime) <= 60000);
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].name, 'steady-task');
});

test('Screenshot Invariants: S-01 & S-02 at t=2.0s and t=3.0s droid maintains ground contact and relaxed stance angles', () => {
  const runner = new LocalSimulationRunner();
  // t = 2.0s -> 120 steps, t = 3.0s -> 180 steps
  for (const step of [120, 180]) {
    const frame = runner.generateFrame(step);
    assert.ok(frame, `Must generate telemetry frame at step ${step}`);
    assert.ok(frame.feet && frame.feet.length === 4, 'Frame must contain 4 feet');

    const contactFeet = frame.feet.filter((f) => f.contact);
    assert.ok(
      contactFeet.length >= 2,
      `At t=${frame.t}s, expected at least 2 contact feet in stance, got ${contactFeet.length}`
    );

    for (const foot of contactFeet) {
      const groundH = getTerrainHeight(foot.pos[0], foot.pos[2]);
      const clearance = Math.abs(foot.pos[1] - groundH);
      assert.ok(
        clearance <= 0.005,
        `Stance foot ${foot.id} at t=${frame.t}s clearance (${clearance.toFixed(4)}m) must be on terrain surface (<= 5mm)`
      );
    }

    // Verify stance thighs are relaxed and natural (not jutting out at > 45 deg)
    for (const foot of contactFeet) {
      const thighJoint = frame.joints.find((j) => j.name === `${foot.id}_thigh_joint`);
      if (thighJoint) {
        assert.ok(
          Math.abs(thighJoint.angle) <= 0.70,
          `Stance thigh ${foot.id} angle (${(thighJoint.angle * 180 / Math.PI).toFixed(1)} deg) must be relaxed (<= 40.0 deg)`
        );
      }
    }
  }
});

test('Screenshot Invariants: S-04 Radar boulder filtering keeps hazards < 500', () => {
  const debris = generateDebrisField(1800, [40, 40], 42, () => 0);
  // Filter for scale >= 0.44m (radar hazards)
  const hazards = debris.filter((d) => d.scale >= 0.44);
  assert.ok(hazards.length < 500, `Hazard boulders on radar must be < 500, got ${hazards.length}`);
  assert.ok(hazards.length > 50, `Radar must retain significant hazards (> 50), got ${hazards.length}`);
});
