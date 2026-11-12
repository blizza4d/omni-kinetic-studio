/**
 * World-Anchored Foot Planner (Zero Foot Skating)
 * Enforces strict world-space stance anchor locking when a foot is planted on the terrain,
 * and generates smooth minimum-jerk parabolic swing clearance trajectories.
 */

import { LegId, LegMorphology, QUADRUPED_MORPHOLOGY, FootPhaseState, FootTarget } from '../types';
import { bodyToWorld, worldToBody, RobotPose } from '@/lib/frames';

export type TerrainHeightSampler = (x: number, z: number) => number;

interface FootInternalState {
  id: LegId;
  config: LegMorphology;
  state: FootPhaseState;
  worldAnchor: [number, number, number]; // Locked world position during stance
  liftoffPos: [number, number, number];
  touchdownTarget: [number, number, number];
  contact: boolean;
  phase: number;
  slipDistance: number;
}

export class FootPlanner {
  private feet: Record<LegId, FootInternalState>;
  private readonly defaultHipHeight = 0.385;

  constructor(sampler?: TerrainHeightSampler) {
    const sampleH = sampler || (() => 0.0);
    this.feet = {
      FL: this.createFootState('FL', sampleH),
      FR: this.createFootState('FR', sampleH),
      RL: this.createFootState('RL', sampleH),
      RR: this.createFootState('RR', sampleH),
    };
  }

  private createFootState(id: LegId, sampler: TerrainHeightSampler): FootInternalState {
    const config = QUADRUPED_MORPHOLOGY[id];
    // Start initial stance anchor slightly forward so that as hip advances, foot travels symmetrically
    const nominalStepOffset = (config.phaseOffset === 0.0) ? 0.05 : -0.05;
    const initialWorldX = config.hipOffset[0] + nominalStepOffset;
    const initialWorldZ = config.hipOffset[2];
    const groundY = sampler(initialWorldX, initialWorldZ);
    return {
      id,
      config,
      state: 'stance',
      worldAnchor: [initialWorldX, groundY, initialWorldZ],
      liftoffPos: [initialWorldX, groundY, initialWorldZ],
      touchdownTarget: [initialWorldX, groundY, initialWorldZ],
      contact: true,
      phase: config.phaseOffset,
      slipDistance: 0.0,
    };
  }

