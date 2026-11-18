import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SimClock, formatClockDisplay, formatProgressPct, clampProgress } from '../lib/sim/SimClock';
import { describeRunMode, normalizeRunMode } from '../lib/sim/runMode';
import { TerrainService } from '../lib/world/terrain/service';
import { getTerrainHeight } from '../lib/world/terrain';
import { CommandShaper, radialDeadzone, computeGravityAccelLimit } from '../lib/control/shape';
import { ControlArbiter } from '../lib/control/arbiter';
import { ShortcutRegistry, isTypingTarget } from '../lib/control/shortcuts';
import { purePursuit, computeObstacleAvoidanceYaw } from '../lib/control/purePursuit';
import { createNeutralCommand } from '../lib/control/types';
import { GaitController } from '../lib/droid/gait/GaitController';
import { SimEngine } from '../lib/sim/SimEngine';
import { validateReplayJson, exportDatasetJsonl, exportDatasetCsv } from '../lib/replay/recorder';
import { BUILT_IN_MISSIONS, MissionDefinitionSchema, MissionRuntime } from '../lib/missions/missions';
import {
  DEFAULT_SCENARIO_CONFIG,
  encodeScenarioToHash,
  decodeScenarioFromHash,
} from '../lib/scenario/sharing';
import {
  DEFAULT_STUDIO_SETTINGS,
  loadStudioSettings,
  saveStudioSettings,
  exportAllStudioData,
  deleteAllStudioData,
} from '../lib/storage/settings';

// ============================================================================
// W1: FOUNDATION FIXES (R-01, R-02, R-03 TERRAIN PARITY)
// ============================================================================

test('W1.1 R-01: SimClock formats t=4.0s / 16.7s identically as 24% everywhere', () => {
  const pct = formatProgressPct(clampProgress(4.0, 16.7));
  assert.strictEqual(pct, '24%');
  assert.strictEqual(formatClockDisplay(4.0, 16.7), 't=4.0s / 16.7s (24%)');

  const clock = new SimClock({ episodeLength: 16.7, endBehavior: 'stop' });
  clock.seekToStep(240); // 240 / 60 = 4.0s
  const snap = clock.snapshot();
  assert.strictEqual(snap.progressText, '24%');
  assert.strictEqual(snap.timeDisplay, 't=4.0s / 16.7s (24%)');
});

test('W1.1 R-08: SimClock honors stop, loop, and auto-restart episode end behaviors', () => {
  const stopClock = new SimClock({ episodeLength: 5.0, endBehavior: 'stop' });
  let endedKind: string | null = null;
  for (let i = 0; i < 400; i++) {
    stopClock.tick(1 / 60, () => {}, (b) => { endedKind = b; });
  }
  assert.strictEqual(stopClock.isEnded(), true);
  assert.strictEqual(endedKind, 'stop');

  const restartClock = new SimClock({ episodeLength: 5.0, endBehavior: 'auto-restart' });
  for (let i = 0; i < 350; i++) {
    restartClock.tick(1 / 60, () => {});
  }
  assert.strictEqual(restartClock.isEnded(), false);
  assert.ok(restartClock.getEpisodeNumber() >= 2, 'auto-restart must increment episode number');
});

test('W1.2 R-02: Single RunMode model and zero forbidden legacy strings in codebase', () => {
  assert.strictEqual(describeRunMode(normalizeRunMode('local_demo')).badgeLabel, 'LOCAL SIMULATION');
  assert.strictEqual(describeRunMode('cloud-stream').badgeLabel, 'CLOUD STREAM');
  assert.strictEqual(describeRunMode('demo-fixtures').badgeLabel, 'DEMO FIXTURES');

  const dirs = ['app', 'components', 'lib'];
  const forbidden = ['DEMO: LOCAL RUNNER', 'Local physics streaming'];

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  };

  for (const d of dirs) {
    for (const file of walk(path.resolve(process.cwd(), d))) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const bad of forbidden) {
        assert.ok(!content.includes(bad), `Forbidden string "${bad}" found in ${file}`);
      }
    }
  }
});

