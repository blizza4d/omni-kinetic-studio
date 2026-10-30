import { generateElevationGrid, TerrainConfig } from '@/lib/world/terrain';

self.onmessage = (e: MessageEvent<{ config: TerrainConfig }>) => {
  const { config } = e.data;
  const t0 = performance.now();

  const { heights, minHeight, maxHeight } = generateElevationGrid(config);
  const durationMs = performance.now() - t0;

  // Zero-copy transfer of the underlying ArrayBuffer
  self.postMessage(
    {
      type: 'TERRAIN_GENERATED',
      heights,
      minHeight,
      maxHeight,
      durationMs,
    },
    // @ts-ignore Transferable
    [heights.buffer]
  );
};
