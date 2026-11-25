/**
 * Automated Sim-to-Real Benchmark & Stress-Test Runner (Phase 2)
 *
 * Executes reproducible N-trial batch evaluations across randomized physics domains:
 * - 3 Standardized Robotics Scenarios (Obstacle Slalom, High-Slope Climb, Low-Friction Docking)
 * - Randomizes gravity, friction, and IMU noise per trial deterministically via seeded PRNG
 * - Evaluates either Nemotron Task Plan waypoints or Scenario trajectories
 * - Computes Evaluation Scorecard (Success Rate, Time to Goal, Path Efficiency, Safety Violations)
 * - Exports comprehensive reports in JSON and Markdown
 */

import { ShortcutRegistry } from '@/lib/control/shortcuts';
import { SimEngine } from '@/lib/sim/SimEngine';
import { mulberry32 } from '@/lib/sim/prng';
import { RobotProfileId, getRobotProfile } from '@/lib/robotics/profiles';
import { wilsonConfidenceInterval } from '@/lib/sim2real/toolkit';
import { NemotronTaskPlan } from '@/lib/nebius/taskPlanner';

export type BenchmarkScenarioId = 'obstacle_slalom' | 'high_slope_climb' | 'low_friction_docking';

export interface BenchmarkWaypoint {
  id: string;
  x: number;
  z: number;
  targetSpeed: number;
  tolerance: number;
}

export interface BenchmarkScenarioSpec {
  id: BenchmarkScenarioId;
  name: string;
  description: string;
  baseSeed: number;
  roughness: number;
  craterCount: number;
  rockCount: number;
  gravityRange: [number, number];
  frictionRange: [number, number];
  noiseRange: [number, number];
  timeLimitSec: number;
  startPos: [number, number];
  startHeading: number;
  waypoints: BenchmarkWaypoint[];
}

export const BENCHMARK_SCENARIOS: Record<BenchmarkScenarioId, BenchmarkScenarioSpec> = {
  obstacle_slalom: {
    id: 'obstacle_slalom',
    name: 'Obstacle Slalom',
    description: 'High-density boulder field slalom testing LiDAR obstacle avoidance and yaw agility.',
    baseSeed: 1042,
    roughness: 0.42,
    craterCount: 3,
    rockCount: 540,
    gravityRange: [1.45, 1.85],
    frictionRange: [0.58, 0.92],
    noiseRange: [0.005, 0.04],
    timeLimitSec: 18,
    startPos: [0, 0],
    startHeading: 0.25,
    waypoints: [
      { id: 'sl_1', x: 4.0, z: -2.5, targetSpeed: 1.05, tolerance: 0.65 },
      { id: 'sl_2', x: 8.0, z: 2.2, targetSpeed: 1.05, tolerance: 0.65 },
      { id: 'sl_3', x: 12.0, z: -1.8, targetSpeed: 0.95, tolerance: 0.65 },
    ],
  },
  high_slope_climb: {
    id: 'high_slope_climb',
    name: 'High-Slope Climb',
    description: 'Steep undulating lunar crater wall stress-testing pitch/roll safety limits and actuator torque.',
    baseSeed: 2088,
    roughness: 0.78,
    craterCount: 6,
    rockCount: 280,
    gravityRange: [1.55, 3.72], // Moon -> Mars slope envelope
    frictionRange: [0.60, 0.95],
    noiseRange: [0.01, 0.05],
    timeLimitSec: 20,
    startPos: [0, 0],
    startHeading: 0.65,
    waypoints: [
      { id: 'sc_1', x: 5.5, z: -4.2, targetSpeed: 0.90, tolerance: 0.7 },
      { id: 'sc_2', x: 11.2, z: -8.6, targetSpeed: 0.85, tolerance: 0.75 },
    ],
  },
  low_friction_docking: {
    id: 'low_friction_docking',
    name: 'Low-Friction Precision Docking',
    description: 'Icy/loose regolith (μ=0.22..0.42) demanding smooth deceleration without target overshoot.',
    baseSeed: 3099,
    roughness: 0.28,
    craterCount: 2,
    rockCount: 220,
    gravityRange: [1.50, 1.75],
    frictionRange: [0.22, 0.42],
    noiseRange: [0.01, 0.06],
    timeLimitSec: 18,
    startPos: [0, 0],
    startHeading: 0,
    waypoints: [
      { id: 'dk_1', x: 6.0, z: 0.8, targetSpeed: 0.85, tolerance: 0.55 },
      { id: 'dk_2', x: 10.5, z: -2.2, targetSpeed: 0.60, tolerance: 0.45 },
    ],
  },
};