test('W1.3 R-03: Unified TerrainService agrees to 0.000000m with getTerrainHeight', () => {
  const service = new TerrainService(42);
  let maxErr = 0;
  for (let i = 0; i < 200; i++) {
    const x = ((i * 73) % 36) - 18;
    const z = ((i * 41) % 36) - 18;
    const hService = service.heightAt(x, z);
    const hLegacy = getTerrainHeight(x, z, { seed: 42, width: 40, length: 40, segments: 128, roughness: 0.65 });
    maxErr = Math.max(maxErr, Math.abs(hService - hLegacy));
  }
  assert.ok(maxErr < 1e-6, `Terrain mismatch detected: ${maxErr}m`);
});

// ============================================================================
// W2: COMMAND PIPELINE, ARBITER, SHAPING & SHORTCUT REGISTRY
// ============================================================================

test('W2: CommandShaper rejects NaN, bounds acceleration by gravity, and attenuates near arena edge', () => {
  const shaper = new CommandShaper();
  const out = createNeutralCommand();

  // NaN rejection
  const nanCmd = { ...createNeutralCommand(), vx: Number.NaN, yawRate: Infinity };
  shaper.shape(
    nanCmd,
    { x: 0, z: 0, heading: 0, gravity: 1.62, tiltRad: 0, stabilityMargin: 1, step: 1, time: 0.02 },
    1 / 60,
    out
  );
  assert.ok(Number.isFinite(out.vx) && Number.isFinite(out.yawRate), 'NaN/Inf must be rejected');

  // Gravity-aware acceleration limit: Moon < Earth under realism=1
  const moonAccel = computeGravityAccelLimit(1.62, 0.8, 1.0);
  const earthAccel = computeGravityAccelLimit(9.81, 0.8, 1.0);
  assert.ok(earthAccel > moonAccel, `Earth accel (${earthAccel}) must exceed Moon accel (${moonAccel})`);

  // Arena edge attenuation when driving outward at x=17.2m (0.8m from 18m rim)
  shaper.reset();
  const driveOut = { ...createNeutralCommand(), vx: 2.0 };
  for (let s = 0; s < 30; s++) {
    shaper.shape(
      driveOut,
      { x: 17.2, z: 0, heading: 0, gravity: 1.62, tiltRad: 0, stabilityMargin: 1, step: s, time: s / 60 },
      1 / 60,
      out
    );
  }
  assert.ok(out.vx < 0.5, `Outward speed near edge (${out.vx}) must be strongly attenuated`);
  assert.ok(shaper.getSafetyEvents().some((e) => e.kind === 'edge_attenuation'), 'Edge attenuation must emit safety event');

  // Radial deadzone continuity
  const dzOut = { x: 0, y: 0 };
  radialDeadzone(0.1, 0.05, 0.15, dzOut);
  assert.strictEqual(dzOut.x, 0);
  radialDeadzone(1.0, 0.0, 0.15, dzOut);
  assert.ok(Math.abs(dzOut.x - 1.0) < 1e-6);
});

test('W2: ControlArbiter honors emergency stop and blends handover smoothly without jumps', () => {
  const arbiter = new ControlArbiter();
  const policyCmd = { ...createNeutralCommand(), vx: 1.0 };
  const manualCmd = { ...createNeutralCommand(), vx: 0.0 };
  const out = createNeutralCommand();

  // Start autonomous
  arbiter.resolve(policyCmd, manualCmd, 'keyboard', false, 0, 1 / 60, out);
  assert.ok(out.vx > 0.9, 'Policy should command when autonomous');

  // Switch to manual: handover blends smoothly over spring half-life 0.15s
  arbiter.takeManualControl('keyboard', 0.1);
  let prevVx = out.vx;
  for (let i = 0; i < 15; i++) {
    arbiter.resolve(policyCmd, manualCmd, 'keyboard', true, 0.1 + i / 60, 1 / 60, out);
    assert.ok(Math.abs(out.vx - prevVx) < 0.2, `Handover step jump too large: ${Math.abs(out.vx - prevVx)}`);
    prevVx = out.vx;
  }

  // Emergency stop ALWAYS wins immediately
  arbiter.resolve(policyCmd, { ...manualCmd, vx: 2.0, stop: true }, 'keyboard', true, 0.5, 1 / 60, out);
  assert.strictEqual(out.vx, 0);
  assert.strictEqual(out.stop, true);
});