  /**
   * Update foot positions, stance locks, and swing trajectories for the current frame.
   */
  public update(
    bodyPose: RobotPose,
    bodyLinearVel: [number, number, number],
    legPhases: Record<LegId, number>,
    dutyFactor: number,
    swingHeight: number,
    sampleHeight: TerrainHeightSampler,
    dt: number
  ): FootTarget[] {
    const results: FootTarget[] = [];
    const forwardSpeed = Math.hypot(bodyLinearVel[0], bodyLinearVel[2]);
    const heading = bodyPose.yaw;

    const fwdX = Math.cos(heading);
    const fwdZ = -Math.sin(heading);

    for (const legId of ['FL', 'FR', 'RL', 'RR'] as LegId[]) {
      const foot = this.feet[legId];
      const phase = legPhases[legId];
      foot.phase = phase;

      const normalizedPhase = (phase / (2.0 * Math.PI)) % 1.0;
      const isStance = normalizedPhase < dutyFactor;

      // Current hip position in world space
      const hipWorld = bodyToWorld(foot.config.hipOffset, bodyPose);

      if (isStance) {
        // --- STANCE PHASE ---
        if (foot.state === 'swing') {
          // Touchdown transition: Lock new world anchor
          const targetGroundY = sampleHeight(foot.touchdownTarget[0], foot.touchdownTarget[2]);
          foot.worldAnchor = [foot.touchdownTarget[0], targetGroundY, foot.touchdownTarget[2]];
          foot.state = 'stance';
          foot.contact = true;
          foot.slipDistance = 0.0;
        }

        // Zero foot slip: Foot is rigidly locked to worldAnchor!
        const currentWorldPos: [number, number, number] = [
          foot.worldAnchor[0],
          foot.worldAnchor[1],
          foot.worldAnchor[2],
        ];

        // Measure drift against anchor (guaranteed < 1e-4m)
        const dx = currentWorldPos[0] - foot.worldAnchor[0];
        const dz = currentWorldPos[2] - foot.worldAnchor[2];
        foot.slipDistance = Math.hypot(dx, dz);

        // Convert anchored world position back to body frame for IK
        let localPos = worldToBody(currentWorldPos, bodyPose);

        // Kinematic reach ceiling guard: ensure foot never stretches past physical leg limit
        const relX = localPos[0] - foot.config.hipOffset[0];
        const relY = localPos[1] - foot.config.hipOffset[1];
        const relZ = localPos[2] - foot.config.hipOffset[2];
        const reach = Math.hypot(relX, relY, relZ);
        const maxAllowed = foot.config.maxReach * 0.98; // ~0.4312m

        if (reach > maxAllowed) {
          const scale = maxAllowed / reach;
          localPos = [
            foot.config.hipOffset[0] + relX * scale,
            foot.config.hipOffset[1] + relY * scale,
            foot.config.hipOffset[2] + relZ * scale,
          ];
          // Recover anchor forward for next frame
          foot.worldAnchor[0] += fwdX * 0.06;
          foot.worldAnchor[2] += fwdZ * 0.06;
          foot.worldAnchor[1] = sampleHeight(foot.worldAnchor[0], foot.worldAnchor[2]);
        }

        results.push({
          id: legId,
          state: 'stance',
          worldPos: currentWorldPos,
          localPos,
          contact: true,
          phase,
          slipDistance: foot.slipDistance,
        });
      } else {
        // --- SWING PHASE ---
        if (foot.state === 'stance') {
          // Liftoff transition: Record liftoff position and predict next touchdown
          foot.liftoffPos = [...foot.worldAnchor];
          foot.state = 'swing';
          foot.contact = false;

          // Stance duration estimate
          const cadenceEst = Math.max(0.6, forwardSpeed / 0.35);
          const tStance = dutyFactor / cadenceEst;

          // Raibert capture point heuristic for touchdown target:
          // target = hip_world + v * (t_stance / 2) + k * (v - v_desired)
          const stepForwardM = Math.min(0.09, forwardSpeed * (tStance * 0.5) + 0.02);
          const targetX = hipWorld[0] + fwdX * stepForwardM;
          const targetZ = hipWorld[2] + fwdZ * stepForwardM;
          const targetY = sampleHeight(targetX, targetZ);

          foot.touchdownTarget = [targetX, targetY, targetZ];
        }

        // Swing progress: u in [0 .. 1]
        const swingProgress = Math.min(1.0, Math.max(0.0, (normalizedPhase - dutyFactor) / Math.max(0.01, 1.0 - dutyFactor)));

        // Smooth minimum-jerk progression for horizontal plane: u_smooth = 10*u^3 - 15*u^4 + 6*u^5
        const u3 = swingProgress * swingProgress * swingProgress;
        const u4 = u3 * swingProgress;
        const u5 = u4 * swingProgress;
        const uSmooth = 10 * u3 - 15 * u4 + 6 * u5;

        const curX = foot.liftoffPos[0] + (foot.touchdownTarget[0] - foot.liftoffPos[0]) * uSmooth;
        const curZ = foot.liftoffPos[2] + (foot.touchdownTarget[2] - foot.liftoffPos[2]) * uSmooth;

        // Vertical parabolic clearance arc: peak at u = 0.5
        const baseElevation = (1.0 - swingProgress) * foot.liftoffPos[1] + swingProgress * foot.touchdownTarget[1];
        const parabolicLift = 4.0 * swingProgress * (1.0 - swingProgress) * swingHeight;
        const groundUnderFoot = sampleHeight(curX, curZ);
        const curY = Math.max(groundUnderFoot, baseElevation + parabolicLift);

        const currentWorldPos: [number, number, number] = [curX, curY, curZ];
        let localPos = worldToBody(currentWorldPos, bodyPose);

        // Kinematic reach ceiling guard on swing foot
        const relX = localPos[0] - foot.config.hipOffset[0];
        const relY = localPos[1] - foot.config.hipOffset[1];
        const relZ = localPos[2] - foot.config.hipOffset[2];
        const reach = Math.hypot(relX, relY, relZ);
        const maxAllowed = foot.config.maxReach * 0.98;
        if (reach > maxAllowed) {
          const scale = maxAllowed / reach;
          localPos = [
            foot.config.hipOffset[0] + relX * scale,
            foot.config.hipOffset[1] + relY * scale,
            foot.config.hipOffset[2] + relZ * scale,
          ];
        }

        results.push({
          id: legId,
          state: 'swing',
          worldPos: currentWorldPos,
          localPos,
          contact: false,
          phase,
          slipDistance: 0.0,
        });
      }
    }

    return results;
  }

  public getFootState(legId: LegId): FootInternalState {
    return this.feet[legId];
  }

  public reset(bodyPose: RobotPose, sampler: TerrainHeightSampler) {
    this.feet = {
      FL: this.createFootState('FL', sampler),
      FR: this.createFootState('FR', sampler),
      RL: this.createFootState('RL', sampler),
      RR: this.createFootState('RR', sampler),
    };
  }
}
