import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCanonicalTerrain } from '../lib/world/terrain/generator';

function fitPlaneSlope(points: { x: number; z: number; y: number }[]): number {
  const n = points.length;
  if (n < 3) return 0;

  let sumX = 0, sumZ = 0, sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumZ += p.z;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanZ = sumZ / n;
  const meanY = sumY / n;

  let sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dz = p.z - meanZ;
    const dy = p.y - meanY;
    sxx += dx * dx;
    szz += dz * dz;
    sxz += dx * dz;
    sxy += dx * dy;
    szy += dz * dy;
  }

  const det = sxx * szz - sxz * sxz;
  if (Math.abs(det) < 1e-8) return 0;

  const a = (sxy * szz - szy * sxz) / det;
  const b = (szy * sxx - sxy * sxz) / det;
  const gradMag = Math.hypot(a, b);
  return Math.atan(gradMag) * (180 / Math.PI);
}

test('Terrain Detrend: Mean plane tilt <= 1.0 deg across golden seeds', () => {
  const goldenSeeds = [42, 101, 777, 2024, 9999];

  for (const seed of goldenSeeds) {
    const field = generateCanonicalTerrain(seed);
    const arenaRadius = 18.0;

    const arenaPoints: { x: number; z: number; y: number }[] = [];
    for (let x = -arenaRadius; x <= arenaRadius; x += 1.0) {
      for (let z = -arenaRadius; z <= arenaRadius; z += 1.0) {
        if (Math.hypot(x, z) <= arenaRadius) {
          arenaPoints.push({ x, z, y: field.sampleHeight(x, z) });
        }
      }
    }

    const meanPlaneTiltDeg = fitPlaneSlope(arenaPoints);
    assert.ok(
      meanPlaneTiltDeg <= 1.0,
      `Seed ${seed}: mean plane tilt ${meanPlaneTiltDeg.toFixed(2)} deg exceeds 1.0 deg limit`
    );
  }
});

test('Terrain Detrend: Max 12m window tilt along corridor <= 3.0 deg', () => {
  const goldenSeeds = [42, 101, 777, 2024, 9999];

  for (const seed of goldenSeeds) {
    const field = generateCanonicalTerrain(seed);
    const windowRadius = 6.0;

    // Test 12m windows along the travel corridor from (0,0) to (14, -10)
    for (let t = 0; t <= 1.0; t += 0.25) {
      const cx = 0 + t * 14.0;
      const cz = 0 + t * -10.0;
      const windowPoints: { x: number; z: number; y: number }[] = [];

      for (let wx = -windowRadius; wx <= windowRadius; wx += 1.0) {
        for (let wz = -windowRadius; wz <= windowRadius; wz += 1.0) {
          if (Math.hypot(wx, wz) <= windowRadius) {
            windowPoints.push({ x: cx + wx, z: cz + wz, y: field.sampleHeight(cx + wx, cz + wz) });
          }
        }
      }

      const winTilt = fitPlaneSlope(windowPoints);
      assert.ok(
        winTilt <= 3.0,
        `Seed ${seed} at t=${t} (${cx.toFixed(1)}, ${cz.toFixed(1)}): 12m window tilt ${winTilt.toFixed(2)} deg exceeds 3.0 deg limit`
      );
    }
  }
});