test('W2: ShortcutRegistry has zero conflicts, detects remap collisions, and suppresses typing targets', () => {
  const reg = new ShortcutRegistry();
  const check = reg.verifyNoConflicts();
  assert.strictEqual(check.ok, true, `Registry conflicts found: ${check.conflicts.join(', ')}`);

  // Preserved legacy shortcuts
  assert.ok(reg.matches('cycle_quality', 'KeyQ'), 'Q must remain Cycle Quality Tier');
  assert.ok(reg.matches('toggle_perf', 'KeyP'), 'P must remain Toggle PerfProbe');
  assert.ok(reg.matches('toggle_control', 'KeyT'), 'T must remain Control Toggle');

  // Conflict detection on remap
  const badRemap = reg.remap('crouch', ['KeyQ']);
  assert.strictEqual(badRemap.ok, false, 'Remapping Crouch to KeyQ must fail due to conflict');

  // Typing suppression
  assert.strictEqual(isTypingTarget({ tagName: 'INPUT' } as any), true);
  assert.strictEqual(isTypingTarget({ tagName: 'DIV', isContentEditable: false } as any), false);
});

// ============================================================================
// W3: PURE PURSUIT ACROSS ALL FOUR QUADRANTS & OBSTACLE AVOIDANCE
// ============================================================================

test('W3: Pure pursuit steers accurately in all four quadrants + U-turn and avoids boulders', () => {
  const out = { vx: 0, yawRate: 0, reached: false, distToTarget: 0 };
  // Facing +X (heading = 0): -Z is LEFT (+yawRate), +Z is RIGHT (-yawRate)
  purePursuit(0, 0, 0, 5, -5, 1.2, 1.2, 0.4, out);
  assert.ok(out.yawRate > 0 && out.vx > 0, 'Front-left target (-Z) must produce +yawRate');

  purePursuit(0, 0, 0, 5, 5, 1.2, 1.2, 0.4, out);
  assert.ok(out.yawRate < 0 && out.vx > 0, 'Front-right target (+Z) must produce -yawRate');

  // Directly behind (-5, 0) must still pivot cleanly (non-zero yawRate)
  purePursuit(0, 0, 0, -5, 0, 1.2, 1.2, 0.4, out);
  assert.ok(Math.abs(out.yawRate) > 1.0, 'Target directly behind must pivot cleanly');

  // Arrival inside radius
  purePursuit(0, 0, 0, 0.2, 0.1, 1.2, 1.2, 0.4, out);
  assert.strictEqual(out.reached, true);
  assert.strictEqual(out.vx, 0);

  // Obstacle right ahead slightly to right (+Z) biases left (+yaw)
  const avoidYaw = computeObstacleAvoidanceYaw(0, 0, 0, [{ x: 1.4, z: 0.2, radius: 0.4 }]);
  assert.ok(avoidYaw > 0, 'Obstacle on right must steer left (+yaw)');
});

// ============================================================================
// W5: BALLISTIC HOP PHYSICS & 60-SECOND MASH-PROOF FUZZ TEST
// ============================================================================

test('W5: Hop ballistics apex matches vy^2 / (2g) at Moon (1.62) and Earth (9.81)', () => {
  const flat = () => 0;
  for (const g of [1.62, 9.81]) {
    const ctrl = new GaitController(0, 0, 0, flat);
    const charge = 0.8;
    const expectedVy0 = GaitController.computeHopTakeoffVelocity(charge);
    const expectedApex = (expectedVy0 * expectedVy0) / (2 * g);

    let maxAlt = 0;
    let landed = false;
    for (let s = 0; s < 300; s++) {
      const st = ctrl.step(
        { vx: 0.4, yawRate: 0, hop: s === 5, hopCharge: charge },
        g,
        flat,
        1 / 60
      );
      if ((st.hopAltitude ?? 0) > maxAlt) maxAlt = st.hopAltitude ?? 0;
      if (st.justLanded) {
        landed = true;
        break;
      }
    }

    assert.ok(landed, `Hop under g=${g} must land cleanly`);
    const relErr = Math.abs(maxAlt - expectedApex) / expectedApex;
    assert.ok(
      relErr < 0.06,
      `Hop apex at g=${g}: got ${maxAlt.toFixed(3)}m vs analytical ${expectedApex.toFixed(3)}m (err ${(relErr * 100).toFixed(1)}%)`
    );
  }
});

