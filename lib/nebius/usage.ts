export interface TierUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface UsageState {
  ultra: TierUsage;
  super: TierUsage;
  nano: TierUsage;
  totalTokens: number;
  totalCostUsd: number;
  budgetLimitUsd: number;
  budgetExceeded: boolean;
  requestCount: number;
  lastUpdated: number;
}

// Pricing per 1,000 tokens in USD
const TIER_PRICING = {
  ultra: { prompt: 0.005, completion: 0.015 },
  super: { prompt: 0.001, completion: 0.002 },
  nano: { prompt: 0.0002, completion: 0.0004 },
};

let globalUsageState: UsageState = {
  ultra: { promptTokens: 1420, completionTokens: 960, totalTokens: 2380, costUsd: 0.0215 },
  super: { promptTokens: 650, completionTokens: 320, totalTokens: 970, costUsd: 0.0013 },
  nano: { promptTokens: 1200, completionTokens: 480, totalTokens: 1680, costUsd: 0.0004 },
  totalTokens: 5030,
  totalCostUsd: 0.0232,
  budgetLimitUsd: 5.0,
  budgetExceeded: false,
  requestCount: 4,
  lastUpdated: Date.now(),
};

export function recordUsage(
  tier: 'ultra' | 'super' | 'nano',
  promptTokens: number,
  completionTokens: number
): UsageState {
  const pricing = TIER_PRICING[tier];
  const deltaCost =
    (promptTokens / 1000) * pricing.prompt + (completionTokens / 1000) * pricing.completion;

  const currentTier = globalUsageState[tier];
  currentTier.promptTokens += promptTokens;
  currentTier.completionTokens += completionTokens;
  currentTier.totalTokens += promptTokens + completionTokens;
  currentTier.costUsd = Number((currentTier.costUsd + deltaCost).toFixed(5));

  globalUsageState.totalTokens += promptTokens + completionTokens;
  globalUsageState.totalCostUsd = Number(
    (globalUsageState.ultra.costUsd + globalUsageState.super.costUsd + globalUsageState.nano.costUsd).toFixed(5)
  );
  globalUsageState.budgetExceeded = globalUsageState.totalCostUsd >= globalUsageState.budgetLimitUsd;
  globalUsageState.requestCount += 1;
  globalUsageState.lastUpdated = Date.now();

  return getUsageState();
}

export function getUsageState(): UsageState {
  return JSON.parse(JSON.stringify(globalUsageState));
}

export function resetUsage(budgetLimitUsd = 5.0): UsageState {
  globalUsageState = {
    ultra: { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 },
    super: { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 },
    nano: { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 },
    totalTokens: 0,
    totalCostUsd: 0,
    budgetLimitUsd,
    budgetExceeded: false,
    requestCount: 0,
    lastUpdated: Date.now(),
  };
  return getUsageState();
}
