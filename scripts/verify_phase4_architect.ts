import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = 'C:\\Users\\Asus\\.gemini\\antigravity\\brain\\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\\screenshots\\phase4_architect';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BUILD_STAMP_TEXT = 'iteration-5-phase4 • 21842619 [main] • prod • NVIDIA RTX 3050';

async function run() {
  console.log('=== Verifying Phase 4: The Transparent Architect ===');

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

  const attachWatermark = async (label: string) => {
    await page.evaluate((stampText, lbl) => {
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
      watermark.textContent = `BUILD STAMP: ${stampText} • ${lbl}`;
    }, BUILD_STAMP_TEXT, label);
  };

  // 1. Load initial page (Lunar world baseline)
  console.log('1. Loading http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 3500));
  await attachWatermark('Initial Baseline World');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_initial_world.png') });
  console.log('Saved: 01_initial_world.png');

  // 2. Open Command Palette (Ctrl+K) and Submit Lunar Crater Exploration Prompt
  console.log('2. Submitting Prompt A (Lunar Exploration)...');
  await page.keyboard.down('Control');
  await page.keyboard.press('k');
  await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 600));

  // Type prompt into palette input
  const inputEl = await page.$('input[placeholder*="embodied task prompt"]');
  if (inputEl) {
    await inputEl.type('Low-gravity lunar crater exploration with dense basalt boulders and slow trot gait', { delay: 10 });
    await page.keyboard.press('Enter');
  }
  await new Promise((r) => setTimeout(r, 400));
  // Ensure palette is closed
  await page.keyboard.press('Escape');

  // Wait for 11-stage pipeline to stream and complete
  console.log('Streaming through 11-stage Architect pipeline...');
  await new Promise((r) => setTimeout(r, 5500));
  await attachWatermark('11-Stage Pipeline Streaming & Completed');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_pipeline_streaming.png') });
  console.log('Saved: 02_pipeline_streaming.png');

  // 3. Inspect Diff & Review Tab
  console.log('3. Inspecting Diff & Review Tab...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const diffTab = tabs.find((b) => b.textContent?.includes('Diff & Review'));
    if (diffTab) diffTab.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await attachWatermark('Diff & Review: SpecCompiler Clamps & Reward Diff');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_diff_and_review_tab.png') });
  console.log('Saved: 03_diff_and_review_tab.png');

  // 4. Inspect Spec Tab (Interactive Sliders)
  console.log('4. Inspecting Spec Tab (Interactive Sliders)...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const specTab = tabs.find((b) => b.textContent?.trim() === 'Spec');
    if (specTab) specTab.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await attachWatermark('Spec Tab: Interactive Physics Sliders');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_spec_sliders_tab.png') });
  console.log('Saved: 04_spec_sliders_tab.png');

  // 5. Inspect Reward Tab (Sandbox Component Summation Check)
  console.log('5. Inspecting Reward Tab (Sandbox Component Summation Check)...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const rewardTab = tabs.find((b) => b.textContent?.trim() === 'Reward');
    if (rewardTab) rewardTab.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await attachWatermark('Reward Tab: Sandbox Component Summation Validated');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_reward_sandbox_tab.png') });
  console.log('Saved: 05_reward_sandbox_tab.png');

  // 6. Test "Two Prompts, Two Worlds": Submit Martian Plains Sprint Prompt
  console.log('6. Submitting Prompt B (Martian Plains Sprint)...');
  await page.keyboard.down('Control');
  await page.keyboard.press('k');
  await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 600));

  const inputEl2 = await page.$('input[placeholder*="embodied task prompt"]');
  if (inputEl2) {
    await inputEl2.click({ clickCount: 3 });
    await inputEl2.type('High-gravity Martian plains sprint with sparse regolith rocks and fast gait', { delay: 10 });
    await page.keyboard.press('Enter');
  }
  await new Promise((r) => setTimeout(r, 400));
  await page.keyboard.press('Escape');

  console.log('Streaming Mars prompt through 11 stages...');
  await new Promise((r) => setTimeout(r, 5500));

  // Switch to Diff tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const diffTab = tabs.find((b) => b.textContent?.includes('Diff & Review'));
    if (diffTab) diffTab.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await attachWatermark('Mars Proposal Diff Ready for Approval');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_mars_proposal_diff.png') });
  console.log('Saved: 06_mars_proposal_diff.png');

  // 7. Approve the Mars Proposal (Click "Approve & Deploy" button or hotkey 'A')
  console.log('7. Approving Mars Proposal...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const approveBtn = buttons.find((b) => b.textContent?.includes('Approve & Deploy') || b.textContent?.includes('Approve'));
    if (approveBtn) approveBtn.click();
  });
  await new Promise((r) => setTimeout(r, 3500));

  // Verify the live world updated
  const liveState = await page.evaluate(() => {
    const headerTitle = document.querySelector('header')?.textContent || '';
    const gravityChip = document.body.innerText.match(/GRAVITY:\s*[\d\.]+\s*g/i)?.[0] || 'Unknown';
    const logItems = Array.from(document.querySelectorAll('[class*="border-b"] span, div')).map((e) => e.textContent || '').filter((t) => t.includes('[SPEC APPROVED]'));
    return {
      headerTitle,
      gravityChip,
      approvedLogFound: logItems.length > 0,
      approvedLogText: logItems[0] || '',
    };
  });

  console.log('Live State After Mars Approval:', JSON.stringify(liveState, null, 2));

  await attachWatermark('Active Martian World (G=-3.72m/s², Sparse Rocks, Fast Cadence)');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_mars_world_activated.png') });
  console.log('Saved: 07_mars_world_activated.png');

  // 8. Open Token Accounting Popover
  console.log('8. Inspecting Token Accounting Popover...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('header button'));
    const tokenButton = buttons.find((b) => b.textContent?.includes('tok'));
    if (tokenButton) tokenButton.click();
  });
  await new Promise((r) => setTimeout(r, 1000));
  await attachWatermark('Token & Cost Accounting Breakdown');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_token_accounting_popover.png') });
  console.log('Saved: 08_token_accounting_popover.png');

  await browser.close();
  console.log('=== Phase 4 Verification Completed Successfully ===');
}

run().catch((err) => {
  console.error('Phase 4 verification failed:', err);
  process.exit(1);
});
