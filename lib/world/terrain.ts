/**
 * Unified Procedural Terrain Accessor
 *
 * Delegates directly to the authoritative canonical TerrainField service
 * (`lib/world/terrain/service.ts`) so that Three.js mesh vertices, physics/gait,
 * foot contact blobs, debris boulders, radar hillshade, and LiDAR all agree
 * to sub-millimeter precision (0.000m terrain divergence).
 */

import { getCanonicalTerrainField } from './terrain/service';

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
 * Evaluates the authoritative canonical terrain elevation at world coordinates (x, z).
 * Deterministic and bit-identical across ThreeViewer, LocalSimulationRunner, and SimEngine.
 */
export function getTerrainHeight(x: number, z: number, config: TerrainConfig = DEFAULT_TERRAIN_CONFIG): number {
  const seed = Number.isFinite(config.seed) ? config.seed : DEFAULT_TERRAIN_CONFIG.seed;
  const field = getCanonicalTerrainField(seed);
  return field.sampleHeight(x, z);
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

  let minHeight = Infinity;
  let maxHeight = -Infinity;

  for (let j = 0; j < gridRes; j++) {
    const z = j * dz - halfL;
    for (let i = 0; i < gridRes; i++) {
      const x = i * dx - halfW;
      const h = getTerrainHeight(x, z, config);
      heights[j * gridRes + i] = h;
      if (h < minHeight) minHeight = h;
      if (h > maxHeight) maxHeight = h;
    }
  }

  return { heights, minHeight, maxHeight };
}