export const BENCHMARK_SCENARIO_LIST: readonly BenchmarkScenarioSpec[] = [
  BENCHMARK_SCENARIOS.obstacle_slalom,
  BENCHMARK_SCENARIOS.high_slope_climb,
  BENCHMARK_SCENARIOS.low_friction_docking,
];

export interface BenchmarkTrialResult {
  trialIndex: number;
  seed: number;
  gravityMps2: number;
  frictionCoeff: number;
  imuNoiseSigma: number;
  success: boolean;
  failureReason?: string;
  timeToGoalSec: number;
  optimalDistanceM: number;
  actualDistanceM: number;
  pathEfficiencyPct: number;
  collisions: number;
  tiltViolations: number;
  maxTiltDeg: number;
}

export interface BenchmarkScorecard {
  runId: string;
  timestampIso: string;
  scenarioId: BenchmarkScenarioId;
  scenarioName: string;
  profileId: RobotProfileId;
  profileName: string;
  policySource: 'nemotron_plan' | 'scenario_default';
  trialCount: number;
  successCount: number;
  successRatePct: number;
  wilson95Pct: [number, number];
  meanTimeToGoalSec: number;
  meanPathEfficiencyPct: number;
  totalSafetyViolations: number;
  totalCollisions: number;
  totalTiltViolations: number;
  trials: BenchmarkTrialResult[];
}

export interface BenchmarkProgressUpdate {
  completedTrials: number;
  totalTrials: number;
  latestTrial: BenchmarkTrialResult;
}

function computeOptimalPolylineDistance(start: [number, number], wps: readonly BenchmarkWaypoint[]): number {
  let dist = 0;
  let px = start[0];
  let pz = start[1];
  for (const w of wps) {
    dist += Math.hypot(w.x - px, w.z - pz);
    px = w.x;
    pz = w.z;
  }
  return Math.max(0.1, dist);
}

/**
 * Runs a single deterministic simulation trial synchronously on an isolated SimEngine.
 */
