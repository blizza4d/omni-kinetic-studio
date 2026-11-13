/**
 * One Euro Adaptive Low-Pass Filter
 * 
 * Dynamically adjusts cutoff frequency based on signal derivative:
 * High smoothing at low speeds (eliminates tremor) with low lag during fast motion.
 */

export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;

  constructor(
    private minCutoff = 1.0, // Minimum cutoff frequency in Hz
    private beta = 0.02,     // Speed coefficient
    private dCutoff = 1.0    // Derivative cutoff in Hz
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / Math.max(1e-4, dt));
  }

  public filter(x: number, dt: number): number {
    if (this.xPrev === null || dt <= 0) {
      this.xPrev = x;
      return x;
    }

    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    this.dxPrev = this.dxPrev + aD * (dx - this.dxPrev);

    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const a = this.alpha(cutoff, dt);
    this.xPrev = this.xPrev + a * (x - this.xPrev);
    return this.xPrev;
  }

  public setParameters(minCutoff: number, beta: number, dCutoff = 1.0): void {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  public reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
  }
}
