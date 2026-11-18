/**
 * Deterministic Run Recorder, Replay Player, and Ghost Track (Phase W6)
 *
 * Records `(seed, scenarioId, scenarioVersion, buildVersion, RLE CommandFrames)`
 * plus a deterministic FNV-1a final-state checksum. Because the simulation is a
 * fixed-timestep deterministic function of (seed, scenario, per-step commands),
 * replaying the command log reproduces the exact final state bit-for-bit.
 */

import { z } from 'zod';
import { CommandFrame, ControlSource, GaitMode, LocomotionCommand } from '../control/types';
import { GaitControllerSnapshot } from '../droid/gait/GaitController';

export const REPLAY_SCHEMA_VERSION = '2.0';

const LocomotionCommandSchema = z.object({
  vx: z.number().finite(),
  vy: z.number().finite(),
  yawRate: z.number().finite(),
  bodyHeight: z.number().min(0).max(1),
  gait: z.enum(['auto', 'walk', 'trot', 'bound', 'pronk']),
  hop: z.boolean(),
  hopCharge: z.number().min(0).max(1),
  stop: z.boolean(),
});

const RleRunSchema = z.object({
  startStep: z.number().int().min(0),
  count: z.number().int().min(1),
  source: z.enum(['policy', 'keyboard', 'gamepad', 'touch', 'pointer', 'cv', 'replay', 'script']),
  cmd: LocomotionCommandSchema,
});

export const ReplayFileSchema = z.object({
  schemaVersion: z.string(),
  seed: z.number().int(),
  gravity: z.number().positive(),
  scenarioId: z.string(),
  scenarioVersion: z.number().int().min(1),
  buildVersion: z.string(),
  missionId: z.string().nullable().optional(),
  totalSteps: z.number().int().min(0),
  finalChecksum: z.string(),
  runs: z.array(RleRunSchema),
  ghostSamples: z
    .array(
      z.object({
        step: z.number().int(),
        pos: z.tuple([z.number(), z.number(), z.number()]),
        quat: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      })
    )
    .optional(),
});

export type ReplayFile = z.infer<typeof ReplayFileSchema>;
export type RleCommandRun = z.infer<typeof RleRunSchema>;

export interface KeyframeSnapshot {
  step: number;
  gait: GaitControllerSnapshot;
  energyJoules: number;
  distanceMeters: number;
}

export interface GhostSample {
  step: number;
  pos: [number, number, number];
  quat: [number, number, number, number];
}

function quantize(v: number, scale = 10000): number {
  return Math.round(v * scale);
}

function commandsEqual(a: LocomotionCommand, b: LocomotionCommand): boolean {
  return (
    quantize(a.vx) === quantize(b.vx) &&
    quantize(a.vy) === quantize(b.vy) &&
    quantize(a.yawRate) === quantize(b.yawRate) &&
    quantize(a.bodyHeight, 1000) === quantize(b.bodyHeight, 1000) &&
    a.gait === b.gait &&
    a.hop === b.hop &&
    quantize(a.hopCharge, 1000) === quantize(b.hopCharge, 1000) &&
    a.stop === b.stop
  );
}

/**
 * Computes deterministic FNV-1a 32-bit hex checksum of final droid state.
 */
