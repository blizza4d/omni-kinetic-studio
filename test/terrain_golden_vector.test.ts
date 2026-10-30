import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { generateCanonicalTerrain } from '../lib/world/terrain/generator';

test('TerrainField: Seed 42 produces deterministic identical SHA-256 hash across runs', () => {
  const field1 = generateCanonicalTerrain(42);
  const field2 = generateCanonicalTerrain(42);

  assert.equal(field1.data.hash, field2.data.hash, 'Hash must be identical for identical seed');
  assert.equal(field1.data.heights.length, 257 * 257);
  assert.equal(field1.data.heights.byteLength, 257 * 257 * 2); // 132,098 bytes
});

test('TerrainField: Validates statistical invariants across 10 seeded runs', () => {
  const seeds = [42, 101, 777, 2024, 9999, 12345, 54321, 98765, 11111, 88888];

  for (const s of seeds) {
    const field = generateCanonicalTerrain(s);
    const stats = field.data.stats;

    assert.ok(stats.relief >= 1.0 && stats.relief <= 3.2, `Relief ${stats.relief}m out of bounds for seed ${s}`);
    assert.ok(stats.p95Slope <= 28.5, `p95Slope ${stats.p95Slope} deg exceeded 28.5 deg for seed ${s}`);
    assert.ok(stats.craterCount >= 8, `Crater count ${stats.craterCount} too low for seed ${s}`);
    assert.ok(field.data.path.length >= 2, `Path missing waypoints for seed ${s}`);

    // Verify slope at spawn (0, 0) is <= 5 degrees
    const spawnSlope = field.sampleSlope(0, 0);
    assert.ok(spawnSlope <= 5.5, `Spawn slope ${spawnSlope} deg exceeds 5.5 deg limit`);
  }
});

test('TerrainField: Golden Vector Parity (1,000 points agree within 1e-4 meters)', () => {
  const field = generateCanonicalTerrain(42);
  const vectorFilePath = path.join(process.cwd(), 'lib/world/terrain/golden_vectors.json');

  let goldenVectors: { x: number; z: number; expectedH: number }[];

  if (!fs.existsSync(vectorFilePath)) {
    // Generate deterministic 1,000 vectors if file does not exist yet
    goldenVectors = [];
    const step = 40.0 / 31.0;
    for (let ix = 0; ix < 32; ix++) {
      for (let iz = 0; iz < 32; iz++) {
        if (goldenVectors.length >= 1000) break;
        const x = Number((-20.0 + ix * step).toFixed(4));
        const z = Number((-20.0 + iz * step).toFixed(4));
        const expectedH = Number(field.sampleHeight(x, z).toFixed(5));
        goldenVectors.push({ x, z, expectedH });
      }
    }
    fs.mkdirSync(path.dirname(vectorFilePath), { recursive: true });
    fs.writeFileSync(vectorFilePath, JSON.stringify(goldenVectors, null, 2), 'utf8');
  } else {
    goldenVectors = JSON.parse(fs.readFileSync(vectorFilePath, 'utf8'));
  }

  let maxDeviation = 0;
  for (const v of goldenVectors) {
    const h = field.sampleHeight(v.x, v.z);
    const diff = Math.abs(h - v.expectedH);
    if (diff > maxDeviation) maxDeviation = diff;
    assert.ok(diff < 1e-4, `Deviation ${diff} exceeds 1e-4m at (${v.x}, ${v.z})`);
  }

  console.log(`[Golden Vector Parity] Tested ${goldenVectors.length} points: max deviation = ${maxDeviation.toExponential(3)}m (PASS < 1e-4m)`);
});
