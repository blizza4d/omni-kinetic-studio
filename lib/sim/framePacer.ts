/**
 * Display Frame Pacer & Timestamp Delta Smoothing
 * 
 * Filters raw rAF micro-jitter by dynamically estimating display refresh rate
 * (60, 75, 90, 120, 144, 165, 240 Hz) and snapping stable deltas within 12%,
 * while allowing legitimate hitches and pauses to pass through cleanly.
 */

export class FramePacer {
  private last = 0;
  private readonly window: number[] = [];
  private refresh = 1 / 60;
  private isFirstTick = true;

  /**
   * Process a frame timestamp in milliseconds (from performance.now() or rAF timestamp).
   * @param timestampMs Frame timestamp in milliseconds
   * @returns Smoothed delta time in seconds
   */
  public tick(timestampMs: number): number {
    if (this.last === 0 || this.isFirstTick) {
      this.last = timestampMs;
      this.isFirstTick = false;
      return this.refresh;
    }

    const raw = (timestampMs - this.last) / 1000.0;
    this.last = timestampMs;

    // Filter out tab pauses, negative deltas, or huge hitches (> 0.25s)
    if (raw <= 0 || raw > 0.25) {
      return this.refresh;
    }

    this.window.push(raw);
    if (this.window.length > 120) {
      this.window.shift();
    }

    // Update refresh rate estimate once sufficient samples are gathered
    if (this.window.length >= 30) {
      this.refresh = this.estimateRefresh();
    }

    // Snap to nearest integer multiple of refresh period if within 12%
    const k = Math.max(1, Math.round(raw / this.refresh));
    const snapped = k * this.refresh;

    if (Math.abs(raw - snapped) < 0.12 * this.refresh) {
      return snapped;
    }
    return raw;
  }

  public getRefreshPeriod(): number {
    return this.refresh;
  }

  public reset(): void {
    this.last = 0;
    this.window.length = 0;
    this.refresh = 1 / 60;
    this.isFirstTick = true;
  }

  private estimateRefresh(): number {
    const sorted = [...this.window].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? this.refresh;

    const common = [60, 75, 90, 120, 144, 165, 240].map((hz) => 1.0 / hz);
    let best = median;
    let bestErr = Infinity;

    for (const c of common) {
      const err = Math.abs(c - median);
      if (err < bestErr) {
        bestErr = err;
        best = c;
      }
    }

    return bestErr < 0.12 * best ? best : median;
  }
}