export function computeStateChecksum(
  step: number,
  pos: [number, number, number],
  quat: [number, number, number, number],
  joints: readonly { angle: number }[]
): string {
  let hash = 0x811c9dc5;
  const mix = (n: number) => {
    const q = Math.round(n * 10000);
    hash ^= q & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (q >> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (q >> 16) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  };
  mix(step);
  mix(pos[0]);
  mix(pos[1]);
  mix(pos[2]);
  mix(quat[0]);
  mix(quat[1]);
  mix(quat[2]);
  mix(quat[3]);
  for (let i = 0; i < joints.length; i++) {
    mix(joints[i].angle);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class DeterministicRecorder {
  private seed = 42;
  private gravity = 1.62;
  private scenarioId = 'lunar-crater-default';
  private scenarioVersion = 1;
  private buildVersion = 'v2.0.0';
  private missionId: string | null = null;

  private runs: RleCommandRun[] = [];
  private keyframes: KeyframeSnapshot[] = [];
  private ghostSamples: GhostSample[] = [];
  private totalSteps = 0;
  private finalChecksum = '00000000';
  private readonly maxRuns = 18000; // cap memory (~30 min)

  public start(meta: {
    seed: number;
    gravity: number;
    scenarioId?: string;
    scenarioVersion?: number;
    buildVersion?: string;
    missionId?: string | null;
  }): void {
    this.seed = meta.seed;
    this.gravity = meta.gravity;
    this.scenarioId = meta.scenarioId ?? 'lunar-crater-default';
    this.scenarioVersion = meta.scenarioVersion ?? 1;
    this.buildVersion = meta.buildVersion ?? 'v2.0.0';
    this.missionId = meta.missionId ?? null;
    this.runs = [];
    this.keyframes = [];
    this.ghostSamples = [];
    this.totalSteps = 0;
    this.finalChecksum = '00000000';
  }

  public recordStep(
    step: number,
    source: ControlSource,
    cmd: LocomotionCommand,
    pos?: [number, number, number],
    quat?: [number, number, number, number],
    joints?: readonly { angle: number }[]
  ): void {
    if (this.runs.length >= this.maxRuns) return;

    const last = this.runs[this.runs.length - 1];
    if (
      last &&
      last.source === source &&
      last.startStep + last.count === step &&
      commandsEqual(last.cmd, cmd) &&
      !cmd.hop // Never RLE-merge edge-triggered hops
    ) {
      last.count++;
    } else {
      this.runs.push({
        startStep: step,
        count: 1,
        source,
        cmd: {
          vx: cmd.vx,
          vy: cmd.vy,
          yawRate: cmd.yawRate,
          bodyHeight: cmd.bodyHeight,
          gait: cmd.gait,
          hop: cmd.hop,
          hopCharge: cmd.hopCharge,
          stop: cmd.stop,
        },
      });
    }

    this.totalSteps = Math.max(this.totalSteps, step + 1);

    // Sample ghost pose every 3 steps (20 Hz) for lightweight comparison overlays
    if (pos && quat && step % 3 === 0) {
      this.ghostSamples.push({
        step,
        pos: [Number(pos[0].toFixed(4)), Number(pos[1].toFixed(4)), Number(pos[2].toFixed(4))],
        quat: [
          Number(quat[0].toFixed(4)),
          Number(quat[1].toFixed(4)),
          Number(quat[2].toFixed(4)),
          Number(quat[3].toFixed(4)),
        ],
      });
    }

    if (pos && quat && joints) {
      this.finalChecksum = computeStateChecksum(step, pos, quat, joints);
    }
  }

  public recordKeyframe(snapshot: KeyframeSnapshot): void {
    // Store keyframe every 120 steps (2 seconds of sim time)
    if (this.keyframes.length > 0 && this.keyframes[this.keyframes.length - 1].step === snapshot.step) {
      return;
    }
    this.keyframes.push(snapshot);
    if (this.keyframes.length > 300) {
      this.keyframes.shift();
    }
  }

  public getNearestKeyframe(targetStep: number): KeyframeSnapshot | null {
    let best: KeyframeSnapshot | null = null;
    for (let i = 0; i < this.keyframes.length; i++) {
      if (this.keyframes[i].step <= targetStep) {
        best = this.keyframes[i];
      } else {
        break;
      }
    }
    return best;
  }

  /**
   * Truncate recording at `forkStep` when user clicks "Take over from here" during replay.
   */
  public forkAtStep(forkStep: number): void {
    const kept: RleCommandRun[] = [];
    for (const run of this.runs) {
      if (run.startStep >= forkStep) break;
      if (run.startStep + run.count <= forkStep) {
        kept.push({ ...run, cmd: { ...run.cmd } });
      } else {
        kept.push({
          ...run,
          count: Math.max(1, forkStep - run.startStep),
          cmd: { ...run.cmd },
        });
        break;
      }
    }
    this.runs = kept;
    this.keyframes = this.keyframes.filter((kf) => kf.step <= forkStep);
    this.ghostSamples = this.ghostSamples.filter((gs) => gs.step <= forkStep);
    this.totalSteps = forkStep;
  }

  public exportReplay(): ReplayFile {
    return {
      schemaVersion: REPLAY_SCHEMA_VERSION,
      seed: this.seed,
      gravity: this.gravity,
      scenarioId: this.scenarioId,
      scenarioVersion: this.scenarioVersion,
      buildVersion: this.buildVersion,
      missionId: this.missionId,
      totalSteps: this.totalSteps,
      finalChecksum: this.finalChecksum,
      runs: this.runs.map((r) => ({ ...r, cmd: { ...r.cmd } })),
      ghostSamples: this.ghostSamples.slice(),
    };
  }

  public getTotalSteps(): number {
    return this.totalSteps;
  }

  public getFinalChecksum(): string {
    return this.finalChecksum;
  }
}

export function validateReplayJson(rawText: string): {
  ok: boolean;
  replay?: ReplayFile;
  error?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: 'Malformed JSON file — unable to parse replay.' };
  }

  const res = ReplayFileSchema.safeParse(parsed);
  if (!res.success) {
    return {
      ok: false,
      error: `Invalid replay schema: ${res.error.issues[0]?.message || 'missing required fields'}.`,
    };
  }

  const major = parseInt(res.data.schemaVersion.split('.')[0] || '0', 10);
  if (major > 2) {
    return {
      ok: false,
      error: `Incompatible replay version (${res.data.schemaVersion}). Update required to play this recording.`,
    };
  }
  if (major < 2) {
    return {
      ok: false,
      error: `Legacy replay version (${res.data.schemaVersion}) is not compatible with v2 deterministic physics.`,
    };
  }

  return { ok: true, replay: res.data };
}

/**
 * Expands or queries an RLE-compressed ReplayFile by step index in O(log N) binary search.
 */
export class ReplayCursor {
  private readonly replay: ReplayFile;

  constructor(replay: ReplayFile) {
    this.replay = replay;
  }

  public getReplay(): ReplayFile {
    return this.replay;
  }

  public getCommandAtStep(step: number): CommandFrame | null {
    const runs = this.replay.runs;
    let lo = 0;
    let hi = runs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = runs[mid];
      if (step < r.startStep) {
        hi = mid - 1;
      } else if (step >= r.startStep + r.count) {
        lo = mid + 1;
      } else {
        return {
          step,
          source: r.source,
          cmd: r.cmd as LocomotionCommand,
        };
      }
    }
    return null;
  }

  public getGhostPoseAtStep(step: number): GhostSample | null {
    const samples = this.replay.ghostSamples;
    if (!samples || samples.length === 0) return null;
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].step < step) lo = mid + 1;
      else hi = mid;
    }
    return samples[lo] ?? samples[samples.length - 1];
  }
}

export function exportDatasetJsonl(replay: ReplayFile): string {
  const lines: string[] = [];
  for (const run of replay.runs) {
    for (let i = 0; i < run.count; i++) {
      const step = run.startStep + i;
      lines.push(
        JSON.stringify({
          step,
          t: Number((step / 60).toFixed(4)),
          source: run.source,
          ...run.cmd,
        })
      );
    }
  }
  return lines.join('\n');
}

export function exportDatasetCsv(replay: ReplayFile): string {
  const header = 'step,t,source,vx,vy,yawRate,bodyHeight,gait,hop,hopCharge,stop';
  const rows = [header];
  for (const run of replay.runs) {
    for (let i = 0; i < run.count; i++) {
      const step = run.startStep + i;
      const c = run.cmd;
      rows.push(
        `${step},${(step / 60).toFixed(4)},${run.source},${c.vx},${c.vy},${c.yawRate},${c.bodyHeight},${c.gait},${c.hop},${c.hopCharge},${c.stop}`
      );
    }
  }
  return rows.join('\n');
}
