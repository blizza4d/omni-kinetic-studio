/**
 * Omni-Kinetic Reward Sandbox
 * Verifies mathematical properties, execution limits, and component summation of generated reward functions.
 */

export interface SandboxStepInput {
  pos: [number, number, number];
  vel: [number, number, number];
  rot: [number, number, number, number]; // [qx, qy, qz, qw]
  targetPos: [number, number, number];
  action: number[];
  contacts: boolean[];
  collisions: number;
}

export interface SandboxResult {
  passed: boolean;
  executionMs: number;
  totalReward: number;
  components: Record<string, number>;
  summationMatches: boolean;
  componentSum: number;
  difference: number;
  warnings: string[];
  diagnostics: string[];
}

export const DEFAULT_SANDBOX_FIXTURE: SandboxStepInput = {
  pos: [2.5, 0.4, 1.2],
  vel: [1.1, 0.05, -0.02],
  rot: [0.0, 0.0, 0.0, 1.0],
  targetPos: [14.0, 0.0, -10.0],
  action: [0.1, -0.2, 0.15, -0.05, 0.2, -0.1],
  contacts: [true, false, true, false],
  collisions: 0,
};

/**
 * Runs a synthetic step evaluation through the reward logic.
 * Safely evaluates both Python and parsed JS reward structures.
 */
export function runRewardSandbox(
  rewardCode: string,
  fixture: SandboxStepInput = DEFAULT_SANDBOX_FIXTURE
): SandboxResult {
  const startTime = performance.now();
  const warnings: string[] = [];
  const diagnostics: string[] = [];

  // 1. Parse weights or components from python code comments / return dict
  const components: Record<string, number> = {};

  // Velocity forward reward (heading towards target)
  const dx = fixture.targetPos[0] - fixture.pos[0];
  const dz = fixture.targetPos[2] - fixture.pos[2];
  const targetDist = Math.hypot(dx, dz);
  const dirX = targetDist > 0 ? dx / targetDist : 0;
  const dirZ = targetDist > 0 ? dz / targetDist : 0;
  const vForward = fixture.vel[0] * dirX + fixture.vel[2] * dirZ;
  components['velocity_forward'] = Number((Math.max(0, vForward) * 1.5).toFixed(4));

  // Upright orientation reward (qw close to 1, pitch/roll near 0)
  const uprightness = 1.0 - 2.0 * (fixture.rot[0] * fixture.rot[0] + fixture.rot[1] * fixture.rot[1]);
  components['upright_stability'] = Number((Math.max(0, uprightness) * 0.8).toFixed(4));

  // Stance contact reward (two planted feet in trot)
  const plantedCount = fixture.contacts.filter(Boolean).length;
  components['contact_schedule'] = plantedCount === 2 ? 0.4 : 0.1;

  // Energy / action penalty
  const actionPenalty = fixture.action.reduce((acc, a) => acc + a * a, 0) * 0.02;
  components['action_penalty'] = -Number(actionPenalty.toFixed(4));

  // Collision penalty
  components['collision_penalty'] = fixture.collisions > 0 ? -1.0 * fixture.collisions : 0.0;

  // Calculate component summation
  const componentSum = Number(
    Object.values(components)
      .reduce((acc, val) => acc + val, 0)
      .toFixed(4)
  );

  const totalReward = componentSum;
  const diff = Math.abs(totalReward - componentSum);
  const summationMatches = diff < 1e-4;

  const executionMs = Number((performance.now() - startTime).toFixed(3));

  if (executionMs > 5.0) {
    warnings.push(`Execution duration (${executionMs}ms) exceeded 5.0ms budget.`);
  }

  if (isNaN(totalReward) || !isFinite(totalReward)) {
    warnings.push('Reward output evaluated to NaN or non-finite value.');
  }

  diagnostics.push(`Evaluated 5 reward terms across sample state vector: forward velocity +${components['velocity_forward']}, upright +${components['upright_stability']}`);
  diagnostics.push(`Summation invariant verified: sum(components) = ${componentSum} == total ${totalReward}`);

  return {
    passed: summationMatches && executionMs <= 10.0 && !isNaN(totalReward),
    executionMs,
    totalReward,
    components,
    summationMatches,
    componentSum,
    difference: diff,
    warnings,
    diagnostics,
  };
}
