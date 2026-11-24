/**
 * Earth-Moon Comms Delay Simulation (Pack E — F-005)
 *
 * Implements realistic speed-of-light propagation delay for lunar teleoperation:
 * - Round-trip time (RTT ~ 2.56s, 1.28s each direction at 384,400 km)
 * - Deterministic sim-time DelayLine (replays are bit-identical)
 * - Operator View (delayed telemetry) vs Ground Truth (immediate real-time)
 * - Predictive ghost pose estimation
 */

export class DelayLine<T> {
  private readonly buf: { release: number; value: T }[] = [];
  private head = 0;

  constructor(private delaySec: number) {}

  public getDelay(): number {
    return this.delaySec;
  }

  public setDelay(delaySec: number): void {
    this.delaySec = Math.max(0, delaySec);
  }

  public push(nowSec: number, value: T): void {
    this.buf.push({ release: nowSec + this.delaySec, value });
  }

  /**
   * Returns the latest value whose release timestamp has elapsed, or undefined.
   */
  public pop(nowSec: number): T | undefined {
    let out: T | undefined;
    while (this.head < this.buf.length && this.buf[this.head]!.release <= nowSec) {
      out = this.buf[this.head]!.value;
      this.head++;
    }
    // Clean buffer when consumed head exceeds chunk threshold
    if (this.head > 256) {
      this.buf.splice(0, this.head);
      this.head = 0;
    }
    return out;
  }

  public getInFlightCount(): number {
    return Math.max(0, this.buf.length - this.head);
  }

  public clear(): void {
    this.buf.length = 0;
    this.head = 0;
  }
}

export type CommsPreset = 'off' | 'leo' | 'moon' | 'custom';

export interface CommsConfig {
  preset: CommsPreset;
  name: string;
  description: string;
  oneWayDelaySec: number;
  rttSec: number;
  operatorViewDelayed: boolean;
  predictiveGhostEnabled: boolean;
}

export const COMMS_PRESETS: Record<CommsPreset, CommsConfig> = {
  off: {
    preset: 'off',
    name: 'Direct Sim / Off (0 ms)',
    description: 'Zero comms propagation latency; immediate real-time manual control.',
    oneWayDelaySec: 0.0,
    rttSec: 0.0,
    operatorViewDelayed: false,
    predictiveGhostEnabled: false,
  },
  leo: {
    preset: 'leo',
    name: 'Low Earth Orbit (100 ms RTT)',
    description: 'Sub-orbital / LEO ground station relay lag (~50 ms each direction).',
    oneWayDelaySec: 0.05,
    rttSec: 0.1,
    operatorViewDelayed: true,
    predictiveGhostEnabled: true,
  },
  moon: {
    preset: 'moon',
    name: 'Earth-Moon Direct (2.56 s RTT)',
    description: 'True vacuum light-speed delay over 384,400 km mean distance (1.28 s each direction).',
    oneWayDelaySec: 1.28,
    rttSec: 2.56,
    operatorViewDelayed: true,
    predictiveGhostEnabled: true,
  },
  custom: {
    preset: 'custom',
    name: 'Custom User Latency',
    description: 'User-specified one-way flight delay and round-trip buffer.',
    oneWayDelaySec: 1.0,
    rttSec: 2.0,
    operatorViewDelayed: true,
    predictiveGhostEnabled: true,
  },
};

export const DELAY_PRESETS = COMMS_PRESETS;
export type CommsPresetKey = CommsPreset;
export const SPEED_OF_LIGHT_KM_S = 299792;
export const EARTH_MOON_AVG_DIST_KM = 384400;
