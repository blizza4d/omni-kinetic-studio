/**
 * Hazards & Dynamic Environmental Events Engine (Pack G — F-007)
 *
 * Implements deterministic seeded dynamic hazards:
 * - Ballistic rockfalls with telegraph warning rings
 * - Soft-regolith sinkage zones with friction degradation
 * - Dynamic sensor dropouts
 */

import { mulberry32 } from '../sim/prng';

export type HazardKind = 'rockfall' | 'soft_regolith' | 'shadow_pocket' | 'sensor_dropout';

export interface DynamicHazardEvent {
  id: string;
  kind: HazardKind;
  triggerTimeSec: number;
  durationSec: number;
  posX: number;
  posZ: number;
  radius: number;
  severity: number; // 0..1
  telegraphed: boolean;
}

export class HazardScheduler {
  private events: DynamicHazardEvent[] = [];

  public generateSchedule(seed: number, episodeLengthSec: number): DynamicHazardEvent[] {
    const rng = mulberry32((seed + 98765) >>> 0);
    const count = Math.floor(episodeLengthSec / 12.0);
    const evts: DynamicHazardEvent[] = [];

    const kinds: HazardKind[] = ['rockfall', 'soft_regolith', 'sensor_dropout'];

    for (let i = 0; i < count; i++) {
      const time = 4.0 + (i + 1) * 11.5 + (rng() * 4.0 - 2.0);
      if (time >= episodeLengthSec - 3.0) continue;

      const kind = kinds[Math.floor(rng() * kinds.length)]!;
      const angle = rng() * Math.PI * 2;
      const dist = 3.0 + rng() * 12.0;

      evts.push({
        id: `hz-${i}-${kind}`,
        kind,
        triggerTimeSec: Number(time.toFixed(1)),
        durationSec: kind === 'rockfall' ? 3.5 : 8.0,
        posX: Number((Math.cos(angle) * dist).toFixed(2)),
        posZ: Number((Math.sin(angle) * dist).toFixed(2)),
        radius: kind === 'rockfall' ? 2.5 : 4.0,
        severity: Number((0.4 + rng() * 0.5).toFixed(2)),
        telegraphed: false,
      });
    }

    this.events = evts;
    return evts;
  }

  public getActiveHazards(
    timeSec: number
  ): { active: DynamicHazardEvent[]; warnings: DynamicHazardEvent[] } {
    const active: DynamicHazardEvent[] = [];
    const warnings: DynamicHazardEvent[] = [];

    for (const ev of this.events) {
      // 1.5s warning telegraph before hazard trigger
      if (timeSec >= ev.triggerTimeSec - 1.5 && timeSec < ev.triggerTimeSec) {
        warnings.push(ev);
      } else if (timeSec >= ev.triggerTimeSec && timeSec <= ev.triggerTimeSec + ev.durationSec) {
        active.push(ev);
      }
    }

    return { active, warnings };
  }
}
