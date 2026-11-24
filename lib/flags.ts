/**
 * Authoritative Feature Flag & Capabilities System (Phase X0)
 *
 * All expansion packs are gated behind self-contained feature flags.
 * Flags can be toggled via build-time defaults, studio settings, or URL query overrides:
 * e.g. `?flags=controller,policy_lab` or `?flags=-audio`.
 */

export type FeatureFlagKey =
  | 'controller_playground' // Pack A (★)
  | 'policy_lab'            // Pack B (★)
  | 'droid_workshop'        // Pack C (★)
  | 'sim_to_real'           // Pack D (★)
  | 'comms_delay'           // Pack E (★)
  | 'power_thermal'         // Pack F
  | 'hazards'               // Pack G
  | 'ai_studio'             // Pack H
  | 'daily_challenge'       // Pack I (★)
  | 'multidroid'            // Pack J
  | 'audio'                 // Pack K
  | 'photo_mode'            // Pack L
  | 'experiments'           // Pack M
  | 'dataset_studio'        // Pack N
  | 'visual_modes'          // Pack O
  | 'pwa'                   // Pack P
  | 'webxr';                // Pack Q (Stretch)

export interface FeatureFlags {
  controller_playground: boolean;
  policy_lab: boolean;
  droid_workshop: boolean;
  sim_to_real: boolean;
  comms_delay: boolean;
  power_thermal: boolean;
  hazards: boolean;
  ai_studio: boolean;
  daily_challenge: boolean;
  multidroid: boolean;
  audio: boolean;
  photo_mode: boolean;
  experiments: boolean;
  dataset_studio: boolean;
  visual_modes: boolean;
  pwa: boolean;
  webxr: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  controller_playground: true,
  policy_lab: true,
  droid_workshop: true,
  sim_to_real: true,
  comms_delay: true,
  power_thermal: true,
  hazards: true,
  ai_studio: true,
  daily_challenge: true,
  multidroid: true,
  audio: true,
  photo_mode: true,
  experiments: true,
  dataset_studio: true,
  visual_modes: true,
  pwa: true,
  webxr: false, // Default off per directive specification
};

/**
 * Resolves active feature flags taking into account URL search parameters.
 */
export function resolveFeatureFlags(urlSearch?: string): FeatureFlags {
  const flags = { ...DEFAULT_FEATURE_FLAGS };

  if (typeof window !== 'undefined' && !urlSearch) {
    urlSearch = window.location.search;
  }

  if (urlSearch) {
    const params = new URLSearchParams(urlSearch);
    const flagsParam = params.get('flags');
    if (flagsParam) {
      const tokens = flagsParam.split(',').map((t) => t.trim().toLowerCase());
      for (const token of tokens) {
        if (!token) continue;
        const isNegated = token.startsWith('-') || token.startsWith('no-');
        const cleanName = token.replace(/^[-!]|^(no-)/, '') as FeatureFlagKey;
        if (cleanName in flags) {
          flags[cleanName] = !isNegated;
        }
      }
    }
  }

  return flags;
}

export function isFeatureEnabled(key: FeatureFlagKey, urlSearch?: string): boolean {
  const flags = resolveFeatureFlags(urlSearch);
  return Boolean(flags[key]);
}

export interface Capabilities {
  canWriteController: boolean;
  canOptimizePolicy: boolean;
  canCustomizeDroid: boolean;
  canRandomizeDomain: boolean;
  canDelayComms: boolean;
  canSimulatePower: boolean;
  canSpawnHazards: boolean;
  canUseAIStudio: boolean;
  canPlayDailyChallenge: boolean;
  canRaceMultiDroid: boolean;
  canPlayAudio: boolean;
  canPhotoMode: boolean;
  canSweepExperiments: boolean;
  canGenerateDataset: boolean;
  canSwitchVisualModes: boolean;
}

export function getCapabilities(flags: FeatureFlags = DEFAULT_FEATURE_FLAGS): Capabilities {
  return {
    canWriteController: flags.controller_playground,
    canOptimizePolicy: flags.policy_lab,
    canCustomizeDroid: flags.droid_workshop,
    canRandomizeDomain: flags.sim_to_real,
    canDelayComms: flags.comms_delay,
    canSimulatePower: flags.power_thermal,
    canSpawnHazards: flags.hazards,
    canUseAIStudio: flags.ai_studio,
    canPlayDailyChallenge: flags.daily_challenge,
    canRaceMultiDroid: flags.multidroid,
    canPlayAudio: flags.audio,
    canPhotoMode: flags.photo_mode,
    canSweepExperiments: flags.experiments,
    canGenerateDataset: flags.dataset_studio,
    canSwitchVisualModes: flags.visual_modes,
  };
}
