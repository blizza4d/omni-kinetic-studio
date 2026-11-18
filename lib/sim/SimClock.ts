/**
 * Authoritative Simulation Clock & Single Progress Source (R-01 & R-08)
 *
 * Owns elapsed time `t`, fixed timestep `fixedDt` (1/60s), episode length,
 * speed multiplier (0.25x..4x), paused state, end-of-episode behavior, and
 * canonical progress formatting.
 *
 * Every UI surface (Console, Bottom Playback Bar, HUD, Results Card) MUST
 * read elapsed time and progress from this single source of truth.
 */

export type EpisodeEndBehavior = 'stop' | 'loop' | 'auto-restart';

export interface SimClockSnapshot {
  step: number;
  elapsed: number;
  episodeLength: number;
  progress: number;
  progressPct: number;
  progressText: string;
  timeDisplay: string;
  speedMultiplier: number;
  paused: boolean;
  ended: boolean;
  endBehavior: EpisodeEndBehavior;
  episodeNumber: number;
}

export function clampProgress(elapsed: number, episodeLength: number): number {
  if (!Number.isFinite(elapsed) || !Number.isFinite(episodeLength) || episodeLength <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, elapsed / episodeLength));
}

export function formatProgressPct(progress: number): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return `${Math.round(clamped * 100)}%`;
}

export function formatClockDisplay(elapsed: number, episodeLength: number): string {
  const safeT = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  const safeLen = Math.max(0.1, Number.isFinite(episodeLength) ? episodeLength : 60);
  const pct = formatProgressPct(clampProgress(safeT, safeLen));
  return `t=${safeT.toFixed(1)}s / ${safeLen.toFixed(1)}s (${pct})`;
}

export class SimClock {
  public readonly fixedDt: number;
  private step = 0;
  private elapsed = 0;
  private accumulator = 0;
  private episodeLength: number;
  private speedMultiplier = 1.0;
  private paused = false;
  private ended = false;
  private endBehavior: EpisodeEndBehavior = 'stop';
  private episodeNumber = 1;
  private readonly maxSubSteps = 5;

  constructor(options?: {
    fixedDt?: number;
    episodeLength?: number;
    endBehavior?: EpisodeEndBehavior;
  }) {
    this.fixedDt = options?.fixedDt ?? 1 / 60;
    this.episodeLength = Math.max(5.0, options?.episodeLength ?? 60.0);
    this.endBehavior = options?.endBehavior ?? 'stop';
  }

  public getStep(): number {
    return this.step;
  }

  public getElapsed(): number {
    return this.elapsed;
  }

  public getEpisodeLength(): number {
    return this.episodeLength;
  }

  public setEpisodeLength(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 5) return;
    this.episodeLength = Math.min(600, seconds);
    if (this.elapsed >= this.episodeLength && this.endBehavior === 'stop') {
      this.ended = true;
    } else {
      this.ended = false;
    }
  }

  public getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  public setSpeedMultiplier(speed: number): void {
    if (!Number.isFinite(speed)) return;
    this.speedMultiplier = Math.max(0.25, Math.min(4.0, speed));
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public togglePaused(): boolean {
    this.paused = !this.paused;
    return this.paused;
  }

  public isEnded(): boolean {
    return this.ended;
  }

  public getEndBehavior(): EpisodeEndBehavior {
    return this.endBehavior;
  }

  public setEndBehavior(behavior: EpisodeEndBehavior): void {
    this.endBehavior = behavior;
  }

  public getEpisodeNumber(): number {
    return this.episodeNumber;
  }

  public getProgress(): number {
    return clampProgress(this.elapsed, this.episodeLength);
  }

  public getAlpha(): number {
    return Math.max(0, Math.min(1, this.accumulator / this.fixedDt));
  }

  public reset(incrementEpisode = false): void {
    this.step = 0;
    this.elapsed = 0;
    this.accumulator = 0;
    this.ended = false;
    if (incrementEpisode) {
      this.episodeNumber++;
    }
  }

  public seekToStep(targetStep: number): void {
    const safeStep = Math.max(0, Math.floor(targetStep));
    this.step = safeStep;
    this.elapsed = safeStep * this.fixedDt;
    this.accumulator = 0;
    this.ended = this.elapsed >= this.episodeLength && this.endBehavior === 'stop';
  }

  /**
   * Advance wall-clock accumulator and execute `onStep` for each fixed step.
   * Returns number of steps executed and interpolation alpha in [0, 1].
   */
  public tick(
    frameDtSec: number,
    onStep: (stepIndex: number, dt: number) => void,
    onEpisodeEnd?: (behavior: EpisodeEndBehavior) => void
  ): { stepsExecuted: number; alpha: number; ended: boolean } {
    if (this.paused || this.ended) {
      return { stepsExecuted: 0, alpha: this.getAlpha(), ended: this.ended };
    }

    const clampedDt = Math.max(0, Math.min(0.1, Number.isFinite(frameDtSec) ? frameDtSec : 0));
    this.accumulator += clampedDt * this.speedMultiplier;

    let stepsExecuted = 0;
    while (this.accumulator >= this.fixedDt && stepsExecuted < this.maxSubSteps) {
      this.accumulator -= this.fixedDt;
      onStep(this.step, this.fixedDt);
      this.step++;
      this.elapsed = this.step * this.fixedDt;
      stepsExecuted++;

      if (this.elapsed >= this.episodeLength) {
        if (this.endBehavior === 'stop') {
          this.elapsed = this.episodeLength;
          this.ended = true;
          this.accumulator = 0;
          if (onEpisodeEnd) onEpisodeEnd('stop');
          break;
        } else if (this.endBehavior === 'loop') {
          this.step = 0;
          this.elapsed = 0;
          if (onEpisodeEnd) onEpisodeEnd('loop');
        } else if (this.endBehavior === 'auto-restart') {
          this.step = 0;
          this.elapsed = 0;
          this.episodeNumber++;
          if (onEpisodeEnd) onEpisodeEnd('auto-restart');
        }
      }
    }

    // Spiral-of-death cap
    if (this.accumulator > this.fixedDt * this.maxSubSteps) {
      this.accumulator = 0;
    }

    return { stepsExecuted, alpha: this.getAlpha(), ended: this.ended };
  }

  public snapshot(): SimClockSnapshot {
    const progress = this.getProgress();
    return {
      step: this.step,
      elapsed: this.elapsed,
      episodeLength: this.episodeLength,
      progress,
      progressPct: Math.round(progress * 100),
      progressText: formatProgressPct(progress),
      timeDisplay: formatClockDisplay(this.elapsed, this.episodeLength),
      speedMultiplier: this.speedMultiplier,
      paused: this.paused,
      ended: this.ended,
      endBehavior: this.endBehavior,
      episodeNumber: this.episodeNumber,
    };
  }
}
