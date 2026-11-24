/**
 * Droid Workshop: Morphology & Payload Tuning (Pack C — F-003)
 *
 * Implements parametric morphology presets and biomechanical derivation:
 * - "Scout" preset matches canonical baseline identically (golden trace invariant)
 * - "Hauler", "Strider", "Hexapod" parametric variants
 * - Dynamic Center-of-Mass (CoM) and payload shift calculation
 * - Gravity & leg-length Froude number walk-to-bound speed scaling
 */

export interface Morphology {
  id: string;
  name: string;
  description: string;
  bodyLength: number; // meters (e.g. 0.65)
  bodyWidth: number; // meters (e.g. 0.28)
  bodyHeight: number; // meters (e.g. 0.16)
  chassisMass: number; // kg (e.g. 18.0)
  payloadMass: number; // kg (0..20)
  payloadOffsetZ: number; // meters forward/back (-0.2..0.2)
  thighLength: number; // meters (e.g. 0.24)
  shinLength: number; // meters (e.g. 0.26)
  footRadius: number; // meters (e.g. 0.035)
  legCount: 4 | 6;
  maxActuatorTorque: number; // Nm (e.g. 45)
  accentColor: string;
}

export const PRESET_SCOUT: Morphology = {
  id: 'scout',
  name: 'Scout',
  description: 'Canonical agile lunar explorer. Balanced reach, speed, and energy efficiency.',
  bodyLength: 0.65,
  bodyWidth: 0.28,
  bodyHeight: 0.16,
  chassisMass: 18.0,
  payloadMass: 0.0,
  payloadOffsetZ: 0.0,
  thighLength: 0.24,
  shinLength: 0.26,
  footRadius: 0.035,
  legCount: 4,
  maxActuatorTorque: 45.0,
  accentColor: '#8EA48C',
};

export const PRESET_HAULER: Morphology = {
  id: 'hauler',
  name: 'Hauler',
  description: 'Reinforced chassis with shortened legs, high torque, and heavy cargo capacity.',
  bodyLength: 0.72,
  bodyWidth: 0.34,
  bodyHeight: 0.18,
  chassisMass: 26.0,
  payloadMass: 12.0,
  payloadOffsetZ: -0.05,
  thighLength: 0.20,
  shinLength: 0.22,
  footRadius: 0.045,
  legCount: 4,
  maxActuatorTorque: 75.0,
  accentColor: '#D97706',
};

export const PRESET_STRIDER: Morphology = {
  id: 'strider',
  name: 'Strider',
  description: 'High-clearance long-leg scout designed for traversing deep boulders and craters.',
  bodyLength: 0.62,
  bodyWidth: 0.26,
  bodyHeight: 0.15,
  chassisMass: 16.5,
  payloadMass: 2.0,
  payloadOffsetZ: 0.0,
  thighLength: 0.32,
  shinLength: 0.34,
  footRadius: 0.032,
  legCount: 4,
  maxActuatorTorque: 50.0,
  accentColor: '#38BDF8',
};

export const PRESET_HEXAPOD: Morphology = {
  id: 'hexapod',
  name: 'Hexapod',
  description: 'Six-legged all-terrain crawler with tripod stability on hyper-steep crater slopes.',
  bodyLength: 0.78,
  bodyWidth: 0.36,
  bodyHeight: 0.16,
  chassisMass: 24.0,
  payloadMass: 5.0,
  payloadOffsetZ: 0.0,
  thighLength: 0.22,
  shinLength: 0.24,
  footRadius: 0.038,
  legCount: 6,
  maxActuatorTorque: 55.0,
  accentColor: '#A855F7',
};

export const BUILT_IN_MORPHOLOGIES: readonly Morphology[] = [
  PRESET_SCOUT,
  PRESET_HAULER,
  PRESET_STRIDER,
  PRESET_HEXAPOD,
];

/**
 * Computes combined total mass and center-of-mass longitudinal shift from payload.
 */
