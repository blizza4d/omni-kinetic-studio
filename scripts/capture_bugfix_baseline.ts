import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = 'C:\\Users\\Asus\\.gemini\\antigravity\\brain\\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\\screenshots\\bugfix_baseline';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const GOLDEN_SEEDS = [42, 101, 777, 2024, 9999];
const BUILD_STAMP_TEXT = 'iteration-5-dev (baseline: bugfix-baseline) • sha:21842619 (main) • production';

async function run() {
  console.log('=== Capturing Bugfix Baseline: Six Golden Views on Five Golden Seeds ===');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=d3d11',
    ],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  });

  const page = await browser.newPage();

  // 1. Initial page load to inspect GPU and general HUD state
  console.log('Connecting to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 3000));

  // Inspect GPU Renderer String & WebGL details
  const gpuInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'No canvas found' };
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { error: 'No WebGL context' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'Unknown',
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'Unknown',
      webgl2: Boolean(canvas.getContext('webgl2')),
    };
  });
  console.log('GPU Info from Browser Agent:', JSON.stringify(gpuInfo, null, 2));

  // Capture Main Overview View
  await page.evaluate((stampText) => {
    let watermark = document.getElementById('build-stamp-watermark');
    if (!watermark) {
      watermark = document.createElement('div');
      watermark.id = 'build-stamp-watermark';
      watermark.style.position = 'fixed';
      watermark.style.bottom = '8px';
      watermark.style.left = '16px';
      watermark.style.zIndex = '99999';
      watermark.style.fontFamily = 'Courier Prime, monospace';
      watermark.style.fontSize = '12px';
      watermark.style.color = 'rgba(253, 251, 247, 0.75)';
      watermark.style.background = 'rgba(31, 31, 31, 0.75)';
      watermark.style.padding = '4px 8px';
      watermark.style.borderRadius = '4px';
      watermark.style.border = '1px solid rgba(253, 251, 247, 0.12)';
      watermark.style.pointerEvents = 'none';
      document.body.appendChild(watermark);
    }
    watermark.textContent = `BUILD STAMP: ${stampText}`;
  }, BUILD_STAMP_TEXT);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00_baseline_overview.png') });
  console.log('Saved: 00_baseline_overview.png');

  // Loop through 5 Golden Seeds and capture the 6 Golden Views each
  for (const seed of GOLDEN_SEEDS) {
    console.log(`\n--- Capturing Golden Seed: ${seed} ---`);
    await page.goto(`http://localhost:3000/?seed=${seed}`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 2000));

    // Watermark updater
    const setStamp = async (viewLabel: string) => {
      await page.evaluate((stampText, s, vl) => {
        let watermark = document.getElementById('build-stamp-watermark');
        if (!watermark) {
          watermark = document.createElement('div');
          watermark.id = 'build-stamp-watermark';
          watermark.style.position = 'fixed';
          watermark.style.bottom = '8px';
          watermark.style.left = '16px';
          watermark.style.zIndex = '99999';
          watermark.style.fontFamily = 'Courier Prime, monospace';
          watermark.style.fontSize = '12px';
          watermark.style.color = 'rgba(253, 251, 247, 0.75)';
          watermark.style.background = 'rgba(31, 31, 31, 0.75)';
          watermark.style.padding = '4px 8px';
          watermark.style.borderRadius = '4px';
          watermark.style.border = '1px solid rgba(253, 251, 247, 0.12)';
          watermark.style.pointerEvents = 'none';
          document.body.appendChild(watermark);
        }
        watermark.textContent = `BUILD STAMP: ${stampText} • Seed: ${s} • View: ${vl}`;
      }, BUILD_STAMP_TEXT, seed, viewLabel);
    };

    // V1: Default Chase at t=0
    await page.keyboard.press('1');
    await new Promise((r) => setTimeout(r, 500));
    await setStamp('V1 Chase (t=0)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `seed_${seed}_V1_chase_t0.png`) });
    console.log(`Saved: seed_${seed}_V1_chase_t0.png`);

    // V2: Default Chase at t=12.5 s
    console.log('Waiting 12.5s for V2 Chase at t=12.5s...');
    await new Promise((r) => setTimeout(r, 12500));
    await setStamp('V2 Chase (t=12.5s)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `seed_${seed}_V2_chase_t12_5.png`) });
    console.log(`Saved: seed_${seed}_V2_chase_t12_5.png`);

    // V3: Top View ('2')
    await page.keyboard.press('2');
    await new Promise((r) => setTimeout(r, 800));
    await setStamp('V3 Top');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `seed_${seed}_V3_top.png`) });
    console.log(`Saved: seed_${seed}_V3_top.png`);

    // V4: Low-Angle toward horizon (switch to '1' chase and drag mouse down to pitch down)
    await page.keyboard.press('1');
    await new Promise((r) => setTimeout(r, 500));
    // Drag mouse upwards to lower camera pitch angle toward horizon
    await page.mouse.move(960, 540);
    await page.mouse.down();
    await page.mouse.move(960, 750, { steps: 10 });
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 800));
    await setStamp('V4 Low-angle Horizon');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `seed_${seed}_V4_low_angle.png`) });
    console.log(`Saved: seed_${seed}_V4_low_angle.png`);

    // V5: Side View ('3')
    await page.keyboard.press('3');
    await new Promise((r) => setTimeout(r, 800));
    await setStamp('V5 Side');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `seed_${seed}_V5_side.png`) });
    console.log(`Saved: seed_${seed}_V5_side.png`);

    // V6: Close-Up of Robot (1.5m)
    // Switch to '1' chase, and wheel zoom in
    await page.keyboard.press('1');
    await new Promise((r) => setTimeout(r, 500));
    // Scroll wheel forward to zoom into 1.5m
    for (let w = 0; w < 10; w++) {
      await page.mouse.wheel({ deltaY: -120 });
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 800));
    await setStamp('V6 Close-up (1.5m)');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `seed_${seed}_V6_close_up.png`) });
    console.log(`Saved: seed_${seed}_V6_close_up.png`);
  }

  // 3. Capture a 60-second recording sequence of default run (sample 6 frames across 60 seconds)
  console.log('\n--- Capturing 60-Second Run Progression Snapshots (Seed 42) ---');
  await page.goto('http://localhost:3000/?seed=42', { waitUntil: 'networkidle2' });
  await page.keyboard.press('1');
  const timestamps = [0, 10, 20, 30, 45, 60];
  for (let idx = 0; idx < timestamps.length; idx++) {
    const targetT = timestamps[idx];
    if (idx > 0) {
      const waitSec = timestamps[idx] - timestamps[idx - 1];
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }
    await page.evaluate((stampText, tSec) => {
      let watermark = document.getElementById('build-stamp-watermark');
      if (watermark) watermark.textContent = `BUILD STAMP: ${stampText} • Seed: 42 • Run t=${tSec}s`;
    }, BUILD_STAMP_TEXT, targetT);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `run_progress_t${targetT}s.png`) });
    console.log(`Saved: run_progress_t${targetT}s.png`);
  }

  await browser.close();
  console.log('=== Bugfix Baseline Visual Capture Complete ===');
}

run().catch((err) => {
  console.error('Failed to capture bugfix baseline:', err);
  process.exit(1);
});