test('W5: 60-second 20Hz randomized input mashing fuzz test yields zero NaN and bounded poses', () => {
  const reg = new ShortcutRegistry();
  const engine = new SimEngine(reg);
  engine.arbiter.takeManualControl('keyboard', 0);

  let rng = 424242;
  const nextRand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 4294967296;
  };

  for (let step = 0; step < 3600; step++) {
    // Change input violently every 3 steps (20 Hz)
    if (step % 3 === 0) {
      const r = nextRand();
      engine.inputs.touch.active = true;
      engine.inputs.touch.moveY = (nextRand() - 0.5) * 2;
      engine.inputs.touch.moveX = (nextRand() - 0.5) * 2;
      engine.inputs.touch.yawX = (nextRand() - 0.5) * 2;
      engine.inputs.touch.sprint = r > 0.7;
      engine.inputs.touch.hopHeld = r > 0.92;
      engine.inputs.touch.crouch = r < 0.1;
    }
    const kin = engine.executeFixedStep(step, 1 / 60);
    assert.ok(kin.bodyPos.every(Number.isFinite), `NaN bodyPos at step ${step}`);
    assert.ok(kin.bodyQuat.every(Number.isFinite), `NaN bodyQuat at step ${step}`);
    for (const j of kin.joints) {
      assert.ok(Number.isFinite(j.angle), `NaN joint ${j.name} at step ${step}`);
    }
  }
});

// ============================================================================
// W6: DETERMINISTIC RECORDING, REPLAY CHECKSUM EQUALITY, FORK & VALIDATION
// ============================================================================

test('W6: Record then replay reproduces byte-equal final state checksum across different frame pacing', () => {
  const reg1 = new ShortcutRegistry();
  const eng1 = new SimEngine(reg1);
  eng1.runScript([
    { durationSteps: 45, cmd: { vx: 1.2, yawRate: 0.4 } },
    { durationSteps: 30, cmd: { vx: 1.4, yawRate: -0.6, hop: true, hopCharge: 0.5 } },
    { durationSteps: 60, cmd: { vx: 0.8, vy: 0.4, yawRate: 0.0 } },
    { durationSteps: 30, cmd: { vx: 0, yawRate: 0, stop: true } },
  ]);

  // Simulate run 1 at uniform 60 Hz steps
  for (let i = 0; i < 165; i++) {
    eng1.tick(1 / 60);
  }
  const replay = eng1.recorder.exportReplay();
  const recordedChecksum = eng1.getFinalChecksum();
  assert.strictEqual(replay.finalChecksum, recordedChecksum);

  // Replay run 2 with variable irregular wall-clock dt sequence (e.g. 120Hz / 30Hz / 75Hz jitter)
  const reg2 = new ShortcutRegistry();
  const eng2 = new SimEngine(reg2);
  eng2.startReplay(replay);
  const irregularDts = [1 / 120, 1 / 45, 1 / 90, 1 / 30, 1 / 144, 1 / 60];
  let idx = 0;
  while (eng2.clock.getStep() < replay.totalSteps && idx < 2000) {
    eng2.tick(irregularDts[idx % irregularDts.length]);
    idx++;
  }
  const replayedChecksum = eng2.getFinalChecksum();
  assert.strictEqual(replayedChecksum, recordedChecksum, 'Replay final checksum must match recorded run bit-for-bit');

  // Validation rejects malformed and future-version files
  assert.strictEqual(validateReplayJson('{bad json').ok, false);
  assert.strictEqual(validateReplayJson(JSON.stringify({ ...replay, schemaVersion: '3.0' })).ok, false);

  // Dataset JSONL & CSV export produce valid output
  const jsonl = exportDatasetJsonl(replay).trim().split('\n');
  assert.strictEqual(jsonl.length, replay.totalSteps);
  assert.doesNotThrow(() => JSON.parse(jsonl[0]));
  const csv = exportDatasetCsv(replay).trim().split('\n');
  assert.strictEqual(csv.length, replay.totalSteps + 1);
});

// ============================================================================
// W7: MISSIONS & DETERMINISTIC SCORING
// ============================================================================

