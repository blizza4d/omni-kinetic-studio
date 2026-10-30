import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function verifyPhase4() {
  const outputDir = path.resolve(process.cwd(), 'docs/screenshots/phase4');
  const artifactDir = 'C:\\Users\\Asus\\.gemini\\antigravity\\brain\\b4635c3d-edaf-4d6d-a6c9-488ec4ec977a\\screenshots\\phase4';
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  console.log('[Phase 4 Verification] Launching Chrome...');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--window-size=1440,900',
    ],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const saveShot = async (name: string) => {
    const p1 = path.join(outputDir, name);
    const p2 = path.join(artifactDir, name);
    await page.screenshot({ path: p1 as `${string}.png` });
    fs.copyFileSync(p1, p2);
    console.log(`[Captured] ${name}`);
  };

  try {
    console.log('[Step 1] Loading app at http://localhost:3000');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    // Step 2: Open Command Palette
    console.log('[Step 2] Triggering task prompt...');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyK');
    await page.keyboard.up('Control');
    await sleep(600);

    // Type prompt and submit
    await page.keyboard.type('Quadruped low-gravity crater traversal', { delay: 20 });
    await sleep(400);
    await page.keyboard.press('Enter');

    // Wait for stage rail to appear
    await sleep(1200);
    console.log('[Step 3] Stage Rail active during synthesis');
    await saveShot('01_stage_rail_active.png');

    // Wait for the full 7-stage chain to complete (all 7 stages finish in ~3-4 seconds)
    console.log('[Step 4] Awaiting complete 7-stage pipeline output...');
    await page.waitForFunction(
      () => {
        const bodyText = document.body.innerText;
        return bodyText.includes('reward.py') && bodyText.includes('Approve & Deploy');
      },
      { timeout: 15000 }
    );
    await sleep(1500);

    // Capture 02: Code Diff & Review tab with syntax-highlighted code
    console.log('[Step 5] Capturing Code Diff & Review tab');
    await saveShot('02_diff_and_review.png');

    // Switch to Critique Tab
    console.log('[Step 6] Switching to Critique tab...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const critiqueBtn = buttons.find((b) => b.innerText.trim().toLowerCase() === 'critique');
      if (critiqueBtn) critiqueBtn.click();
    });
    await sleep(600);
    await saveShot('03_critique_physics_audit.png');

    // Switch to Safety Tab
    console.log('[Step 7] Switching to Safety tab...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const safetyBtn = buttons.find((b) => b.innerText.trim().toLowerCase() === 'safety');
      if (safetyBtn) safetyBtn.click();
    });
    await sleep(600);
    await saveShot('04_ast_safety_gate_6checks.png');

    // Open Token Spend Popover
    console.log('[Step 8] Opening Token & Cost Accounting Popover...');
    await page.evaluate(() => {
      const tokenButton = document.querySelector('header button[title*="token"]');
      if (tokenButton) (tokenButton as HTMLButtonElement).click();
    });
    await sleep(700);
    await saveShot('05_token_spend_popover.png');

    // Verify Safety Checks content
    const safetyContent = await page.evaluate(() => {
      return document.body.innerText;
    });

    const hasFileSizeCheck = safetyContent.includes('File Size Limit');
    const hasSyntaxCheck = safetyContent.includes('Python Syntax');
    const hasWhitelistCheck = safetyContent.includes('Scientific Import Whitelist');
    const hasSandboxCheck = safetyContent.includes('Forbidden Primitives');
    const hasLoopCheck = safetyContent.includes('Loop Termination');

    console.log('[Verification Checklist]');
    console.log(' - File Size Check present:', hasFileSizeCheck);
    console.log(' - Syntax Check present:', hasSyntaxCheck);
    console.log(' - Whitelist Check present:', hasWhitelistCheck);
    console.log(' - Sandbox Check present:', hasSandboxCheck);
    console.log(' - Loop Check present:', hasLoopCheck);

    if (consoleErrors.length > 0) {
      console.warn('[Console Errors Detected]:', consoleErrors);
    } else {
      console.log('[Phase 4 Verification Succeeded] 0 console errors.');
    }
  } finally {
    await browser.close();
  }
}

verifyPhase4().catch((err) => {
  console.error('[Verification Failed]:', err);
  process.exit(1);
});
