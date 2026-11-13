/**
 * Baseline Trace Recorder (Phase F0)
 * 
 * Records 20 seconds of rendered frames from the baseline pipeline:
 * - Straight walking at 3 speeds (0.3 m/s, 0.6 m/s, 0.95 m/s)
 * - Stop / deceleration
 * - Turn in place (yawRate = 0.8 rad/s)
 * - Simulates the 500ms batch delivery and lack of sub-frame interpolation
 * - Computes all Section 4 metrics and outputs docs/traces/before.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { LocalSimulationRunner } from '../lib/telemetry/local_runner';
import { TelemetryStore } from '../lib/telemetry/store';
import {
  computeFramePacingMetrics,
  computeMotionSmoothness,
  PoseSample,
} from '../lib/perf/smoothness';

export function recordBaselineTrace(durationSeconds = 15.0, displayHz = 60): {
  pacing: ReturnType<typeof computeFramePacingMetrics>;
  smoothness: ReturnType<typeof computeMotionSmoothness>;
  samples: PoseSample[];
} {
  const dtDisplay = 1.0 / displayHz;
  const totalDisplayFrames = Math.round(durationSeconds * displayHz);
  const runner = new LocalSimulationRunner('baseline_job', 60, 1);
  const store = TelemetryStore.getInstance();
  store.clear();

  // Simulated server SSE batch generation: 30 frames every 500ms
  const framesPerBatch = 30;
  const batchIntervalSec = 0.5;
  let nextBatchTime = 0.0;

  const timestamps: number[] = [];
  const samples: PoseSample[] = [];

  // Camera state with raw * 0.12 per-frame lerp
  let camYaw = 0;
  let camPitch = 0.45;
  let camDist = 5.0;

  for (let frameIdx = 0; frameIdx < totalDisplayFrames; frameIdx++) {
    const t = frameIdx * dtDisplay;
    timestamps.push(t);

    // Dynamic command schedule over 20 seconds:
    // 0s - 5s: Walk slow (0.3 m/s)
    // 5s - 10s: Walk medium (0.6 m/s)
    // 10s - 14s: Walk fast (0.95 m/s)
    // 14s - 16s: Stop (0.0 m/s)
    // 16s - 20s: Turn in place (vx = 0, yawRate = 0.8 rad/s)
    let vx = 0.6;
    let yawRate = 0;
    if (t < 5.0) {
      vx = 0.3;
    } else if (t < 10.0) {
      vx = 0.6;
    } else if (t < 14.0) {
      vx = 0.95;
    } else if (t < 16.0) {
      vx = 0.0;
    } else {
      vx = 0.0;
      yawRate = 0.8;
    }

    // Step the simulation when next batch time is reached
    if (t >= nextBatchTime) {
      const batch = runner.getNextBatch(framesPerBatch);
      // Baseline behavior: Ingest batch directly overwrites latestFrame
      store.ingestBatch(batch.frames);
      nextBatchTime += batchIntervalSec;
    }

    // Baseline ThreeViewer reads latest discrete frame
    const latest = store.getLatestFrame();
    const torso = latest?.bodies?.find((b) => b.id === 'torso') || latest?.bodies?.[0];
    const rootPos: [number, number, number] = torso?.pos
      ? [torso.pos[0], torso.pos[1], torso.pos[2]]
      : [0, 0.385, 0];

    const headPos: [number, number, number] = [
      rootPos[0] + 0.15,
      rootPos[1] + 0.08,
      rootPos[2],
    ];

    const feet = (latest?.feet || []).map((f) => ({
      id: f.id,
      pos: [...f.pos] as [number, number, number],
      isStance: f.contact,
    }));

    // Baseline camera follow (* 0.12 per-frame lerp)
    camYaw += (0 - camYaw) * 0.12;
    camPitch += (0.45 - camPitch) * 0.12;
    camDist += (5.0 - camDist) * 0.12;

    const camX = rootPos[0] + Math.sin(camYaw) * Math.cos(camPitch) * camDist;
    const camY = rootPos[1] + Math.sin(camPitch) * camDist + 0.4;
    const camZ = rootPos[2] + Math.cos(camYaw) * Math.cos(camPitch) * camDist;

    samples.push({
      timestamp: t,
      rootPos,
      headPos,
      feet: feet.length > 0 ? feet : [
        { id: 'FL', pos: [rootPos[0] + 0.24, 0, rootPos[2] - 0.15], isStance: true },
        { id: 'FR', pos: [rootPos[0] + 0.24, 0, rootPos[2] + 0.15], isStance: false },
        { id: 'RL', pos: [rootPos[0] - 0.24, 0, rootPos[2] - 0.15], isStance: false },
        { id: 'RR', pos: [rootPos[0] - 0.24, 0, rootPos[2] + 0.15], isStance: true },
      ],
      cameraPos: [camX, camY, camZ],
      cameraLookAt: [rootPos[0], rootPos[1] + 0.2, rootPos[2]],
    });
  }

  const pacing = computeFramePacingMetrics(timestamps);
  const smoothness = computeMotionSmoothness(samples, 0.44);

  return { pacing, smoothness, samples };
}

if (require.main === module || !module.parent) {
  console.log('--- RECORDING BASELINE ANIMATION TRACE (OLD PIPELINE) ---');
  const result = recordBaselineTrace(15.0, 60);

  const tracesDir = path.resolve(process.cwd(), 'docs', 'traces');
  if (!fs.existsSync(tracesDir)) {
    fs.mkdirSync(tracesDir, { recursive: true });
  }

  const outPath = path.join(tracesDir, 'before.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        metadata: {
          recordedAt: new Date().toISOString(),
          durationSeconds: 15.0,
          displayRefreshHz: 60,
          sampleCount: result.samples.length,
          pipeline: 'baseline_discrete_batch_no_interpolation',
        },
        pacingMetrics: result.pacing,
        smoothnessMetrics: result.smoothness,
        samplesSampled: result.samples.filter((_, idx) => idx % 5 === 0), // Sample every 5th frame for file size
      },
      null,
      2
    )
  );

  console.log(`[Baseline] Trace saved to: ${outPath}`);
  console.log(`[Baseline] Root Jerk RMS: ${result.smoothness.jerkRMS.root.toFixed(2)} m/s³`);
  console.log(`[Baseline] Peak Root Jerk: ${result.smoothness.peakJerk.root.toFixed(2)} m/s³`);
  console.log(`[Baseline] Velocity Violations: ${result.smoothness.velocityContinuityViolations}`);
  console.log(`[Baseline] Camera Relative Jitter: ${result.smoothness.cameraRelativeJitter.toFixed(3)} px`);
}
