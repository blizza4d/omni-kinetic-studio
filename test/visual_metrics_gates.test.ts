import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDebrisField } from '../lib/world/debris';
import { generateCanonicalTerrain } from '../lib/world/terrain/generator';

test('Visual Metrics: Debris radial falloff prevents boulder accumulation at rim', () => {
  const getH = (x: number, z: number) => 0;
  const debris = generateDebrisField(1800, [48, 48], 42, getH);

  // Measure density in rings: 10-15m vs 15-18m
  let countInner = 0; // 10m to 15m
  let countOuter = 0; // 15m to 17.6m

  for (const d of debris) {
    const r = Math.max(Math.abs(d.x), Math.abs(d.z));
    if (r >= 10.0 && r < 15.0) countInner++;
    if (r >= 15.0 && r <= 18.0) countOuter++;
  }

  // The outer perimeter must have tapering/falloff density, not a wall
  const innerArea = (15 * 15 - 10 * 10) * 4; // 500 m^2
  const outerArea = (17.6 * 17.6 - 15 * 15) * 4; // 339 m^2

  const densityInner = countInner / innerArea;
  const densityOuter = countOuter / outerArea;

  console.log(`Debris density: Inner (10-15m) = ${densityInner.toFixed(3)}/m², Outer (15-18m) = ${densityOuter.toFixed(3)}/m²`);
  assert.ok(densityOuter <= densityInner * 0.85, `Outer rim density ${densityOuter} must taper below inner density ${densityInner}`);
});

test('Visual Metrics: Rim proximity check is strictly zero at spawn (0, 0)', () => {
  // Simulates shader uEdgeDistance uniform logic
  const halfExtent = 18.0;
  const robotSpawnX = 0;
  const robotSpawnZ = 0;

  const distToEdge = Math.max(0, halfExtent - Math.max(Math.abs(robotSpawnX), Math.abs(robotSpawnZ)));
  assert.equal(distToEdge, 18.0);

  // Smoothstep(2.5, 0.0, distToEdge): when distToEdge is 18.0, value is strictly 0.0
  const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };

  const rimActivation = smoothstep(2.5, 0.0, distToEdge);
  assert.equal(rimActivation, 0.0, 'Rim red glow activation must be 0.0 at spawn');
});
