import test from 'node:test';
import assert from 'node:assert/strict';
import { FramePacer } from '../lib/sim/framePacer';

test('FramePacer: Snaps jittered timestamps to target refresh rate', () => {
  const pacer = new FramePacer();
  let timeMs = 1000.0;

  // Warm up pacer with 40 jittered 60 Hz frames (16.66ms +/- 0.8ms)
  const outputs: number[] = [];
  for (let i = 0; i < 40; i++) {
    const jitter = (i % 2 === 0 ? 0.6 : -0.6);
    timeMs += 16.667 + jitter;
    const delta = pacer.tick(timeMs);
    outputs.push(delta);
  }

  // After warm-up, pacer must estimate 60 Hz (~0.016667s)
  const refresh = pacer.getRefreshPeriod();
  assert.equal(Number(refresh.toFixed(5)), Number((1 / 60).toFixed(5)));

  // Output deltas for small jitter should snap cleanly to exact 1/60s
  const lastDelta = outputs[outputs.length - 1];
  assert.equal(Number(lastDelta.toFixed(5)), Number((1 / 60).toFixed(5)));
});

test('FramePacer: Passes through legitimate frame hitches (> 12% deviation)', () => {
  const pacer = new FramePacer();
  let timeMs = 1000.0;

  for (let i = 0; i < 40; i++) {
    timeMs += 16.667;
    pacer.tick(timeMs);
  }

  // Inject a 45ms hitch (nearly 3 dropped frames)
  timeMs += 45.0;
  const hitchDelta = pacer.tick(timeMs);

  assert.ok(hitchDelta >= 0.040, `Hitch delta must pass through, got ${hitchDelta}`);
});
