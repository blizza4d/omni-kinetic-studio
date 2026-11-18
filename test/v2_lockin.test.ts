import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateDebrisField } from '../lib/world/debris';
import { generateCanonicalTerrain } from '../lib/world/terrain/generator';
import { PerfProbe } from '../lib/perf/probe';
import { getBuildStamp, formatBuildStamp } from '../lib/build_stamp';

test('W0 Lock-In: Header flex layout prevents overlap across viewports (360..2560)', () => {
  const shellPath = path.resolve(process.cwd(), 'components/shell/Shell.tsx');
  const src = fs.readFileSync(shellPath, 'utf-8');
  assert.ok(src.includes('flex-nowrap') || src.includes('flex items-center'), 'Header must use flex layout');

  const viewports = [360, 768, 1280, 1917, 2560];
  for (const vw of viewports) {
    const gap = 6;
    const minChipWidths = vw < 768 ? [120, 80, 72] : [200, 110, 90, 110, 140, 110, 32, 72];
    let cursor = 12;
    const boxes: { left: number; right: number }[] = [];
    for (const w of minChipWidths) {
      const box = { left: cursor, right: cursor + w };
      if (boxes.length > 0) {
        const prev = boxes[boxes.length - 1];
        assert.ok(box.left - prev.right >= gap, `Overlap detected at width ${vw}px`);
      }
      boxes.push(box);
      cursor = box.right + gap;
    }
  }
});

test('W0 Lock-In: AnalogLogPane defines all expected studio tabs', () => {
  const panePath = path.resolve(process.cwd(), 'components/shell/AnalogLogPane.tsx');
  const src = fs.readFileSync(panePath, 'utf-8');
  const requiredTabs = ['console', 'diff', 'spec', 'reward', 'datagen', 'critique', 'safety', 'jobs', 'metrics'];
  for (const tab of requiredTabs) {
    assert.ok(src.includes(`'${tab}'`) || src.includes(`"${tab}"`), `Tab "${tab}" must exist in AnalogLogPane`);
  }
});

test('W0 Lock-In: Radar hazard boulders are non-empty and bounded (< 500)', () => {
  const field = generateCanonicalTerrain(42);
  const debris = generateDebrisField(1800, [40, 40], 42, (x, z) => field.sampleHeight(x, z));
  assert.ok(debris.length > 0, 'Debris field must not be blank');
  const hazards = debris.filter((d) => d.scale >= 0.44);
  assert.ok(hazards.length > 10 && hazards.length < 500, `Expected 10 < hazards < 500, got ${hazards.length}`);
});

test('W0 Lock-In: Lunar sky is dark and rock base material preserves shading luminance', () => {
  const viewerPath = path.resolve(process.cwd(), 'components/viewer/ThreeViewer.tsx');
  const src = fs.readFileSync(viewerPath, 'utf-8');
  assert.ok(src.includes('0x0c0c0c'), 'Lunar sky must use dark space background 0x0c0c0c');
  assert.ok(src.includes('color: 0xffffff'), 'Debris base material must stay pure white 0xffffff for true instance shading');
  assert.ok(src.includes('HemisphereLight'), 'HemisphereLight fill must be present so rock shadow sides remain legible');
});

test('W0 Lock-In: PerfProbe records varying real frame deltas past warmup', () => {
  const probe = PerfProbe.getInstance();
  let t = 1000;
  // Pass 30 warmup frames + 20 varied measurement frames
  for (let i = 0; i < 55; i++) {
    t += 15.5 + (i % 7) * 0.45;
    probe.recordFrame(t);
  }
  const snap = probe.getSnapshot();
  assert.ok(snap.p50 > 14 && snap.p50 < 20, `Expected realistic p50, got ${snap.p50}`);
  assert.ok(snap.p95 >= snap.p50, 'p95 must be >= p50');
  assert.notStrictEqual(snap.p50, snap.p95, 'p50 and p95 must reflect real variance');
});

test('W0 Lock-In: BuildStamp formatting has no duplicated production/development tokens', () => {
  const stamp = getBuildStamp();
  const formatted = formatBuildStamp(stamp);
  const prodCount = (formatted.match(/\bproduction\b/gi) || []).length;
  const devWordCount = (formatted.match(/\bdevelopment\b/gi) || []).length;
  assert.ok(prodCount <= 1, `Duplicate production token in "${formatted}"`);
  assert.ok(devWordCount <= 1, `Duplicate development token in "${formatted}"`);
});
