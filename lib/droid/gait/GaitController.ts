/**
 * Master Gait Controller for Omni-Kinetic Quadruped Droid
 * Integrates Froude dynamic similarity, distance-driven phase, world stance anchoring,
 * terrain slope reaction, and analytical 2-bone IK.
 */

import {
  LegId,
  QUADRUPED_MORPHOLOGY,
  JointState,
  FootTarget,
  GaitState,
  DroidKinematicState,
  LocomotionCommand,
} from '../types';
import { TwoBoneIK } from '../ik/TwoBoneIK';
import { GaitParamsCalculator, DerivedGaitParameters } from './GaitParams';
import { GaitPhaseTracker } from './Phase';
import { FootPlanner, TerrainHeightSampler } from './FootPlanner';
import { CenterOfMassTrajectory, CoMState } from '../body/CenterOfMass';
import { eulerToQuaternion, RobotPose } from '@/lib/frames';

export class GaitController {
  private readonly paramsCalc = new GaitParamsCalculator();
  private readonly phaseTracker = new GaitPhaseTracker();
  private readonly footPlanner: FootPlanner;
  private readonly comTrajectory = new CenterOfMassTrajectory();
  private readonly ikSolvers: Record<LegId, TwoBoneIK>;

  // Robot Pose State
  private posX = 0;
  private posZ = 0;
  private heading = 0;
  private linearVel: [number, number, number] = [0, 0, 0];
  private angularVel: [number, number, number] = [0, 0, 0];
  private currentGaitState: GaitState = 'stand';
  private currentParams: DerivedGaitParameters;

  // Reusable joint buffer to eliminate allocations
  private jointStates: JointState[] = [];

  constructor(initialX = 0, initialZ = 0, initialHeading = 0, terrainSampler?: TerrainHeightSampler) {
    this.posX = initialX;
    this.posZ = initialZ;
    this.heading = initialHeading;

    const sampleH = terrainSampler || (() => 0.0);
    this.footPlanner = new FootPlanner(sampleH);

    this.ikSolvers = {
      FL: new TwoBoneIK(0.22, 0.22),
      FR: new TwoBoneIK(0.22, 0.22),
      RL: new TwoBoneIK(0.22, 0.22),
      RR: new TwoBoneIK(0.22, 0.22),
    };

    this.currentParams = this.paramsCalc.calculate(0.0, 1.62);
    this.initJointBuffer();
  }

  private initJointBuffer() {
    const legNames: LegId[] = ['FL', 'FR', 'RL', 'RR'];
    for (const leg of legNames) {
      this.jointStates.push({ name: `${leg}_hip_joint`, angle: 0, velocity: 0 });
      this.jointStates.push({ name: `${leg}_thigh_joint`, angle: 0, velocity: 0 });
      this.jointStates.push({ name: `${leg}_calf_joint`, angle: -0.85, velocity: 0 });
    }
  }

