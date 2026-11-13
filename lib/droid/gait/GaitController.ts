/**
 * Master Gait Controller for Omni-Kinetic Quadruped Droid
 * 
 * Integrates:
 * - Froude dynamic similarity & gravity scaling (g read live from sim)
 * - Distance-driven phase tracking with double-support stand settling
 * - World-anchored stance phase (strictly zero foot slip < 1e-4m)
 * - Soft two-bone analytical inverse kinematics
 * - State machine with inertialized transitions (OffsetScalar / OffsetQuat)
 * - Secondary motion (antenna lag, landing compression, idle sway)
 * - Zero per-frame allocations on hot execution paths
 */

import {
  LegId,
  QUADRUPED_MORPHOLOGY,
  JointState,
  FootTarget,
  GaitState,
  DroidKinematicState,
  LocomotionCommand,
  STANDING_HEIGHT,
} from '../types';
import { TwoBoneIK } from '../ik/TwoBoneIK';
import { GaitParamsCalculator, DerivedGaitParameters } from './GaitParams';
import { GaitPhaseTracker } from './Phase';
import { FootPlanner, TerrainHeightSampler } from './FootPlanner';
import { CenterOfMassTrajectory, CoMState } from '../body/CenterOfMass';
import { SecondaryMotion } from '../secondary/SecondaryMotion';
import { OffsetScalar, OffsetQuat } from '../../anim/math/inertialize';
import { eulerToQuaternion, RobotPose } from '@/lib/frames';
import { Quaternion } from 'three';

export class GaitController {
  private readonly paramsCalc = new GaitParamsCalculator();
  private readonly phaseTracker = new GaitPhaseTracker();
  private readonly footPlanner: FootPlanner;
  private readonly comTrajectory = new CenterOfMassTrajectory();
  private readonly secondaryMotion = new SecondaryMotion();
  private readonly ikSolvers: Record<LegId, TwoBoneIK>;

  // Inertialization transition offsets
  private readonly heightOffset = new OffsetScalar();
  private readonly pitchOffset = new OffsetScalar();
  private readonly rollOffset = new OffsetScalar();
  private readonly quatOffset = new OffsetQuat();

  // Robot Pose State
  private posX = 0;
  private posZ = 0;
  private heading = 0;
  private linearVel: [number, number, number] = [0, 0, 0];
  private angularVel: [number, number, number] = [0, 0, 0];
  private currentGaitState: GaitState = 'stand';
  private currentParams: DerivedGaitParameters;

  // State timers
  private stateTimer = 0;
  private prevGaitState: GaitState = 'stand';
  private wasInFlight = false;

  // Scratch quaternions for zero-allocation rotations
  private readonly _rawQuat = new Quaternion();
  private readonly _outQuat = new Quaternion();

  // Reusable joint buffer to eliminate allocations
  private jointStates: JointState[] = [];

