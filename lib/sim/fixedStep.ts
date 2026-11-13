/**
 * Fixed-Timestep Simulation Loop with Sub-Frame Alpha Interpolation
 * 
 * Decouples deterministic simulation ticks (e.g. 120 Hz) from variable display
 * refresh rates (60, 75, 90, 120, 144, 240 Hz).
 * Features:
 * - Deterministic fixed step
 * - Spiral-of-death backlog drop protection
 * - Sub-frame alpha calculation [0.0 .. 1.0)
 * - Time-scaling support for speed multipliers without altering physics step size
 */

export interface FixedStepOptions {
  step: number;     // Simulation delta in seconds (e.g. 1 / 120)
  maxSteps: number; // Maximum steps per frame to prevent spiral of death (e.g. 6)
  maxFrame: number; // Clamp for a single frame delta in seconds (e.g. 0.1)
}

export class FixedStepLoop {
  private accumulator = 0;
  public alpha = 0;
  private totalStepsExecuted = 0;

  constructor(
    private readonly opts: FixedStepOptions,
    private readonly stepFn: (dt: number) => void
  ) {}

  /**
   * Advance the fixed-timestep simulation by the given rendered frame delta.
   * @param frameDelta Frame delta time in seconds
   * @param timeScale Speed multiplier (e.g. 0.25x to 4.0x)
   * @returns Number of simulation steps executed in this tick
   */
  public advance(frameDelta: number, timeScale = 1.0): number {
    const safeDelta = Math.min(Math.max(frameDelta, 0), this.opts.maxFrame);
    const dt = safeDelta * Math.max(0, timeScale);
    this.accumulator += dt;

    let steps = 0;
    while (this.accumulator >= this.opts.step && steps < this.opts.maxSteps) {
      this.stepFn(this.opts.step);
      this.accumulator -= this.opts.step;
      steps++;
      this.totalStepsExecuted++;
    }

    if (steps === this.opts.maxSteps) {
      // Backlog saturation: drop excess accumulator to prevent spiral of death
      this.accumulator = Math.min(this.accumulator, this.opts.step);
    }

    // Alpha in [0.0, 1.0) for sub-frame interpolation
    this.alpha = Math.min(0.999999, Math.max(0.0, this.accumulator / this.opts.step));
    return steps;
  }

  public getAlpha(): number {
    return this.alpha;
  }

  public getTotalSteps(): number {
    return this.totalStepsExecuted;
  }

  public reset(): void {
    this.accumulator = 0;
    this.alpha = 0;
  }
}
