import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

async function auditBrowser() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  const consoleLogs: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    } else {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', (err: any) => {
    consoleErrors.push(`PageError: ${err.message}`);
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));

  // Inspect computed styles
  const styles = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const charcoal = rootStyle.getPropertyValue('--charcoal').trim();
    const charcoalDeep = rootStyle.getPropertyValue('--charcoal-deep').trim();
    const fpsElem = document.querySelector('span[class*="FPS"], div[class*="analog-panel"] span');
    const headerTitle = document.querySelector('h1')?.textContent || '';
    const modeBadge = document.querySelector('button[class*="rounded border"] span')?.textContent || '';
    const logItems = Array.from(document.querySelectorAll('aside div')).map((d) => d.textContent?.trim()).filter(Boolean);

    return {
      charcoal,
      charcoalDeep,
      bodyBg: bodyStyle.backgroundColor,
      headerTitle,
      modeBadge,
      fpsText: fpsElem?.textContent || '',
      logSample: logItems.slice(0, 10),
    };
  });

  // Capture fresh baseline screenshot
  const baselineDir = path.resolve(process.cwd(), 'docs/baseline');
  fs.mkdirSync(baselineDir, { recursive: true });
  await page.screenshot({ path: path.join(baselineDir, 'baseline_audit.png') });

  console.log('AUDIT RESULT:', JSON.stringify({ styles, consoleErrors, consoleLogsCount: consoleLogs.length }, null, 2));

  await browser.close();
}

auditBrowser().catch(console.error);
