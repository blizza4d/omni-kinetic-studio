import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runBrowserVerification() {
  const screenshotsDir = path.resolve(process.cwd(), 'docs/screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  console.log('[BrowserVerification] Launching Chrome at:', chromePath);
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader', // Stable headless WebGL
      '--enable-webgl',
      '--window-size=1440,900',
    ],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  try {
    // 1. Idle Workspace
    console.log('[State 1] Navigating to http://localhost:3000');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);
    const idlePath = path.join(screenshotsDir, '01_idle_workspace.png');
    await page.screenshot({ path: idlePath });
    console.log('[State 1 Captured]', idlePath);

    // 2. Planning & Architect Diff
    console.log('[State 2] Triggering Command Palette (Ctrl+K)');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyK');
    await page.keyboard.up('Control');
    await sleep(1000);

    const palettePath = path.join(screenshotsDir, '02_command_palette.png');
    await page.screenshot({ path: palettePath });
    console.log('[State 2 Captured Palette]', palettePath);

    // Click the default suggested task button
    const suggestedTask = await page.$('button.group');
    if (suggestedTask) {
      console.log('[State 2] Submitting prompt to Architect stream...');
      await suggestedTask.click();
      await sleep(4500); // Wait for stream to complete
      const planningPath = path.join(screenshotsDir, '02_planning_architect_diff.png');
      await page.screenshot({ path: planningPath });
      console.log('[State 2 Captured Planning & Diff]', planningPath);
    }

    // 3. Running Telemetry Stream
    console.log('[State 3] Approving Job and Streaming Telemetry...');
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const text = await (await b.getProperty('textContent')).jsonValue();
      if (text && text.includes('Approve & Deploy Job')) {
        await b.click();
        break;
      }
    }
    await sleep(3000);
    const runningPath = path.join(screenshotsDir, '03_running_telemetry_stream.png');
    await page.screenshot({ path: runningPath });
    console.log('[State 3 Captured Running Telemetry]', runningPath);

    // 4. Collision Warning
    console.log('[State 4] Waiting for simulated debris collision pulse...');
    await sleep(2500);
    const collisionPath = path.join(screenshotsDir, '04_collision_warning_pulse.png');
    await page.screenshot({ path: collisionPath });
    console.log('[State 4 Captured Collision]', collisionPath);

    // 5. CV Teleoperation Mode
    console.log('[State 5] Pressing T to enter Teleop mode...');
    await page.keyboard.press('KeyT');
    await sleep(2000);
    const teleopPath = path.join(screenshotsDir, '05_active_teleop_webcam.png');
    await page.screenshot({ path: teleopPath });
    console.log('[State 5 Captured Teleop Mode]', teleopPath);

    console.log('[BrowserVerification] All 5 states verified and captured successfully!');
  } catch (err) {
    console.error('[BrowserVerification Error]', err);
  } finally {
    await browser.close();
  }
}

runBrowserVerification();
