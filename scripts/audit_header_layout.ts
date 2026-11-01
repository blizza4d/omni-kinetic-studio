import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const WIDTHS = [1280, 1440, 1920];

interface HeaderLayoutAudit {
  viewportWidth: number;
  headerHeight: number;
  chipCount: number;
  overlaps: { chipA: string; chipB: string; gapPx: number }[];
  truncatedTitle: string;
  hasTitleTooltip: boolean;
}

async function auditHeader() {
  console.log('=== Auditing Header Layout at 1280, 1440, 1920 px ===');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const audits: HeaderLayoutAudit[] = [];

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 900 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));

    const result = await page.evaluate((w) => {
      const header = document.querySelector('header');
      if (!header) return null;

      const headerRect = header.getBoundingClientRect();
      const chips = Array.from(header.querySelectorAll('button, div[class*="rounded"], span[class*="rounded"]'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          // Filter to interactive or visually boxed chips with non-zero dimensions
          return r.width > 20 && r.height > 15;
        });

      const chipData = chips.map((c) => {
        const r = c.getBoundingClientRect();
        return {
          text: (c.textContent || '').trim().replace(/\s+/g, ' '),
          rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
        };
      });

      // Find any overlapping pairs or gap < 4px between horizontally adjacent chips
      const overlaps: { chipA: string; chipB: string; gapPx: number }[] = [];
      for (let i = 0; i < chipData.length; i++) {
        for (let j = i + 1; j < chipData.length; j++) {
          const a = chipData[i].rect;
          const b = chipData[j].rect;
          // Check if vertically aligned
          if (Math.abs(a.top - b.top) < 20) {
            // Horizontal separation
            const gap = Math.max(a.left - b.right, b.left - a.right);
            const isIntersecting = !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
            if (isIntersecting || gap < 4.0) {
              overlaps.push({
                chipA: chipData[i].text.slice(0, 30),
                chipB: chipData[j].text.slice(0, 30),
                gapPx: isIntersecting ? -1 : Number(gap.toFixed(1)),
              });
            }
          }
        }
      }

      const titleEl = header.querySelector('span[class*="truncate"]');
      const truncatedTitle = titleEl?.textContent || '';
      const hasTitleTooltip = Boolean(titleEl?.getAttribute('title'));

      return {
        viewportWidth: w,
        headerHeight: Number(headerRect.height.toFixed(1)),
        chipCount: chipData.length,
        overlaps,
        truncatedTitle,
        hasTitleTooltip,
      };
    }, width);

    if (result) {
      audits.push(result);
      console.log(`[Width ${width}px] Height: ${result.headerHeight}px, Chips: ${result.chipCount}, Overlaps/Touches: ${result.overlaps.length}, Title: "${result.truncatedTitle}", HasTooltip: ${result.hasTitleTooltip}`);
      for (const ov of result.overlaps) {
        console.log(`   - OVERLAP/CROWDING: "${ov.chipA}" vs "${ov.chipB}" (gap: ${ov.gapPx}px)`);
      }
    }
  }

  await browser.close();
  const outPath = path.resolve(process.cwd(), 'docs/header-layout-baseline.json');
  fs.writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), audits }, null, 2));
  console.log(`Saved header audit to ${outPath}`);
}

auditHeader().catch(console.error);
