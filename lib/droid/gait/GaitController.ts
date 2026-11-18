/**
 * Master Gait Controller for Omni-Kinetic Quadruped Droid (v2)
 *
 * Integrates:
 * - Froude dynamic similarity & gravity scaling (g read live from sim)
 * - Distance-driven phase tracking across walk / trot / bound / pronk profiles
 * - World-anchored stance phase (strictly zero foot slip on canonical TerrainService)
 * - Full user-control maneuvers: strafe, reverse, spin-in-place, crouch/stand,
 *   charge-and-hop true ballistics (apex = vy^2 / (2g)), landing absorption,
 *   acceleration lean, torso counter-rotation, and stumble recovery
 * - Soft two-bone analytical inverse kinematics (zero-allocation hot path)
 * - State machine with inertialized transitions (OffsetScalar / OffsetQuat)
 * - Deterministic snapshot/restore for replay seeking & forking
 */

import {
  LegId,
  GaitPattern,
  QUADRUPED_MORPHOLOGY,
  JointState,
  FootTarget,
  GaitState,
  DroidKinematicState,
  LocomotionCommand,
  STANDING_HEIGHT,
} from '../types';
import { TwoBoneIK, IKResult } from '../ik/TwoBoneIK';
import { GaitParamsCalculator, DerivedGaitParameters } from './GaitParams';
import { GaitPhaseTracker } from './Phase';
import { FootPlanner, TerrainHeightSampler } from './FootPlanner';
import { CenterOfMassTrajectory } from '../body/CenterOfMass';
import { SecondaryMotion } from '../secondary/SecondaryMotion';
import { OffsetScalar, OffsetQuat } from '../../anim/math/inertialize';
import { eulerToQuaternion, RobotPose } from '@/lib/frames';
import { Quaternion } from 'three';

