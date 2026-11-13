/**
 * Motion & Frame Pacing Smoothness Measurement Library
 * 
 * Computes deterministic frame pacing and motion smoothness metrics
 * for robotics spatial visualizers and procedural locomotion engines.
 */

export interface FramePacingMetrics {
  frameTimeMedian: number;
  frameTimeP95: number;
  frameTimeP99: number;
  frameTimeMax: number;
  judderIndex: number;
  stutterCount: number;
  refreshPeriod: number;
  droppedFrameRatio: number;
}

export interface PoseSample {
  timestamp: number; // seconds
  rootPos: [number, number, number];
  headPos?: [number, number, number];
  feet: {
    id: string;
    pos: [number, number, number];
    isStance: boolean;
  }[];
  cameraPos?: [number, number, number];
  cameraLookAt?: [number, number, number];
  phase?: number;
}

export interface MotionSmoothnessMetrics {
  jerkRMS: {
    root: number;
    head: number;
    feet: Record<string, number>;
  };
  peakJerk: {
    root: number;
    head: number;
  };
  velocityContinuityViolations: number;
  loopDiscontinuity: number;
  footSlip: {
    meanPercentOfLegLength: number;
    maxPercentOfLegLength: number;
    maxMeters: number;
  };
  cameraRelativeJitter: number; // pixels standard deviation at 1080p
}

/**
 * Common display refresh rates in Hz.
 */
const COMMON_REFRESH_RATES = [60, 75, 90, 120, 144, 165, 240];

/**
 * Estimate display refresh period from an array of frame delta times (in seconds).
 */
export function estimateRefreshPeriod(deltas: number[]): number {
  if (deltas.length === 0) return 1 / 60;
  const validDeltas = deltas.filter((d) => d > 0.002 && d < 0.1);
  if (validDeltas.length === 0) return 1 / 60;

  const sorted = [...validDeltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  let bestPeriod = 1 / 60;
  let minDiff = Infinity;

  for (const hz of COMMON_REFRESH_RATES) {
    const period = 1 / hz;
    const diff = Math.abs(period - median);
    if (diff < minDiff) {
      minDiff = diff;
      bestPeriod = period;
    }
  }

  // Snap if within 15% of known refresh rate
  return minDiff < 0.15 * bestPeriod ? bestPeriod : median;
}

/**
 * Compute frame pacing metrics from raw frame timestamps (seconds).
 */
export function computeFramePacingMetrics(timestamps: number[]): FramePacingMetrics {
  if (timestamps.length < 2) {
    return {
      frameTimeMedian: 1 / 60,
      frameTimeP95: 1 / 60,
      frameTimeP99: 1 / 60,
      frameTimeMax: 1 / 60,
      judderIndex: 0,
      stutterCount: 0,
      refreshPeriod: 1 / 60,
      droppedFrameRatio: 0,
    };
  }

  const deltas: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    deltas.push(timestamps[i] - timestamps[i - 1]);
  }

  const sorted = [...deltas].sort((a, b) => a - b);
  const n = sorted.length;
  const median = sorted[Math.floor(n * 0.5)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];
  const max = sorted[n - 1];

  const refreshPeriod = estimateRefreshPeriod(deltas);

  // Judder: deltas differing from median by > 25%
  let judderFrames = 0;
  for (const d of deltas) {
    if (Math.abs(d - median) > 0.25 * median) {
      judderFrames++;
    }
  }
  const judderIndex = judderFrames / n;

  // Stutter: frames > 2 * median (normalized per minute)
  const totalDurationMin = (timestamps[timestamps.length - 1] - timestamps[0]) / 60.0;
  let rawStutters = 0;
  for (const d of deltas) {
    if (d > 2.0 * median) {
      rawStutters++;
    }
  }
  const stutterCount = totalDurationMin > 0 ? rawStutters / totalDurationMin : 0;

  // Dropped frames: delta > 1.5 * refreshPeriod
  let droppedCount = 0;
  for (const d of deltas) {
    if (d > 1.5 * refreshPeriod) {
      droppedCount++;
    }
  }
  const droppedFrameRatio = droppedCount / n;

  return {
    frameTimeMedian: Number(median.toFixed(6)),
    frameTimeP95: Number(p95.toFixed(6)),
    frameTimeP99: Number(p99.toFixed(6)),
    frameTimeMax: Number(max.toFixed(6)),
    judderIndex: Number(judderIndex.toFixed(4)),
    stutterCount: Number(stutterCount.toFixed(2)),
    refreshPeriod: Number(refreshPeriod.toFixed(6)),
    droppedFrameRatio: Number(droppedFrameRatio.toFixed(4)),
  };
}