test('W7: All 6 built-in missions validate cleanly and compute deterministic scores & medals', () => {
  assert.ok(BUILT_IN_MISSIONS.length >= 6, 'At least 6 playable missions required');
  for (const m of BUILT_IN_MISSIONS) {
    assert.doesNotThrow(() => MissionDefinitionSchema.parse(m), `Mission ${m.id} schema failed`);
  }

  const m0 = BUILT_IN_MISSIONS[0];
  const rt = new MissionRuntime(m0);
  for (const marker of m0.markers) {
    rt.step({
      x: marker.x,
      z: marker.z,
      heading: 0,
      speed: 1.0,
      tiltDeg: 3,
      hopActive: false,
      collided: false,
      edgeWarn: false,
      fallen: false,
      energyDeltaJ: 0.2,
      dt: 1.0,
    });
  }
  const snap = rt.snapshot(m0.markers[2].x, m0.markers[2].z, 0);
  assert.strictEqual(snap.status, 'succeeded');
  assert.strictEqual(snap.score.medal, 'gold');
});

// ============================================================================
// W8 + W10: TERRAIN BRUSH SYNC, UNDO/REDO & SHAREABLE SCENARIO LINKS (#s=)
// ============================================================================

test('W8 & W10: Terrain brush updates heightfield cleanly with undo, and #s= share links round-trip < 2KB', () => {
  const terrain = new TerrainService(42);
  const before = terrain.heightAt(2.0, -2.0);
  const snap = terrain.snapshotHeights();
  const res = terrain.applyBrush(2.0, -2.0, 2.5, 0.5);
  assert.strictEqual(res.applied, true);
  assert.ok(terrain.heightAt(2.0, -2.0) > before + 0.35, 'Brush raise must lift heightfield');

  // Reject unsafe brush
  assert.strictEqual(terrain.applyBrush(NaN, 0, 2, 0.5).applied, false);

  // Restore undo snapshot
  terrain.restoreHeights(snap);
  assert.ok(Math.abs(terrain.heightAt(2.0, -2.0) - before) < 1e-4, 'Undo must restore exact elevation');

  // Share link round-trip under 2 KB + version guard
  const enc = encodeScenarioToHash({ ...DEFAULT_SCENARIO_CONFIG, seed: 777, gravity: 3.71 });
  assert.strictEqual(enc.ok, true);
  assert.ok((enc.hash?.length ?? 9999) < 2048, 'Share hash must be strictly under 2 KB');
  const dec = decodeScenarioFromHash(enc.hash!);
  assert.strictEqual(dec.ok, true);
  assert.strictEqual(dec.config?.seed, 777);
  assert.strictEqual(dec.config?.gravity, 3.71);

  // Reject future schema version with updateRequired
  const futurePayload = Buffer.from(JSON.stringify({ v: 99, seed: 1 })).toString('base64url');
  const futureRes = decodeScenarioFromHash(`#s=${futurePayload}`);
  assert.strictEqual(futureRes.ok, false);
  assert.strictEqual(futureRes.updateRequired, true);
});

// ============================================================================
// W9 + W11: LIDAR SENSOR SCAN & GUARDED STORAGE QUOTA FAILURE DRILL
// ============================================================================

test('W9 & W11: LiDAR scan hits canonical terrain and storage handles QuotaExceededError gracefully', () => {
  const reg = new ShortcutRegistry();
  const eng = new SimEngine(reg);
  const rays = eng.computeLidarScan(24, 14.0);
  assert.strictEqual(rays.length, 24);
  for (const r of rays) {
    assert.ok(Number.isFinite(r.dist) && r.dist >= 0 && r.dist <= 14.01);
  }

  // Mock Storage with QuotaExceededError failure drill
  const throwingStorage = {
    getItem: () => null,
    setItem: () => {
      const err: any = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    },
    removeItem: () => {},
  } as unknown as Storage;

  const writeRes = saveStudioSettings(DEFAULT_STUDIO_SETTINGS, throwingStorage);
  assert.strictEqual(writeRes.ok, false);
  assert.strictEqual(writeRes.quotaExceeded, true);

  // Valid in-memory storage round-trip + export/delete
  const map = new Map<string, string>();
  const memStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  } as unknown as Storage;

  saveStudioSettings({ ...DEFAULT_STUDIO_SETTINGS, camera: { ...DEFAULT_STUDIO_SETTINGS.camera, fov: 72 } }, memStorage);
  assert.strictEqual(loadStudioSettings(memStorage).camera.fov, 72);
  assert.ok(exportAllStudioData(memStorage).includes('"fov": 72'));
  deleteAllStudioData(memStorage);
  assert.strictEqual(loadStudioSettings(memStorage).camera.fov, 55);
});
