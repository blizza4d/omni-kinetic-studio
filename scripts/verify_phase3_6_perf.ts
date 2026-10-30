import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = 'C:\\Users\\Asus\\.gemini\\antigravity\\brain\\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\\screenshots\\phase3_6';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('=== Starting Phase 3.6 Automated Verification & Benchmark ===');

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
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err: any) => {
    consoleErrors.push(`PageError: ${err.message}`);
  });

  // 1. Baseline Run on http://localhost:3000
  console.log('\n[1/5] Loading production app at http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 6000)); // allow simulation stream to initialize and fill ring buffer

  // Inspect Baseline Performance from window.__omnikinetic_perf_probe
  const baselineStats = await page.evaluate(() => {
    const probe = (window as any).__omnikinetic_perf_probe;
    const store = (window as any).__omnikinetic_telemetry_store;
    const snapshot = probe ? probe.getSnapshot() : null;
    const storeSnapshot = store ? store.getSnapshot() : null;

    // UI elements
    const fpsBadge = document.querySelector('[data-testid="fps-badge"]')?.textContent || '';
    const arenaChip = Array.from(document.querySelectorAll('span, div')).find((el) => el.textContent?.includes('ARENA'))?.textContent || '';
    const hotkeyHints = document.querySelector('div[class*="text-[10px]"]')?.textContent || '';

    return {
      snapshot,
      storeSnapshot,
      fpsBadge,
      arenaChip,
      hotkeyHints,
    };
  });

  console.log('Baseline Performance Stats:', JSON.stringify(baselineStats.snapshot, null, 2));
  console.log('Truthful FPS Badge Text:', baselineStats.fpsBadge);
  console.log('Arena Boundary Chip:', baselineStats.arenaChip);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_baseline_world_and_rim.png') });
  console.log('Saved: 01_baseline_world_and_rim.png');

  // 2. Test PerfPanel Expansion ('P' hotkey) & Diagnostics
  console.log('\n[2/5] Testing Hotkey P (Diagnostics Panel)...');
  await page.keyboard.press('p');
  await new Promise((r) => setTimeout(r, 1000));

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_perf_panel_open.png') });
  console.log('Saved: 02_perf_panel_open.png');

  // 3. Test Artificial Stall Injection (60ms) to verify truthfulness
  console.log('\n[3/5] Testing Stall Injection (60ms) for Truthful Badge Reactivity...');
  await page.evaluate(() => {
    const probe = (window as any).__omnikinetic_perf_probe;
    if (probe) probe.injectStall(60);
  });
  await new Promise((r) => setTimeout(r, 1200));

  const postStallStats = await page.evaluate(() => {
    const probe = (window as any).__omnikinetic_perf_probe;
    return {
      snapshot: probe ? probe.getSnapshot() : null,
      badge: document.querySelector('[data-testid="fps-badge"]')?.textContent || '',
    };
  });
  console.log('Post-Stall Stats (Long tasks observed):', postStallStats.snapshot?.longTasks, 'Badge:', postStallStats.badge);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_stall_injection_reaction.png') });
  console.log('Saved: 03_stall_injection_reaction.png');

  // Close PerfPanel with 'P'
  await page.keyboard.press('p');
  await new Promise((r) => setTimeout(r, 500));

  // 4. Test Quality Tier Hotkey ('Q')
  console.log('\n[4/5] Testing Quality Tier Toggle (Q hotkey)...');
  await page.keyboard.press('q'); // Ultra -> High
  await new Promise((r) => setTimeout(r, 500));
  await page.keyboard.press('q'); // High -> Medium
  await new Promise((r) => setTimeout(r, 500));
  const mediumBadge = await page.evaluate(() => {
    return document.querySelector('[data-testid="fps-badge"]')?.textContent || '';
  });
  console.log('Badge after Q cycles to Medium:', mediumBadge);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_medium_tier_active.png') });
  console.log('Saved: 04_medium_tier_active.png');

  // 5. A/B Toggle Bisect Runs
  console.log('\n[5/5] Running A/B Feature Bisect Matrix...');
  const bisectResults: Record<string, any> = {};

  const bisectConfigs = [
    { name: 'all_on', url: 'http://localhost:3000' },
    { name: 'shadows_off', url: 'http://localhost:3000?shadows=off' },
    { name: 'radar_off', url: 'http://localhost:3000?radar=off' },
    { name: 'glass_off', url: 'http://localhost:3000?glass=off' },
    { name: 'dpr_1', url: 'http://localhost:3000?dpr=1' },
    { name: 'debris_400', url: 'http://localhost:3000?debris=400' },
  ];

  for (const cfg of bisectConfigs) {
    console.log(`Bisect testing: ${cfg.name} (${cfg.url})...`);
    await page.goto(cfg.url, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 4000));

    const stats = await page.evaluate(() => {
      const probe = (window as any).__omnikinetic_perf_probe;
      return probe ? probe.getSnapshot() : null;
    });

    bisectResults[cfg.name] = stats;
  }

  await browser.close();

  // Write Results Summary to JSON
  const outputData = {
    timestamp: new Date().toISOString(),
    baseline: baselineStats.snapshot,
    store: baselineStats.storeSnapshot,
    postStall: postStallStats,
    bisect: bisectResults,
    consoleErrors,
  };

  fs.writeFileSync('docs/perf-report.json', JSON.stringify(outputData, null, 2), 'utf8');
  console.log('\nSuccessfully wrote docs/perf-report.json');

  return outputData;
}

run().catch((err) => {
  console.error('Phase 3.6 Benchmark failed:', err);
  process.exit(1);
});