/**
 * Compute derivative vector series (velocity, acceleration, jerk) using central or forward finite differences.
 */
function computeDerivativeSeries(
  positions: [number, number, number][],
  times: number[]
): [number, number, number][] {
  const n = positions.length;
  if (n < 2) return [];
  const derivs: [number, number, number][] = [];

  for (let i = 0; i < n - 1; i++) {
    const dt = Math.max(1e-4, times[i + 1] - times[i]);
    derivs.push([
      (positions[i + 1][0] - positions[i][0]) / dt,
      (positions[i + 1][1] - positions[i][1]) / dt,
      (positions[i + 1][2] - positions[i][2]) / dt,
    ]);
  }
  return derivs;
}

/**
 * Compute Root-Mean-Square and Peak of 3D vector magnitudes.
 */
function computeRMSAndPeak(vectors: [number, number, number][]): { rms: number; peak: number } {
  if (vectors.length === 0) return { rms: 0, peak: 0 };
  let sumSq = 0;
  let peak = 0;

  for (const v of vectors) {
    const mag = Math.hypot(v[0], v[1], v[2]);
    sumSq += mag * mag;
    if (mag > peak) peak = mag;
  }
  return {
    rms: Math.sqrt(sumSq / vectors.length),
    peak,
  };
}

/**
 * Compute motion smoothness metrics from a recorded trace of rendered poses.
 */