  constructor(initialX = 0, initialZ = 0, initialHeading = 0, terrainSampler?: TerrainHeightSampler) {
    this.posX = initialX;
    this.posZ = initialZ;
    this.heading = initialHeading;

    const sampleH = terrainSampler || (() => 0.0);
    const groundY = sampleH(this.posX, this.posZ);
    const initialPose: RobotPose = {
      position: [this.posX, groundY + STANDING_HEIGHT, this.posZ],
      yaw: this.heading,
      pitch: 0,
      roll: 0,
    };
    this.footPlanner = new FootPlanner(sampleH, initialPose);

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
   * Execute a single deterministic simulation step.
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

    // 2. Froude Number & Dynamic Gait Parameters from live sim gravity
    this.currentParams = this.paramsCalc.calculate(cmdVx, gravity);

    // 3. State Machine Transitions with Inertialization
    let nextState = this.currentGaitState;
    const isStationary = Math.abs(cmdVx) < 0.03 && Math.abs(cmdYawRate) < 0.05;

    if (isStationary) {
      if (this.currentGaitState === 'walk' || this.currentGaitState === 'bound') {
        nextState = 'stop';
        this.stateTimer = 0.25; // 250ms stop settle window
      } else if (this.currentGaitState === 'stop') {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          nextState = 'stand';
        }
      } else {
        nextState = 'stand';
      }
    } else if (Math.abs(cmdVx) < 0.03 && Math.abs(cmdYawRate) >= 0.05) {
      nextState = 'turnInPlace';
    } else if (this.currentGaitState === 'stand') {
      nextState = 'startWalk';
      this.stateTimer = 0.12; // 120ms anticipation crouch
    } else if (this.currentGaitState === 'startWalk') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        nextState = this.currentParams.isBounding ? 'bound' : 'walk';
      }
    } else {
      nextState = this.currentParams.isBounding ? 'bound' : 'walk';
    }

    // Trigger inertialization if state changed
    if (nextState !== this.currentGaitState) {
      this.prevGaitState = this.currentGaitState;
      this.currentGaitState = nextState;
      // Capture transition discontinuity offsets (half-life 0.10s)
      this.heightOffset.trigger(0, 0, 0, 0);
      this.pitchOffset.trigger(0, 0, 0, 0);
    }

    // 4. Advance Distance-Driven Gait Phase
    let masterPhase: number;
    if (this.currentGaitState === 'turnInPlace') {
      masterPhase = this.phaseTracker.advanceTurnInPlace(cmdYawRate, dt);
    } else if (this.currentGaitState === 'stand' || this.currentGaitState === 'stop') {
      this.phaseTracker.settleToStand(dt, 0.12);
      masterPhase = this.phaseTracker.getMasterPhase();
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

    // 6. Secondary Motion (Antenna inertia, landing compression, idle breathing)
    const isFlightNow = this.currentParams.isBounding && com.verticalVelocity !== 0;
    if (this.wasInFlight && !isFlightNow) {
      this.secondaryMotion.onLandingImpact(com.verticalVelocity);
    }
    this.wasInFlight = isFlightNow;

    const bodyLinAcc: [number, number, number] = [
      (this.linearVel[0] - 0) * dt,
      (com.verticalVelocity - 0) * dt,
      (this.linearVel[2] - 0) * dt,
    ];

    const sec = this.secondaryMotion.update(
      bodyLinAcc,
      this.currentGaitState === 'stand',
      dt
    );

    // Anticipation crouch in startWalk
    let anticipationY = 0;
    let anticipationPitch = 0;
    if (this.currentGaitState === 'startWalk') {
      anticipationY = -0.012;
      anticipationPitch = -0.025; // Slight forward lean
    }

    // Apply inertialization offsets
    const dHeight = this.heightOffset.update(0.10, dt);
    const dPitch = this.pitchOffset.update(0.10, dt);
    const dRoll = this.rollOffset.update(0.10, dt);

    const finalY = com.y + sec.landingHeightOffset + sec.idleHeightOffset + anticipationY + dHeight;
    const finalPitch = com.pitch + sec.idlePitchOffset + anticipationPitch + dPitch;
    const finalRoll = com.roll + dRoll;
    const finalYaw = com.yaw;

    const bodyPose: RobotPose = {
      position: [this.posX, finalY, this.posZ],
      yaw: finalYaw,
      pitch: finalPitch,
      roll: finalRoll,
    };

    const rawQuatArray = eulerToQuaternion(finalYaw, finalPitch, finalRoll);
    this._rawQuat.set(rawQuatArray[0], rawQuatArray[1], rawQuatArray[2], rawQuatArray[3]);
    this.quatOffset.update(0.10, dt);
    this.quatOffset.apply(this._rawQuat, this._outQuat);

    const bodyQuat: [number, number, number, number] = [
      this._outQuat.x,
      this._outQuat.y,
      this._outQuat.z,
      this._outQuat.w,
    ];

    // 7. World-Anchored Foot Planning (Zero Foot Skating)
    const feetTargets = this.footPlanner.update(
      bodyPose,
      this.linearVel,
      legPhases,
      this.currentParams.dutyFactor,
      this.currentParams.swingHeight,
      terrainSampler,
      dt
    );

    // 8. Solve 2-Bone Analytical Inverse Kinematics for each leg
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
      bodyPos: [this.posX, finalY, this.posZ],
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
    this.currentGaitState = 'stand';
    this.phaseTracker.reset();
    this.comTrajectory.reset();
    this.secondaryMotion.reset();
    this.heightOffset.reset();
    this.pitchOffset.reset();
    this.rollOffset.reset();
    this.quatOffset.reset();
    const initialPose: RobotPose = {
      position: [x, sampler(x, z) + STANDING_HEIGHT, z],
      yaw: heading,
      pitch: 0,
      roll: 0,
    };
    this.footPlanner.reset(initialPose, sampler);
  }
}
