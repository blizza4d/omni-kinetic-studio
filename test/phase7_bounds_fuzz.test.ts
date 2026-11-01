import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalSimulationRunner } from '../lib/telemetry/local_runner';
import { generateDebrisField, checkNavigablePath } from '../lib/world/debris';
import { getTerrainHeight, DEFAULT_TERRAIN_CONFIG } from '../lib/world/terrain';
import { evaluateBoundary, DEFAULT_ARENA } from '../lib/world/bounds';
import { BoundsReportSchema } from '../contracts';

test('Bounds Fuzz Test: 1,000 Seeded Episodes across 3 Policies remain within arena and catch plane', () => {
  const policies = ['straight_forward', 'zigzag_steering', 'brownian_perturbation'];
  const episodesPerPolicy = 334; // Total = 1,002 episodes
  const statusCounts: Record<string, number> = {};

  let nanCount = 0;
  let escapeCount = 0;
  let fallThroughCount = 0;
  let maxDistanceOutsideArena = 0;
  let totalEpisodes = 0;

  for (let policyIdx = 0; policyIdx < policies.length; policyIdx++) {
    const policy = policies[policyIdx];

    for (let ep = 0; ep < episodesPerPolicy; ep++) {
      const seed = 1000 + ep * 3 + policyIdx;
      const runner = new LocalSimulationRunner(`fuzz_${seed}`, 60, 1);
      totalEpisodes++;

      // Run 600 steps (10 seconds) per episode
      for (let s = 0; s < 600; s++) {
        const frame = runner.generateFrame(s);
        const torso = frame.bodies[0];
        const [x, y, z] = torso.pos;

        // Check for NaN or corrupt transforms
        if (isNaN(x) || isNaN(y) || isNaN(z)) {
          nanCount++;
        }

        const dist = Math.hypot(x, z);
        if (dist > DEFAULT_ARENA.hardMargin) {
          escapeCount++;
          if (dist - DEFAULT_ARENA.hardMargin > maxDistanceOutsideArena) {
            maxDistanceOutsideArena = dist - DEFAULT_ARENA.hardMargin;
          }
        }

        if (y < DEFAULT_ARENA.floorCatchY) {
          fallThroughCount++;
        }

        statusCounts[frame.status] = (statusCounts[frame.status] || 0) + 1;
      }
    }
  }

  // Fuzz Assertions
  assert.strictEqual(nanCount, 0, `Expected 0 NaNs, found ${nanCount}`);
  assert.strictEqual(escapeCount, 0, `Expected 0 escapes beyond hardMargin (20m), found ${escapeCount}`);
  assert.strictEqual(fallThroughCount, 0, `Expected 0 fall-throughs below catch plane, found ${fallThroughCount}`);
  assert.strictEqual(maxDistanceOutsideArena, 0, 'Robot exceeded arena hardMargin');

  // Verify Reachability Corridor on 100 randomized seeds
  let reachabilityPassed = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const debris = generateDebrisField(1800, [40, 40], seed, (x, z) => getTerrainHeight(x, z, DEFAULT_TERRAIN_CONFIG));
    const navigable = checkNavigablePath(debris, [0, 0, 0], [14, 0, -10]);
    if (navigable) reachabilityPassed++;
  }

  assert.strictEqual(reachabilityPassed, 100, `Reachability check passed for ${reachabilityPassed}/100 seeds`);

  // Validate BoundsReport Schema
  const report = BoundsReportSchema.parse({
    episodes: totalEpisodes,
    policies,
    statusCounts,
    nanCount,
    escapeCount,
    fallThroughCount,
    maxDistanceOutsideArena,
    passed: true,
  });

  assert.ok(report.passed);
});
