/**
 * Guarded Persistence, Settings, Migrations, and Capabilities Module (Phases W11 & Sec 2.9)
 *
 * Wraps localStorage with schema versioning, graceful QuotaExceededError handling,
 * full export/delete controls, and capability flags.
 */

import { z } from 'zod';
import { EpisodeEndBehavior } from '../sim/SimClock';
import { MedalTier } from '../missions/missions';
import { ScenarioConfig } from '../scenario/sharing';

export const SETTINGS_SCHEMA_VERSION = 2;
const STORAGE_KEY_SETTINGS = 'omnikinetic.v2.settings';
const STORAGE_KEY_SCORES = 'omnikinetic.v2.mission_scores';
const STORAGE_KEY_SCENARIOS = 'omnikinetic.v2.saved_scenarios';
const STORAGE_KEY_COACH = 'omnikinetic.v2.coach_dismissed';

export type CameraMode = 'follow' | 'orbit' | 'topdown' | 'fpv' | 'freefly';
export type RadarSize = 'small' | 'medium' | 'large';
export type QualityTierSetting = 'low' | 'medium' | 'high' | 'ultra';

export const StudioSettingsSchema = z.object({
  version: z.number().int().default(SETTINGS_SCHEMA_VERSION),
  controls: z.object({
    sensitivity: z.number().min(0.4).max(2.0).default(1.0),
    gamepadDeadzone: z.number().min(0.05).max(0.35).default(0.15),
    gamepadCurve: z.number().min(1.0).max(2.5).default(1.5),
    invertYaw: z.boolean().default(false),
    invertCameraY: z.boolean().default(false),
    oneHandedMode: z.boolean().default(false),
    pointerDriveEnabled: z.boolean().default(false),
    avoidRocks: z.boolean().default(true),
    hapticsEnabled: z.boolean().default(true),
    showTouchControls: z.enum(['auto', 'always', 'never']).default('auto'),
    keyOverrides: z.record(z.array(z.string())).default({}),
  }),
  camera: z.object({
    defaultMode: z.enum(['follow', 'orbit', 'topdown', 'fpv', 'freefly']).default('follow'),
    fov: z.number().min(40).max(95).default(55),
    shakeEnabled: z.boolean().default(true),
    smoothing: z.number().min(0.05).max(0.4).default(0.18),
    autoRecenterOrbit: z.boolean().default(true),
    pipEnabled: z.boolean().default(false),
  }),
  display: z.object({
    qualityTier: z.enum(['low', 'medium', 'high', 'ultra']).default('high'),
    radarSize: z.enum(['small', 'medium', 'large']).default('medium'),
    showControlHud: z.boolean().default(true),
    showKeyLegend: z.boolean().default(true),
    showInputVisualizer: z.boolean().default(false),
    showContours: z.boolean().default(true),
    showTrail: z.boolean().default(true),
    colorblindSafe: z.boolean().default(false),
  }),
  simulation: z.object({
    realism: z.number().min(0).max(1).default(0.5),
    endBehavior: z.enum(['stop', 'loop', 'auto-restart']).default('stop'),
    autoPauseOnBlur: z.boolean().default(false),
    autoRecord: z.boolean().default(true),
    speedLimiter: z.number().min(0.3).max(1.0).default(1.0),
    brakeAssist: z.boolean().default(true),
    noFalls: z.boolean().default(false),
    pathPreview: z.boolean().default(true),
  }),
  accessibility: z.object({
    reducedMotion: z.boolean().default(false),
    highContrast: z.boolean().default(false),
    largeText: z.boolean().default(false),
  }),
});

export type StudioSettings = z.infer<typeof StudioSettingsSchema>;

export interface MissionBestScore {
  missionId: string;
  bestScore: number;
  medal: MedalTier;
  bestTimeSec: number;
  assistsUsed: boolean;
}

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = StudioSettingsSchema.parse({
  version: SETTINGS_SCHEMA_VERSION,
  controls: {},
  camera: {},
  display: {},
  simulation: {},
  accessibility: {},
});

export interface StorageWriteResult {
  ok: boolean;
  quotaExceeded?: boolean;
  error?: string;
}

export interface StudioCapabilities {
  userControl: boolean;
  gamepadApi: boolean;
  touchControls: boolean;
  cvTeleop: boolean;
  replaySystem: boolean;
  missions: boolean;
  scenarioEditor: boolean;
  terrainBrush: boolean;
  sensorOverlays: boolean;
  screenshotCapture: boolean;
  clipRecording: boolean;
  shareLinks: boolean;
}

