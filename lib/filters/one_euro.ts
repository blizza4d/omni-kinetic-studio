/**
 * One Euro Filter for adaptive low-latency jitter reduction.
 * Casiez, G., Roussel, N. and Vogel, D. (2012).
 * Fast movements -> higher cutoff (low lag). Slow movements -> lower cutoff (high smoothing).
 */

class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  constructor(private alpha: number = 0.5) {}

  public setAlpha(alpha: number) {
    this.alpha = Math.max(0, Math.min(1, alpha));
  }

  public filter(value: number): number {
    if (this.y === null) {
      this.s = value;
      this.y = value;
      return value;
    }
    this.s = this.alpha * value + (1.0 - this.alpha) * this.s!;
    this.y = this.s;
    return this.y;
  }

  public lastValue(): number {
    return this.y ?? 0;
  }

  public reset() {
    this.y = null;
    this.s = null;
  }
}

export class OneEuroFilter {
  private xFilter: LowPassFilter;
  private dxFilter: LowPassFilter;
  private lastTime: number | null = null;

  constructor(
    private minCutoff: number = 1.0,
    private beta: number = 0.007,
    private dCutoff: number = 1.0
  ) {
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  public filter(val: number, timestampSec: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestampSec;
      return this.xFilter.filter(val);
    }

    const dt = Math.max(timestampSec - this.lastTime, 1e-4);
    this.lastTime = timestampSec;

    // Estimate derivative
    const dx = (val - this.xFilter.lastValue()) / dt;
    this.dxFilter.setAlpha(this.alpha(this.dCutoff, dt));
    const edx = this.dxFilter.filter(dx);

    // Compute dynamic cutoff frequency
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    this.xFilter.setAlpha(this.alpha(cutoff, dt));
    return this.xFilter.filter(val);
  }

  public reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

export class Vector3OneEuroFilter {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;
  private fz: OneEuroFilter;

  constructor(minCutoff = 1.2, beta = 0.01) {
    this.fx = new OneEuroFilter(minCutoff, beta);
    this.fy = new OneEuroFilter(minCutoff, beta);
    this.fz = new OneEuroFilter(minCutoff, beta);
  }

  public filter(v: [number, number, number], t: number): [number, number, number] {
    return [
      this.fx.filter(v[0], t),
      this.fy.filter(v[1], t),
      this.fz.filter(v[2], t),
    ];
  }

  public reset() {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}
