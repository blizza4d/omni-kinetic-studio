import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { getTerrainHeight, DEFAULT_TERRAIN_CONFIG } from '../lib/world/terrain';
import { generateDebrisField } from '../lib/world/debris';

const SCREENSHOT_DIR = 'C:\\Users\\Asus\\.gemini\\antigravity\\brain\\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\\screenshots\\iteration4_baseline';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('=== Starting Iteration 4 Baseline Measurement Harness ===');

  // 1. Analytical Terrain Baseline
  console.log('\n[1/4] Calculating Analytical Terrain Baseline...');
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  const slopeSamples: number[] = [];
  const N = 100;
  const step = 48 / N;

  for (let ix = 0; ix < N; ix++) {
    for (let iz = 0; iz < N; iz++) {
      const x = -24 + ix * step;
      const z = -24 + iz * step;
      const h = getTerrainHeight(x, z, DEFAULT_TERRAIN_CONFIG);
      if (h < minHeight) minHeight = h;
      if (h > maxHeight) maxHeight = h;

      // Slope approximation
      const hx = getTerrainHeight(x + 0.2, z, DEFAULT_TERRAIN_CONFIG);
      const hz = getTerrainHeight(x, z + 0.2, DEFAULT_TERRAIN_CONFIG);
      const slope = Math.atan(Math.sqrt(((hx - h) / 0.2) ** 2 + ((hz - h) / 0.2) ** 2)) * (180 / Math.PI);
      slopeSamples.push(slope);
    }
  }

  slopeSamples.sort((a, b) => a - b);
  const medianSlope = slopeSamples[Math.floor(slopeSamples.length * 0.5)];
  const p95Slope = slopeSamples[Math.floor(slopeSamples.length * 0.95)];
  const relief = maxHeight - minHeight;

  console.log(`Terrain Relief: min=${minHeight.toFixed(3)}m, max=${maxHeight.toFixed(3)}m, relief=${relief.toFixed(3)}m`);
  console.log(`Slope Distribution: median=${medianSlope.toFixed(2)} deg, p95=${p95Slope.toFixed(2)} deg`);

  // 2. Analytical Debris Distribution Baseline
  console.log('\n[2/4] Calculating Debris Radial Distribution...');
  const debris = generateDebrisField(1800, [40, 40], 42, (x, z) => getTerrainHeight(x, z, DEFAULT_TERRAIN_CONFIG));
  const radialBins: number[] = new Array(6).fill(0); // 0-4m, 4-8m, 8-12m, 12-16m, 16-20m, 20m+

  let pyramidCount = 0; // Octahedron
  for (const d of debris) {
    const dist = Math.hypot(d.x, d.z);
    const bin = Math.min(5, Math.floor(dist / 4));
    radialBins[bin]++;
    if (d.geometryType === 2) pyramidCount++;
  }

  console.log(`Debris Count: ${debris.length}`);
  console.log(`Debris Radial Bins (4m annuli):`, radialBins);
  console.log(`Pyramid (Octahedron) Count: ${pyramidCount} (${((pyramidCount / debris.length) * 100).toFixed(1)}%)`);

  // 3. Browser Live Motion & Contact Measurement
  console.log('\n[3/4] Launching Browser for Live Motion & Ground Contact Baseline...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=d3d11',
    ],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  console.log('Waiting 6s for simulation stream to establish...');
  await new Promise((r) => setTimeout(r, 6000));

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_viewport_robot_clipped.png') });
  console.log('Saved: 01_viewport_robot_clipped.png');

  // In-page live measurement
  const liveData = await page.evaluate(async () => {
    const store = (window as any).__omnikinetic_telemetry_store;
    const probe = (window as any).__omnikinetic_perf_probe;

    const canvas = document.querySelector('canvas');
    let gpuRenderer = 'Unknown';
    if (canvas) {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) gpuRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      }
    }

    // Inspect UI element texts
    const headerTitle = document.querySelector('header h1')?.textContent || '';
    const headerChips = Array.from(document.querySelectorAll('header span, header button')).map((el) => el.textContent?.trim()).filter(Boolean);
    const radarCanvas = document.querySelector('canvas[width="130"]');
    const redBorderCheck = window.getComputedStyle(document.body).boxShadow || '';

    // Sample 120 RAF frames (~2 seconds)
    const samples: any[] = [];
    let lastPos: [number, number, number] | null = null;
    let staleCount = 0;
    let maxJump = 0;

    const startWall = performance.now();
    const startSim = store?.getLatestFrame()?.t ?? 0;

    for (let f = 0; f < 120; f++) {
      await new Promise((r) => setTimeout(r, 16));
      const frame = store?.getLatestFrame();
      const torso = frame?.bodies?.find((b: any) => b.id === 'torso') || frame?.bodies?.[0];
      const pos = torso ? [...torso.pos] : null;

      if (pos && lastPos) {
        const dist = Math.hypot(pos[0] - lastPos[0], pos[1] - lastPos[1], pos[2] - lastPos[2]);
        if (dist < 0.0001) {
          staleCount++;
        } else {
          if (dist > maxJump) maxJump = dist;
        }
      }

      if (pos) {
        samples.push({
          f,
          t: frame?.t,
          pos,
          bodiesCount: frame?.bodies?.length,
          jointsCount: frame?.joints?.length,
        });
        lastPos = pos as [number, number, number];
      }
    }

    const endWall = performance.now();
    const endSim = store?.getLatestFrame()?.t ?? 0;
    const wallSec = (endWall - startWall) / 1000;
    const simSec = endSim - startSim;
    const simRateRatio = wallSec > 0 ? simSec / wallSec : 0;
    const staleRatio = samples.length > 0 ? staleCount / samples.length : 0;

    return {
      gpuRenderer,
      headerTitle,
      headerChips,
      hasRadarCanvas: Boolean(radarCanvas),
      simRateRatio: Number(simRateRatio.toFixed(3)),
      staleRatio: Number(staleRatio.toFixed(3)),
      staleCount,
      totalSamples: samples.length,
      maxJump: Number(maxJump.toFixed(3)),
      startSim,
      endSim,
      wallSec: Number(wallSec.toFixed(3)),
      firstSample: samples[0],
      lastSample: samples[samples.length - 1],
    };
  });

  console.log('Live Motion Measurement:', JSON.stringify(liveData, null, 2));

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_terrain_flat_and_debris_wall.png') });
  console.log('Saved: 02_terrain_flat_and_debris_wall.png');

  await browser.close();

  // Combine baseline report data
  const report = {
    timestamp: new Date().toISOString(),
    gpu: liveData.gpuRenderer,
    terrain: {
      minHeight,
      maxHeight,
      relief,
      medianSlope,
      p95Slope,
    },
    debris: {
      total: debris.length,
      radialBins,
      pyramidCount,
      pyramidPercent: Number(((pyramidCount / debris.length) * 100).toFixed(1)),
    },
    motion: {
      simRateRatio: liveData.simRateRatio,
      staleRatio: liveData.staleRatio,
      staleCount: liveData.staleCount,
      totalSamples: liveData.totalSamples,
      maxJump: liveData.maxJump,
      wallSec: liveData.wallSec,
      startSimT: liveData.startSim,
      endSimT: liveData.endSim,
    },
    ui: {
      headerTitle: liveData.headerTitle,
      headerChips: liveData.headerChips,
      hasRadar: liveData.hasRadarCanvas,
    },
  };

  fs.writeFileSync('docs/iteration4_baseline_data.json', JSON.stringify(report, null, 2), 'utf8');
  console.log('Baseline report written to docs/iteration4_baseline_data.json');
}

run().catch((err) => {
  console.error('Measurement failed:', err);
  process.exit(1);
});