export function detectCapabilities(): StudioCapabilities {
  const hasWindow = typeof window !== 'undefined';
  const hasNavigator = typeof navigator !== 'undefined';
  return {
    userControl: true,
    gamepadApi: hasNavigator && typeof navigator.getGamepads === 'function',
    touchControls: true,
    cvTeleop: hasNavigator && Boolean(navigator.mediaDevices?.getUserMedia),
    replaySystem: true,
    missions: true,
    scenarioEditor: true,
    terrainBrush: true,
    sensorOverlays: true,
    screenshotCapture: hasWindow,
    clipRecording: hasWindow && typeof (window as any).MediaRecorder !== 'undefined',
    shareLinks: true,
  };
}

function safeWrite(key: string, value: string, storage?: Storage): StorageWriteResult {
  const target = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return { ok: false, error: 'Storage unavailable in this environment.' };
  try {
    target.setItem(key, value);
    return { ok: true };
  } catch (err: any) {
    const isQuota =
      err?.name === 'QuotaExceededError' ||
      err?.code === 22 ||
      String(err?.message || '').toLowerCase().includes('quota');
    return {
      ok: false,
      quotaExceeded: isQuota,
      error: isQuota
        ? 'Browser storage quota exceeded. Data kept in memory — export a backup file.'
        : String(err?.message || 'Storage write failed.'),
    };
  }
}

export function loadStudioSettings(storage?: Storage): StudioSettings {
  const target = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  const prefersReduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fallback: StudioSettings = {
    ...DEFAULT_STUDIO_SETTINGS,
    accessibility: {
      ...DEFAULT_STUDIO_SETTINGS.accessibility,
      reducedMotion: prefersReduced,
    },
  };

  if (!target) return fallback;
  try {
    const raw = target.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    // Migrate v1 -> v2 transparently
    const merged = {
      ...fallback,
      ...parsed,
      version: SETTINGS_SCHEMA_VERSION,
      controls: { ...fallback.controls, ...(parsed?.controls || {}) },
      camera: { ...fallback.camera, ...(parsed?.camera || {}) },
      display: { ...fallback.display, ...(parsed?.display || {}) },
      simulation: { ...fallback.simulation, ...(parsed?.simulation || {}) },
      accessibility: { ...fallback.accessibility, ...(parsed?.accessibility || {}) },
    };
    const res = StudioSettingsSchema.safeParse(merged);
    return res.success ? res.data : fallback;
  } catch {
    return fallback;
  }
}

export function saveStudioSettings(settings: StudioSettings, storage?: Storage): StorageWriteResult {
  return safeWrite(STORAGE_KEY_SETTINGS, JSON.stringify({ ...settings, version: SETTINGS_SCHEMA_VERSION }), storage);
}

export function loadMissionScores(storage?: Storage): Record<string, MissionBestScore> {
  const target = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return {};
  try {
    const raw = target.getItem(STORAGE_KEY_SCORES);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveMissionBestScore(
  entry: MissionBestScore,
  storage?: Storage
): { result: StorageWriteResult; scores: Record<string, MissionBestScore> } {
  const scores = loadMissionScores(storage);
  const prev = scores[entry.missionId];
  if (!prev || entry.bestScore > prev.bestScore) {
    scores[entry.missionId] = entry;
  }
  const result = safeWrite(STORAGE_KEY_SCORES, JSON.stringify(scores), storage);
  return { result, scores };
}

export function loadSavedScenarios(storage?: Storage): ScenarioConfig[] {
  const target = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return [];
  try {
    const raw = target.getItem(STORAGE_KEY_SCENARIOS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveScenarioLocally(scenario: ScenarioConfig, storage?: Storage): StorageWriteResult {
  const existing = loadSavedScenarios(storage).filter((s) => s.name !== scenario.name);
  existing.unshift(scenario);
  return safeWrite(STORAGE_KEY_SCENARIOS, JSON.stringify(existing.slice(0, 20)), storage);
}

export function isCoachDismissed(storage?: Storage): boolean {
  const target = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return false;
  return target.getItem(STORAGE_KEY_COACH) === '1';
}

export function setCoachDismissed(dismissed: boolean, storage?: Storage): StorageWriteResult {
  return safeWrite(STORAGE_KEY_COACH, dismissed ? '1' : '0', storage);
}

export function exportAllStudioData(storage?: Storage): string {
  return JSON.stringify(
    {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      settings: loadStudioSettings(storage),
      missionScores: loadMissionScores(storage),
      scenarios: loadSavedScenarios(storage),
    },
    null,
    2
  );
}

export function deleteAllStudioData(storage?: Storage): void {
  const target = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return;
  target.removeItem(STORAGE_KEY_SETTINGS);
  target.removeItem(STORAGE_KEY_SCORES);
  target.removeItem(STORAGE_KEY_SCENARIOS);
  target.removeItem(STORAGE_KEY_COACH);
}
