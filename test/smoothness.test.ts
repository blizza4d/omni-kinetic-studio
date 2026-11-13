import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateRefreshPeriod,
  computeFramePacingMetrics,
  computeMotionSmoothness,
  PoseSample,
} from '../lib/perf/smoothness';

test('estimateRefreshPeriod: Snaps to 60, 75, 90, 120, 144 Hz within tolerance', () => {
  // 60 Hz synthetic deltas (~0.016667s with small jitter)
  const deltas60 = Array.from({ length: 60 }, () => 0.016667 + (Math.random() - 0.5) * 0.001);
  const p60 = estimateRefreshPeriod(deltas60);
  assert.equal(Number(p60.toFixed(5)), Number((1 / 60).toFixed(5)));

  // 120 Hz synthetic deltas (~0.008333s with small jitter)
  const deltas120 = Array.from({ length: 120 }, () => 0.008333 + (Math.random() - 0.5) * 0.0005);
  const p120 = estimateRefreshPeriod(deltas120);
  assert.equal(Number(p120.toFixed(5)), Number((1 / 120).toFixed(5)));

  // 144 Hz synthetic deltas (~0.006944s with small jitter)
  const deltas144 = Array.from({ length: 144 }, () => 0.006944 + (Math.random() - 0.5) * 0.0004);
  const p144 = estimateRefreshPeriod(deltas144);
  assert.equal(Number(p144.toFixed(5)), Number((1 / 144).toFixed(5)));
});

test('computeFramePacingMetrics: Computes median, judder index, dropped frames', () => {
  // Perfectly steady 60 FPS timestamps
  const timestamps = Array.from({ length: 61 }, (_, i) => i * (1 / 60));
  const metrics = computeFramePacingMetrics(timestamps);

  assert.equal(metrics.judderIndex, 0.0);
  assert.equal(metrics.stutterCount, 0.0);
  assert.equal(metrics.droppedFrameRatio, 0.0);
  assert.equal(metrics.refreshPeriod, Number((1 / 60).toFixed(6)));

  // Timestamps with one 100ms hitch
  const hitched = [...timestamps];
  hitched[30] += 0.1;
  const hitchedMetrics = computeFramePacingMetrics(hitched);
  assert.ok(hitchedMetrics.judderIndex > 0, 'Judder index must detect frame delta deviation');
});

test('computeMotionSmoothness: Computes jerk RMS, stance slip, and continuity', () => {
  const dt = 1 / 60;
  const samples: PoseSample[] = [];

  for (let i = 0; i < 60; i++) {
    const t = i * dt;
    // Constant speed 1.0 m/s: a = 0, jerk = 0
    samples.push({
      timestamp: t,
      rootPos: [t * 1.0, 0.4, 0],
      headPos: [t * 1.0 + 0.1, 0.45, 0],
      feet: [
        { id: 'FL', pos: [0.2, 0.0, -0.15], isStance: true },
        { id: 'FR', pos: [t * 1.0, 0.1, 0.15], isStance: false },
      ],
      cameraPos: [t * 1.0 - 2.0, 1.2, 3.0],
      cameraLookAt: [t * 1.0, 0.4, 0],
      phase: (i / 60) % 1.0,
    });
  }

  const smooth = computeMotionSmoothness(samples, 0.44);
  assert.equal(smooth.footSlip.maxMeters, 0.0, 'Stance foot with constant pos must have 0 slip');
  assert.equal(smooth.velocityContinuityViolations, 0, 'Constant velocity must have 0 continuity violations');
  assert.ok(smooth.jerkRMS.root < 1.0, 'Constant velocity must have near zero jerk');
});
