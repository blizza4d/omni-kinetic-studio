import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = 'C:\\Users\\Asus\\.gemini\\antigravity\\brain\\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\\screenshots\\iteration5_baseline';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const GOLDEN_SEEDS = [42, 101, 777, 2024, 9999];
const BUILD_STAMP_TEXT = 'iteration-5-dev • 21842619 [main] • prod • NVIDIA RTX 3050';

async function run() {
  console.log('=== Capturing Iteration 5 Golden Seed Baselines & Visual Audit ===');

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

  // 1. First, navigate to main production page and capture baseline
  console.log('Loading http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 4000));

  // Add Build Stamp watermark banner to page for truthful screenshot provenance
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

  // Capture full viewport
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_iteration5_baseline_main.png') });
  console.log('Saved: 01_iteration5_baseline_main.png');

  // 2. Perform Detailed Scene & WebGL Audit
  const sceneAudit = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    let gpu = 'Unknown';
    if (canvas) {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      }
    }

    // Inspect header elements
    const headerEl = document.querySelector('header');
    const headerTitle = headerEl?.querySelector('h1')?.textContent || '';
    const headerHeight = headerEl?.getBoundingClientRect().height || 0;
    const isSingleRow = headerHeight < 55; // Multi-row wraps > 60px

    const chips = Array.from(headerEl?.querySelectorAll('button, span') || []).map((el) => el.textContent?.trim()).filter(Boolean);

    // Perf Badge Check
    const perfText = document.body.innerText.match(/\d+\.\d+ms p50 \/ \d+\.\d+ms p95/)?.[0] || 'Not found';
    const warningBadgeEl = document.querySelector('header [class*="text-brick"]');
    const warningBadgeText = warningBadgeEl?.textContent?.trim() || '';

    // Radar Check
    const radarCanvas = document.querySelector('canvas[width="130"]');
    const radarParent = radarCanvas?.closest('div');
    const radarText = radarParent?.textContent || '';

    // Log Banner Check
    const logBanner = document.querySelector('[class*="border-b"] [class*="font-mono"]')?.textContent || '';

    return {
      gpu,
      headerTitle,
      headerHeight,
      isSingleRow,
      chips,
      perfText,
      warningBadgeText,
      hasRadar: Boolean(radarCanvas),
      radarText,
      logBanner,
    };
  });

  console.log('Scene Audit Data:', JSON.stringify(sceneAudit, null, 2));

  // 3. Golden Seeds Capture across fixed cameras
  for (const seed of GOLDEN_SEEDS) {
    console.log(`\nCapturing Golden Seed: ${seed}...`);
    // Navigate with seed parameter
    await page.goto(`http://localhost:3000/?seed=${seed}`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 2500));

    // Ensure watermark is present
    await page.evaluate((stampText, s) => {
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
      watermark.textContent = `BUILD STAMP: ${stampText} • Seed: ${s}`;
    }, BUILD_STAMP_TEXT, seed);

    // Chase view
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `seed_${seed}_chase.png`) });
    console.log(`Saved: seed_${seed}_chase.png`);

    // Top view (press hotkey '2')
    await page.keyboard.press('2');
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `seed_${seed}_top.png`) });
    console.log(`Saved: seed_${seed}_top.png`);

    // Side view (press hotkey '3')
    await page.keyboard.press('3');
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `seed_${seed}_side.png`) });
    console.log(`Saved: seed_${seed}_side.png`);

    // Switch back to Chase ('1')
    await page.keyboard.press('1');
    await new Promise((r) => setTimeout(r, 300));
  }

  // 4. Save audit summary JSON
  const baselineAuditReport = {
    timestamp: new Date().toISOString(),
    buildStamp: BUILD_STAMP_TEXT,
    gpu: sceneAudit.gpu,
    audit: sceneAudit,
    seeds: GOLDEN_SEEDS,
  };

  fs.writeFileSync('docs/iteration5_baseline_audit.json', JSON.stringify(baselineAuditReport, null, 2), 'utf8');
  console.log('\nWrote audit summary to docs/iteration5_baseline_audit.json');

  await browser.close();
  console.log('=== Golden Seed Baseline Capture Complete ===');
}

run().catch((err) => {
  console.error('Failed to capture baseline:', err);
  process.exit(1);
});