export function executeSingleBenchmarkTrial(
  scenario: BenchmarkScenarioSpec,
  trialIndex: number,
  profileId: RobotProfileId,
  customPlan?: NemotronTaskPlan | null
): BenchmarkTrialResult {
  const rng = mulberry32(scenario.baseSeed + trialIndex * 7919);
  const sampleRange = (r: [number, number]) => r[0] + (r[1] - r[0]) * rng();

  const seed = scenario.baseSeed + trialIndex * 131;
  const gravityMps2 = Number(sampleRange(scenario.gravityRange).toFixed(2));
  const frictionCoeff = Number(sampleRange(scenario.frictionRange).toFixed(2));
  const imuNoiseSigma = Number(sampleRange(scenario.noiseRange).toFixed(4));

  const profile = getRobotProfile(profileId);
  const waypoints: BenchmarkWaypoint[] =
    customPlan && customPlan.waypoints.length > 0
      ? customPlan.waypoints.map((w) => ({
          id: `nm_${w.id}`,
          x: w.position[0],
          z: w.position[2],
          targetSpeed: Math.min(profile.maxLinearVelMps, w.target_speed),
          tolerance: Math.max(0.4, w.arrival_tolerance),
        }))
      : scenario.waypoints;

  const optimalDistanceM = computeOptimalPolylineDistance(scenario.startPos, waypoints);

  const registry = new ShortcutRegistry();
  const engine = new SimEngine(registry, {
    scenario: {
      name: scenario.name,
      seed,
      gravity: gravityMps2,
      roughness: scenario.roughness,
      craterCount: scenario.craterCount,
      rockCount: scenario.rockCount,
      startPos: scenario.startPos,
      startHeading: scenario.startHeading,
      episodeLength: scenario.timeLimitSec,
    },
  });

  engine.setRobotProfile(profileId);
  engine.applyDomainPhysics({
    gravityMps2,
    frictionCoeff,
    imuNoiseSigma,
    maxTorqueNm: profile.maxTorqueNm,
    controlLatencyMs: 0,
  });
  engine.setAutonomousPlan(waypoints);
  engine.arbiter.releaseToPolicy();

  const fixedDt = 1 / 60;
  const maxSteps = Math.round(scenario.timeLimitSec * 60);
  const maxTiltDegAllowed =
    customPlan?.safety_constraints.max_pitch_deg ?? profile.safetyLimits.tiltCriticalDeg;

  let collisions = 0;
  let tiltViolations = 0;
  let maxTiltDeg = 0;
  let prevCooldownCollision = false;
  let tiltCooldown = 0;
  let reachedStep = -1;
  let failureReason: string | undefined;

  for (let step = 0; step < maxSteps; step++) {
    const kin = engine.executeFixedStep(step, fixedDt);

    // Measure tilt against safety threshold
    const tiltDeg = Math.abs(
      Math.asin(
        Math.max(-1, Math.min(1, 2 * (kin.bodyQuat[3] * kin.bodyQuat[0] - kin.bodyQuat[2] * kin.bodyQuat[1])))
      ) *
        (180 / Math.PI)
    );
    if (tiltDeg > maxTiltDeg) maxTiltDeg = tiltDeg;

    if (tiltDeg > maxTiltDegAllowed) {
      if (tiltCooldown <= 0) {
        tiltViolations++;
        tiltCooldown = 30;
      }
    } else if (tiltCooldown > 0) {
      tiltCooldown--;
    }

    // Track boulder impacts
    const obstacles = engine.getHazardObstacles();
    let hitThisStep = false;
    const hitR = profile.id === 'quadruped_scout' ? 0.32 : profile.dimensions.widthM * 0.68;
    for (let j = 0; j < obstacles.length; j++) {
      const obs = obstacles[j];
      const d = Math.hypot(kin.bodyPos[0] - obs.x, kin.bodyPos[2] - obs.z);
      if (d < obs.radius + hitR && !kin.hopActive) {
        hitThisStep = true;
        break;
      }
    }
    if (hitThisStep && !prevCooldownCollision) {
      collisions++;
      prevCooldownCollision = true;
    } else if (!hitThisStep) {
      prevCooldownCollision = false;
    }

    if (kin.gaitState === 'fallen') {
      failureReason = 'Chassis instability / fall';
      reachedStep = step;
      break;
    }

    const planState = engine.getAutonomousPlanState();
    if (planState.completed) {
      reachedStep = step;
      break;
    }
  }

  const completed = engine.getAutonomousPlanState().completed && !failureReason;
  const stepsTaken = reachedStep > 0 ? reachedStep : maxSteps;
  const timeToGoalSec = Number((stepsTaken * fixedDt).toFixed(2));
  const actualDistanceM = Number(Math.max(0.01, engine.getDistanceMeters()).toFixed(2));
  const pathEfficiencyPct = completed
    ? Number(Math.min(100, (optimalDistanceM / actualDistanceM) * 100).toFixed(1))
    : Number(Math.min(99, (actualDistanceM / optimalDistanceM) * 40).toFixed(1));

  if (!completed && !failureReason) {
    failureReason = 'Episode timeout before final waypoint';
  }

  return {
    trialIndex: trialIndex + 1,
    seed,
    gravityMps2,
    frictionCoeff,
    imuNoiseSigma,
    success: completed,
    failureReason,
    timeToGoalSec,
    optimalDistanceM: Number(optimalDistanceM.toFixed(2)),
    actualDistanceM,
    pathEfficiencyPct,
    collisions,
    tiltViolations,
    maxTiltDeg: Number(maxTiltDeg.toFixed(1)),
  };
}

/**
 * Executes an N-trial Sim-to-Real benchmark batch asynchronously (yielding between trials for 60 FPS UI responsiveness).
 */
