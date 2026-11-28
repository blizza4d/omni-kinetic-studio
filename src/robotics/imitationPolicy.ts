/**
 * In-Browser Weighted k-NN Behavior Cloning Imitation Policy
 *
 * Trains directly on Success-tagged demonstrations recorded in EpisodeDemonstrationRecorder
 * and predicts continuous locomotion actions { throttle, steering } in < 1 ms per fixed step
 * using z-score standardized Euclidean distance and inverse-squared weighting.
 *
 * Zero external dependencies. Deterministic execution.
 */

import type { RecordedDemonstrationEpisode } from '@/lib/dataset/episodeRecorder';

export interface ImitationObservationInput {
  position: readonly [number, number, number];
  yawRad: number;
  linearVel: readonly [number, number, number];
  angularVelDegS: readonly [number, number, number];
  pitchDeg: number;
  rollDeg: number;
  lidarRanges?: readonly number[];
}

export interface ImitationPrediction {
  throttle: number; // m/s linear command
  steering: number; // rad/s yaw rate command
  nearestDist: number; // standardized feature-space Euclidean distance
  confidence: number; // [0..1] similarity confidence
  inferenceTimeMs: number;
  usedDemoCount: number;
}

export interface ImitationPolicyStats {
  trained: boolean;
  episodeCount: number;
  sampleCount: number;
  featureDim: number;
  k: number;
}

const FEATURE_DIM = 12;
const DEFAULT_MAX_LIDAR_RANGE = 15.0;

function computeSectorMins(ranges?: readonly number[]): [number, number, number] {
  if (!ranges || ranges.length === 0) {
    return [DEFAULT_MAX_LIDAR_RANGE, DEFAULT_MAX_LIDAR_RANGE, DEFAULT_MAX_LIDAR_RANGE];
  }
  const n = ranges.length;
  const third = Math.max(1, Math.floor(n / 3));
  let rightMin = DEFAULT_MAX_LIDAR_RANGE;
  let frontMin = DEFAULT_MAX_LIDAR_RANGE;
  let leftMin = DEFAULT_MAX_LIDAR_RANGE;

  for (let i = 0; i < n; i++) {
    const val = Number.isFinite(ranges[i]) ? ranges[i]! : DEFAULT_MAX_LIDAR_RANGE;
    if (i < third) {
      if (val < rightMin) rightMin = val;
    } else if (i < third * 2) {
      if (val < frontMin) frontMin = val;
    } else {
      if (val < leftMin) leftMin = val;
    }
  }
  return [leftMin, frontMin, rightMin];
}

function encodeObservation(obs: ImitationObservationInput, out: Float64Array): void {
  const [lMin, fMin, rMin] = computeSectorMins(obs.lidarRanges);
  out[0] = obs.position[0];
  out[1] = obs.position[2];
  out[2] = Math.cos(obs.yawRad);
  out[3] = Math.sin(obs.yawRad);
  out[4] = obs.linearVel[0];
  out[5] = obs.linearVel[2];
  out[6] = obs.angularVelDegS[2];
  out[7] = obs.pitchDeg;
  out[8] = obs.rollDeg;
  out[9] = lMin;
  out[10] = fMin;
  out[11] = rMin;
}

function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val));
}

export class ImitationPolicy {
  private k = 5;
  private episodeCount = 0;
  private sampleCount = 0;
  private features: Float64Array = new Float64Array(0);
  private throttles: Float64Array = new Float64Array(0);
  private steerings: Float64Array = new Float64Array(0);
  private mean: Float64Array = new Float64Array(FEATURE_DIM);
  private invStd: Float64Array = new Float64Array(FEATURE_DIM);
  private readonly queryVec = new Float64Array(FEATURE_DIM);
  private topKDist: Float64Array = new Float64Array(5);
  private topKIdx: Int32Array = new Int32Array(5);

