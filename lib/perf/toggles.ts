/**
 * Feature Toggles & A/B Bisect Parser
 * Reads and normalizes runtime diagnostic query parameters.
 */

export interface FeatureToggles {
  shadows: boolean;
  debrisPhysics: boolean;
  physics: boolean;
  radar: boolean;
  glass: boolean;
  dpr: number;
  debrisCount: number;
  particles: boolean;
  grid: boolean;
  trail: boolean;
  hud: boolean;
  stallTestMs: number;
}

export function parseFeatureToggles(searchParams?: URLSearchParams | null): FeatureToggles {
  const params = searchParams ?? (typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams());

  const getBool = (key: string, defaultVal = true): boolean => {
    const val = params.get(key)?.toLowerCase();
    if (val === 'off' || val === 'false' || val === '0') return false;
    if (val === 'on' || val === 'true' || val === '1') return true;
    return defaultVal;
  };

  const getNum = (key: string, defaultVal: number): number => {
    const val = params.get(key);
    if (!val) return defaultVal;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? defaultVal : parsed;
  };

  return {
    shadows: getBool('shadows', true),
    debrisPhysics: getBool('debrisPhysics', true),
    physics: getBool('physics', true),
    radar: getBool('radar', true),
    glass: getBool('glass', true),
    dpr: Math.min(2.0, Math.max(0.5, getNum('dpr', 1.5))),
    debrisCount: Math.max(0, Math.min(2000, getNum('debris', 1800))),
    particles: getBool('particles', true),
    grid: getBool('grid', false),
    trail: getBool('trail', true),
    hud: getBool('hud', true),
    stallTestMs: getNum('stallTest', 0),
  };
}