export function computeMotionSmoothness(
  samples: PoseSample[],
  legLength = 0.44
): MotionSmoothnessMetrics {
  const n = samples.length;
  if (n < 4) {
    return {
      jerkRMS: { root: 0, head: 0, feet: {} },
      peakJerk: { root: 0, head: 0 },
      velocityContinuityViolations: 0,
      loopDiscontinuity: 0,
      footSlip: { meanPercentOfLegLength: 0, maxPercentOfLegLength: 0, maxMeters: 0 },
      cameraRelativeJitter: 0,
    };
  }

  const times = samples.map((s) => s.timestamp);

  // 1. Root Kinematics (Position -> Velocity -> Acceleration -> Jerk)
  const rootPos = samples.map((s) => s.rootPos);
  const rootVel = computeDerivativeSeries(rootPos, times);
  const velTimes = times.slice(0, -1);
  const rootAcc = computeDerivativeSeries(rootVel, velTimes);
  const accTimes = velTimes.slice(0, -1);
  const rootJerk = computeDerivativeSeries(rootAcc, accTimes);
  const rootJerkStats = computeRMSAndPeak(rootJerk);

  // 2. Head Kinematics
  const headPos = samples.map((s) => s.headPos || s.rootPos);
  const headVel = computeDerivativeSeries(headPos, times);
  const headAcc = computeDerivativeSeries(headVel, velTimes);
  const headJerk = computeDerivativeSeries(headAcc, accTimes);
  const headJerkStats = computeRMSAndPeak(headJerk);

  // 3. Velocity Continuity Violations (acceleration spikes > 25 m/s^2 without command event)
  let velocityViolations = 0;
  for (let i = 0; i < rootAcc.length; i++) {
    const aMag = Math.hypot(rootAcc[i][0], rootAcc[i][1], rootAcc[i][2]);
    if (aMag > 25.0) {
      velocityViolations++;
    }
  }

  // 4. Stance Foot Slip
  // Measure horizontal drift of a foot while marked as stance
  const footDrifts: number[] = [];
  let maxFootSlipM = 0;

  const legIds = samples[0].feet.map((f) => f.id);
  const footJerkMap: Record<string, number> = {};

  for (const legId of legIds) {
    const footPositions: [number, number, number][] = samples.map((s) => (s.feet.find((f) => f.id === legId)?.pos || [0, 0, 0]) as [number, number, number]);
    const fVel = computeDerivativeSeries(footPositions, times);
    const fAcc = computeDerivativeSeries(fVel, velTimes);
    const fJerk = computeDerivativeSeries(fAcc, accTimes);
    footJerkMap[legId] = Number(computeRMSAndPeak(fJerk).rms.toFixed(2));

    let currentAnchor: [number, number] | null = null;

    for (let i = 0; i < samples.length; i++) {
      const foot = samples[i].feet.find((f) => f.id === legId);
      if (!foot) continue;

      if (foot.isStance) {
        if (!currentAnchor) {
          currentAnchor = [foot.pos[0], foot.pos[2]];
        } else {
          const drift = Math.hypot(foot.pos[0] - currentAnchor[0], foot.pos[2] - currentAnchor[1]);
          footDrifts.push(drift);
          if (drift > maxFootSlipM) maxFootSlipM = drift;
        }
      } else {
        currentAnchor = null;
      }
    }
  }

  const meanSlipM = footDrifts.length ? footDrifts.reduce((s, v) => s + v, 0) / footDrifts.length : 0;
  const meanSlipPct = (meanSlipM / legLength) * 100;
  const maxSlipPct = (maxFootSlipM / legLength) * 100;

  // 5. Loop Discontinuity (compare pose at phase ~0 and phase ~1 if cyclic)
  let loopDiscontinuity = 0;
  const p0Sample = samples.find((s) => (s.phase ?? 0) < 0.05);
  const p1Sample = [...samples].reverse().find((s) => (s.phase ?? 0) > 0.95);
  if (p0Sample && p1Sample) {
    const dy = Math.abs(p0Sample.rootPos[1] - p1Sample.rootPos[1]);
    loopDiscontinuity = Number(dy.toFixed(6));
  }

  // 6. Camera Relative Jitter
  // Standard deviation of robot screen position relative to low-pass filtered trend
  let cameraRelativeJitter = 0.0;
  if (samples[0].cameraPos && samples[0].cameraLookAt) {
    const residuals: number[] = [];
    let filteredX = rootPos[0][0];
    let filteredZ = rootPos[0][2];

    for (let i = 0; i < samples.length; i++) {
      const rx = rootPos[i][0];
      const rz = rootPos[i][2];
      filteredX += (rx - filteredX) * 0.05;
      filteredZ += (rz - filteredZ) * 0.05;

      const residual = Math.hypot(rx - filteredX, rz - filteredZ);
      // Rough projection scale: 1 meter at 5m distance occupies ~200px on 1080p
      residuals.push(residual * 200.0);
    }

    const meanRes = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const variance = residuals.reduce((a, b) => a + (b - meanRes) ** 2, 0) / residuals.length;
    cameraRelativeJitter = Number(Math.sqrt(variance).toFixed(3));
  }

  return {
    jerkRMS: {
      root: Number(rootJerkStats.rms.toFixed(2)),
      head: Number(headJerkStats.rms.toFixed(2)),
      feet: footJerkMap,
    },
    peakJerk: {
      root: Number(rootJerkStats.peak.toFixed(2)),
      head: Number(headJerkStats.peak.toFixed(2)),
    },
    velocityContinuityViolations: velocityViolations,
    loopDiscontinuity,
    footSlip: {
      meanPercentOfLegLength: Number(meanSlipPct.toFixed(3)),
      maxPercentOfLegLength: Number(maxSlipPct.toFixed(3)),
      maxMeters: Number(maxFootSlipM.toFixed(6)),
    },
    cameraRelativeJitter,
  };
}
