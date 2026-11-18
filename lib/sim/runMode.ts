/**
 * Authoritative Run-Mode Model (R-02)
 *
 * Single source of truth for run-mode terminology across header chip, console logs,
 * job cards, command palette, run summary, and API status payloads.
 *
 * Local simulation is NEVER called "streaming" or "demo".
 * "Demo" appears ONLY for `demo-fixtures`.
 */

export type RunMode = 'local-simulation' | 'cloud-stream' | 'demo-fixtures';

export interface RunModeDescriptor {
  mode: RunMode;
  badgeLabel: string;
  shortLabel: string;
  consolePrefix: string;
  tooltip: string;
  sourceLabels: string[];
}

export function normalizeRunMode(raw?: string | null): RunMode {
  if (raw === 'cloud-stream' || raw === 'cloud_nebius') return 'cloud-stream';
  if (raw === 'demo-fixtures' || raw === 'fixtures') return 'demo-fixtures';
  return 'local-simulation';
}

export function describeRunMode(mode: RunMode): RunModeDescriptor {
  switch (mode) {
    case 'cloud-stream':
      return {
        mode: 'cloud-stream',
        badgeLabel: 'CLOUD STREAM',
        shortLabel: 'CLOUD: L40S',
        consolePrefix: 'Cloud physics stream (Nebius L40S)',
        tooltip: 'Streams authoritative GPU simulation telemetry from Nebius Serverless Jobs.',
        sourceLabels: ['nebius_serverless_jobs', 'nvidia_l40s_gpu', 'cloud_stream'],
      };
    case 'demo-fixtures':
      return {
        mode: 'demo-fixtures',
        badgeLabel: 'DEMO FIXTURES',
        shortLabel: 'DEMO: FIXTURES',
        consolePrefix: 'Demo fixture playback (recorded dataset)',
        tooltip: 'Plays back bundled pre-recorded fixture frames without live physics stepping.',
        sourceLabels: ['bundled_fixture_jsonl', 'demo_playback'],
      };
    case 'local-simulation':
    default:
      return {
        mode: 'local-simulation',
        badgeLabel: 'LOCAL SIMULATION',
        shortLabel: 'LOCAL ENGINE',
        consolePrefix: 'Local fixed-step simulation',
        tooltip: 'Runs deterministic 60 Hz fixed-timestep simulation locally in your browser with <16ms control latency.',
        sourceLabels: ['deterministic_fixed_step', 'canonical_terrain_field', 'local_simulation'],
      };
  }
}

export function formatRunStatusMessage(mode: RunMode, elapsedSec: number): string {
  const desc = describeRunMode(mode);
  return `${desc.consolePrefix} · t=${elapsedSec.toFixed(1)}s`;
}
