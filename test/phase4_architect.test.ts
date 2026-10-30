import test from 'node:test';
import assert from 'node:assert';
import { compileSpec } from '@/lib/spec/compiler';
import { runRewardSandbox } from '@/sim/reward_sandbox';
import { generateDeterministicEnvironmentSpec } from '@/lib/nebius/prompts';
import { EnvironmentSpecV4Schema, CompiledSpecSchema } from '@/contracts';

test('SpecCompiler: Clamps out-of-bounds parameters and logs all adjustments', () => {
  const unsafeSpec = {
    taskId: 'test_clamp_task',
    taskName: 'Unsafe LLM Output',
    description: 'Adversarial parameters',
    gravity: [5.0, 10.0, -15.0], // Out of bounds
    terrain: {
      roughness: 1.5, // > 0.95
      friction: 0.05, // < 0.2
      amplitude: 8.0, // > 3.5
      skirt: 10.0, // > 2.0
    },
    debris: {
      count: 5000, // > 2200
      sizeRange: [0.8, 0.4], // Inverted
    },
    robot: {
      massKg: 150.0, // > 40
      baseSpeed: 10.0, // > 2.5
      cadenceHz: 8.0, // > 3.0
    },
    episodeLength: 10000, // > 3000
    spawn: { pos: [35.0, 0, 45.0] }, // Outside arena
    goal: { pos: [-50.0, 0, -50.0] }, // Outside arena
  };

  const compiled = compileSpec(unsafeSpec);

  // Validate CompiledSpec Schema
  const validated = CompiledSpecSchema.parse(compiled);
  assert.ok(validated.specHash.length >= 8);
  assert.strictEqual(validated.spec.schemaVersion, '4.0');

  // Verify Clamping Invariants
  assert.ok(validated.spec.gravity[1] <= -0.5, 'Gravity Y must be downward');
  assert.ok(validated.spec.gravity[0] >= -2.0 && validated.spec.gravity[0] <= 2.0);
  assert.ok(validated.spec.terrain.roughness <= 0.95);
  assert.ok(validated.spec.terrain.friction >= 0.2);
  assert.ok(validated.spec.terrain.skirt <= 2.0, 'Outer perimeter skirt must be <= 2.0m');
  assert.ok(validated.spec.debris.count <= 2200);
  assert.ok(validated.spec.debris.sizeRange[1] > validated.spec.debris.sizeRange[0]);
  assert.ok(validated.spec.robot.baseSpeed <= 2.5);
  assert.ok(validated.spec.robot.cadenceHz <= 3.0);
  assert.ok(Math.abs(validated.spec.spawn.pos[0]) <= 16.0);
  assert.ok(Math.abs(validated.spec.goal.pos[0]) <= 16.0);

  // Verify Adjustments Report
  assert.ok(validated.report.adjustments.length >= 8, 'Expected multiple clamped adjustments logged');
  assert.ok(validated.report.reachability.reachable, 'A* corridor reachability must hold');
});

test('Reward Sandbox: Evaluates execution within 5.0ms budget and verifies component summation', () => {
  const dummyRewardCode = `
import numpy as np

def compute_step_reward(state: dict, action: np.ndarray, prev_state: dict):
    # Standard reward function with component dict
    return 1.825, {
        "velocity_forward": 1.10,
        "upright_stability": 0.65,
        "contact_schedule": 0.40,
        "action_penalty": -0.325,
        "collision_penalty": 0.0
    }
`;

  const result = runRewardSandbox(dummyRewardCode);
  assert.strictEqual(result.passed, true);
  assert.ok(result.executionMs <= 5.0, `Execution ms ${result.executionMs} <= 5.0 budget`);
  assert.strictEqual(result.summationMatches, true);
  assert.ok(Math.abs(result.totalReward - result.componentSum) < 1e-4);
  assert.strictEqual(result.warnings.length, 0);
});

test('Two Prompts, Two Worlds: Generates distinct physical worlds for Moon vs Mars prompts', () => {
  const moonPrompt = 'Low-gravity lunar crater exploration with dense basalt boulders and slow trot gait';
  const marsPrompt = 'High-gravity Martian plains sprint with sparse regolith rocks and fast gait';

  const moonSpec = generateDeterministicEnvironmentSpec(moonPrompt);
  const marsSpec = generateDeterministicEnvironmentSpec(marsPrompt);

  const compiledMoon = compileSpec(moonSpec);
  const compiledMars = compileSpec(marsSpec);

  // Verify distinct gravity
  assert.strictEqual(compiledMoon.spec.gravity[1], -1.62, 'Moon vertical gravity must be -1.62 m/s²');
  assert.strictEqual(compiledMars.spec.gravity[1], -3.72, 'Mars vertical gravity must be -3.72 m/s²');

  // Verify distinct terrain and debris characteristics
  assert.notStrictEqual(compiledMoon.spec.terrain.seed, compiledMars.spec.terrain.seed);
  assert.ok(compiledMoon.spec.debris.count > compiledMars.spec.debris.count * 1.5, 'Moon should have significantly denser debris');
  assert.ok(compiledMoon.spec.terrain.roughness > compiledMars.spec.terrain.roughness, 'Moon should have higher crater roughness');

  // Verify distinct robot locomotion dynamics
  assert.ok(compiledMars.spec.robot.baseSpeed > compiledMoon.spec.robot.baseSpeed * 1.5, 'Mars sprint should have faster base speed');
  assert.ok(compiledMars.spec.robot.cadenceHz > compiledMoon.spec.robot.cadenceHz, 'Mars sprint should have higher stride cadence');

  // Verify distinct hashes
  assert.notStrictEqual(compiledMoon.specHash, compiledMars.specHash, 'Two prompts must produce two distinct spec hashes');
});