export async function runBenchmarkSuite(options: {
  scenarioId: BenchmarkScenarioId;
  trialCount: number;
  profileId: RobotProfileId;
  customPlan?: NemotronTaskPlan | null;
  onProgress?: (update: BenchmarkProgressUpdate) => void;
  abortSignal?: AbortSignal;
}): Promise<BenchmarkScorecard> {
  const scenario = BENCHMARK_SCENARIOS[options.scenarioId];
  const profile = getRobotProfile(options.profileId);
  const trials: BenchmarkTrialResult[] = [];

  for (let i = 0; i < options.trialCount; i++) {
    if (options.abortSignal?.aborted) break;

    const trialResult = executeSingleBenchmarkTrial(
      scenario,
      i,
      options.profileId,
      options.customPlan
    );
    trials.push(trialResult);
    options.onProgress?.({
      completedTrials: i + 1,
      totalTrials: options.trialCount,
      latestTrial: trialResult,
    });

    // Yield one macrotask so UI updates smoothly between batch runs
    await new Promise((resolve) => setTimeout(resolve, 4));
  }

  const executedCount = trials.length;
  const successTrials = trials.filter((t) => t.success);
  const successCount = successTrials.length;
  const successRatePct = executedCount > 0 ? Number(((successCount / executedCount) * 100).toFixed(1)) : 0;

  const wilson = wilsonConfidenceInterval(successCount, executedCount, 1.96);
  const meanTimeToGoalSec =
    successCount > 0
      ? Number((successTrials.reduce((acc, t) => acc + t.timeToGoalSec, 0) / successCount).toFixed(2))
      : executedCount > 0
      ? Number((trials.reduce((acc, t) => acc + t.timeToGoalSec, 0) / executedCount).toFixed(2))
      : 0;
  const meanPathEfficiencyPct =
    executedCount > 0
      ? Number((trials.reduce((acc, t) => acc + t.pathEfficiencyPct, 0) / executedCount).toFixed(1))
      : 0;
  const totalCollisions = trials.reduce((acc, t) => acc + t.collisions, 0);
  const totalTiltViolations = trials.reduce((acc, t) => acc + t.tiltViolations, 0);

  return {
    runId: `bench_${Date.now()}`,
    timestampIso: new Date().toISOString(),
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    profileId: profile.id,
    profileName: profile.name,
    policySource: options.customPlan && options.customPlan.waypoints.length > 0 ? 'nemotron_plan' : 'scenario_default',
    trialCount: executedCount,
    successCount,
    successRatePct,
    wilson95Pct: [Number((wilson.low * 100).toFixed(1)), Number((wilson.high * 100).toFixed(1))],
    meanTimeToGoalSec,
    meanPathEfficiencyPct,
    totalSafetyViolations: totalCollisions + totalTiltViolations,
    totalCollisions,
    totalTiltViolations,
    trials,
  };
}

export function exportBenchmarkJson(report: BenchmarkScorecard): string {
  return JSON.stringify(report, null, 2);
}

export function exportBenchmarkMarkdown(report: BenchmarkScorecard): string {
  const lines: string[] = [
    `# Omni-Kinetic Sim-to-Real Benchmark Report`,
    ``,
    `- **Run ID:** \`${report.runId}\``,
    `- **Timestamp (UTC):** ${report.timestampIso}`,
    `- **Scenario:** ${report.scenarioName} (\`${report.scenarioId}\`)`,
    `- **Robot Profile:** ${report.profileName} (\`${report.profileId}\`)`,
    `- **Policy Source:** ${report.policySource === 'nemotron_plan' ? 'NVIDIA Nemotron Plan' : 'Scenario Standard Pure Pursuit'}`,
    ``,
    `## Evaluation Scorecard`,
    ``,
    `| Metric | Value |`,
    `| --- | --- |`,
    `| **Success Rate** | **${report.successRatePct}%** (${report.successCount}/${report.trialCount}, 95% Wilson CI [${report.wilson95Pct[0]}%, ${report.wilson95Pct[1]}%]) |`,
    `| **Mean Time to Goal** | ${report.meanTimeToGoalSec.toFixed(2)} s |`,
    `| **Path Efficiency** | ${report.meanPathEfficiencyPct.toFixed(1)}% |`,
    `| **Safety Violations** | ${report.totalSafetyViolations} (${report.totalTiltViolations} tilt breaches, ${report.totalCollisions} collisions) |`,
    ``,
    `## Per-Trial Domain Randomization Telemetry`,
    ``,
    `| Trial | Seed | Gravity (m/s²) | Friction μ | Noise σ | Status | Time (s) | Efficiency | Violations (T/C) | Max Tilt (°) |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  ];

  for (const t of report.trials) {
    lines.push(
      `| #${t.trialIndex} | ${t.seed} | ${t.gravityMps2.toFixed(2)} | ${t.frictionCoeff.toFixed(2)} | ${t.imuNoiseSigma.toFixed(3)} | ${
        t.success ? 'PASS' : `FAIL (${t.failureReason || 'timeout'})`
      } | ${t.timeToGoalSec.toFixed(2)} | ${t.pathEfficiencyPct.toFixed(1)}% | ${t.tiltViolations}/${t.collisions} | ${t.maxTiltDeg.toFixed(1)}° |`
    );
  }

  return lines.join('\n');
}