  public fit(episodes: readonly RecordedDemonstrationEpisode[], k = 5): ImitationPolicyStats {
    this.k = Math.max(1, Math.min(25, Math.floor(k)));
    if (this.topKDist.length !== this.k) {
      this.topKDist = new Float64Array(this.k);
      this.topKIdx = new Int32Array(this.k);
    }

    const successEpisodes = episodes.filter((ep) => ep.meta.success && ep.frames.length > 0);
    let totalSamples = 0;
    for (let i = 0; i < successEpisodes.length; i++) {
      totalSamples += successEpisodes[i]!.frames.length;
    }

    if (totalSamples === 0) {
      this.episodeCount = 0;
      this.sampleCount = 0;
      this.features = new Float64Array(0);
      this.throttles = new Float64Array(0);
      this.steerings = new Float64Array(0);
      return this.getStats();
    }

    this.episodeCount = successEpisodes.length;
    this.sampleCount = totalSamples;
    this.features = new Float64Array(totalSamples * FEATURE_DIM);
    this.throttles = new Float64Array(totalSamples);
    this.steerings = new Float64Array(totalSamples);
    this.mean.fill(0);

    const degToRad = Math.PI / 180;
    let row = 0;
    const scratch = new Float64Array(FEATURE_DIM);

    for (let e = 0; e < successEpisodes.length; e++) {
      const ep = successEpisodes[e]!;
      for (let fIdx = 0; fIdx < ep.frames.length; fIdx++) {
        const f = ep.frames[fIdx]!;
        const o = f.observation;
        const pos = o.position ?? o.pose;
        const vel = o.linear_vel ?? o.linear_velocity;
        const angVel = o.angular_vel ?? o.angular_velocity;
        const roll = o.roll ?? o.orientation_euler_deg[0] ?? 0;
        const pitch = o.pitch ?? o.orientation_euler_deg[1] ?? 0;
        const yawDeg = o.orientation_euler_deg[2] ?? 0;

        encodeObservation(
          {
            position: pos,
            yawRad: yawDeg * degToRad,
            linearVel: vel,
            angularVelDegS: angVel,
            pitchDeg: pitch,
            rollDeg: roll,
            lidarRanges: o.lidar_ranges,
          },
          scratch
        );

        const base = row * FEATURE_DIM;
        for (let d = 0; d < FEATURE_DIM; d++) {
          const val = Number.isFinite(scratch[d]) ? scratch[d]! : 0;
          this.features[base + d] = val;
          this.mean[d] += val;
        }

        const tCmd = f.action.throttle ?? f.action.linear_vel_cmd[0] ?? 0;
        const sCmd = f.action.steering ?? f.action.angular_vel_cmd ?? 0;
        this.throttles[row] = Number.isFinite(tCmd) ? tCmd : 0;
        this.steerings[row] = Number.isFinite(sCmd) ? sCmd : 0;
        row++;
      }
    }

    // Compute per-feature mean
    for (let d = 0; d < FEATURE_DIM; d++) {
      this.mean[d] /= totalSamples;
    }

    // Compute per-feature variance -> inverse std
    const variance = new Float64Array(FEATURE_DIM);
    for (let i = 0; i < totalSamples; i++) {
      const base = i * FEATURE_DIM;
      for (let d = 0; d < FEATURE_DIM; d++) {
        const diff = this.features[base + d]! - this.mean[d]!;
        variance[d] += diff * diff;
      }
    }
    for (let d = 0; d < FEATURE_DIM; d++) {
      const std = Math.sqrt(variance[d]! / totalSamples);
      this.invStd[d] = std > 1e-3 ? 1 / std : 1;
    }

    // Pre-standardize stored matrix in-place for sub-millisecond inference
    for (let i = 0; i < totalSamples; i++) {
      const base = i * FEATURE_DIM;
      for (let d = 0; d < FEATURE_DIM; d++) {
        this.features[base + d] = (this.features[base + d]! - this.mean[d]!) * this.invStd[d]!;
      }
    }

    return this.getStats();
  }

  public isTrained(): boolean {
    return this.sampleCount > 0;
  }

  public getStats(): ImitationPolicyStats {
    return {
      trained: this.sampleCount > 0,
      episodeCount: this.episodeCount,
      sampleCount: this.sampleCount,
      featureDim: FEATURE_DIM,
      k: Math.min(this.k, Math.max(1, this.sampleCount)),
    };
  }

  public predict(obs: ImitationObservationInput): ImitationPrediction {
    const t0 = performance.now();
    if (this.sampleCount === 0) {
      return {
        throttle: 0,
        steering: 0,
        nearestDist: Infinity,
        confidence: 0,
        inferenceTimeMs: Number((performance.now() - t0).toFixed(3)),
        usedDemoCount: 0,
      };
    }

    encodeObservation(obs, this.queryVec);
    for (let d = 0; d < FEATURE_DIM; d++) {
      const val = Number.isFinite(this.queryVec[d]) ? this.queryVec[d]! : 0;
      this.queryVec[d] = (val - this.mean[d]!) * this.invStd[d]!;
    }

    const effK = Math.min(this.k, this.sampleCount);
    for (let i = 0; i < effK; i++) {
      this.topKDist[i] = Infinity;
      this.topKIdx[i] = -1;
    }

    let worstSlot = 0;
    let worstDist = Infinity;

    for (let i = 0; i < this.sampleCount; i++) {
      const base = i * FEATURE_DIM;
      let sq = 0;
      for (let d = 0; d < FEATURE_DIM; d++) {
        const diff = this.features[base + d]! - this.queryVec[d]!;
        sq += diff * diff;
      }
      const dist = Math.sqrt(sq / FEATURE_DIM);
      if (dist < worstDist) {
        this.topKDist[worstSlot] = dist;
        this.topKIdx[worstSlot] = i;
        // Find new worst in topK
        worstDist = this.topKDist[0]!;
        worstSlot = 0;
        for (let j = 1; j < effK; j++) {
          if (this.topKDist[j]! > worstDist) {
            worstDist = this.topKDist[j]!;
            worstSlot = j;
          }
        }
      }
    }

    let minDist = Infinity;
    let weightSum = 0;
    let throttleAccum = 0;
    let steeringAccum = 0;

    for (let j = 0; j < effK; j++) {
      const idx = this.topKIdx[j]!;
      if (idx < 0) continue;
      const dist = this.topKDist[j]!;
      if (dist < minDist) minDist = dist;
      const w = 1 / (dist * dist + 1e-4);
      weightSum += w;
      throttleAccum += w * this.throttles[idx]!;
      steeringAccum += w * this.steerings[idx]!;
    }

    const throttle = weightSum > 0 ? clamp(throttleAccum / weightSum, -1.6, 1.6) : 0;
    const steering = weightSum > 0 ? clamp(steeringAccum / weightSum, -2.0, 2.0) : 0;
    const confidence = Number.isFinite(minDist) ? Math.exp(-0.35 * minDist) : 0;

    return {
      throttle: Number(throttle.toFixed(4)),
      steering: Number(steering.toFixed(4)),
      nearestDist: Number((Number.isFinite(minDist) ? minDist : 999).toFixed(4)),
      confidence: Number(clamp(confidence, 0, 1).toFixed(4)),
      inferenceTimeMs: Number((performance.now() - t0).toFixed(3)),
      usedDemoCount: this.episodeCount,
    };
  }
}

export const globalImitationPolicy = new ImitationPolicy();
