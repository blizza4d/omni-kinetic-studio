/**
 * Gravity Specifications & Truthful Units Formatting
 * Strict compliance with Units Mandate (AGENTS.md):
 * "Every physical quantity in the UI, logs, contracts, and docs MUST explicitly state its physical unit (m/s2, g, m, deg, s)."
 */

export const STANDARD_EARTH_GRAVITY = 9.80665; // m/s^2

export interface GravitySpec {
  value: number; // magnitude in m/s^2
  vector: [number, number, number]; // [gx, gy, gz] in m/s^2
  unit: 'm/s2';
  gFactor: number; // in g
  displayName: string;
}

/**
 * Robustly parses gravity from strings, arrays, presets, or numbers.
 * Guaranteed to never return 0 vertical gravity (minimum clamp -0.1 m/s^2 downward).
 */
export function parseGravityInput(input: any): [number, number, number] {
  if (input === undefined || input === null) {
    return [0, -1.62, 0];
  }

  // Named presets
  if (typeof input === 'string') {
    const lower = input.trim().toLowerCase();
    if (lower === 'moon' || lower === 'lunar') {
      return [0, -1.62, 0];
    }
    if (lower === 'mars') {
      return [0, -3.72, 0];
    }
    if (lower === 'earth') {
      return [0, -9.81, 0];
    }

    // Check for "X g"
    const gMatch = lower.match(/^([+-]?\d+(?:\.\d+)?)\s*g$/);
    if (gMatch) {
      const gVal = parseFloat(gMatch[1]);
      const ms2 = -Math.abs(gVal * STANDARD_EARTH_GRAVITY);
      const clamped = Math.min(-0.1, Math.max(-25.0, ms2));
      return [0, Number(clamped.toFixed(3)), 0];
    }

    // Check for "X m/s2" or "X m/s^2" or "X m/s²"
    const ms2Match = lower.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:m\/s\^?2|m\/s²)$/);
    if (ms2Match) {
      const ms2Val = parseFloat(ms2Match[1]);
      const downward = -Math.abs(ms2Val);
      const clamped = Math.min(-0.1, Math.max(-25.0, downward));
      return [0, Number(clamped.toFixed(3)), 0];
    }

    // Bare number in string
    const num = parseFloat(lower);
    if (!isNaN(num)) {
      const downward = -Math.abs(num);
      const clamped = Math.min(-0.1, Math.max(-25.0, downward));
      return [0, Number(clamped.toFixed(3)), 0];
    }

    // Default fallback
    return [0, -1.62, 0];
  }

  // Number input
  if (typeof input === 'number') {
    const downward = -Math.abs(input);
    const clamped = Math.min(-0.1, Math.max(-25.0, downward));
    return [0, Number(clamped.toFixed(3)), 0];
  }

  // Array input [gx, gy, gz]
  if (Array.isArray(input)) {
    const gx = typeof input[0] === 'number' ? input[0] : 0;
    let gy = typeof input[1] === 'number' ? input[1] : -1.62;
    const gz = typeof input[2] === 'number' ? input[2] : 0;

    // Invariant: vertical gravity must provide downward acceleration (<= -0.5)
    if (gy >= -0.05) {
      gy = -0.5;
    }
    gy = Math.min(-0.5, Math.max(-25.0, gy));
    return [Number(gx.toFixed(3)), Number(gy.toFixed(3)), Number(gz.toFixed(3))];
  }

  // Object input { value, unit }
  if (typeof input === 'object' && typeof input.value === 'number') {
    const downward = -Math.abs(input.value);
    const clamped = Math.min(-0.1, Math.max(-25.0, downward));
    return [0, Number(clamped.toFixed(3)), 0];
  }

  return [0, -1.62, 0];
}

/**
 * Formats gravity truthfully with units, equivalent g-force, and celestial name if standard.
 * e.g., "1.62 m/s² (0.165 g, Moon)"
 */
export function formatGravityDisplay(gravity: [number, number, number] | number[] | undefined): string {
  if (!gravity || !Array.isArray(gravity) || gravity.length < 2) {
    return '1.62 m/s² (0.165 g, Moon)';
  }

  const verticalMs2 = Math.abs(gravity[1]);

  if (Math.abs(verticalMs2 - 1.62) <= 0.05) {
    return '1.62 m/s² (0.165 g, Moon)';
  }
  if (Math.abs(verticalMs2 - 3.72) <= 0.05) {
    return '3.72 m/s² (0.38 g, Mars)';
  }
  if (Math.abs(verticalMs2 - 9.81) <= 0.05) {
    return '9.81 m/s² (1.00 g, Earth)';
  }

  const gVal = (verticalMs2 / STANDARD_EARTH_GRAVITY).toFixed(2);
  return `${verticalMs2.toFixed(2)} m/s² (${gVal} g)`;
}
