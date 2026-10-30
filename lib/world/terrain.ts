/**
 * Deterministic procedural terrain generator using fractional Brownian motion (fBm).
 * Shared across Three.js visual mesh, cannon-es physical heightfield, and local runner.
 */

export interface TerrainConfig {
  seed: number;
  width: number;
  length: number;
  segments: number;
  roughness: number;
  octaves?: number;
  amplitude?: number;
}

export const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  seed: 42,
  width: 40,
  length: 40,
  segments: 128,
  roughness: 0.65,
  octaves: 4,
  amplitude: 1.8,
};

/**
 * Pseudo-random 2D gradient hash for deterministic continuous noise.
 */
function hash2d(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + seed * 137.5) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Bilinear smoothed noise cell.
 */
function smoothNoise2d(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  // Smoothstep interpolation curve
  const wx = fx * fx * (3.0 - 2.0 * fx);
  const wz = fz * fz * (3.0 - 2.0 * fz);

  const s00 = hash2d(ix, iz, seed);
  const s10 = hash2d(ix + 1, iz, seed);
  const s01 = hash2d(ix, iz + 1, seed);
  const s11 = hash2d(ix + 1, iz + 1, seed);

  const top = s00 * (1.0 - wx) + s10 * wx;
  const bottom = s01 * (1.0 - wx) + s11 * wx;
  return top * (1.0 - wz) + bottom * wz;
}

/**
 * Evaluates the terrain elevation at world coordinates (x, z).
 * Deterministic and reproducible across all platforms.
 */
export function getTerrainHeight(x: number, z: number, config: TerrainConfig = DEFAULT_TERRAIN_CONFIG): number {
  const { seed, roughness, octaves = 4, amplitude = 1.8 } = config;

  let total = 0.0;
  let freq = 0.08;
  let amp = amplitude * roughness;
  let maxAmp = 0.0;

  for (let o = 0; o < octaves; o++) {
    total += smoothNoise2d(x * freq, z * freq, seed + o * 31) * amp;
    maxAmp += amp;
    amp *= 0.5;
    freq *= 2.0;
  }

  // Normalize and apply low-gravity crater bowl dip
  const normalized = (total / maxAmp) * 2.0 - 1.0;
  const distFromCenter = Math.sqrt(x * x + z * z);
  const craterRim = Math.sin(distFromCenter * 0.25 + seed) * 0.35 * roughness;

  return normalized * (amplitude * roughness) + craterRim;
}

/**
 * Generates a full 2D elevation grid array for Heightfield geometry / cannon-es.
 * Returns: Float32Array of size (segments + 1) * (segments + 1)
 */
export function generateElevationGrid(config: TerrainConfig): {
  heights: Float32Array;
  minHeight: number;
  maxHeight: number;
} {
  const { width, length, segments } = config;
  const gridRes = segments + 1;
  const heights = new Float32Array(gridRes * gridRes);

  const dx = width / segments;
  const dz = length / segments;
  const halfW = width / 2;
  const halfL = length / 2;

  let minH = Infinity;
  let maxH = -Infinity;

  for (let j = 0; j < gridRes; j++) {
    const z = j * dz - halfL;
    for (let i = 0; i < gridRes; i++) {
      const x = i * dx - halfW;
      const h = getTerrainHeight(x, z, config);
      heights[j * gridRes + i] = h;

      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }

  return { heights, minHeight: minH, maxHeight: maxH };
}
