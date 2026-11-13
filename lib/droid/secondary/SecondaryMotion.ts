/**
 * Secondary Motion Engine for Omni-Kinetic Droid
 * 
 * Features:
 * - Antenna and sensor boom inertia springs driven by body acceleration
 * - Landing impact absorption spring (compresses on touchdown after ballistic flight)
 * - Subtle organic breathing / idle sway when standing (< 1% body height)
 */

import { Vector3 } from 'three';
import { Spring3, springDamper, SpringState } from '../../anim/math/spring';

export class SecondaryMotion {
  // Antenna / mast displacement in body frame
  public readonly antennaOffset: Vector3 = new Vector3();
  private antennaSpring: Spring3 = new Spring3(0, 0, 0);

  // Landing impact compression
  private landingCompression: SpringState = { x: 0, v: 0 };

  // Idle sway phase
  private idlePhase = 0;

  /**
   * Update secondary dynamics.
   * @param bodyLinAcc Body linear acceleration [ax, ay, az] in body frame
   * @param isStanding True if droid is in idle/stand state
   * @param dt Frame delta in seconds
   */
  public update(
    bodyLinAcc: [number, number, number],
    isStanding: boolean,
    dt: number
  ): {
    antennaDisplacement: Vector3;
    landingHeightOffset: number;
    idleHeightOffset: number;
    idlePitchOffset: number;
  } {
    if (dt <= 0) {
      return {
        antennaDisplacement: this.antennaOffset,
        landingHeightOffset: this.landingCompression.x,
        idleHeightOffset: 0,
        idlePitchOffset: 0,
      };
    }

    // 1. Antenna lag spring: opposes acceleration (half-life 80ms)
    const targetAx = -bodyLinAcc[0] * 0.015;
    const targetAy = -bodyLinAcc[1] * 0.010;
    const targetAz = -bodyLinAcc[2] * 0.015;
    this.antennaSpring.update(targetAx, targetAy, targetAz, 0.08, dt);
    this.antennaOffset.copy(this.antennaSpring.pos);

    // 2. Landing compression decay (half-life 120ms)
    springDamper(this.landingCompression, 0.0, 0.0, 0.12, dt);

    // 3. Idle breathing / sway (0.35 Hz, ~3mm amplitude)
    let idleHeight = 0;
    let idlePitch = 0;
    if (isStanding) {
      this.idlePhase += dt * 0.35 * Math.PI * 2.0;
      idleHeight = Math.sin(this.idlePhase) * 0.003;
      idlePitch = Math.cos(this.idlePhase * 0.5) * 0.004;
    } else {
      this.idlePhase = 0;
    }

    return {
      antennaDisplacement: this.antennaOffset,
      landingHeightOffset: this.landingCompression.x,
      idleHeightOffset: idleHeight,
      idlePitchOffset: idlePitch,
    };
  }

  /**
   * Trigger landing impact absorption on foot touchdown after flight.
   * @param landingVelocity Vertical velocity at impact (negative m/s)
   */
  public onLandingImpact(landingVelocity: number): void {
    const impact = Math.min(0.04, Math.max(0.0, -landingVelocity * 0.025));
    this.landingCompression.x = -impact;
    this.landingCompression.v = landingVelocity * 0.5;
  }

  public reset(): void {
    this.antennaSpring.set(0, 0, 0);
    this.antennaOffset.set(0, 0, 0);
    this.landingCompression.x = 0;
    this.landingCompression.v = 0;
    this.idlePhase = 0;
  }
}
