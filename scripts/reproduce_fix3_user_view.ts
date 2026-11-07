import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = 'C:\\Users\\Asus\\.gemini\\antigravity\\brain\\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\\screenshots\\fix3_reconciliation';

async function run() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
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
  });

  const page = await browser.newPage();

  // 1. Exact user viewport: 1917x881 at t=36.0s (Episode 3)
  console.log('Navigating to http://localhost:3000 at 1917x881...');
  await page.setViewport({ width: 1917, height: 881, deviceScaleFactor: 1 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  // Read WebGL GPU string
  const gpuInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'No canvas' };
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { error: 'No WebGL context' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'Unknown',
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'Unknown',
      webgl2: Boolean(canvas.getContext('webgl2')),
    };
  });
  console.log('GPU Info:', JSON.stringify(gpuInfo, null, 2));

  // Advance simulation to t=36.0s
  console.log('Advancing simulation to t=36.0s (waiting 36s of realtime telemetry)...');
  await new Promise((r) => setTimeout(r, 36000));

  // Capture reproduction at 1917x881
  const path1917 = path.join(OUT_DIR, 'reproduction_1917x881_t36s.png');
  await page.screenshot({ path: path1917 });
  console.log('Saved:', path1917);

  // Read DOM and viewer diagnostic values at t=36s
  const diagnostics = await page.evaluate(() => {
    const header = document.querySelector('header');
    const headerText = header ? header.textContent : '';
    const chips = Array.from(document.querySelectorAll('header button, header div, header span'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { text: el.textContent?.trim(), left: r.left, top: r.top, width: r.width, height: r.height };
      })
      .filter((c) => c.width > 20 && c.height > 15);

    const logEl = document.querySelector('[data-testid="console-log"]') || document.querySelector('.font-mono.text-xs');
    const logText = logEl ? logEl.textContent : '';

    return {
      headerText,
      chips: chips.slice(0, 15),
      logText,
    };
  });
  console.log('Diagnostics at t=36s:', JSON.stringify(diagnostics, null, 2));

  // 2. Viewport 1920x1080
  console.log('Capturing at 1920x1080...');
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, 'reproduction_1920x1080.png') });

  // 3. Viewport 1440x900
  console.log('Capturing at 1440x900...');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, 'reproduction_1440x900.png') });

  // 4. Viewport 1280x720
  console.log('Capturing at 1280x720...');
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, 'reproduction_1280x720.png') });

  await browser.close();
  console.log('=== All reproductions captured ===');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
