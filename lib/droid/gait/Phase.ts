/**
 * Distance-Driven Gait Phase Generator
 * Ensures foot contact cadence and phase advance strictly from distance traveled,
 * eliminating foot skating at varying speeds and speed multipliers.
 */

import { LegId } from '../types';

export class GaitPhaseTracker {
  private masterPhase = 0; // [0 .. 2*PI)
  private totalDistanceTraveled = 0;

  // Stride phase offsets for quadruped trot gait
  // Pair 1: FL & RR (0 rad)
  // Pair 2: FR & RL (PI rad)
  private readonly legPhaseOffsets: Record<LegId, number> = {
    FL: 0.0,
    FR: Math.PI,
    RL: Math.PI,
    RR: 0.0,
  };

  /**
   * Advance gait phase using ground displacement delta.
   * At zero displacement, phase freezes cleanly with zero drift.
   */
  public advance(distanceDeltaM: number, strideLengthM: number): number {
    if (distanceDeltaM > 0.00001 && strideLengthM > 0.01) {
      this.totalDistanceTraveled += distanceDeltaM;
      const phaseDelta = (2.0 * Math.PI * distanceDeltaM) / strideLengthM;
      this.masterPhase = (this.masterPhase + phaseDelta) % (2.0 * Math.PI);
    }
    return this.masterPhase;
  }

  /**
   * Advance by turn yaw rate when turning in place with zero linear speed.
   */
  public advanceTurnInPlace(yawRateRadS: number, dt: number): number {
    const turnDist = Math.abs(yawRateRadS) * dt * 0.35; // Equivalent wheel/foot arc
    return this.advance(turnDist, 0.25);
  }

  public getMasterPhase(): number {
    return this.masterPhase;
  }

  public getLegPhase(legId: LegId): number {
    return (this.masterPhase + this.legPhaseOffsets[legId]) % (2.0 * Math.PI);
  }

  public getTotalDistance(): number {
    return this.totalDistanceTraveled;
  }

  public reset(phase = 0) {
    this.masterPhase = phase % (2.0 * Math.PI);
    this.totalDistanceTraveled = 0;
  }

  public serialize(): { masterPhase: number; totalDistance: number } {
    return {
      masterPhase: this.masterPhase,
      totalDistance: this.totalDistanceTraveled,
    };
  }

  public restore(state: { masterPhase: number; totalDistance: number }) {
    this.masterPhase = state.masterPhase;
    this.totalDistanceTraveled = state.totalDistance;
  }
}
