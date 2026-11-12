/**
 * Dynamic Similarity and Gravity-Aware Locomotion Parameters
 * Calculates Froude number, transition velocities, cadence, and ballistic flight profiles
 * parameterized by environmental gravity g and leg length L.
 */

export interface DerivedGaitParameters {
  gravity: number; // m/s^2 (e.g. 1.62 for Moon, 9.81 for Earth)
  legLength: number; // Hip height in meters (nominal 0.385m)
  froudeNumber: number; // Fr = v^2 / (g * L)
  transitionSpeed: number; // Speed where Fr = 0.5 (m/s)
  cadenceHz: number; // Step frequency (Hz)
  strideLength: number; // Ground distance per cycle (m)
  dutyFactor: number; // Fraction of cycle in stance (0.35 to 0.65)
  flightFraction: number; // Fraction of cycle in flight
  isBounding: boolean; // True when Fr > 0.5
  swingHeight: number; // Maximum foot clearance in meters
}

export class GaitParamsCalculator {
  private readonly defaultLegLength = 0.385; // Standing hip height (m)
  private readonly nominalCadenceEarth = 2.2; // Hz at Earth gravity

  /**
   * Derive dynamic similarity parameters for a given forward speed and gravity.
   */
  public calculate(speed: number, gravity = 1.62, legLength = this.defaultLegLength): DerivedGaitParameters {
    const safeG = Math.max(0.1, Math.abs(gravity));
    const safeL = Math.max(0.1, legLength);
    const absSpeed = Math.abs(speed);

    // 1. Froude Number: Fr = v^2 / (g * L)
    const froudeNumber = (absSpeed * absSpeed) / (safeG * safeL);

    // 2. Walk-to-bound transition speed at Fr = 0.5
    // v_trans = sqrt(0.5 * g * L)
    const transitionSpeed = Math.sqrt(0.5 * safeG * safeL);
    const isBounding = froudeNumber >= 0.5 && absSpeed > 0.25;

    // 3. Cadence scales with sqrt(g / g_earth)
    // Low gravity natural frequency is lower by sqrt(1.62 / 9.81) ~ 0.406
    const gravityFrequencyScale = Math.sqrt(safeG / 9.81);
    const speedRatio = Math.min(2.5, Math.max(0.2, absSpeed / Math.max(0.2, transitionSpeed)));
    let cadenceHz = this.nominalCadenceEarth * gravityFrequencyScale * (0.6 + 0.4 * speedRatio);
    // Actuator dynamic limits [0.6 Hz .. 3.2 Hz]
    cadenceHz = Math.max(0.6, Math.min(3.2, cadenceHz));

    // 4. Stride Length = speed / cadence
    let strideLength = absSpeed / Math.max(0.1, cadenceHz);
    strideLength = Math.max(0.12, Math.min(0.24, strideLength));

    // 5. Duty factor (fraction in stance)
    // Walk (Fr <= 0.5): 0.65 down to 0.50
    // Bound (Fr > 0.5): 0.50 down to 0.36
    let dutyFactor: number;
    if (froudeNumber <= 0.5) {
      const t = Math.min(1.0, froudeNumber / 0.5);
      dutyFactor = 0.65 - 0.15 * t;
    } else {
      const t = Math.min(1.0, (froudeNumber - 0.5) / 1.5);
      dutyFactor = 0.50 - 0.14 * t;
    }

    const flightFraction = Math.max(0.0, 1.0 - dutyFactor);

    // 6. Swing Height: in low gravity, foot swing arcs are higher and longer
    // High clearance avoids surface boulders
    const lowGravityClearanceBoost = Math.min(2.0, Math.max(1.0, 3.5 / safeG));
    const baseSwingHeight = 0.045; // 4.5 cm nominal on Earth
    const swingHeight = baseSwingHeight * lowGravityClearanceBoost;

    return {
      gravity: safeG,
      legLength: safeL,
      froudeNumber: Number(froudeNumber.toFixed(4)),
      transitionSpeed: Number(transitionSpeed.toFixed(4)),
      cadenceHz: Number(cadenceHz.toFixed(3)),
      strideLength: Number(strideLength.toFixed(3)),
      dutyFactor: Number(dutyFactor.toFixed(3)),
      flightFraction: Number(flightFraction.toFixed(3)),
      isBounding,
      swingHeight: Number(swingHeight.toFixed(4)),
    };
  }
}
