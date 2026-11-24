/**
 * Policy Lab: Headless Optimization & Evaluation Engine (Pack B — F-002)
 *
 * Implements in-browser policy training using Cross-Entropy Method (CEM)
 * over deterministic simulation episodes:
 * - Parameterized interpretable policy family
 * - Multi-seed evaluation to prevent single-seed overfitting
 * - Headless step loop producing byte-identical state hashes to rendered viewer
 * - Candidate comparison on held-out test seeds
 */

import { LocomotionCommand, createNeutralCommand } from '../control/types';
import { purePursuit, computeObstacleAvoidanceYaw } from '../control/purePursuit';
import { Observation } from '../control/sandbox';
import { gaussian, mulberry32 } from '../sim/prng';

export interface PolicyParams {
  goalGain: number; // 0.5 .. 3.0
  edgeAvoidGain: number; // 0.5 .. 4.0
  maxSpeed: number; // 0.5 .. 2.2 m/s
  turnRate: number; // 0.5 .. 2.5 rad/s
  obstacleAvoidWeight: number; // 0.2 .. 3.0
  gaitThreshold: number; // 0.8 .. 1.8 m/s transition to bound
}

export const DEFAULT_POLICY_PARAMS: PolicyParams = {
  goalGain: 1.25,
  edgeAvoidGain: 2.0,
  maxSpeed: 1.45,
  turnRate: 1.8,
  obstacleAvoidWeight: 1.5,
  gaitThreshold: 1.35,
};

export const POLICY_PARAM_BOUNDS: { [K in keyof PolicyParams]: { min: number; max: number } } = {
  goalGain: { min: 0.2, max: 4.0 },
  edgeAvoidGain: { min: 0.2, max: 5.0 },
  maxSpeed: { min: 0.4, max: 2.4 },
  turnRate: { min: 0.4, max: 3.0 },
  obstacleAvoidWeight: { min: 0.1, max: 4.0 },
  gaitThreshold: { min: 0.6, max: 2.0 },
};

export function paramsToVector(p: PolicyParams): number[] {
  return [p.goalGain, p.edgeAvoidGain, p.maxSpeed, p.turnRate, p.obstacleAvoidWeight, p.gaitThreshold];
}

export function vectorToParams(v: number[]): PolicyParams {
  return {
    goalGain: v[0] ?? DEFAULT_POLICY_PARAMS.goalGain,
    edgeAvoidGain: v[1] ?? DEFAULT_POLICY_PARAMS.edgeAvoidGain,
    maxSpeed: v[2] ?? DEFAULT_POLICY_PARAMS.maxSpeed,
    turnRate: v[3] ?? DEFAULT_POLICY_PARAMS.turnRate,
    obstacleAvoidWeight: v[4] ?? DEFAULT_POLICY_PARAMS.obstacleAvoidWeight,
    gaitThreshold: v[5] ?? DEFAULT_POLICY_PARAMS.gaitThreshold,
  };
}

export function clampParamsVector(v: number[]): number[] {
  const p = vectorToParams(v);
  const keys = Object.keys(POLICY_PARAM_BOUNDS) as (keyof PolicyParams)[];
  const clamped: number[] = [];
  for (const k of keys) {
    const val = p[k];
    const b = POLICY_PARAM_BOUNDS[k];
    clamped.push(Math.max(b.min, Math.min(b.max, val)));
  }
  return clamped;
}

/**
 * Evaluates parameterized policy on an observation.
 */
export function evaluatePolicy(
  params: PolicyParams,
  obs: Observation,
  out: LocomotionCommand = createNeutralCommand()
): LocomotionCommand {
  out.vx = 0;
  out.vy = 0;
  out.yawRate = 0;
  out.bodyHeight = 0.5;
  out.hop = false;
  out.stop = false;

  // 1. Edge avoidance check
  if (obs.edgeDistance < 2.5) {
    const factor = Math.max(0.1, obs.edgeDistance / 2.5);
    out.vx = 0.3 * factor;
    out.yawRate = params.edgeAvoidGain;
    out.gait = 'walk';
    return out;
  }

  // 2. Goal tracking
  if (obs.goal) {
    const dist = obs.goal.distance;
    const bearing = obs.goal.bearing;
    const targetSpd = dist < 0.8 ? 0.35 : params.maxSpeed;
    const turn = Math.max(-params.turnRate, Math.min(params.turnRate, bearing * params.goalGain));

    out.vx = targetSpd;
    out.yawRate = turn;
    out.gait = targetSpd >= params.gaitThreshold ? 'bound' : 'auto';
  } else {
    out.vx = params.maxSpeed * 0.7;
    out.yawRate = 0;
    out.gait = 'auto';
  }

  return out;
}

// ============================================================================
// CROSS-ENTROPY METHOD (CEM) OPTIMIZER
// ============================================================================

export interface CEMOptions {
  dims: number;
  popSize: number;
  eliteFrac: number;
  iterations: number;
  mean: number[];
  std: number[];
  minStd: number;
  seed: number;
}

export interface CEMGenerationResult {
  iter: number;
  bestScore: number;
  meanScore: number;
  mean: number[];
}

export async function runCEM(
  opts: CEMOptions,
  evaluate: (x: number[]) => Promise<number>,
  clamp: (x: number[]) => number[],
  onGeneration?: (g: CEMGenerationResult) => void,
  signal?: AbortSignal
): Promise<{ best: number[]; bestScore: number; generations: CEMGenerationResult[] }> {
  const rng = mulberry32(opts.seed);
  const mean = opts.mean.slice();
  const std = opts.std.slice();
  let best = mean.slice();
  let bestScore = -Infinity;
  const nElite = Math.max(2, Math.floor(opts.popSize * opts.eliteFrac));
  const history: CEMGenerationResult[] = [];

  for (let iter = 0; iter < opts.iterations; iter++) {
    if (signal?.aborted) break;

    const pop: { x: number[]; s: number }[] = [];
    for (let i = 0; i < opts.popSize; i++) {
      const sampled = mean.map((m, d) => m + std[d]! * gaussian(rng));
      const clamped = clamp(sampled);
      const score = await evaluate(clamped);
      pop.push({ x: clamped, s: score });
    }

    pop.sort((a, b) => b.s - a.s);

    if (pop[0]!.s > bestScore) {
      bestScore = pop[0]!.s;
      best = pop[0]!.x.slice();
    }

    const elite = pop.slice(0, nElite);
    for (let d = 0; d < opts.dims; d++) {
      const m = elite.reduce((acc, e) => acc + e.x[d]!, 0) / nElite;
      const v = elite.reduce((acc, e) => acc + (e.x[d]! - m) ** 2, 0) / nElite;
      mean[d] = m;
      std[d] = Math.max(Math.sqrt(v), opts.minStd);
    }

    const meanScore = pop.reduce((a, p) => a + p.s, 0) / pop.length;
    const genResult = {
      iter: iter + 1,
      bestScore,
      meanScore,
      mean: mean.slice(),
    };
    history.push(genResult);
    onGeneration?.(genResult);
  }

  return { best, bestScore, generations: history };
}
