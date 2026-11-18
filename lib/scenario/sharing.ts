/**
 * Scenario Schema, Environment Presets, and Shareable URL Codec (Phases W8 & W10)
 *
 * Encodes scenario configuration into a compact `#s=` base64url hash (< 2 KB)
 * with strict Zod schema validation and forward-version detection ("update required").
 */

import { z } from 'zod';

export const SCENARIO_SCHEMA_VERSION = 2;
export const MAX_SHARE_HASH_BYTES = 2048;

export const GRAVITY_PRESETS = [
  { id: 'moon', label: 'Moon', gravity: 1.62, description: '0.165 g — Lunar Mare Crater' },
  { id: 'mars', label: 'Mars', gravity: 3.71, description: '0.378 g — Jezero Basalt' },
  { id: 'earth', label: 'Earth', gravity: 9.81, description: '1.000 g — Terrestrial Lab' },
] as const;

export const LUNAR_TIME_PRESETS = [
  { id: 'dawn', label: 'Lunar Dawn', sunElevationDeg: 14, sunAzimuthDeg: 35 },
  { id: 'morning', label: 'Low Morning', sunElevationDeg: 22, sunAzimuthDeg: 52 },
  { id: 'noon', label: 'High Noon', sunElevationDeg: 54, sunAzimuthDeg: 115 },
  { id: 'dusk', label: 'Long Shadows', sunElevationDeg: 10, sunAzimuthDeg: 225 },
] as const;

export const ScenarioWaypointSchema = z.object({
  id: z.string().max(32),
  x: z.number().min(-18).max(18),
  z: z.number().min(-18).max(18),
  label: z.string().max(40).optional(),
  kind: z.enum(['beacon', 'sample', 'trench', 'base']).optional(),
});

export const CustomObstacleSchema = z.object({
  id: z.string().max(32),
  x: z.number().min(-18).max(18),
  z: z.number().min(-18).max(18),
  radius: z.number().min(0.2).max(2.5),
  kind: z.enum(['boulder', 'wall', 'keepout']),
});

export const ScenarioConfigSchema = z.object({
  v: z.number().int().min(1),
  name: z.string().min(1).max(80).default('Low-Gravity Lunar Crater Exploration'),
  seed: z.number().int().min(1).max(999999).default(42),
  gravity: z.number().min(0.2).max(25.0).default(1.62),
  roughness: z.number().min(0.1).max(1.5).default(0.65),
  craterCount: z.number().int().min(0).max(20).default(6),
  slopeScale: z.number().min(0.2).max(2.0).default(1.0),
  rockCount: z.number().int().min(0).max(2000).default(1400),
  sunElevationDeg: z.number().min(5).max(85).default(22),
  sunAzimuthDeg: z.number().min(0).max(360).default(52),
  startPos: z.tuple([z.number().min(-16).max(16), z.number().min(-16).max(16)]).default([0, 0]),
  startHeading: z.number().min(-Math.PI * 2).max(Math.PI * 2).default(0.62),
  episodeLength: z.number().min(10).max(600).default(60),
  missionId: z.string().max(64).nullable().default('first-steps'),
  waypoints: z.array(ScenarioWaypointSchema).max(24).default([]),
  customObstacles: z.array(CustomObstacleSchema).max(32).default([]),
});

export type ScenarioConfig = z.infer<typeof ScenarioConfigSchema>;

export const DEFAULT_SCENARIO_CONFIG: ScenarioConfig = {
  v: SCENARIO_SCHEMA_VERSION,
  name: 'Low-Gravity Lunar Crater Exploration',
  seed: 42,
  gravity: 1.62,
  roughness: 0.65,
  craterCount: 6,
  slopeScale: 1.0,
  rockCount: 1400,
  sunElevationDeg: 22,
  sunAzimuthDeg: 52,
  startPos: [0, 0],
  startHeading: 0.62,
  episodeLength: 60,
  missionId: 'first-steps',
  waypoints: [],
  customObstacles: [],
};

function toBase64Url(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf-8');
  }
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Encodes a ScenarioConfig into `#s=<base64url>` strictly under 2 KB.
 */
export function encodeScenarioToHash(config: ScenarioConfig): { ok: boolean; hash?: string; error?: string } {
  const validated = ScenarioConfigSchema.safeParse({ ...config, v: SCENARIO_SCHEMA_VERSION });
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0]?.message || 'Invalid scenario config.' };
  }
  const json = JSON.stringify(validated.data);
  const encoded = toBase64Url(json);
  const hash = `#s=${encoded}`;
  if (hash.length > MAX_SHARE_HASH_BYTES) {
    return {
      ok: false,
      error: `Scenario link exceeds ${MAX_SHARE_HASH_BYTES} byte URL limit (${hash.length} bytes). Export as JSON file instead.`,
    };
  }
  return { ok: true, hash };
}

/**
 * Decodes and validates a `#s=` URL hash, migrating v1 -> v2 and rejecting unknown future versions.
 */
export function decodeScenarioFromHash(hash: string): {
  ok: boolean;
  config?: ScenarioConfig;
  error?: string;
  updateRequired?: boolean;
} {
  if (!hash) return { ok: false, error: 'Empty scenario hash.' };
  const idx = hash.indexOf('s=');
  if (idx === -1) return { ok: false, error: 'Missing scenario payload (#s=).' };
  const rawPayload = hash.slice(idx + 2).split('&')[0];
  if (!rawPayload || rawPayload.length > MAX_SHARE_HASH_BYTES * 2) {
    return { ok: false, error: 'Scenario link payload is empty or exceeds safe size.' };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(fromBase64Url(rawPayload));
  } catch {
    return { ok: false, error: 'Malformed scenario link — unable to decode payload.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Invalid scenario payload object.' };
  }

  const version = typeof parsed.v === 'number' ? parsed.v : 1;
  if (version > SCENARIO_SCHEMA_VERSION) {
    return {
      ok: false,
      updateRequired: true,
      error: `This shared scenario was created with schema v${version} (current v${SCENARIO_SCHEMA_VERSION}). Update required to load it.`,
    };
  }

  // Migrate v1 -> v2 seamlessly
  const migrated = {
    ...DEFAULT_SCENARIO_CONFIG,
    ...parsed,
    v: SCENARIO_SCHEMA_VERSION,
  };

  const validated = ScenarioConfigSchema.safeParse(migrated);
  if (!validated.success) {
    return {
      ok: false,
      error: `Invalid scenario parameters: ${validated.error.issues[0]?.message || 'schema error'}.`,
    };
  }

  return { ok: true, config: validated.data };
}
