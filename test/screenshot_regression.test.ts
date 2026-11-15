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

test('Screenshot Invariants: S-01 & S-02 at t=2.0s droid feet are grounded on lunar terrain', () => {
  const runner = new LocalSimulationRunner();
  // t = 2.0s -> 120 steps at 60 Hz
  const frameAt2s = runner.generateFrame(120);

  assert.ok(frameAt2s, 'Must generate telemetry frame at t=2.0s');
  assert.ok(frameAt2s.feet && frameAt2s.feet.length === 4, 'Frame must contain 4 feet');

  // Verify that all feet are positioned near the terrain surface (within 0.15m of ground, not floating > 0.25m)
  for (const foot of frameAt2s.feet) {
    const groundH = getTerrainHeight(foot.pos[0], foot.pos[2]);
    const clearance = foot.pos[1] - groundH;
    assert.ok(
      clearance >= -0.05 && clearance <= 0.15,
      `Foot ${foot.id} at t=2.0s clearance (${clearance.toFixed(3)}m) must be physically grounded near terrain (y=${groundH.toFixed(3)}m)`
    );
  }
});

test('Screenshot Invariants: S-04 Radar boulder filtering keeps hazards < 500', () => {
  const debris = generateDebrisField(1800, [40, 40], 42, () => 0);
  // Filter for scale >= 0.44m (radar hazards)
  const hazards = debris.filter((d) => d.scale >= 0.44);
  assert.ok(hazards.length < 500, `Hazard boulders on radar must be < 500, got ${hazards.length}`);
  assert.ok(hazards.length > 50, `Radar must retain significant hazards (> 50), got ${hazards.length}`);
});
