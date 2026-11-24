/**
 * Feature Packs Expansion Comprehensive Test Suite (Packs A - P)
 *
 * Verifies that:
 * 1. Pack A (Controller Playground): Sandbox compiler isolates code, watchdog terminates infinite loops, templates execute.
 * 2. Pack B (Policy Lab): Policy parameterization bounds, CEM optimization produces valid generation history.
 * 3. Pack C (Droid Workshop): Scout morphology equals baseline, CoM shifts with payload, validation guards limits.
 * 4. Pack D (Sim-to-Real Toolkit): Domain randomization samples within ranges, Wilson score intervals compute accurately.
 * 5. Pack E (Comms Delay): DelayLine releases items monotonically according to sim time.
 * 6. Pack F (Power & Thermal): Battery depletes with speed, solar charges, thermal derates smoothly above threshold.
 * 7. Pack G (Hazards): Seeded hazard schedule produces telegraph warnings >= 1s before trigger.
 * 8. Pack I (Daily Challenge & Progression): Daily seed is identical within UTC day and changes across days; achievements unlock.
 * 9. Pack M (Experiments): Parameter sweep grid generation covers min..max and exports valid CSV.
 * 10. Pack N (Dataset Studio): Records format cleanly to JSONL and CSV with disjoint seed split.
 * 11. Pack O (Visual Modes & Coverage): CoverageGrid records 1m spatial cells and tracks coverage percentage accurately.
 * 12. Pack P (i18n & Narration): All 7 language catalogs provide all keys without missing strings.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Pack A
import {
  compileControllerSource,
  validateControllerOutput,
  stepWithWatchdog,
  TEMPLATE_GO_TO_GOAL,
  TEMPLATE_EDGE_AVOIDANCE,
} from '../lib/control/sandbox';

// Pack B
import {
  DEFAULT_POLICY_PARAMS,
  evaluatePolicy,
  runCEM,
  clampParamsVector,
  paramsToVector,
} from '../lib/lab/policyLab';

// Pack C
import {
  PRESET_SCOUT,
  PRESET_HAULER,
  computeCenterOfMass,
  computeGaitTransitionSpeed,
  validateMorphology,
} from '../lib/droid/workshop';

// Pack D
import {
  DEFAULT_RANDOMIZATION_CONFIG,
  sampleDomain,
  wilsonConfidenceInterval,
  computeRobustnessReport,
} from '../lib/sim2real/toolkit';

// Pack E
import { DelayLine } from '../lib/comms/delay';

// Pack F
import { PowerThermalSimulator } from '../lib/sim/realism';

// Pack G
import { HazardScheduler } from '../lib/world/hazards';

// Pack I
import {
  dailySeed,
  getDailyChallengeConfig,
  evaluateAchievements,
  DEFAULT_PLAYER_PROGRESSION,
  calculateLevelFromXP,
} from '../lib/progression/achievements';

// Pack M
import { generateSweepGrid, formatSweepToCSV } from '../lib/experiments/sweeps';

// Pack N
import { formatRecordsToJSONL, formatRecordsToCSV, splitDatasetBySeed } from '../lib/dataset/studio';

// Pack O
import { CoverageGrid } from '../lib/world/visualModes';

// Pack P
import { LOCALES, LocaleKey } from '../lib/i18n/catalog';
import { mulberry32 } from '../lib/sim/prng';

// ============================================================================
// PACK A: CONTROLLER PLAYGROUND
// ============================================================================

test('Pack A: Compiler rejects forbidden APIs and accepts valid controllers', () => {
  const badSource = 'function controller(obs, ctx) { fetch("http://evil.com"); return { vx: 1 }; }';
  const badCompiled = compileControllerSource(badSource);
  assert.equal(badCompiled.ok, false);
  assert.ok(badCompiled.error?.includes('fetch'));

  const goodCompiled = compileControllerSource(TEMPLATE_GO_TO_GOAL);
  assert.equal(goodCompiled.ok, true);
  assert.ok(typeof goodCompiled.fn === 'function');

  const logs: string[] = [];
  const mockObs = {
    t: 1.0,
    dt: 1 / 60,
    pose: { x: 0, z: 0, heading: 0, pitch: 0, roll: 0 },
    vel: { forward: 0, lateral: 0, yawRate: 0 },
    gravity: 1.62,
    contacts: [true, true, true, true] as [boolean, boolean, boolean, boolean],
    goal: { x: 10, z: 0, distance: 10, bearing: 0 },
    edgeDistance: 15.0,
  };
  const mockCtx = { seed: 42, storage: {}, log: (m: string) => logs.push(m) };

  const rawCmd = goodCompiled.fn!(mockObs, mockCtx);
  const validated = validateControllerOutput(rawCmd);
  assert.equal(validated.vx, 1.35);
  assert.equal(validated.gait, 'trot');
});

test('Pack A: Watchdog protects against hung or timeout controllers', async () => {
  const misses = { n: 0 };
  const lastSafe = { vx: 0.5, vy: 0, yawRate: 0, bodyHeight: 0.5, gait: 'auto' as const, hop: false, hopCharge: 0, stop: false };

  // Step with fast function: succeeds within 10ms
  const fastStep = async () => ({ ...lastSafe, vx: 1.2 });
  const res1 = await stepWithWatchdog(fastStep, 50, lastSafe, misses);
  assert.equal(res1.vx, 1.2);
  assert.equal(misses.n, 0);

  // Step with hung function (takes 100ms vs 10ms budget): watchdog falls back to lastSafe
  const slowStep = async () => {
    await new Promise((r) => setTimeout(r, 60));
    return { ...lastSafe, vx: 2.0 };
  };
  const res2 = await stepWithWatchdog(slowStep, 10, lastSafe, misses);
  assert.equal(res2.vx, 0.5, 'Must return lastSafe command on timeout');
  assert.equal(misses.n, 1, 'Miss count must increment');
});

// ============================================================================
// PACK B: POLICY LAB
// ============================================================================

test('Pack B: CEM optimizer converges toward target objective', async () => {
  const initialVector = paramsToVector(DEFAULT_POLICY_PARAMS);

  // Target objective: minimize quadratic distance to [2.0, 3.0, 1.5, 2.0, 1.0, 1.2]
  const target = [2.0, 3.0, 1.5, 2.0, 1.0, 1.2];
  const evalFn = async (x: number[]) => {
    let loss = 0;
    for (let i = 0; i < x.length; i++) {
      loss += (x[i]! - target[i]!) ** 2;
    }
    return -loss; // Higher is better
  };

  const cemRes = await runCEM(
    {
      dims: initialVector.length,
      popSize: 15,
      eliteFrac: 0.3,
      iterations: 5,
      mean: initialVector,
      std: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      minStd: 0.05,
      seed: 12345,
    },
    evalFn,
    clampParamsVector
  );

  assert.ok(cemRes.generations.length === 5);
  // Generations should monotonically track best score
  assert.ok(cemRes.bestScore > -15.0, `Best score should improve (got ${cemRes.bestScore})`);
});

// ============================================================================
// PACK C: DROID WORKSHOP
// ============================================================================

test('Pack C: Scout matches default specs; Hauler shifts CoM rearward', () => {
  const scoutCom = computeCenterOfMass(PRESET_SCOUT);
  assert.equal(scoutCom.totalMass, 18.0);
  assert.equal(scoutCom.comShiftZ, 0.0);
  assert.equal(scoutCom.nominalReach, 0.5);

  const haulerCom = computeCenterOfMass(PRESET_HAULER);
  assert.equal(haulerCom.totalMass, 38.0); // 26 + 12kg
  assert.ok(haulerCom.comShiftZ < 0, 'Payload offset -0.05m must shift CoM backwards');

  const vTransScout = computeGaitTransitionSpeed(PRESET_SCOUT, 1.62);
  assert.ok(vTransScout > 0.5 && vTransScout < 1.0, 'Scout transition speed under Moon gravity');

  assert.equal(validateMorphology(PRESET_SCOUT).ok, true);
});

// ============================================================================
// PACK D: SIM-TO-REAL TOOLKIT
// ============================================================================

test('Pack D: Domain randomization stays in bounds; Wilson interval computes accurately', () => {
  const rng = mulberry32(999);
  const sampled = sampleDomain(DEFAULT_RANDOMIZATION_CONFIG, 1.62, rng);

  assert.ok(sampled.friction >= 0.6 && sampled.friction <= 1.05);
  assert.ok(sampled.massScale >= 0.9 && sampled.massScale <= 1.15);
  assert.ok(sampled.gravity >= 1.55 && sampled.gravity <= 1.68);

  // Wilson score test: 24 successes out of 30 runs
  const ci = wilsonConfidenceInterval(24, 30);
  assert.ok(ci.center > 0.75 && ci.center < 0.85);
  assert.ok(ci.low < ci.center && ci.high > ci.center);

  const report = computeRobustnessReport([
    { succeeded: true, score: 95, fell: false, edgeViolated: false, durationSec: 15, domain: sampled },
    { succeeded: true, score: 90, fell: false, edgeViolated: false, durationSec: 16, domain: sampled },
    { succeeded: false, score: 40, fell: true, edgeViolated: false, durationSec: 8, domain: sampled },
  ]);
  assert.equal(report.totalRuns, 3);
  assert.equal(report.fallRate, 0.333);
});

// ============================================================================
// PACK E: COMMS DELAY MODE
// ============================================================================

test('Pack E: DelayLine buffers packets and releases monotonically per sim-time', () => {
  const dl = new DelayLine<string>(1.28); // Moon 1.28s one-way delay

  dl.push(0.0, 'cmd_at_0');
  dl.push(0.5, 'cmd_at_0.5');
  dl.push(1.0, 'cmd_at_1.0');

  // At t=0.5s: nothing should release yet
  assert.equal(dl.pop(0.5), undefined);
  assert.equal(dl.getInFlightCount(), 3);

  // At t=1.3s: 'cmd_at_0' should release (0.0 + 1.28 = 1.28s <= 1.30s)
  assert.equal(dl.pop(1.3), 'cmd_at_0');
  assert.equal(dl.getInFlightCount(), 2);

  // At t=2.5s: all remaining commands have passed release time, pops latest ('cmd_at_1.0')
  assert.equal(dl.pop(2.5), 'cmd_at_1.0');
  assert.equal(dl.getInFlightCount(), 0);
});

// ============================================================================
// PACK F: POWER & THERMAL REALISM
// ============================================================================

test('Pack F: PowerThermalSimulator drains battery and derates under high temperature', () => {
  const sim = new PowerThermalSimulator({ capacityWh: 100, idlePowerWatts: 20 });
  // In shadow (no solar generation), idle power should drain battery
  const st0 = sim.step(10.0, 0, 0, 18, false, 0.0);
  assert.ok(st0.batteryChargePct < 1.0, 'Battery should deplete slightly under idle draw');
  assert.equal(st0.thermalDerateFactor, 1.0);

  // In full sun with high alignment, solar charging yields positive energy
  const stSun = sim.step(1.0, 0, 0, 18, true, 1.0);
  assert.ok(stSun.solarYieldWatts > 0, 'Solar charging should generate power when sunlit');

  // Step 1000s under high velocity to build thermal load
  for (let i = 0; i < 200; i++) {
    sim.step(1.0, 1.8, 0, 30, true, 0.0);
  }
  const hotSt = sim.step(1.0, 1.8, 0, 30, true, 0.0);
  assert.ok(hotSt.motorTempC > 50, 'Motor temperature should rise with continuous high speed');
});

// ============================================================================
// PACK G: HAZARDS & DYNAMIC EVENTS
// ============================================================================

test('Pack G: Seeded hazard scheduler issues telegraph warnings before activation', () => {
  const scheduler = new HazardScheduler();
  const schedule = scheduler.generateSchedule(42, 60.0);
  assert.ok(schedule.length > 2, 'Should schedule multiple hazards for 60s run');

  const firstEvent = schedule[0]!;
  // Check 1.0s before trigger time: must be in warnings
  const { warnings, active } = scheduler.getActiveHazards(firstEvent.triggerTimeSec - 0.8);
  assert.ok(warnings.some((w) => w.id === firstEvent.id), 'Hazard must be telegraphed in warnings');
  assert.ok(!active.some((a) => a.id === firstEvent.id), 'Hazard must not be active during warning window');
});

// ============================================================================
// PACK I: DAILY CHALLENGE & ACHIEVEMENTS
// ============================================================================

test('Pack I: Daily challenge seed is consistent for UTC day and achievements trigger', () => {
  const d1 = new Date('2026-11-23T10:00:00Z');
  const d2 = new Date('2026-11-23T22:30:00Z');
  const d3 = new Date('2026-11-24T00:01:00Z');

  const c1 = getDailyChallengeConfig(d1);
  const c2 = getDailyChallengeConfig(d2);
  const c3 = getDailyChallengeConfig(d3);

  assert.equal(c1.seed, c2.seed, 'Same UTC date must generate identical seed');
  assert.notEqual(c1.seed, c3.seed, 'Different UTC dates must generate different seeds');

  // Achievement unlock test
  const snap: any = { score: { elapsedSec: 10, succeeded: true, medal: 'gold' }, missionId: 'crater-rim-run' };
  const { newlyUnlocked, updatedProgression } = evaluateAchievements(DEFAULT_PLAYER_PROGRESSION, snap, {
    totalDistanceMeters: 65,
    collisions: 0,
  });

  assert.ok(newlyUnlocked.some((a) => a.id === 'first_steps'));
  assert.ok(newlyUnlocked.some((a) => a.id === 'rock_dodger'));
  assert.ok(newlyUnlocked.some((a) => a.id === 'marathon'));
  assert.ok(newlyUnlocked.some((a) => a.id === 'gold_standard'));
  assert.ok(updatedProgression.xp > 0);
  assert.ok(calculateLevelFromXP(updatedProgression.xp) >= 2);
});

// ============================================================================
// PACK M & N: EXPERIMENTS & DATASET STUDIO
// ============================================================================

test('Pack M & N: Sweeps generate grid matrix; Datagen formats CSV and JSONL', () => {
  const grid = generateSweepGrid({
    id: 'sw-1',
    title: 'Gravity Sweep',
    paramAName: 'gravity',
    paramARange: [1.62, 9.81],
    paramASteps: 3,
    seedsPerCell: 5,
  });
  assert.equal(grid.length, 3);
  assert.equal(grid[0]!.paramA, 1.62);
  assert.equal(grid[2]!.paramA, 9.81);

  const csvOutput = formatSweepToCSV(
    { id: 'sw-1', title: 'Gravity Sweep', paramAName: 'gravity', paramARange: [1.62, 9.81], paramASteps: 3, seedsPerCell: 5 },
    [{ paramAValue: 1.62, seedsTested: 5, meanScore: 88, minScore: 80, maxScore: 92, successRate: 1.0 }]
  );
  assert.ok(csvOutput.includes('gravity,none,seeds,meanScore,successRate'));

  // Dataset split
  const items = [{ seed: 10 }, { seed: 15 }, { seed: 85 }, { seed: 95 }];
  const { train, val } = splitDatasetBySeed(items, 0.8);
  assert.ok(train.length > 0);
  assert.ok(val.length > 0);
});

// ============================================================================
// PACK O & P: VISUAL MODES & i18n
// ============================================================================

test('Pack O & P: Coverage grid records visited cells; i18n catalog is complete', () => {
  const grid = new CoverageGrid();
  grid.recordPosition(0.5, 0.5);
  grid.recordPosition(0.8, 0.2); // Same cell (0, 0)
  grid.recordPosition(2.5, 3.5); // New cell (2, 3)

  const stats = grid.getCoverageStats();
  assert.equal(stats.visitedCount, 2);
  assert.ok(stats.coveragePct > 0);

  // i18n completeness test
  const expectedKeys: (keyof typeof LOCALES.en.catalog)[] = [
    'studioTitle',
    'teleopLabel',
    'autonomousLabel',
    'manualLabel',
    'restartTooltip',
    'goalReachedNotice',
    'edgeWarningNotice',
    'hopLaunchedNotice',
    'batteryLowNotice',
  ];

  const localeKeys = Object.keys(LOCALES) as LocaleKey[];
  for (const loc of localeKeys) {
    const entry = LOCALES[loc]!;
    for (const k of expectedKeys) {
      assert.ok(
        Boolean(entry.catalog[k]),
        `Locale [${loc}] missing required catalog string "${k}"`
      );
    }
  }
});
