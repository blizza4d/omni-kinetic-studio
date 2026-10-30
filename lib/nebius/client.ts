import OpenAI from 'openai';

export interface ModelTierConfig {
  reasoningModel: string; // Ultra
  midModel: string;       // Super
  fastModel: string;      // Nano
  source: 'live_discovered' | 'configured' | 'fallback';
  fallbackActive: boolean;
  fallbackNotice?: string;
  availableModels: string[];
  lastChecked: number;
}

let cachedModels: ModelTierConfig | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 1000 * 60 * 10; // 10 minutes

export function getNebiusClient(): OpenAI | null {
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new OpenAI({
    baseURL: process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1',
    apiKey: apiKey,
  });
}

/**
 * Resolves active models dynamically from Token Factory /models endpoint.
 * Never hardcodes retired snapshots without graceful fallback.
 */
export async function resolveNebiusModels(forceRefresh = false): Promise<ModelTierConfig> {
  const now = Date.now();
  if (!forceRefresh && cachedModels && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedModels;
  }

  const client = getNebiusClient();
  const configuredReasoning = process.env.NEBIUS_REASONING_MODEL || 'nvidia/Nemotron-3-Ultra-550b-a55b';
  const configuredMid = process.env.NEBIUS_MID_MODEL || 'nvidia/Nemotron-3-Super';
  const configuredFast = process.env.NEBIUS_FAST_MODEL || 'nvidia/Nemotron-3-Nano';

  if (!client) {
    cachedModels = {
      reasoningModel: configuredReasoning,
      midModel: configuredMid,
      fastModel: configuredFast,
      source: 'fallback',
      fallbackActive: true,
      fallbackNotice: 'NEBIUS_API_KEY not configured. Deterministic offline fixture pipeline active.',
      availableModels: [configuredReasoning, configuredMid, configuredFast],
      lastChecked: now,
    };
    lastFetchTime = now;
    return cachedModels;
  }

  try {
    const response = await client.models.list();
    const modelIds = response.data.map((m) => m.id);

    // Look for active Nemotron Ultra / reasoning tier
    let reasoning =
      modelIds.find((id) => id.toLowerCase().includes('nemotron-3-ultra') || id.toLowerCase().includes('nemotron-ultra')) ||
      modelIds.find((id) => id.toLowerCase().includes('nemotron') && id.toLowerCase().includes('ultra')) ||
      modelIds.find((id) => id.toLowerCase().includes('deepseek-r1') || id.toLowerCase().includes('reasoning')) ||
      configuredReasoning;

    // Look for mid tier (Super)
    let mid =
      modelIds.find((id) => id.toLowerCase().includes('nemotron') && id.toLowerCase().includes('super')) ||
      modelIds.find((id) => id.toLowerCase().includes('super') || id.toLowerCase().includes('70b')) ||
      configuredMid;

    // Look for fast tier (Nano / 8b)
    let fast =
      modelIds.find((id) => id.toLowerCase().includes('nano') || id.toLowerCase().includes('mini') || id.toLowerCase().includes('8b')) ||
      configuredFast;

    cachedModels = {
      reasoningModel: reasoning,
      midModel: mid,
      fastModel: fast,
      source: 'live_discovered',
      fallbackActive: false,
      availableModels: modelIds,
      lastChecked: now,
    };
    lastFetchTime = now;
    return cachedModels;
  } catch (err: any) {
    console.warn('[NebiusClient] Live model query failed; falling back to configured presets:', err.message);
    cachedModels = {
      reasoningModel: configuredReasoning,
      midModel: configuredMid,
      fastModel: configuredFast,
      source: 'configured',
      fallbackActive: true,
      fallbackNotice: `Live model lookup error: ${err.message}. Using configured fallback tiers.`,
      availableModels: [configuredReasoning, configuredMid, configuredFast],
      lastChecked: now,
    };
    lastFetchTime = now;
    return cachedModels;
  }
}

/**
 * Handles automatic cascade fallback from Ultra to Super to Nano when an API error occurs.
 */
export async function executeWithFallback<T>(
  operation: (modelId: string, tier: 'ultra' | 'super' | 'nano') => Promise<T>,
  onFallback?: (notice: string) => void
): Promise<{ result: T; tierUsed: 'ultra' | 'super' | 'nano'; modelUsed: string }> {
  const models = await resolveNebiusModels();

  // Try Ultra (Reasoning)
  try {
    const result = await operation(models.reasoningModel, 'ultra');
    return { result, tierUsed: 'ultra', modelUsed: models.reasoningModel };
  } catch (ultraErr: any) {
    const isModelNotFound =
      ultraErr.status === 404 ||
      ultraErr.message?.includes('not found') ||
      ultraErr.message?.includes('deprecated') ||
      ultraErr.message?.includes('does not exist');

    if (!isModelNotFound) throw ultraErr;

    const notice1 = `[Model Fallback] Ultra model '${models.reasoningModel}' returned 404/retired. Cascading to Super tier '${models.midModel}'...`;
    console.warn(notice1);
    if (onFallback) onFallback(notice1);

    // Try Super (Mid)
    try {
      const result = await operation(models.midModel, 'super');
      return { result, tierUsed: 'super', modelUsed: models.midModel };
    } catch (superErr: any) {
      const notice2 = `[Model Fallback] Super model '${models.midModel}' failed. Cascading to Fast Nano tier '${models.fastModel}'...`;
      console.warn(notice2);
      if (onFallback) onFallback(notice2);

      // Try Nano (Fast)
      const result = await operation(models.fastModel, 'nano');
      return { result, tierUsed: 'nano', modelUsed: models.fastModel };
    }
  }
}
