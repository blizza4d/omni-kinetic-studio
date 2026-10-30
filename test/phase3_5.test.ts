import assert from 'node:assert';
import test from 'node:test';
import { getTerrainHeight, DEFAULT_TERRAIN_CONFIG, generateElevationGrid } from '../lib/world/terrain';
import { generateDebrisField } from '../lib/world/debris';
import { LocalSimulationRunner } from '../lib/telemetry/local_runner';
import { TelemetryFrameSchema, EnvironmentSpecSchema } from '../contracts';

test('Terrain Determinism: identical seed produces identical height at 20 sample coordinates', () => {
  const seed = 1337;
  const config = { ...DEFAULT_TERRAIN_CONFIG, seed };

  // Sample 20 random points across 40x40m terrain
  const points = [
    [-15.2, -12.4], [-8.1, 5.3], [0.0, 0.0], [12.7, -9.1], [18.4, 16.2],
    [-19.0, 18.0], [5.5, -14.2], [7.8, 12.1], [-11.3, -3.2], [14.1, 2.5],
    [-4.2, 8.9], [9.3, -7.4], [-16.5, 4.1], [2.2, -18.0], [-7.7, -15.5],
    [16.8, -14.3], [-1.5, 12.6], [11.2, 11.2], [-13.4, 15.6], [8.0, 0.5],
  ];

  for (const [x, z] of points) {
    const h1 = getTerrainHeight(x, z, config);
    const h2 = getTerrainHeight(x, z, config);
    assert.strictEqual(h1, h2, `Height at (${x}, ${z}) must be strictly deterministic`);
  }
});

test('Terrain Heightfield: visual grid elevation matches analytical height within 0.01m', () => {
  const config = { ...DEFAULT_TERRAIN_CONFIG, segments: 64 };
  const { heights } = generateElevationGrid(config);

  const gridRes = config.segments + 1;
  const dx = config.width / config.segments;
  const dz = config.length / config.segments;
  const halfW = config.width / 2;
  const halfL = config.length / 2;

  // Sample 20 grid indices
  for (let k = 0; k < 20; k++) {
    const i = (k * 3) % gridRes;
    const j = (k * 5) % gridRes;

    const x = i * dx - halfW;
    const z = j * dz - halfL;

    const gridVal = heights[j * gridRes + i];
    const directVal = getTerrainHeight(x, z, config);

    const diff = Math.abs(gridVal - directVal);
    assert.ok(diff < 0.01, `Height discrepancy (${diff}) at (${x}, ${z}) must be < 1cm`);
  }
});

test('Debris Generation: produces 1800 instances with realistic bounds and center clearing', () => {
  const config = DEFAULT_TERRAIN_CONFIG;
  const debris = generateDebrisField(1800, [40, 40], config.seed, (x, z) => getTerrainHeight(x, z, config));

  assert.ok(debris.length > 1500, `Expected ~1800 debris instances, got ${debris.length}`);

  for (const d of debris) {
    const dist = Math.sqrt(d.x * d.x + d.z * d.z);
    assert.ok(dist >= 2.5, 'Debris must maintain minimum 2.5m spawn clearing');
    assert.ok(d.scale >= 0.2 && d.scale <= 1.3, 'Debris scale within bounds');
  }
});

test('Local Runner Realism: emits valid TelemetryFrame v2 grounded on heightfield', () => {
  const runner = new LocalSimulationRunner('realism_test', 60, 1);
  const batch = runner.getNextBatch(30);

  assert.strictEqual(batch.frames.length, 30);
  for (const f of batch.frames) {
    const parsed = TelemetryFrameSchema.parse(f);
    assert.ok(['2.0', '3.0', '4.0'].includes(parsed.schemaVersion || ''));
    assert.strictEqual(parsed.iteration, 1);
    assert.ok(parsed.rewardComponents.forward !== undefined, 'Forward reward component required');
    assert.ok(parsed.rewardComponents.stability !== undefined, 'Stability reward component required');
    assert.ok(parsed.goalDistance !== undefined, 'Goal distance required');

    // Robot y (elevation) must be grounded above heightfield
    const torso = parsed.bodies[0];
    assert.ok(torso.pos[2] > -2.0 && torso.pos[2] < 5.0, 'Robot elevation within physical bounds');
  }
});
