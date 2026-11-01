import fs from 'fs';
import path from 'path';
import { generateCanonicalTerrain } from '../lib/world/terrain/generator';

interface SeedTiltReport {
  seed: number;
  meanPlaneTiltDeg: number;
  maxWindowTilt12mDeg: number;
  meanSlopeDeg: number;
  p95SlopeDeg: number;
}

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

  // y = a*x + b*z + c
  const a = (sxy * szz - szy * sxz) / det;
  const b = (szy * sxx - sxy * sxz) / det;

  // Gradient magnitude: |grad| = sqrt(a^2 + b^2)
  // Tilt angle in degrees: atan(sqrt(a^2 + b^2)) * 180 / PI
  const gradMag = Math.hypot(a, b);
  return Math.atan(gradMag) * (180 / Math.PI);
}

function evaluateSeed(seed: number): SeedTiltReport {
  const field = generateCanonicalTerrain(seed);
  const arenaRadius = 18.0;

  // 1. Overall Arena Mean Plane Tilt (sample points in 18m radius)
  const arenaPoints: { x: number; z: number; y: number }[] = [];
  const step = 1.0;
  for (let x = -arenaRadius; x <= arenaRadius; x += step) {
    for (let z = -arenaRadius; z <= arenaRadius; z += step) {
      if (Math.hypot(x, z) <= arenaRadius) {
        arenaPoints.push({ x, z, y: field.sampleHeight(x, z) });
      }
    }
  }
  const meanPlaneTiltDeg = fitPlaneSlope(arenaPoints);

  // 2. Max 12m Window Tilt across overlapping windows
  let maxWindowTilt12mDeg = 0;
  const windowRadius = 6.0;
  for (let cx = -12; cx <= 12; cx += 4) {
    for (let cz = -12; cz <= 12; cz += 4) {
      const windowPoints: { x: number; z: number; y: number }[] = [];
      for (let wx = -windowRadius; wx <= windowRadius; wx += 1.0) {
        for (let wz = -windowRadius; wz <= windowRadius; wz += 1.0) {
          if (Math.hypot(wx, wz) <= windowRadius) {
            windowPoints.push({ x: cx + wx, z: cz + wz, y: field.sampleHeight(cx + wx, cz + wz) });
          }
        }
      }
      const winTilt = fitPlaneSlope(windowPoints);
      if (winTilt > maxWindowTilt12mDeg) {
        maxWindowTilt12mDeg = winTilt;
      }
    }
  }

  // 3. Slope statistics
  const slopes: number[] = [];
  for (let x = -15; x <= 15; x += 1.5) {
    for (let z = -15; z <= 15; z += 1.5) {
      const h0 = field.sampleHeight(x, z);
      const hx = field.sampleHeight(x + 0.3, z);
      const hz = field.sampleHeight(x, z + 0.3);
      const gx = (hx - h0) / 0.3;
      const gz = (hz - h0) / 0.3;
      const deg = Math.atan(Math.hypot(gx, gz)) * (180 / Math.PI);
      slopes.push(deg);
    }
  }
  slopes.sort((a, b) => a - b);
  const meanSlopeDeg = slopes.reduce((a, b) => a + b, 0) / slopes.length;
  const p95SlopeDeg = slopes[Math.floor(slopes.length * 0.95)];

  return {
    seed,
    meanPlaneTiltDeg: Number(meanPlaneTiltDeg.toFixed(2)),
    maxWindowTilt12mDeg: Number(maxWindowTilt12mDeg.toFixed(2)),
    meanSlopeDeg: Number(meanSlopeDeg.toFixed(2)),
    p95SlopeDeg: Number(p95SlopeDeg.toFixed(2)),
  };
}

async function runTiltAudit() {
  console.log('=== Running Terrain Tilt Audit Across 100 Seeds ===');
  const reports: SeedTiltReport[] = [];
  for (let s = 1; s <= 100; s++) {
    reports.push(evaluateSeed(s * 73 + 17));
  }

  const tilts = reports.map((r) => r.meanPlaneTiltDeg).sort((a, b) => a - b);
  const winTilts = reports.map((r) => r.maxWindowTilt12mDeg).sort((a, b) => a - b);

  const meanTiltAvg = tilts.reduce((a, b) => a + b, 0) / tilts.length;
  const meanTiltP95 = tilts[Math.floor(tilts.length * 0.95)];
  const maxWinAvg = winTilts.reduce((a, b) => a + b, 0) / winTilts.length;
  const maxWinP95 = winTilts[Math.floor(winTilts.length * 0.95)];

  console.log(`Mean Plane Tilt (100 seeds): Avg = ${meanTiltAvg.toFixed(2)}°, P95 = ${meanTiltP95.toFixed(2)}° (limit <= 1.0°)`);
  console.log(`Max 12m Window Tilt (100 seeds): Avg = ${maxWinAvg.toFixed(2)}°, P95 = ${maxWinP95.toFixed(2)}° (limit <= 3.0°)`);

  const outPath = path.resolve(process.cwd(), 'docs/terrain-tilt-baseline.json');
  fs.writeFileSync(outPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { meanTiltAvg, meanTiltP95, maxWinAvg, maxWinP95 },
    reports: reports.slice(0, 20),
  }, null, 2));
  console.log(`Saved tilt audit to ${outPath}`);
}

runTiltAudit().catch(console.error);
