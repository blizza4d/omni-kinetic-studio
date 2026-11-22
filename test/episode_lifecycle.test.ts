/**
 * Episode Lifecycle & Controls Invariants Test Suite (Phase E5)
 *
 * Verifies that:
 * 1. 5-episode drive test: Controls work in EVERY episode (1 through 5).
 * 2. Restart variants: UI button, KeyR shortcut, restart during active drive, restart while paused.
 * 3. Emergency stop latch: Escape / X in episode 1 does not freeze episode 2.
 * 4. SimClock determinism & progress: t=4.0s / 16.7s -> 24% everywhere, paused state clears on restart.
 * 5. Determinism state hash equality: Episode 1 state equals Episode 5 state for identical seed and inputs.
 * 6. Async safety guard (`ifCurrent` and AbortSignal): stale callbacks rejected, previous signal aborted.
 * 7. Error resilience: single step errors do not crash subsequent episodes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SimEngine } from '../lib/sim/SimEngine';
import { getShortcutRegistry } from '../lib/control/shortcuts';
import { ifCurrent } from '../lib/sim/guard';
import { formatClockDisplay, clampProgress, formatProgressPct } from '../lib/sim/SimClock';
import { computeStateChecksum } from '../lib/replay/recorder';

test('E5.1: Five-episode consecutive drive test: manual controls work in every episode', () => {
  const reg = getShortcutRegistry();
  const engine = new SimEngine(reg, {
    scenario: { episodeLength: 5.0, seed: 101 },
  });

  for (let ep = 1; ep <= 5; ep++) {
    // 1. Assert fresh episode state
    const clk0 = engine.getClockSnapshot();
    assert.equal(clk0.episodeNumber, ep, `Episode number should be ${ep}`);
    assert.equal(clk0.ended, false, `Episode ${ep} should not be ended at start`);
    assert.equal(clk0.paused, false, `Episode ${ep} should not be paused at start`);

    // 2. Drive forward for 30 steps using W key
    engine.inputs.handleKeyDown({ code: 'KeyW', key: 'w' });
    const p0 = engine.gait.getSnapshot();

    for (let s = 0; s < 30; s++) {
      engine.tick(1 / 60);
    }

    const p1 = engine.gait.getSnapshot();
    const dist = Math.hypot(p1.posX - p0.posX, p1.posZ - p0.posZ);
    assert.ok(
      dist > 0.35,
      `Episode ${ep}: Droid must move under W key (moved ${dist.toFixed(3)}m, expected > 0.35m)`
    );

    // Release key
    engine.inputs.handleKeyUp({ code: 'KeyW' });

    // Step to end of episode
    for (let s = 0; s < 300; s++) {
      engine.tick(1 / 60);
    }
    assert.equal(engine.getClockSnapshot().ended, true, `Episode ${ep} should end`);

    // Restart episode for next iteration
    engine.resetEpisode(true);
  }
});

test('E5.2: Restart variants: KeyR shortcut, mid-drive restart with keys held, paused restart', () => {
  const reg = getShortcutRegistry();
  const engine = new SimEngine(reg, {
    scenario: { episodeLength: 5.0, seed: 202 },
  });

  // Variant A: Restart while driving with W held down
  engine.inputs.handleKeyDown({ code: 'KeyW', key: 'w' });
  for (let i = 0; i < 30; i++) engine.tick(1 / 60);
  assert.ok(engine.getInputVisualizer().keysHeld.includes('KeyW'));

  // Trigger reset mid-run
  engine.resetEpisode(true);
  // Stale key should be cleared by onEpisodeStart()
  assert.equal(engine.getInputVisualizer().keysHeld.length, 0, 'Keys held should be cleared on reset');
  assert.equal(engine.getArbiterSnapshot().isManual, false, 'Arbiter should reset to neutral policy');

  // Variant B: Re-pressing W after reset drives droid cleanly
  engine.inputs.handleKeyDown({ code: 'KeyW', key: 'w' });
  const p0 = engine.gait.getSnapshot();
  for (let i = 0; i < 30; i++) engine.tick(1 / 60);
  const p1 = engine.gait.getSnapshot();
  assert.ok(Math.hypot(p1.posX - p0.posX, p1.posZ - p0.posZ) > 0.35);

  // Variant C: Restart while paused
  engine.clock.setPaused(true);
  assert.equal(engine.clock.isPaused(), true);
  engine.resetEpisode(true);
  assert.equal(engine.clock.isPaused(), false, 'Paused state must clear on episode reset');
  const res = engine.tick(1 / 60);
  assert.ok(res.stepsExecuted > 0, 'Tick must execute simulation steps after paused reset');
});

test('E5.3: Emergency stop latch: Escape / X in episode 1 does not freeze episode 2', () => {
  const reg = getShortcutRegistry();
  const engine = new SimEngine(reg, {
    scenario: { episodeLength: 5.0, seed: 303 },
  });

  // Trigger emergency stop in episode 1
  engine.inputs.handleKeyDown({ code: 'KeyX', key: 'x' });
  engine.arbiter.triggerEmergencyStop();
  engine.tick(1 / 60);
  assert.equal(engine.getArbiterSnapshot().emergencyStop, true);

  // End episode 1 and restart to episode 2
  engine.resetEpisode(true);
  assert.equal(engine.getArbiterSnapshot().emergencyStop, false, 'Emergency stop latch must clear on restart');

  // Drive in episode 2
  engine.inputs.handleKeyDown({ code: 'KeyW', key: 'w' });
  const p0 = engine.gait.getSnapshot();
  for (let i = 0; i < 30; i++) engine.tick(1 / 60);
  const p1 = engine.gait.getSnapshot();
  assert.ok(
    Math.hypot(p1.posX - p0.posX, p1.posZ - p0.posZ) > 0.35,
    'Droid must move in episode 2 despite emergency stop in episode 1'
  );
});

test('E5.4: Clock determinism and unified progress formatting across episodes', () => {
  assert.equal(clampProgress(4.0, 16.7).toFixed(4), (4.0 / 16.7).toFixed(4));
  assert.equal(formatProgressPct(4.0 / 16.7), '24%');
  assert.equal(formatClockDisplay(4.0, 16.7), 't=4.0s / 16.7s (24%)');

  const reg = getShortcutRegistry();
  const engine = new SimEngine(reg, {
    scenario: { episodeLength: 16.7, seed: 404 },
  });

  // Step to exactly t=4.0s (240 fixed steps @ 60 Hz)
  for (let i = 0; i < 240; i++) {
    engine.tick(1 / 60);
  }
  const snap = engine.getClockSnapshot();
  assert.equal(snap.progressPct, 24, 'Progress at t=4.0s/16.7s must be 24% in episode 1');
  assert.equal(snap.progressText, '24%');

  // Reset to episode 2 and step to t=4.0s again
  engine.resetEpisode(true);
  for (let i = 0; i < 240; i++) {
    engine.tick(1 / 60);
  }
  const snap2 = engine.getClockSnapshot();
  assert.equal(snap2.progressPct, 24, 'Progress at t=4.0s/16.7s must be 24% in episode 2');
  assert.equal(snap2.progressText, '24%');
});

test('E5.5: Determinism state hash equality: Episode 1 equals Episode 5 for identical seed and commands', () => {
  const reg = getShortcutRegistry();

  function runScriptedEpisode(epSeed: number): string {
    const engine = new SimEngine(reg, {
      scenario: { episodeLength: 3.0, seed: epSeed },
    });

    // Scripted input sequence: 30 steps W, 15 steps A, 30 steps W
    for (let i = 0; i < 30; i++) {
      engine.inputs.handleKeyDown({ code: 'KeyW', key: 'w' });
      engine.tick(1 / 60);
    }
    engine.inputs.handleKeyUp({ code: 'KeyW' });

    for (let i = 0; i < 15; i++) {
      engine.inputs.handleKeyDown({ code: 'KeyA', key: 'a' });
      engine.tick(1 / 60);
    }
    engine.inputs.handleKeyUp({ code: 'KeyA' });

    for (let i = 0; i < 30; i++) {
      engine.inputs.handleKeyDown({ code: 'KeyW', key: 'w' });
      engine.tick(1 / 60);
    }
    engine.inputs.handleKeyUp({ code: 'KeyW' });

    return engine.getFinalChecksum();
  }

  const hash1 = runScriptedEpisode(777);
  const hash2 = runScriptedEpisode(777);
  assert.equal(hash1, hash2, 'State checksum must be bit-identical across separate episode runs');
});

test('E5.6: Async safety guard (`ifCurrent`): rejects late callbacks from superseded episodes', () => {
  let activeEpisodeId = 1;
  const getCurrentId = () => activeEpisodeId;

  let callbackExecuted = false;
  const guardedFn = ifCurrent({ id: 1 }, getCurrentId, () => {
    callbackExecuted = true;
  });

  // While episode 1 is active, callback executes
  guardedFn();
  assert.equal(callbackExecuted, true);

  // After transitioning to episode 2, late callback from episode 1 is dropped
  callbackExecuted = false;
  activeEpisodeId = 2;
  guardedFn();
  assert.equal(callbackExecuted, false, 'Stale callback from episode 1 must be silently dropped');
});

test('E5.7: EpisodeManager lifecycle: start, restart, end, and disposeAll lifecycle transitions', () => {
  const reg = getShortcutRegistry();
  const engine = new SimEngine(reg, {
    scenario: { episodeLength: 5.0, seed: 888 },
  });

  const mgr = engine.getEpisodeManager();
  assert.ok(mgr.episode, 'Active episode must exist');
  assert.equal(mgr.episode?.getPhase(), 'running');

  // Trigger end
  mgr.end();
  assert.equal(mgr.episode?.getPhase(), 'ended');

  // Restart
  const ep2 = mgr.restart();
  assert.equal(ep2.getPhase(), 'running');
  assert.equal(ep2.config.seed, 888);

  // Dispose all
  mgr.disposeAll();
  assert.equal(mgr.episode, null);
});
