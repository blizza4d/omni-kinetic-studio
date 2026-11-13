/**
 * Frame-Rate Independent Exponential Smoothing
 */

export const LN2 = Math.LN2;

/**
 * Fraction to move toward target this frame, given a half-life in seconds and frame delta dt.
 * Mathematically exact across any frame rate (60 Hz, 120 Hz, 144 Hz).
 */
export function halfLifeAlpha(halfLife: number, dt: number): number {
  if (halfLife <= 0 || dt <= 0) return 1.0;
  return 1.0 - Math.exp((-LN2 * dt) / halfLife);
}

/**
 * Smooth scalar value toward target with exponential decay.
 */
export function smoothTo(current: number, target: number, halfLife: number, dt: number): number {
  return current + (target - current) * halfLifeAlpha(halfLife, dt);
}