export function computeCenterOfMass(m: Morphology): {
  totalMass: number;
  comShiftZ: number; // Longitudinal shift in meters (+ forward, - rearward)
  nominalReach: number;
} {
  const totalMass = m.chassisMass + m.payloadMass;
  const comShiftZ = (m.payloadMass * m.payloadOffsetZ) / Math.max(1, totalMass);
  const nominalReach = m.thighLength + m.shinLength;
  return {
    totalMass: Number(totalMass.toFixed(2)),
    comShiftZ: Number(comShiftZ.toFixed(3)),
    nominalReach: Number(nominalReach.toFixed(3)),
  };
}

/**
 * Computes gravity-scaled walk-to-bound transition speed using Froude number (Fr ~ 0.5):
 * v_transition = sqrt(0.5 * g * legLength)
 */
export function computeGaitTransitionSpeed(m: Morphology, gravity = 1.62): number {
  const legLength = m.thighLength + m.shinLength;
  const vCrit = Math.sqrt(0.5 * Math.max(0.1, gravity) * legLength);
  return Number(vCrit.toFixed(2));
}

/**
 * Validates morphology structural feasibility.
 */
export function validateMorphology(m: Morphology): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const reach = m.thighLength + m.shinLength;

  if (reach < 0.25 || reach > 0.9) {
    errors.push(`Total leg reach (${reach.toFixed(2)}m) must be between 0.25m and 0.90m`);
  }
  if (m.payloadMass < 0 || m.payloadMass > 30) {
    errors.push('Payload mass must be between 0kg and 30kg');
  }
  if (m.bodyLength < 0.4 || m.bodyLength > 1.2) {
    errors.push('Body length must be between 0.40m and 1.20m');
  }

  return { ok: errors.length === 0, errors };
}

export type MorphologyPresetKey = 'scout' | 'hauler' | 'strider' | 'hexapod';
export type MorphologySpec = Morphology & {
  chassisMassKg: number;
  thighLengthM: number;
  calfLengthM: number;
  froudeWalkSpeed: number;
  maxPayloadKg: number;
};

export const MORPHOLOGY_PRESETS: Record<MorphologyPresetKey, MorphologySpec> = {
  scout: {
    ...PRESET_SCOUT,
    chassisMassKg: PRESET_SCOUT.chassisMass,
    thighLengthM: PRESET_SCOUT.thighLength,
    calfLengthM: PRESET_SCOUT.shinLength,
    froudeWalkSpeed: computeGaitTransitionSpeed(PRESET_SCOUT, 1.62),
    maxPayloadKg: 10,
  },
  hauler: {
    ...PRESET_HAULER,
    chassisMassKg: PRESET_HAULER.chassisMass,
    thighLengthM: PRESET_HAULER.thighLength,
    calfLengthM: PRESET_HAULER.shinLength,
    froudeWalkSpeed: computeGaitTransitionSpeed(PRESET_HAULER, 1.62),
    maxPayloadKg: 25,
  },
  strider: {
    ...PRESET_STRIDER,
    chassisMassKg: PRESET_STRIDER.chassisMass,
    thighLengthM: PRESET_STRIDER.thighLength,
    calfLengthM: PRESET_STRIDER.shinLength,
    froudeWalkSpeed: computeGaitTransitionSpeed(PRESET_STRIDER, 1.62),
    maxPayloadKg: 8,
  },
  hexapod: {
    ...PRESET_HEXAPOD,
    chassisMassKg: PRESET_HEXAPOD.chassisMass,
    thighLengthM: PRESET_HEXAPOD.thighLength,
    calfLengthM: PRESET_HEXAPOD.shinLength,
    froudeWalkSpeed: computeGaitTransitionSpeed(PRESET_HEXAPOD, 1.62),
    maxPayloadKg: 30,
  },
};

export function computeCoMWithPayload(m: MorphologySpec, payloadKg: number) {
  const com = computeCenterOfMass({ ...m, payloadMass: payloadKg });
  return {
    totalMassKg: com.totalMass,
    comOffset: [0, 0, com.comShiftZ] as [number, number, number],
  };
}

export function validateMorphologyFeasibility(m: MorphologySpec, payloadKg: number) {
  const v = validateMorphology({ ...m, payloadMass: payloadKg });
  return {
    feasible: v.ok,
    reason: v.errors.length > 0 ? v.errors.join('; ') : 'Structure within rated limits',
  };
}
