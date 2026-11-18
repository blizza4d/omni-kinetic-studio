/**
 * Distance-Driven Gait Phase Generator (v2)
 *
 * Ensures foot contact cadence and phase advance strictly from ground displacement,
 * eliminating foot skating at varying speeds and speed multipliers.
 * Supports walk, trot, bound, and pronk phase profiles with smooth transition gating.
 */

import { LegId, GaitPattern } from '../types';

const GAIT_OFFSETS: Record<GaitPattern, Record<LegId, number>> = {
  // 4-beat crawl/walk: 0, 0.5, 0.25, 0.75
  walk: { FL: 0.0, FR: Math.PI, RL: Math.PI * 1.5, RR: Math.PI * 0.5 },
  // Diagonal-pair trot: FL+RR (0), FR+RL (PI)
  trot: { FL: 0.0, FR: Math.PI, RL: Math.PI, RR: 0.0 },
  // Front-pair / hind-pair lunar bound: FL+FR (0), RL+RR (PI)
  bound: { FL: 0.0, FR: 0.0, RL: Math.PI, RR: Math.PI },
  // Synchronized 4-leg pronk
  pronk: { FL: 0.0, FR: 0.0, RL: 0.0, RR: 0.0 },
};

export class GaitPhaseTracker {
  private masterPhase = 0; // [0 .. 2*PI)
  private totalDistanceTraveled = 0;
  private activePattern: GaitPattern = 'trot';
  private pendingPattern: GaitPattern | null = null;
  private switchWaitSec = 0;

  private readonly legPhaseOffsets: Record<LegId, number> = {
    FL: 0.0,
    FR: Math.PI,
    RL: Math.PI,
    RR: 0.0,
  };

  public getPattern(): GaitPattern {
    return this.activePattern;
  }

  /**
   * Request a gait pattern change; waits up to 0.25s for a safe double-support
   * phase moment so feet do not slip mid-swing.
   */
  public requestPattern(pattern: GaitPattern, dt: number): boolean {
    if (pattern === this.activePattern && this.pendingPattern === null) return false;
    if (pattern !== this.pendingPattern) {
      this.pendingPattern = pattern;
      this.switchWaitSec = 0;
    }
    this.switchWaitSec += dt;

    const norm = (this.masterPhase / (2 * Math.PI)) % 1.0;
    const nearDoubleSupport = norm < 0.08 || Math.abs(norm - 0.5) < 0.08 || norm > 0.92;
    if (nearDoubleSupport || this.switchWaitSec >= 0.25) {
      this.activePattern = this.pendingPattern;
      const offsets = GAIT_OFFSETS[this.activePattern];
      this.legPhaseOffsets.FL = offsets.FL;
      this.legPhaseOffsets.FR = offsets.FR;
      this.legPhaseOffsets.RL = offsets.RL;
      this.legPhaseOffsets.RR = offsets.RR;
      this.pendingPattern = null;
      this.switchWaitSec = 0;
      return true;
    }
    return false;
  }

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
    const turnDist = Math.abs(yawRateRadS) * dt * 0.35;
    return this.advance(turnDist, 0.25);
  }

  /**
   * Settle toward the nearest double-support stance when speed drops to ~0.
   */
  public settleToStand(dt: number, halfLife = 0.12): void {
    if (dt <= 0) return;
    const a = 1.0 - Math.exp((-Math.LN2 * dt) / halfLife);
    const twoPi = 2.0 * Math.PI;
    const norm = (this.masterPhase / twoPi) % 1.0;
    const targetNorm = norm < 0.25 || norm >= 0.75 ? (norm >= 0.75 ? 1.0 : 0.0) : 0.5;
    const targetPhase = targetNorm * twoPi;
    this.masterPhase += (targetPhase - this.masterPhase) * a;
    this.masterPhase = (this.masterPhase + twoPi) % twoPi;
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

  public reset(phase = 0, pattern: GaitPattern = 'trot'): void {
    this.masterPhase = phase % (2.0 * Math.PI);
    this.totalDistanceTraveled = 0;
    this.activePattern = pattern;
    this.pendingPattern = null;
    this.switchWaitSec = 0;
    const offsets = GAIT_OFFSETS[pattern];
    this.legPhaseOffsets.FL = offsets.FL;
    this.legPhaseOffsets.FR = offsets.FR;
    this.legPhaseOffsets.RL = offsets.RL;
    this.legPhaseOffsets.RR = offsets.RR;
  }

  public serialize(): { masterPhase: number; totalDistance: number; pattern: GaitPattern } {
    return {
      masterPhase: this.masterPhase,
      totalDistance: this.totalDistanceTraveled,
      pattern: this.activePattern,
    };
  }

  public restore(state: { masterPhase: number; totalDistance: number; pattern?: GaitPattern }): void {
    this.masterPhase = state.masterPhase;
    this.totalDistanceTraveled = state.totalDistance;
    if (state.pattern) {
      this.activePattern = state.pattern;
      const offsets = GAIT_OFFSETS[state.pattern];
      this.legPhaseOffsets.FL = offsets.FL;
      this.legPhaseOffsets.FR = offsets.FR;
      this.legPhaseOffsets.RL = offsets.RL;
      this.legPhaseOffsets.RR = offsets.RR;
    }
  }
}