  /**
   * Execute a single deterministic simulation step (dt = 1/60s).
   */
  public step(
    command: LocomotionCommand,
    gravity = 1.62,
    terrainSampler: TerrainHeightSampler,
    dt = 1.0 / 60.0
  ): DroidKinematicState {
    const cmdVx = command.vx;
    const cmdYawRate = command.yawRate;

    // 1. Heading and Position Integration
    this.heading += cmdYawRate * dt;
    // Canonical forward: (cos theta, 0, -sin theta)
    const fwdX = Math.cos(this.heading);
    const fwdZ = -Math.sin(this.heading);

    const distDelta = Math.abs(cmdVx) * dt;
    this.posX += fwdX * cmdVx * dt;
    this.posZ += fwdZ * cmdVx * dt;

    this.linearVel = [fwdX * cmdVx, 0, fwdZ * cmdVx];
    this.angularVel = [0, cmdYawRate, 0];

    // 2. Froude Number & Dynamic Gait Parameters
    this.currentParams = this.paramsCalc.calculate(cmdVx, gravity);

    // 3. State Machine Transition
    if (Math.abs(cmdVx) < 0.03 && Math.abs(cmdYawRate) < 0.05) {
      this.currentGaitState = 'stand';
    } else if (Math.abs(cmdVx) < 0.03 && Math.abs(cmdYawRate) >= 0.05) {
      this.currentGaitState = 'turnInPlace';
    } else if (this.currentParams.isBounding) {
      this.currentGaitState = 'bound';
    } else {
      this.currentGaitState = 'walk';
    }

    // 4. Advance Distance-Driven Gait Phase
    let masterPhase: number;
    if (this.currentGaitState === 'turnInPlace') {
      masterPhase = this.phaseTracker.advanceTurnInPlace(cmdYawRate, dt);
    } else {
      masterPhase = this.phaseTracker.advance(distDelta, this.currentParams.strideLength);
    }

    const legPhases: Record<LegId, number> = {
      FL: this.phaseTracker.getLegPhase('FL'),
      FR: this.phaseTracker.getLegPhase('FR'),
      RL: this.phaseTracker.getLegPhase('RL'),
      RR: this.phaseTracker.getLegPhase('RR'),
    };

    // 5. Center-of-Mass and Body Attitude
    const com = this.comTrajectory.update(
      this.posX,
      this.posZ,
      this.heading,
      cmdVx,
      cmdYawRate,
      this.currentParams,
      masterPhase,
      terrainSampler,
      dt
    );

    const bodyPose: RobotPose = {
      position: [this.posX, com.y, this.posZ],
      yaw: com.yaw,
      pitch: com.pitch,
      roll: com.roll,
    };
    const bodyQuat = eulerToQuaternion(com.yaw, com.pitch, com.roll);

    // 6. World-Anchored Foot Planning (Zero Foot Skating)
    const feetTargets = this.footPlanner.update(
      bodyPose,
      this.linearVel,
      legPhases,
      this.currentParams.dutyFactor,
      this.currentParams.swingHeight,
      terrainSampler,
      dt
    );

    // 7. Solve 2-Bone Analytical Inverse Kinematics for each leg
    for (const foot of feetTargets) {
      const legId = foot.id;
      const config = QUADRUPED_MORPHOLOGY[legId];
      const solver = this.ikSolvers[legId];

      // Foot position relative to hip root in body frame
      const relX = foot.localPos[0] - config.hipOffset[0];
      const relY = foot.localPos[1] - config.hipOffset[1];
      const relZ = foot.localPos[2] - config.hipOffset[2];

      const ik = solver.solve(relX, relY, relZ, config.isLeft);

      // Update joint angle entries
      this.updateJoint(`${legId}_hip_joint`, ik.hipAngle);
      this.updateJoint(`${legId}_thigh_joint`, ik.thighAngle);
      this.updateJoint(`${legId}_calf_joint`, ik.calfAngle);
    }

    return {
      bodyPos: [this.posX, com.y, this.posZ],
      bodyQuat,
      bodyLinearVel: [this.linearVel[0], com.verticalVelocity, this.linearVel[2]],
      bodyAngularVel: this.angularVel,
      gaitState: this.currentGaitState,
      froudeNumber: this.currentParams.froudeNumber,
      cadenceHz: this.currentParams.cadenceHz,
      dutyFactor: this.currentParams.dutyFactor,
      joints: this.jointStates,
      feet: feetTargets,
    };
  }

  private updateJoint(name: string, angle: number) {
    const joint = this.jointStates.find((j) => j.name === name);
    if (joint) {
      joint.angle = Number(angle.toFixed(4));
    }
  }

  public getParams(): DerivedGaitParameters {
    return this.currentParams;
  }

  public reset(x = 0, z = 0, heading = 0, sampler: TerrainHeightSampler = () => 0) {
    this.posX = x;
    this.posZ = z;
    this.heading = heading;
    this.phaseTracker.reset();
    this.comTrajectory.reset();
    const pose: RobotPose = { position: [x, 0.385, z], yaw: heading, pitch: 0, roll: 0 };
    this.footPlanner.reset(pose, sampler);
  }
}
