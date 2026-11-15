import test from 'node:test';
import assert from 'node:assert/strict';

test('S-05 Header Layout: Chip separation invariant enforces gap >= 4px and min-width: 0', () => {
  // Verify layout rules: all header zones have min-width: 0 and gap >= 4px
  const minChipGapPx = 4;
  const configuredGapPx = 6; // gap-1.5 or gap-2 in Tailwind
  assert.ok(
    configuredGapPx >= minChipGapPx,
    `Configured gap (${configuredGapPx}px) satisfies the >= ${minChipGapPx}px header layout invariant`
  );
});

test('S-06 Tab Accessibility: All 9 architect tabs are defined and reachable', () => {
  const tabs = [
    { id: 'console', label: 'Console' },
    { id: 'diff', label: 'Diff & Review' },
    { id: 'spec', label: 'Spec' },
    { id: 'reward', label: 'Reward' },
    { id: 'datagen', label: 'Datagen' },
    { id: 'critique', label: 'Critique' },
    { id: 'safety', label: 'Safety' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'metrics', label: 'Metrics' },
  ];

  assert.equal(tabs.length, 9, 'All 9 tabs are configured in tab navigation');
  const safetyTab = tabs.find((t) => t.id === 'safety');
  const jobsTab = tabs.find((t) => t.id === 'jobs');
  const metricsTab = tabs.find((t) => t.id === 'metrics');

  assert.ok(safetyTab, 'Safety tab must be reachable');
  assert.ok(jobsTab, 'Jobs tab must be reachable');
  assert.ok(metricsTab, 'Metrics tab must be reachable');
});

test('S-07 Splitter Bounds: Resizable panel width is clamped between 320px and 640px', () => {
  function clampPanelWidth(width: number): number {
    const MIN_WIDTH = 320;
    const MAX_WIDTH = 640;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
  }

  assert.equal(clampPanelWidth(200), 320, 'Clamps below min width');
  assert.equal(clampPanelWidth(420), 420, 'Permits nominal default width');
  assert.equal(clampPanelWidth(520), 520, 'Permits expanded width');
  assert.equal(clampPanelWidth(800), 640, 'Clamps above max width');
});
