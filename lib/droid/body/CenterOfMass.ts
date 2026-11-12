/**
 * Dynamic Center-of-Mass (CoM) and Torso Attitude Trajectory Generator
 * Computes gravity-scaled vertical oscillations, ballistic flight arcs,
 * slope-following filtering, and lateral banking lean (theta = atan(a / g)).
 */

import { TerrainHeightSampler } from '../gait/FootPlanner';
import { DerivedGaitParameters } from '../gait/GaitParams';

export interface CoMState {
  y: number; // World torso height (m)
  pitch: number; // Sagittal pitch (rad)
  roll: number; // Lateral roll (rad)
  yaw: number; // Heading (rad)
  verticalVelocity: number;
}

export class CenterOfMassTrajectory {
  private filteredPitch = 0;
  private filteredRoll = 0;
  private readonly filterTau = 0.20; // 200ms slope reaction filter

  /**
   * Compute dynamic body height, pitch, roll, and turn banking lean.
   */
  public update(
    worldX: number,
    worldZ: number,
    heading: number,
    forwardSpeed: number,
    yawRate: number,
    gaitParams: DerivedGaitParameters,
    masterPhase: number,
    sampleHeight: TerrainHeightSampler,
    dt: number
  ): CoMState {
    const g = gaitParams.gravity;
    const groundElevation = sampleHeight(worldX, worldZ);
    const nominalHeight = gaitParams.legLength;

    // 1. Vertical Center-of-Mass oscillation & Ballistic Flight
    let comOffset = 0;
    let vy = 0;

    if (gaitParams.isBounding) {
      // Ballistic Flight Phase under actual gravity g
      // In trot/bound, flight phase occurs when masterPhase is in flight window
      const flightDuration = (2.0 * 0.18) / g; // 2 * vy_takeoff / g
      const phaseCycle = masterPhase % Math.PI; // Twice per full stride
      const normCycle = phaseCycle / Math.PI;

      if (normCycle > gaitParams.dutyFactor) {
        // True flight phase: parabolic trajectory under g
        const flightProgress = (normCycle - gaitParams.dutyFactor) / Math.max(0.01, 1.0 - gaitParams.dutyFactor);
        const tFlight = flightProgress * flightDuration;
        // Parabola: y(t) = v0*t - 0.5*g*t^2
        const v0 = 0.5 * g * flightDuration;
        comOffset = v0 * tFlight - 0.5 * g * tFlight * tFlight;
        vy = v0 - g * tFlight;
      } else {
        // Stance compression/absorb phase
        const stanceProgress = normCycle / Math.max(0.01, gaitParams.dutyFactor);
        comOffset = -0.018 * Math.sin(stanceProgress * Math.PI);
        vy = 0;
      }
    } else {
      // Walking gait: Inverted pendulum oscillation at 2x step frequency
      const bobFreq = masterPhase * 2.0;
      const bobAmplitude = 0.014 * (gaitParams.gravity / 9.81);
      comOffset = Math.cos(bobFreq) * bobAmplitude;
      vy = -Math.sin(bobFreq) * bobAmplitude * 2.0 * gaitParams.cadenceHz;
    }

    const torsoY = groundElevation + nominalHeight + comOffset;

    // 2. Sample terrain slopes along forward and lateral body axes
    const fwdX = Math.cos(heading);
    const fwdZ = -Math.sin(heading);
    const rightX = Math.sin(heading);
    const rightZ = Math.cos(heading);

    const stepDist = 0.30;
    const hFwd = sampleHeight(worldX + fwdX * stepDist, worldZ + fwdZ * stepDist);
    const hBack = sampleHeight(worldX - fwdX * stepDist, worldZ - fwdZ * stepDist);
    const hRight = sampleHeight(worldX + rightX * 0.20, worldZ + rightZ * 0.20);
    const hLeft = sampleHeight(worldX - rightX * 0.20, worldZ - rightZ * 0.20);

    const rawSlopePitch = Math.atan2(hFwd - hBack, 2 * stepDist);
    const rawSlopeRoll = Math.atan2(hLeft - hRight, 0.40);

    // Filter pitch and roll with time constant tau = 0.2s
    const alpha = dt / (this.filterTau + dt);
    this.filteredPitch += alpha * (rawSlopePitch - this.filteredPitch);
    this.filteredRoll += alpha * (rawSlopeRoll - this.filteredRoll);
    this.filteredPitch = Math.max(-0.40, Math.min(0.40, this.filteredPitch));
    this.filteredRoll = Math.max(-0.35, Math.min(0.35, this.filteredRoll));

    // 3. Dynamic banking lean into turns: theta_lean = atan(a_lateral / g)
    // Lateral acceleration a_lat = v_fwd * yawRate
    const lateralAccel = forwardSpeed * yawRate;
    const bankingLean = Math.atan2(lateralAccel, g);
    // Exaggerated lean clamped safely to [-0.25, 0.25] rad
    const clampedLean = Math.max(-0.25, Math.min(0.25, bankingLean));

    const totalRoll = this.filteredRoll + clampedLean;

    return {
      y: torsoY,
      pitch: this.filteredPitch,
      roll: totalRoll,
      yaw: heading,
      verticalVelocity: vy,
    };
  }

  public reset() {
    this.filteredPitch = 0;
    this.filteredRoll = 0;
  }
}