export interface GaitControllerSnapshot {
  posX: number;
  posZ: number;
  heading: number;
  prevCmdVx: number;
  prevCmdVy: number;
  currentGaitState: GaitState;
  stateTimer: number;
  hopActive: boolean;
  hopAltitude: number;
  hopVy: number;
  phase: { masterPhase: number; totalDistance: number; pattern: GaitPattern };
}

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

  // Robot Pose & Motion State
  private posX = 0;
  private posZ = 0;
  private heading = 0;
  private prevCmdVx = 0;
  private prevCmdVy = 0;
  private prevFinalY = STANDING_HEIGHT;
  private prevFinalPitch = 0;
  private prevFinalRoll = 0;
  private readonly linearVel: [number, number, number] = [0, 0, 0];
  private readonly angularVel: [number, number, number] = [0, 0, 0];
  private currentGaitState: GaitState = 'stand';
  private currentParams: DerivedGaitParameters;

  // Ballistic Hop State (exact kinematics: y += vy*dt - 0.5*g*dt^2, vy -= g*dt)
  private hopActive = false;
  private hopAltitude = 0;
  private hopVy = 0;
  private justLanded = false;
  private landingImpactSpeed = 0;

  // State timers
  private stateTimer = 0;
  private wasInFlight = false;

  // Preallocated scratch objects (strictly zero allocations in step())
  private readonly _rawQuat = new Quaternion();
  private readonly _outQuat = new Quaternion();
  private readonly _ikScratch: IKResult = {
    hipAngle: 0,
    thighAngle: 0,
    calfAngle: 0,
    isValid: true,
    reachDistance: 0,
  };
  private readonly _legPhases: Record<LegId, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };
  private readonly _bodyAcc: [number, number, number] = [0, 0, 0];

  // Reusable joint buffer & O(1) index map
  private readonly jointStates: JointState[] = [];
  private readonly jointIndexMap = new Map<string, number>();

  constructor(initialX = 0, initialZ = 0, initialHeading = 0, terrainSampler?: TerrainHeightSampler) {
    this.posX = initialX;
    this.posZ = initialZ;
    this.heading = initialHeading;

    const sampleH = terrainSampler || (() => 0.0);
    const groundY = sampleH(this.posX, this.posZ);
    this.prevFinalY = groundY + STANDING_HEIGHT;
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

  private initJointBuffer(): void {
    const legNames: LegId[] = ['FL', 'FR', 'RL', 'RR'];
    for (const leg of legNames) {
      const names = [`${leg}_hip_joint`, `${leg}_thigh_joint`, `${leg}_calf_joint`];
      for (const n of names) {
        this.jointIndexMap.set(n, this.jointStates.length);
        this.jointStates.push({
          name: n,
          angle: n.includes('calf') ? -0.85 : 0,
          velocity: 0,
          torque: 0,
        });
      }
    }
  }

  /**
   * Computes exact hop launch velocity (m/s) for a normalized charge in [0..1].
   */
  public static computeHopTakeoffVelocity(charge: number): number {
    const c = Math.max(0, Math.min(1, Number.isFinite(charge) ? charge : 0.5));
    return 0.85 + c * 1.15; // 0.85 m/s tap .. 2.00 m/s full charge
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
    const g = Math.max(0.2, Math.min(25.0, Number.isFinite(gravity) ? Math.abs(gravity) : 1.62));
    const cmdVx = Number.isFinite(command.vx) ? command.vx : 0;
    const cmdVy = Number.isFinite(command.vy) ? command.vy! : Number.isFinite(command.vz) ? command.vz! : 0;
    const cmdYawRate = Number.isFinite(command.yawRate) ? command.yawRate : 0;
    const bodyHeightNorm = Number.isFinite(command.bodyHeight)
      ? Math.max(0, Math.min(1, command.bodyHeight!))
      : 0.5;

    this.justLanded = false;
    this.landingImpactSpeed = 0;

    // 1. Heading and World Planar Position Integration (Single Frame Convention)
    // Forward = (+cos theta, 0, -sin theta), Right = (+sin theta, 0, +cos theta)
    this.heading += cmdYawRate * dt;
    const fwdX = Math.cos(this.heading);
    const fwdZ = -Math.sin(this.heading);
    const rightX = Math.sin(this.heading);
    const rightZ = Math.cos(this.heading);

    const worldVx = fwdX * cmdVx + rightX * cmdVy;
    const worldVz = fwdZ * cmdVx + rightZ * cmdVy;
    const planarSpeed = Math.hypot(cmdVx, cmdVy);
    const distDelta = planarSpeed * dt;

    this.posX += worldVx * dt;
    this.posZ += worldVz * dt;

    // 2. Ballistic Hop Integration (true projectile physics under live gravity g)
    if (command.hop && !this.hopActive) {
      this.hopActive = true;
      this.hopAltitude = 0.001;
      this.hopVy = GaitController.computeHopTakeoffVelocity(command.hopCharge ?? 0.5);
    }

    if (this.hopActive) {
      // Exact symplectic integration: y_next = y + v*dt - 0.5*g*dt^2, v_next = v - g*dt
      this.hopAltitude += this.hopVy * dt - 0.5 * g * dt * dt;
      this.hopVy -= g * dt;

      if (this.hopAltitude <= 0) {
        this.hopAltitude = 0;
        this.justLanded = true;
        this.landingImpactSpeed = Math.abs(this.hopVy);
        this.secondaryMotion.onLandingImpact(-this.landingImpactSpeed);
        this.hopVy = 0;
        this.hopActive = false;
      }
    }

    this.linearVel[0] = worldVx;
    this.linearVel[1] = this.hopActive ? this.hopVy : 0;
    this.linearVel[2] = worldVz;
    this.angularVel[0] = 0;
    this.angularVel[1] = cmdYawRate;
    this.angularVel[2] = 0;

    // 3. Froude Number & Dynamic Gait Parameters from live sim gravity
    this.currentParams = this.paramsCalc.calculate(planarSpeed, g);

    // Select gait pattern (respecting user override 0..4 with safe double-support transition)
    let desiredPattern: GaitPattern;
    if (command.gait && command.gait !== 'auto') {
      desiredPattern = command.gait;
    } else if (planarSpeed < 0.45) {
      desiredPattern = 'walk';
    } else if (this.currentParams.froudeNumber > 0.85 && planarSpeed > 1.35) {
      desiredPattern = 'bound';
    } else {
      desiredPattern = 'trot';
    }
    const patternSwitched = this.phaseTracker.requestPattern(desiredPattern, dt);

    // 4. State Machine Transitions with Inertialization
    let nextState = this.currentGaitState;
    const isStationary = planarSpeed < 0.03 && Math.abs(cmdYawRate) < 0.05;

    if (this.hopActive) {
      nextState = 'hop';
    } else if (command.stop) {
      nextState = 'stop';
      this.stateTimer = 0.2;
    } else if (isStationary) {
      if (
        this.currentGaitState === 'walk' ||
        this.currentGaitState === 'bound' ||
        this.currentGaitState === 'hop'
      ) {
        nextState = 'stop';
        this.stateTimer = 0.25;
      } else if (this.currentGaitState === 'stop') {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) nextState = 'stand';
      } else {
        nextState = 'stand';
      }
    } else if (planarSpeed < 0.03 && Math.abs(cmdYawRate) >= 0.05) {
      nextState = 'turnInPlace';
    } else if (this.currentGaitState === 'stand') {
      nextState = 'startWalk';
      this.stateTimer = 0.12; // 120ms anticipation crouch
    } else if (this.currentGaitState === 'startWalk') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        nextState = desiredPattern === 'bound' || desiredPattern === 'pronk' ? 'bound' : 'walk';
      }
    } else {
      nextState = desiredPattern === 'bound' || desiredPattern === 'pronk' ? 'bound' : 'walk';
    }

    if (nextState !== this.currentGaitState || patternSwitched) {
      this.currentGaitState = nextState;
      // Smoothly inertialize transition without zeroing motion
      this.heightOffset.trigger(this.prevFinalY, this.prevFinalY, 0, 0);
      this.pitchOffset.trigger(this.prevFinalPitch, this.prevFinalPitch, 0, 0);
      this.rollOffset.trigger(this.prevFinalRoll, this.prevFinalRoll, 0, 0);
    }

    // 5. Advance Distance-Driven Gait Phase (frozen during aerial hop flight)
    let masterPhase: number;
    if (this.hopActive) {
      masterPhase = this.phaseTracker.getMasterPhase();
    } else if (this.currentGaitState === 'turnInPlace') {
      masterPhase = this.phaseTracker.advanceTurnInPlace(cmdYawRate, dt);
    } else if (this.currentGaitState === 'stand' || this.currentGaitState === 'stop') {
      this.phaseTracker.settleToStand(dt, 0.12);
      masterPhase = this.phaseTracker.getMasterPhase();
    } else {
      masterPhase = this.phaseTracker.advance(distDelta, this.currentParams.strideLength);
    }

    this._legPhases.FL = this.phaseTracker.getLegPhase('FL');
    this._legPhases.FR = this.phaseTracker.getLegPhase('FR');
    this._legPhases.RL = this.phaseTracker.getLegPhase('RL');
    this._legPhases.RR = this.phaseTracker.getLegPhase('RR');

    // 6. Center-of-Mass, User Height Offset, Acceleration Lean, and Counter-Rotation
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

    const rawAx = (cmdVx - this.prevCmdVx) / Math.max(dt, 1e-4);
    const rawAyLat = (cmdVy - this.prevCmdVy) / Math.max(dt, 1e-4);
    const ax = Math.max(-4.0, Math.min(4.0, rawAx));
    const ayLat = Math.max(-3.0, Math.min(3.0, rawAyLat));
    this.prevCmdVx = cmdVx;
    this.prevCmdVy = cmdVy;

    // Clamped gravity-aware acceleration lean: atan(a / max(g, 1.5))
    const effG = Math.max(1.5, g);
    const accelPitchLean = Math.max(-0.06, Math.min(0.06, -Math.atan(ax / effG) * 0.08));
    const accelRollLean = Math.max(-0.06, Math.min(0.06, Math.atan(ayLat / effG) * 0.08));
    // Subtle torso yaw counter-rotation (~1.2 deg) coupled to diagonal swing phase (stays within L0 < 2.0 deg slip gate)
    const counterYaw =
      planarSpeed > 0.08 && !this.hopActive ? Math.sin(masterPhase) * 0.020 * Math.min(1, planarSpeed) : 0;

    // Secondary Motion (antenna lag, landing compression, idle breathing)
    const isFlightNow = this.hopActive || (this.currentParams.isBounding && com.verticalVelocity !== 0);
    if (this.wasInFlight && !isFlightNow && !this.justLanded) {
      this.secondaryMotion.onLandingImpact(com.verticalVelocity);
    }
    this.wasInFlight = isFlightNow;

    this._bodyAcc[0] = ax;
    this._bodyAcc[1] = this.hopActive ? -g : com.verticalVelocity;
    this._bodyAcc[2] = ayLat;

    const sec = this.secondaryMotion.update(this._bodyAcc, this.currentGaitState === 'stand', dt);

    // User crouch/stand height offset (0 -> -0.10m crouch, 0.5 -> 0, 1.0 -> +0.025m tall)
    const userHeightDelta = bodyHeightNorm < 0.5
      ? (bodyHeightNorm - 0.5) * 0.20
      : (bodyHeightNorm - 0.5) * 0.05;

    // Anticipation crouch on startWalk (subtle 6mm dip so legs stay athletic)
    const anticipationY = this.currentGaitState === 'startWalk' ? -0.006 : 0;
    const anticipationPitch = this.currentGaitState === 'startWalk' ? -0.02 : 0;

    // Hop pitch attitude (nose up during ascent, level at apex, slight nose down anticipating landing)
    const hopPitch = this.hopActive ? Math.max(-0.16, Math.min(0.18, this.hopVy * 0.12)) : 0;

    const dHeight = this.heightOffset.update(0.12, dt);
    const dPitch = this.pitchOffset.update(0.12, dt);
    const dRoll = this.rollOffset.update(0.12, dt);

    const groundUnderTorso = terrainSampler(this.posX, this.posZ);
    const rawGroundY = com.y + sec.landingHeightOffset + sec.idleHeightOffset + anticipationY + userHeightDelta + dHeight;
    // When grounded, keep nominal stance athletic (>= 0.376m) while permitting full user crouch down to 0.26m
    const minGroundHeight = bodyHeightNorm < 0.45 ? 0.26 : 0.376;
    const finalY = this.hopActive
      ? groundUnderTorso + STANDING_HEIGHT + this.hopAltitude + sec.landingHeightOffset
      : Math.max(groundUnderTorso + minGroundHeight, Math.min(groundUnderTorso + 0.405, rawGroundY));

    const finalPitch = com.pitch + sec.idlePitchOffset + anticipationPitch + accelPitchLean + hopPitch + dPitch;
    const finalRoll = com.roll + accelRollLean + dRoll;
    const finalYaw = com.yaw + counterYaw;

    this.prevFinalY = finalY;
    this.prevFinalPitch = finalPitch;
    this.prevFinalRoll = finalRoll;

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

    // 7. Foot Planning & Aerial Hop Tuck
    let feetTargets: FootTarget[];
    if (this.hopActive) {
      // Mid-air tuck & pre-landing leg extension
      const tuckFactor = this.hopVy > 0 ? Math.min(1, this.hopVy / 1.4) : Math.max(0, 1 - Math.abs(this.hopVy) / 1.4);
      const localFootY = -0.35 + tuckFactor * 0.11; // Tuck up 11cm at apex, extend before touchdown
      const legIds: LegId[] = ['FL', 'FR', 'RL', 'RR'];
      feetTargets = legIds.map((legId) => {
        const cfg = QUADRUPED_MORPHOLOGY[legId];
        const lx = cfg.hipOffset[0] + (cfg.isFront ? 0.03 * tuckFactor : -0.03 * tuckFactor);
        const ly = localFootY;
        const lz = cfg.hipOffset[2];
        const wx = this.posX + fwdX * lx + rightX * lz;
        const wz = this.posZ + fwdZ * lx + rightZ * lz;
        const wy = Math.max(terrainSampler(wx, wz) + 0.01, finalY + ly);
        return {
          id: legId,
          state: 'swing' as const,
          worldPos: [wx, wy, wz] as [number, number, number],
          localPos: [lx, ly, lz] as [number, number, number],
          contact: false,
          phase: 0.5,
          slipDistance: 0,
        };
      });
    } else {
      feetTargets = this.footPlanner.update(
        bodyPose,
        this.linearVel,
        this._legPhases,
        this.currentParams.dutyFactor,
        this.currentParams.swingHeight,
        terrainSampler,
        dt
      );
    }

    // 8. Solve 2-Bone Analytical IK for each leg (zero allocation)
    let contactCount = 0;
    for (let i = 0; i < feetTargets.length; i++) {
      const foot = feetTargets[i];
      if (foot.contact) contactCount++;
      const legId = foot.id;
      const config = QUADRUPED_MORPHOLOGY[legId];
      const solver = this.ikSolvers[legId];

      const relX = foot.localPos[0] - config.hipOffset[0];
      const relY = foot.localPos[1] - config.hipOffset[1];
      const relZ = foot.localPos[2] - config.hipOffset[2];

      const ik = solver.solve(relX, relY, relZ, config.isLeft, this._ikScratch);

      this.updateJoint(`${legId}_hip_joint`, ik.hipAngle, dt);
      this.updateJoint(`${legId}_thigh_joint`, ik.thighAngle, dt);
      this.updateJoint(`${legId}_calf_joint`, ik.calfAngle, dt);
    }

    const tiltMag = Math.hypot(finalPitch, finalRoll);
    const stabilityMargin = this.hopActive
      ? 0.25
      : Math.max(0, Math.min(1, (contactCount / 4) * 0.75 + (1 - Math.min(1, tiltMag / 0.5)) * 0.25));

    return {
      bodyPos: [this.posX, finalY, this.posZ],
      bodyQuat,
      bodyLinearVel: [this.linearVel[0], this.hopActive ? this.hopVy : com.verticalVelocity, this.linearVel[2]],
      bodyAngularVel: [this.angularVel[0], this.angularVel[1], this.angularVel[2]],
      gaitState: this.currentGaitState,
      gaitPattern: this.phaseTracker.getPattern(),
      froudeNumber: this.currentParams.froudeNumber,
      cadenceHz: this.currentParams.cadenceHz,
      dutyFactor: this.currentParams.dutyFactor,
      joints: this.jointStates,
      feet: feetTargets,
      hopActive: this.hopActive,
      hopAltitude: this.hopAltitude,
      justLanded: this.justLanded,
      landingImpactSpeed: this.landingImpactSpeed,
      antennaAngles: [sec.antennaDisplacement.x, sec.antennaDisplacement.z],
      stabilityMargin,
    };
  }

  private updateJoint(name: string, angle: number, dt: number): void {
    const idx = this.jointIndexMap.get(name);
    if (idx === undefined) return;
    const joint = this.jointStates[idx];
    const safeAngle = Number.isFinite(angle) ? Number(angle.toFixed(4)) : joint.angle;
    const vel = dt > 1e-5 ? (safeAngle - joint.angle) / dt : 0;
    joint.velocity = Number(vel.toFixed(3));
    joint.torque = Number((Math.abs(safeAngle) * 2.2 + Math.abs(vel) * 0.35).toFixed(3));
    joint.angle = safeAngle;
  }

  public getParams(): DerivedGaitParameters {
    return this.currentParams;
  }

  public getSnapshot(): GaitControllerSnapshot {
    return {
      posX: this.posX,
      posZ: this.posZ,
      heading: this.heading,
      prevCmdVx: this.prevCmdVx,
      prevCmdVy: this.prevCmdVy,
      currentGaitState: this.currentGaitState,
      stateTimer: this.stateTimer,
      hopActive: this.hopActive,
      hopAltitude: this.hopAltitude,
      hopVy: this.hopVy,
      phase: this.phaseTracker.serialize(),
    };
  }

  public restoreSnapshot(snap: GaitControllerSnapshot, terrainSampler: TerrainHeightSampler): void {
    this.posX = snap.posX;
    this.posZ = snap.posZ;
    this.heading = snap.heading;
    this.prevCmdVx = snap.prevCmdVx;
    this.prevCmdVy = snap.prevCmdVy;
    this.currentGaitState = snap.currentGaitState;
    this.stateTimer = snap.stateTimer;
    this.hopActive = snap.hopActive;
    this.hopAltitude = snap.hopAltitude;
    this.hopVy = snap.hopVy;
    this.phaseTracker.restore(snap.phase);
    this.heightOffset.reset();
    this.pitchOffset.reset();
    this.rollOffset.reset();
    this.quatOffset.reset();
    const pose: RobotPose = {
      position: [snap.posX, terrainSampler(snap.posX, snap.posZ) + STANDING_HEIGHT + snap.hopAltitude, snap.posZ],
      yaw: snap.heading,
      pitch: 0,
      roll: 0,
    };
    this.footPlanner.reset(pose, terrainSampler);
  }

  public reset(x = 0, z = 0, heading = 0, sampler: TerrainHeightSampler = () => 0): void {
    this.posX = x;
    this.posZ = z;
    this.heading = heading;
    this.prevCmdVx = 0;
    this.prevCmdVy = 0;
    this.currentGaitState = 'stand';
    this.hopActive = false;
    this.hopAltitude = 0;
    this.hopVy = 0;
    this.justLanded = false;
    this.landingImpactSpeed = 0;
    this.stateTimer = 0;
    this.phaseTracker.reset();
    this.comTrajectory.reset();
    this.secondaryMotion.reset();
    this.heightOffset.reset();
    this.pitchOffset.reset();
    this.rollOffset.reset();
    this.quatOffset.reset();
    const groundY = sampler(x, z);
    this.prevFinalY = groundY + STANDING_HEIGHT;
    this.prevFinalPitch = 0;
    this.prevFinalRoll = 0;
    const initialPose: RobotPose = {
      position: [x, groundY + STANDING_HEIGHT, z],
      yaw: heading,
      pitch: 0,
      roll: 0,
    };
    this.footPlanner.reset(initialPose, sampler);
  }
}
