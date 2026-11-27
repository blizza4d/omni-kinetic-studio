/**
 * Omni-Kinetic v2 Unified Deterministic Simulation Engine (`SimEngine.ts`)
 *
 * Single browser-native fixed-timestep (60 Hz) simulation engine unifying:
 * - TerrainService (single canonical heightfield shared with mesh, debris, radar, LiDAR)
 * - SimClock (single elapsed time & progress source across all UI surfaces)
 * - ControlArbiter + CommandShaper + InputManager (single typed command pipeline)
 * - GaitController (gravity-aware walk/trot/bound/pronk, hop ballistics, crouch, strafe, spin)
 * - DeterministicRecorder + ReplayCursor + Ghost pose sampling + Forking
 * - MissionRuntime (6 built-in missions, live objectives, deterministic medals & scoring)
 * - Render-time alpha interpolation (prevPose -> currPose, zero per-frame allocations)
 */

import { Quaternion } from 'three';
import { TelemetryFrame } from '@/contracts';
import { TerrainService } from '../world/terrain/service';
import { generateDebrisField, DebrisInstance } from '../world/debris';
import { evaluateBoundary, DEFAULT_ARENA } from '../world/bounds';
import { SimClock, SimClockSnapshot, EpisodeEndBehavior } from './SimClock';
import { EpisodeManager, EpisodeConfig, Episode, EpisodePhase } from './EpisodeManager';
import { createEpisodeAbortController } from './guard';
import { GaitController, GaitControllerSnapshot } from '../droid/gait/GaitController';
import { DroidKinematicState, STANDING_HEIGHT } from '../droid/types';
import { ControlArbiter } from '../control/arbiter';
import { CommandShaper, SafetyContext } from '../control/shape';
import { InputManager, InputVisualizerSnapshot } from '../control/inputs';
import { ShortcutRegistry } from '../control/shortcuts';
import {
  ControlSource,
  LocomotionCommand,
  ControlArbiterSnapshot,
  SafetyEvent,
  createNeutralCommand,
} from '../control/types';
import { purePursuit, computeObstacleAvoidanceYaw, ObstaclePoint, PursuitOut } from '../control/purePursuit';
import {
  DeterministicRecorder,
  ReplayCursor,
  ReplayFile,
  GhostSample,
  computeStateChecksum,
} from '../replay/recorder';
import {
  BUILT_IN_MISSIONS,
  MissionDefinition,
  MissionProgressSnapshot,
  MissionRuntime,
  getMissionById,
} from '../missions/missions';
import { ScenarioConfig, DEFAULT_SCENARIO_CONFIG } from '../scenario/sharing';
import { slerpShortest } from '../anim/math/quaternion';
import { globalEpisodeRecorder, DatasetControlSource } from '../dataset/episodeRecorder';
import { DEFAULT_ROBOT_PROFILE, getRobotProfile, RobotProfile, RobotProfileId } from '../robotics/profiles';
import { PerceptionStore } from '../perception/lidar';
import { TransientRoboticsStore } from '../telemetry/transientStore';
import { quaternionToEuler, Quaternion4 } from '../frames';
import { gaussian, mulberry32 } from './prng';

export interface InterpolatedDroidRenderState {
  time: number;
  step: number;
  pos: [number, number, number];
  quat: [number, number, number, number];
  vel: [number, number, number];
  yaw: number;
  speed: number;
  cmdSpeed: number;
  joints: Record<string, number>;
  jointTorques: Record<string, number>;
  wheelAngles?: [number, number, number, number];
  profileId?: RobotProfileId;
  feet: { id: string; pos: [number, number, number]; contact: boolean; slip: number }[];
  antennaAngles: [number, number];
  gaitState: string;
  gaitPattern: string;
  froudeNumber: number;
  hopActive: boolean;
  justLanded: boolean;
  landingImpactSpeed: number;
  stabilityMargin: number;
  tiltDeg: number;
  distanceToEdge: number;
  boundaryState: 'inside' | 'soft' | 'hard' | 'out';
}

export interface LidarRayHit {
  origin: [number, number, number];
  hitPoint: [number, number, number];
  dist: number;
  hit: boolean;
  isObstacle: boolean;
}

export interface ScriptedCommandStep {
  durationSteps: number;
  cmd: Partial<LocomotionCommand>;
}

export interface TelemetryChartSample {
  t: number;
  speed: number;
  cmdSpeed: number;
  energy: number;
  slip: number;
  tiltDeg: number;
  reward: number;
}

export class SimEngine {
  public readonly terrain: TerrainService;
  public readonly clock: SimClock;
  public readonly gait: GaitController;
  public readonly arbiter: ControlArbiter;
  public readonly shaper: CommandShaper;
  public readonly inputs: InputManager;
  public readonly recorder: DeterministicRecorder;
  public readonly missionRuntime: MissionRuntime;

  public scenario: ScenarioConfig;
  private debris: DebrisInstance[] = [];
  private hazardObstacles: ObstaclePoint[] = [];

  // Replay & Ghost state
  private replayCursor: ReplayCursor | null = null;
  private ghostCursor: ReplayCursor | null = null;

  // Scripted test queue
  private scriptQueue: { remaining: number; cmd: LocomotionCommand }[] = [];

  // Simulation metrics & telemetry chart buffer
  private energyJoules = 0;
  private distanceMeters = 0;
  private lastCollisionStep = -120;
  private lastInputLatencyMs = 0;
  private pendingLatencyInputMs = 0;
  private lastCmdSpeed = 0;
  private readonly chartHistory: TelemetryChartSample[] = [];
  private readonly maxChartSamples = 600;

  // Robot profile, Sim-to-Real Domain Physics & Hardware-in-the-Loop Digital Twin state
  private robotProfile: RobotProfile = DEFAULT_ROBOT_PROFILE;
  private wheelSpinAngles: [number, number, number, number] = [0, 0, 0, 0];
  private domainSlipDamping = 0.25;
  private domainMaxTorqueNm = DEFAULT_ROBOT_PROFILE.maxTorqueNm;
  private domainImuNoiseSigma = 0;
  private readonly noiseRng = mulberry32(99173);
  private domainLatencyMs = 0;
  private readonly cmdDelayBuffer: { vx: number; vy: number; yawRate: number }[] = [];
  private digitalTwinEnabled = false;
  // Autonomous Nemotron / Benchmark Waypoint Plan
  private autonomousWaypoints: { id: string; x: number; z: number; targetSpeed: number; tolerance: number }[] = [];
  private autonomousConstraints: { maxSpeed?: number; maxTiltDeg?: number } | null = null;
  private autonomousWpIndex = 0;
  private autonomousPlanCompleted = false;
  private prevYawRad = 0;
  private readonly _angVelOut: [number, number, number] = [0, 0, 0];

  // Digital Twin / Domain state
  private digitalTwinPose: {
    pos: [number, number, number];
    quat: [number, number, number, number];
    vel: [number, number, number];
    yaw: number;
    updatedMs: number;
  } | null = null;

  // Prev & Curr pose buffers for render-time alpha interpolation (zero allocations)
  private prevPos: [number, number, number] = [0, STANDING_HEIGHT, 0];
  private currPos: [number, number, number] = [0, STANDING_HEIGHT, 0];
  private prevQuat: [number, number, number, number] = [0, 0, 0, 1];
  private currQuat: [number, number, number, number] = [0, 0, 0, 1];
  private prevJoints: Record<string, number> = {};
  private currJoints: Record<string, number> = {};
  private currTorques: Record<string, number> = {};
  private latestKinematic: DroidKinematicState | null = null;
  private latestMissionSnap: MissionProgressSnapshot;

  // Preallocated scratch objects
  private readonly _policyCmd: LocomotionCommand = createNeutralCommand('auto');
  private readonly _manualCmd: LocomotionCommand = createNeutralCommand('auto');
  private readonly _arbitedCmd: LocomotionCommand = createNeutralCommand('auto');
  private readonly _shapedCmd: LocomotionCommand = createNeutralCommand('auto');
  private readonly _pursuitOut: PursuitOut = { vx: 0, yawRate: 0, reached: false, distToTarget: 0 };
  private readonly _qA = new Quaternion();
  private readonly _qB = new Quaternion();
  private readonly _qOut = new Quaternion();
  private readonly _safetyCtx: SafetyContext = {
    x: 0,
    z: 0,
    heading: 0,
    gravity: 1.62,
    tiltRad: 0,
    stabilityMargin: 1.0,
    step: 0,
    time: 0,
  };

  // Callbacks
  private onEpisodeComplete?: (missionSnap: MissionProgressSnapshot, replay: ReplayFile) => void;
  private onFrameCallback?: (frame: TelemetryFrame) => void;
  private episodeManager: EpisodeManager;
  private currentEpisodeAbort: AbortController = new AbortController();

  constructor(
    registry: ShortcutRegistry,
    options?: {
      scenario?: Partial<ScenarioConfig>;
      onToast?: (msg: string, level?: 'info' | 'warn') => void;
      onAction?: (actionId: string) => void;
      onEpisodeComplete?: (missionSnap: MissionProgressSnapshot, replay: ReplayFile) => void;
      onFrame?: (frame: TelemetryFrame) => void;
    }
  ) {
    this.scenario = { ...DEFAULT_SCENARIO_CONFIG, ...(options?.scenario || {}) };
    this.terrain = new TerrainService(this.scenario.seed, {
      fbmAmplitude: Math.max(0.2, this.scenario.roughness * 0.9),
      primaryCratersMax: Math.max(2, this.scenario.craterCount),
    });
    this.clock = new SimClock({
      fixedDt: 1 / 60,
      episodeLength: this.scenario.episodeLength,
      endBehavior: 'stop',
    });
    this.arbiter = new ControlArbiter();
    this.shaper = new CommandShaper();
    this.inputs = new InputManager(registry, undefined, {
      onToast: options?.onToast,
      onAction: options?.onAction,
    });
    this.recorder = new DeterministicRecorder();

    const mission =
      (this.scenario.missionId ? getMissionById(this.scenario.missionId) : undefined) ||
      BUILT_IN_MISSIONS[0];
    this.missionRuntime = new MissionRuntime(mission);

    this.gait = new GaitController(
      this.scenario.startPos[0],
      this.scenario.startPos[1],
      this.scenario.startHeading,
      (x, z) => this.terrain.heightAt(x, z)
    );

    this.episodeManager = new EpisodeManager((cfg: EpisodeConfig, id: number): Episode => {
      this.currentEpisodeAbort.abort('superseded');
      this.currentEpisodeAbort = new AbortController();
      const signal = this.currentEpisodeAbort.signal;
      let phase: EpisodePhase = 'running';

      return {
        id,
        config: cfg,
        signal,
        step: (dt: number) => {
          this.executeFixedStep(this.clock.getStep(), dt);
        },
        getPhase: () => (this.clock.isEnded() ? 'ended' : this.clock.isPaused() ? 'paused' : phase),
        setPhase: (p: EpisodePhase) => {
          phase = p;
          if (p === 'paused') this.clock.setPaused(true);
          else if (p === 'running') {
            if (this.clock.isEnded()) {
              this.clock.reset(false);
            }
            this.clock.setPaused(false);
          } else if (p === 'ended') {
            this.clock.seekToStep(Math.round(this.clock.getEpisodeLength() * 60));
          }
        },
        submitCommand: (cmd: LocomotionCommand) => {
          Object.assign(this._manualCmd, cmd);
        },
        dispose: () => {
          this.currentEpisodeAbort.abort('disposed');
        },
      };
    });

    this.onEpisodeComplete = options?.onEpisodeComplete;
    this.onFrameCallback = options?.onFrame;

    this.rebuildDebris();
    this.latestMissionSnap = this.missionRuntime.snapshot(
      this.scenario.startPos[0],
      this.scenario.startPos[1],
      this.scenario.startHeading
    );
    this.resetEpisode(false);
  }

  public getScenario(): ScenarioConfig {
    return { ...this.scenario };
  }

  public setGravity(gravityMps2: number): void {
    this.scenario.gravity = gravityMps2;
  }

  public getRobotProfile(): RobotProfile {
    return this.robotProfile;
  }

  public setRobotProfile(profileId: RobotProfileId): RobotProfile {
    const profile = getRobotProfile(profileId);
    this.robotProfile = profile;
    this.shaper.params.maxForward = profile.maxLinearVelMps;
    this.shaper.params.maxBackward = profile.maxBackwardVelMps;
    this.shaper.params.maxLateral = profile.maxLateralVelMps;
    this.shaper.params.maxYawRate = profile.maxAngularVelRadS;
    this.shaper.params.maxSafeTiltRad = (profile.safetyLimits.tiltCriticalDeg * Math.PI) / 180;
    this.domainMaxTorqueNm = profile.maxTorqueNm;
    PerceptionStore.getInstance().setLidarConfig({
      rayCount: profile.sensorMounts.lidar.defaultRays,
      fovDeg: profile.sensorMounts.lidar.defaultFovDeg,
      maxRangeM: profile.sensorMounts.lidar.defaultRangeM,
    });
    return profile;
  }

  public applyDomainPhysics(cfg: {
    gravityMps2?: number;
    frictionCoeff?: number;
    slipDamping?: number;
    maxTorqueNm?: number;
    imuNoiseSigma?: number;
    controlLatencyMs?: number;
  }): void {
    if (cfg.gravityMps2 !== undefined) {
      this.scenario.gravity = cfg.gravityMps2;
    }
    if (cfg.frictionCoeff !== undefined) {
      this.shaper.params.frictionMu = Math.max(0.1, Math.min(2.0, cfg.frictionCoeff));
    }
    if (cfg.slipDamping !== undefined) {
      this.domainSlipDamping = Math.max(0, Math.min(1.0, cfg.slipDamping));
    }
    if (cfg.maxTorqueNm !== undefined) {
      this.domainMaxTorqueNm = Math.max(5, Math.min(120, cfg.maxTorqueNm));
    }
    if (cfg.imuNoiseSigma !== undefined) {
      this.domainImuNoiseSigma = Math.max(0, Math.min(0.5, cfg.imuNoiseSigma));
    }
    if (cfg.controlLatencyMs !== undefined) {
      this.domainLatencyMs = Math.max(0, Math.min(350, cfg.controlLatencyMs));
      if (this.domainLatencyMs === 0) {
        this.cmdDelayBuffer.length = 0;
      }
    }
  }

  public getDomainPhysics() {
    return {
      gravityMps2: this.scenario.gravity,
      frictionCoeff: this.shaper.params.frictionMu,
      slipDamping: this.domainSlipDamping,
      maxTorqueNm: this.domainMaxTorqueNm,
      imuNoiseSigma: this.domainImuNoiseSigma,
      controlLatencyMs: this.domainLatencyMs,
    };
  }

  public setDigitalTwinEnabled(enabled: boolean): void {
    this.digitalTwinEnabled = enabled;
    if (!enabled) {
      this.digitalTwinPose = null;
    }
  }

  public isDigitalTwinEnabled(): boolean {
    return this.digitalTwinEnabled;
  }

  public applyDigitalTwinTelemetry(data: {
    x: number;
    y?: number;
    z: number;
    yaw?: number;
    quat?: [number, number, number, number];
    vx?: number;
    vy?: number;
    vz?: number;
  }): void {
    if (!this.digitalTwinEnabled) return;
    const samplerY = this.terrain.heightAt(data.x, data.z);
    const bodyY = data.y !== undefined ? data.y : samplerY + this.robotProfile.dimensions.standingHeightM;
    const yaw = data.yaw ?? 0;
    const q: [number, number, number, number] = data.quat ?? [
      0,
      Math.sin(yaw * 0.5),
      0,
      Math.cos(yaw * 0.5),
    ];
    this.digitalTwinPose = {
      pos: [data.x, bodyY, data.z],
      quat: q,
      vel: [data.vx ?? 0, data.vy ?? 0, data.vz ?? 0],
      yaw,
      updatedMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };
  }

  public getLastShapedCommand(): LocomotionCommand {
    return { ...this._shapedCmd };
  }

  public getDistanceMeters(): number {
    return this.distanceMeters;
  }

  public setAutonomousPlan(
    waypoints: { id: string; x: number; z: number; targetSpeed?: number; tolerance?: number }[],
    constraints?: { maxSpeed?: number; maxTiltDeg?: number }
  ): void {
    this.autonomousWaypoints = waypoints.map((w) => ({
      id: w.id,
      x: w.x,
      z: w.z,
      targetSpeed: w.targetSpeed ?? 1.05,
      tolerance: w.tolerance ?? 0.55,
    }));
    this.autonomousConstraints = constraints ?? null;
    this.autonomousWpIndex = 0;
    this.autonomousPlanCompleted = false;
  }

  public clearAutonomousPlan(): void {
    this.autonomousWaypoints = [];
    this.autonomousConstraints = null;
    this.autonomousWpIndex = 0;
    this.autonomousPlanCompleted = false;
  }

  public getAutonomousPlanState() {
    return {
      totalWaypoints: this.autonomousWaypoints.length,
      currentIndex: this.autonomousWpIndex,
      completed: this.autonomousPlanCompleted,
      active: this.autonomousWaypoints.length > 0 && !this.autonomousPlanCompleted,
      remainingWaypoints: this.autonomousWaypoints.slice(this.autonomousWpIndex),
    };
  }

  public getDebris(): readonly DebrisInstance[] {
    return this.debris;
  }

  public getHazardObstacles(): readonly ObstaclePoint[] {
    return this.hazardObstacles;
  }

  public getChartHistory(): readonly TelemetryChartSample[] {
    return this.chartHistory;
  }

  public getLastInputLatencyMs(): number {
    return this.lastInputLatencyMs;
  }

  public getMissionSnapshot(): MissionProgressSnapshot {
    return this.latestMissionSnap;
  }

  public getArbiterSnapshot(): ControlArbiterSnapshot {
    return this.arbiter.snapshot('POLICY v1');
  }

  public getClockSnapshot(): SimClockSnapshot {
    return this.clock.snapshot();
  }

  public getSafetyEvents(): readonly SafetyEvent[] {
    return this.shaper.getSafetyEvents();
  }

  public getLatestKinematic(): DroidKinematicState | null {
    return this.latestKinematic;
  }

  public getEpisodeManager(): EpisodeManager {
    return this.episodeManager;
  }

  public getInputVisualizer(): InputVisualizerSnapshot {
    return this.inputs.getVisualizerSnapshot();
  }

  public isReplayActive(): boolean {
    return this.replayCursor !== null;
  }

  public hasGhost(): boolean {
    return this.ghostCursor !== null;
  }

  public rebuildDebris(): void {
    const startX = this.scenario.startPos[0];
    const startZ = this.scenario.startPos[1];
    const nextGoal = this.missionRuntime.getMission().markers[0];
    this.debris = generateDebrisField(
      this.scenario.rockCount,
      [40, 40],
      this.scenario.seed,
      (x, z) => this.terrain.heightAt(x, z),
      {
        spawnPos: [startX, 0, startZ],
        goalPos: nextGoal ? [nextGoal.x, 0, nextGoal.z] : [14, 0, -10],
      }
    );

    const hazards: ObstaclePoint[] = [];
    for (const d of this.debris) {
      if (d.scale >= 0.44) {
        hazards.push({ x: d.x, z: d.z, radius: d.scale * 0.28 });
      }
    }
    for (const custom of this.scenario.customObstacles) {
      hazards.push({ x: custom.x, z: custom.z, radius: custom.radius });
    }
    this.hazardObstacles = hazards;
  }

  public applyScenario(next: Partial<ScenarioConfig>, regenerateTerrain = true): void {
    const seedChanged = next.seed !== undefined && next.seed !== this.scenario.seed;
    const terrainShapeChanged =
      (next.roughness !== undefined && next.roughness !== this.scenario.roughness) ||
      (next.craterCount !== undefined && next.craterCount !== this.scenario.craterCount);
    const rockChanged =
      (next.rockCount !== undefined && next.rockCount !== this.scenario.rockCount) ||
      next.customObstacles !== undefined;

    this.scenario = { ...this.scenario, ...next };
    this.clock.setEpisodeLength(this.scenario.episodeLength);

    if (regenerateTerrain && (seedChanged || terrainShapeChanged)) {
      this.terrain.regenerate(this.scenario.seed, {
        fbmAmplitude: Math.max(0.2, this.scenario.roughness * 0.9),
        primaryCratersMax: Math.max(2, this.scenario.craterCount),
      });
      this.rebuildDebris();
    } else if (rockChanged) {
      this.rebuildDebris();
    }
  }

  public loadMission(missionId: string): MissionDefinition | null {
    const mission = getMissionById(missionId);
    if (!mission) return null;
    this.missionRuntime.loadMission(mission);
    this.scenario = {
      ...this.scenario,
      missionId: mission.id,
      name: mission.title,
      seed: mission.seed,
      gravity: mission.gravity,
      rockCount: mission.rockCount,
      startPos: [mission.startPos[0], mission.startPos[1]],
      startHeading: mission.startHeading,
      episodeLength: mission.timeLimitSec,
    };
    this.terrain.regenerate(mission.seed, {
      fbmAmplitude: Math.max(0.2, this.scenario.roughness * 0.9),
      primaryCratersMax: Math.max(2, this.scenario.craterCount),
    });
    this.clock.setEpisodeLength(mission.timeLimitSec);
    this.rebuildDebris();
    this.resetEpisode(true);
    return mission;
  }

  public resetEpisode(incrementEpisode = false): void {
    this.replayCursor = null;
    this.inputs.onEpisodeStart();
    this.arbiter.reset();
    this.shaper.reset();
    this.shaper.clearSafetyEvents();
    this.clock.reset(incrementEpisode);
    this.missionRuntime.reset();
    this.energyJoules = 0;
    this.distanceMeters = 0;
    this.lastCollisionStep = -120;
    this.chartHistory.length = 0;
    this.cmdDelayBuffer.length = 0;
    this.wheelSpinAngles = [0, 0, 0, 0];
    this.autonomousWpIndex = 0;
    this.autonomousPlanCompleted = false;

    const sx = this.scenario.startPos[0];
    const sz = this.scenario.startPos[1];
    const sh = this.scenario.startHeading;
    const sampler = (x: number, z: number) => this.terrain.heightAt(x, z);
    this.gait.reset(sx, sz, sh, sampler);

    const groundY = sampler(sx, sz);
    this.prevPos = [sx, groundY + STANDING_HEIGHT, sz];
    this.currPos = [sx, groundY + STANDING_HEIGHT, sz];
    this.prevQuat = [0, Math.sin(sh * 0.5), 0, Math.cos(sh * 0.5)];
    this.currQuat = [0, Math.sin(sh * 0.5), 0, Math.cos(sh * 0.5)];

    this.recorder.start({
      seed: this.scenario.seed,
      gravity: this.scenario.gravity,
      scenarioId: this.scenario.name,
      scenarioVersion: this.scenario.v,
      missionId: this.scenario.missionId,
    });
    this.recorder.recordKeyframe({
      step: 0,
      gait: this.gait.getSnapshot(),
      energyJoules: 0,
      distanceMeters: 0,
    });

    this.latestMissionSnap = this.missionRuntime.snapshot(sx, sz, sh);

    this.episodeManager.start({
      seed: this.scenario.seed,
      scenarioId: this.scenario.name,
      episodeLength: this.scenario.episodeLength,
      gravity: this.scenario.gravity,
      missionId: this.scenario.missionId,
      roughness: this.scenario.roughness,
      craterCount: this.scenario.craterCount,
      rockCount: this.scenario.rockCount,
      startPos: this.scenario.startPos,
      startHeading: this.scenario.startHeading,
    });
  }

  // --- REPLAY & GHOST CONTROLS (Phase W6) ---

  public startReplay(replay: ReplayFile): void {
    // Load matching seed and gravity for bit-identical determinism
    if (replay.seed !== this.scenario.seed) {
      this.scenario.seed = replay.seed;
      this.terrain.regenerate(replay.seed, {
        fbmAmplitude: Math.max(0.2, this.scenario.roughness * 0.9),
        primaryCratersMax: Math.max(2, this.scenario.craterCount),
      });
      this.rebuildDebris();
    }
    this.scenario.gravity = replay.gravity;
    if (replay.missionId) {
      const m = getMissionById(replay.missionId);
      if (m) this.missionRuntime.loadMission(m);
    }

    this.resetEpisode(false);
    this.replayCursor = new ReplayCursor(replay);
    this.arbiter.setReplayActive(true);
    this.clock.setEpisodeLength(Math.max(10, replay.totalSteps / 60));
    this.clock.setPaused(false);
  }

  public setGhostReplay(replay: ReplayFile | null): void {
    this.ghostCursor = replay ? new ReplayCursor(replay) : null;
  }

  public getCurrentGhostPose(): GhostSample | null {
    if (!this.ghostCursor) return null;
    return this.ghostCursor.getGhostPoseAtStep(this.clock.getStep());
  }

  /**
   * Seek to an arbitrary step using nearest 2s keyframe snapshot + deterministic fast-forward.
   */
  public seekToStep(targetStep: number): void {
    const safeStep = Math.max(0, Math.floor(targetStep));
    const sampler = (x: number, z: number) => this.terrain.heightAt(x, z);

    const activeReplay = this.replayCursor;
    const kf = this.recorder.getNearestKeyframe(safeStep);

    if (kf && !activeReplay) {
      this.gait.restoreSnapshot(kf.gait, sampler);
      this.energyJoules = kf.energyJoules;
      this.distanceMeters = kf.distanceMeters;
      this.clock.seekToStep(kf.step);
    } else {
      // Deterministic rewind to step 0
      this.gait.reset(this.scenario.startPos[0], this.scenario.startPos[1], this.scenario.startHeading, sampler);
      this.shaper.reset();
      this.missionRuntime.reset();
      this.energyJoules = 0;
      this.distanceMeters = 0;
      this.clock.seekToStep(0);
    }

    // Fast-forward to exact targetStep
    while (this.clock.getStep() < safeStep) {
      this.executeFixedStep(this.clock.getStep(), this.clock.fixedDt);
      this.clock.seekToStep(this.clock.getStep() + 1);
    }
  }

  /**
   * "Take over from here": forks the active replay into live manual control at current step.
   */
  public takeOverFromReplay(): void {
    if (!this.replayCursor) return;
    const currentStep = this.clock.getStep();
    this.replayCursor = null;
    this.arbiter.setReplayActive(false);
    this.arbiter.takeManualControl('keyboard', this.clock.getElapsed());
    this.recorder.forkAtStep(currentStep);
    this.clock.setPaused(false);
  }

  /**
   * Enqueues scripted locomotion steps for automated verification (`window.__omniDebug.runScript`).
   */
  public runScript(steps: ScriptedCommandStep[]): void {
    this.scriptQueue = steps.map((s) => ({
      remaining: Math.max(1, Math.floor(s.durationSteps)),
      cmd: { ...createNeutralCommand('auto'), ...s.cmd },
    }));
    this.arbiter.setScriptActive(this.scriptQueue.length > 0);
  }

  /**
   * Advances simulation clock by frameDtSec, executing deterministic 60 Hz fixed steps.
   */
  public tick(frameDtSec: number): { stepsExecuted: number; alpha: number } {
    const res = this.clock.tick(
      frameDtSec,
      (stepIndex, dt) => this.executeFixedStep(stepIndex, dt),
      (behavior: EpisodeEndBehavior) => {
        if (behavior === 'stop') {
          this.episodeManager.end();
          this.onEpisodeComplete?.(this.latestMissionSnap, this.recorder.exportReplay());
        } else if (behavior === 'loop' || behavior === 'auto-restart') {
          const sampler = (x: number, z: number) => this.terrain.heightAt(x, z);
          this.gait.reset(this.scenario.startPos[0], this.scenario.startPos[1], this.scenario.startHeading, sampler);
          this.shaper.reset();
          this.missionRuntime.reset();
        }
      }
    );
    return { stepsExecuted: res.stepsExecuted, alpha: res.alpha };
  }

  /**
   * Single deterministic 60 Hz simulation step (ZERO per-frame heap churn on hot path).
   */
  public executeFixedStep(stepIndex: number, dt: number): DroidKinematicState {
    // 1. Shift current pose into prev pose for render-time alpha interpolation
    this.prevPos[0] = this.currPos[0];
    this.prevPos[1] = this.currPos[1];
    this.prevPos[2] = this.currPos[2];
    this.prevQuat[0] = this.currQuat[0];
    this.prevQuat[1] = this.currQuat[1];
    this.prevQuat[2] = this.currQuat[2];
    this.prevQuat[3] = this.currQuat[3];
    for (const k in this.currJoints) {
      this.prevJoints[k] = this.currJoints[k];
    }

    const snap = this.gait.getSnapshot();
    const rx = snap.posX;
    const rz = snap.posZ;
    const rHeading = snap.heading;
    const nowSec = stepIndex * dt;

    // 2. Compute autonomous Policy v1 command (autonomous plan waypoints OR mission marker / default goal)
    let nextMarker = null as ReturnType<MissionRuntime['getNextMarker']>;
    if (this.autonomousWaypoints.length > 0) {
      if (this.autonomousPlanCompleted || this.autonomousWpIndex >= this.autonomousWaypoints.length) {
        this._policyCmd.vx = 0;
        this._policyCmd.vy = 0;
        this._policyCmd.yawRate = 0;
        this._policyCmd.bodyHeight = 0.5;
        this._policyCmd.gait = 'auto';
        this._policyCmd.hop = false;
        this._policyCmd.hopCharge = 0;
        this._policyCmd.stop = false;
      } else {
        const wp = this.autonomousWaypoints[this.autonomousWpIndex]!;
        const distWp = Math.hypot(wp.x - rx, wp.z - rz);
        if (distWp <= wp.tolerance) {
          this.autonomousWpIndex++;
          if (this.autonomousWpIndex >= this.autonomousWaypoints.length) {
            this.autonomousPlanCompleted = true;
          }
        }
        if (this.autonomousPlanCompleted) {
          this._policyCmd.vx = 0;
          this._policyCmd.vy = 0;
          this._policyCmd.yawRate = 0;
        } else {
          const targetWp = this.autonomousWaypoints[this.autonomousWpIndex]!;
          const maxSpd = this.autonomousConstraints?.maxSpeed ?? targetWp.targetSpeed;
          const effSpeed = Math.min(targetWp.targetSpeed, maxSpd);
          purePursuit(rx, rz, rHeading, targetWp.x, targetWp.z, effSpeed, 1.35, targetWp.tolerance, this._pursuitOut);
          const avoidYaw = computeObstacleAvoidanceYaw(rx, rz, rHeading, this.hazardObstacles, 2.0);
          const slopeNowDeg = this.terrain.slopeDegAt(rx, rz);
          const maxPlanTilt = this.autonomousConstraints?.maxTiltDeg ?? 30;
          const tiltScale = slopeNowDeg > maxPlanTilt ? 0.35 : 1.0;
          this._policyCmd.vx = this._pursuitOut.reached ? 0 : this._pursuitOut.vx * tiltScale;
          this._policyCmd.vy = 0;
          this._policyCmd.yawRate = this._pursuitOut.reached
            ? 0
            : Math.max(-2.0, Math.min(2.0, this._pursuitOut.yawRate + avoidYaw));
        }
        this._policyCmd.bodyHeight = 0.5;
        this._policyCmd.gait = 'auto';
        this._policyCmd.hop = false;
        this._policyCmd.hopCharge = 0.55;
        this._policyCmd.stop = false;
      }
    } else {
      nextMarker = this.missionRuntime.getNextMarker(rx, rz);
      const goalX = nextMarker ? nextMarker.x : 14.0;
      const goalZ = nextMarker ? nextMarker.z : -10.0;

      purePursuit(rx, rz, rHeading, goalX, goalZ, 1.05, 1.3, 0.7, this._pursuitOut);
      const avoidYaw = computeObstacleAvoidanceYaw(rx, rz, rHeading, this.hazardObstacles, 2.0);
      this._policyCmd.vx = this._pursuitOut.reached ? 0 : this._pursuitOut.vx;
      this._policyCmd.vy = 0;
      this._policyCmd.yawRate = this._pursuitOut.reached
        ? 0
        : Math.max(-2.0, Math.min(2.0, this._pursuitOut.yawRate + avoidYaw));
      this._policyCmd.bodyHeight = 0.5;
      this._policyCmd.gait = 'auto';
      this._policyCmd.hop = Boolean(nextMarker?.requireHop && this._pursuitOut.distToTarget < 2.3 && !snap.hopActive);
      this._policyCmd.hopCharge = 0.55;
      this._policyCmd.stop = false;
    }

    // 3. Poll all manual input sources
    const polled = this.inputs.poll(rx, rz, rHeading, this.hazardObstacles, dt, this._manualCmd);
    const viz = this.inputs.getVisualizerSnapshot();
    if (viz.lastInputTimestampMs > this.pendingLatencyInputMs) {
      this.pendingLatencyInputMs = viz.lastInputTimestampMs;
    }

    // 4. Resolve Replay / Script override if active
    let overrideCmd: LocomotionCommand | undefined = undefined;
    if (this.replayCursor) {
      const recFrame = this.replayCursor.getCommandAtStep(stepIndex);
      if (recFrame) {
        overrideCmd = recFrame.cmd;
      } else {
        // End of replay
        this.clock.setPaused(true);
      }
    } else if (this.scriptQueue.length > 0) {
      const head = this.scriptQueue[0];
      overrideCmd = head.cmd;
      head.remaining--;
      if (head.remaining <= 0) {
        this.scriptQueue.shift();
        if (this.scriptQueue.length === 0) {
          this.arbiter.setScriptActive(false);
        }
      }
    }

    // 5. Arbitrate winning command
    const arbitrated = this.arbiter.resolve(
      this._policyCmd,
      polled.cmd,
      polled.source,
      polled.hasActiveInput,
      nowSec,
      dt,
      this._arbitedCmd,
      overrideCmd
    );

    // 6. Shape command through gravity-aware traction limits & arena safety layer
    // For replay, commands were already shaped when recorded, but passing through validation still guards NaN
    this._safetyCtx.x = rx;
    this._safetyCtx.z = rz;
    this._safetyCtx.heading = rHeading;
    this._safetyCtx.gravity = this.scenario.gravity;
    this._safetyCtx.tiltRad = (this.terrain.slopeDegAt(rx, rz) * Math.PI) / 180;
    this._safetyCtx.stabilityMargin = this.latestKinematic?.stabilityMargin ?? 1.0;
    this._safetyCtx.step = stepIndex;
    this._safetyCtx.time = nowSec;

    const shaped = this.replayCursor
      ? arbitrated.cmd
      : this.shaper.shape(arbitrated.cmd, this._safetyCtx, dt, this._shapedCmd);

    // Non-holonomic 4WD differential constraint + slope traction + optional domain transport delay
    const curSlopeDeg = this.terrain.slopeDegAt(rx, rz);
    const slopeTractionFactor = Math.max(
      0.35,
      Math.min(1.0, (this.shaper.params.frictionMu / 0.8) * Math.cos((curSlopeDeg * Math.PI) / 180))
    );
    const applySlopeTraction =
      curSlopeDeg > 18 || this.shaper.params.frictionMu < 0.78 || this.robotProfile.id !== 'quadruped_scout';

    let execVx = applySlopeTraction ? shaped.vx * slopeTractionFactor : shaped.vx;
    let execVy =
      this.robotProfile.locomotionType === 'differential_4wd'
        ? 0
        : applySlopeTraction
        ? shaped.vy * slopeTractionFactor
        : shaped.vy;
    let execYawRate = shaped.yawRate;
    const execHop = this.robotProfile.locomotionType === 'differential_4wd' ? false : shaped.hop;

    if (this.domainLatencyMs > 0 && !shaped.stop && !this.replayCursor) {
      const delaySteps = Math.max(1, Math.round(this.domainLatencyMs / (dt * 1000)));
      this.cmdDelayBuffer.push({ vx: execVx, vy: execVy, yawRate: execYawRate });
      if (this.cmdDelayBuffer.length > delaySteps) {
        const delayed = this.cmdDelayBuffer.shift()!;
        execVx = delayed.vx;
        execVy = delayed.vy;
        execYawRate = delayed.yawRate;
      } else {
        execVx = 0;
        execVy = 0;
        execYawRate = 0;
      }
    }

    this.lastCmdSpeed = Math.hypot(execVx, execVy);

    // 7. Step GaitController on canonical TerrainService
    const sampler = (x: number, z: number) => this.terrain.heightAt(x, z);
    const kin = this.gait.step(
      {
        vx: execVx,
        vy: execVy,
        yawRate: execYawRate,
        bodyHeight: shaped.bodyHeight,
        gait: shaped.gait,
        hop: execHop,
        hopCharge: shaped.hopCharge,
        stop: shaped.stop,
        mode: arbitrated.source === 'policy' ? 'policy' : 'teleop',
      },
      this.scenario.gravity,
      sampler,
      dt
    );
    this.latestKinematic = kin;

    // Differential 4WD wheel rotation integration
    if (this.robotProfile.locomotionType === 'differential_4wd') {
      const wr = Math.max(0.05, this.robotProfile.wheelRadiusM);
      const halfTrack = this.robotProfile.trackWidthM * 0.5;
      const vLeft = shaped.stop ? 0 : kin.bodyLinearVel[0] * Math.cos(rHeading) - kin.bodyLinearVel[2] * Math.sin(rHeading) - execYawRate * halfTrack;
      const vRight = shaped.stop ? 0 : kin.bodyLinearVel[0] * Math.cos(rHeading) - kin.bodyLinearVel[2] * Math.sin(rHeading) + execYawRate * halfTrack;
      this.wheelSpinAngles[0] += (vLeft / wr) * dt;
      this.wheelSpinAngles[1] += (vRight / wr) * dt;
      this.wheelSpinAngles[2] += (vLeft / wr) * dt;
      this.wheelSpinAngles[3] += (vRight / wr) * dt;
    }

    // Measure input-to-motion latency when manual velocity begins changing
    if (
      this.pendingLatencyInputMs > 0 &&
      typeof performance !== 'undefined' &&
      (Math.hypot(shaped.vx, shaped.vy) > 0.02 || Math.abs(shaped.yawRate) > 0.02 || shaped.hop)
    ) {
      const deltaMs = performance.now() - this.pendingLatencyInputMs;
      if (deltaMs >= 0 && deltaMs < 1000) {
        this.lastInputLatencyMs = Number(deltaMs.toFixed(1));
      }
      this.pendingLatencyInputMs = 0;
    }

    // Trigger gamepad haptics on hop landing
    if (kin.justLanded) {
      this.inputs.triggerHaptics(Math.min(0.8, (kin.landingImpactSpeed ?? 0.5) * 0.4), 0.3, 110);
    }

    // 8. Update curr interpolation buffers (Digital Twin inbound pose takes precedence when live)
    if (this.digitalTwinEnabled && this.digitalTwinPose) {
      this.currPos[0] = this.digitalTwinPose.pos[0];
      this.currPos[1] = this.digitalTwinPose.pos[1];
      this.currPos[2] = this.digitalTwinPose.pos[2];
      this.currQuat[0] = this.digitalTwinPose.quat[0];
      this.currQuat[1] = this.digitalTwinPose.quat[1];
      this.currQuat[2] = this.digitalTwinPose.quat[2];
      this.currQuat[3] = this.digitalTwinPose.quat[3];
    } else {
      this.currPos[0] = kin.bodyPos[0];
      this.currPos[1] = kin.bodyPos[1];
      this.currPos[2] = kin.bodyPos[2];
      this.currQuat[0] = kin.bodyQuat[0];
      this.currQuat[1] = kin.bodyQuat[1];
      this.currQuat[2] = kin.bodyQuat[2];
      this.currQuat[3] = kin.bodyQuat[3];
    }
    for (let i = 0; i < kin.joints.length; i++) {
      const j = kin.joints[i];
      this.currJoints[j.name] = j.angle;
      const rawT = j.torque ?? 0;
      this.currTorques[j.name] = Math.max(-this.domainMaxTorqueNm, Math.min(this.domainMaxTorqueNm, rawT));
    }

    // Ground-contact suspension clamping (prevents terrain penetration on steep crater rims)
    const groundYUnderBody = sampler(this.currPos[0], this.currPos[2]);
    const minSuspensionY = groundYUnderBody + Math.min(0.14, this.robotProfile.dimensions.clearanceM * 0.65);
    let suspensionClamped = false;
    if (this.currPos[1] < minSuspensionY) {
      this.currPos[1] = minSuspensionY;
      suspensionClamped = true;
    }

    // Write high-frequency 60 Hz state to non-reactive transient store (zero React re-renders)
    let slipSum = 0;
    let contactCount = 0;
    for (let i = 0; i < kin.feet.length; i++) {
      slipSum += kin.feet[i]!.slipDistance;
      if (kin.feet[i]!.contact || this.robotProfile.locomotionType === 'differential_4wd') {
        contactCount++;
      }
    }
    const avgWheelSlip = kin.feet.length > 0 ? slipSum / kin.feet.length : 0;
    const qTuple: Quaternion4 = [this.currQuat[0], this.currQuat[1], this.currQuat[2], this.currQuat[3]];
    const [eYawRad, ePitchRad, eRollRad] = quaternionToEuler(qTuple);
    const toDeg = 180 / Math.PI;
    let dYaw = eYawRad - this.prevYawRad;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    this.prevYawRad = eYawRad;
    this._angVelOut[0] = Number((eRollRad * 2.0 * toDeg).toFixed(2));
    this._angVelOut[1] = Number((ePitchRad * 2.0 * toDeg).toFixed(2));
    this._angVelOut[2] = Number(((dYaw / Math.max(1e-4, dt)) * toDeg).toFixed(2));

    TransientRoboticsStore.getInstance().writePhysicsFrame({
      timestampMs: Math.round(nowSec * 1000),
      step: stepIndex,
      pos: this.currPos,
      quat: this.currQuat,
      vel: kin.bodyLinearVel,
      angVelDegS: this._angVelOut,
      pitchDeg: Number((ePitchRad * toDeg).toFixed(2)),
      rollDeg: Number((eRollRad * toDeg).toFixed(2)),
      yawDeg: Number((eYawRad * toDeg).toFixed(2)),
      wheelSlip: Number(avgWheelSlip.toFixed(4)),
      slopeDeg: Number(curSlopeDeg.toFixed(2)),
      slopeTractionFactor: Number(slopeTractionFactor.toFixed(3)),
      groundContactCount: contactCount,
      suspensionClamped,
      gravityMps2: this.scenario.gravity,
      eStopActive: this.arbiter.snapshot().emergencyStop,
    });

    // 9. Collision detection against hazard boulders & custom obstacles
    const collisionBodyRadius = this.robotProfile.id === 'quadruped_scout' ? 0.32 : this.robotProfile.dimensions.widthM * 0.68;
    let collided = false;
    for (let i = 0; i < this.hazardObstacles.length; i++) {
      const obs = this.hazardObstacles[i];
      const d = Math.hypot(this.currPos[0] - obs.x, this.currPos[2] - obs.z);
      if (d < obs.radius + collisionBodyRadius && !kin.hopActive) {
        if (stepIndex - this.lastCollisionStep > 45) {
          collided = true;
          this.lastCollisionStep = stepIndex;
        }
        break;
      }
    }

    // 10. Energy, Distance, Boundary & Mission evaluation
    const speed = Math.hypot(kin.bodyLinearVel[0], kin.bodyLinearVel[2]);
    const energyDelta = (0.35 + speed * 0.55 + (shaped.hop ? 2.2 : 0)) * dt;
    this.energyJoules += energyDelta;
    this.distanceMeters += speed * dt;

    const bCheck = evaluateBoundary(kin.bodyPos[0], kin.bodyPos[1], kin.bodyPos[2], DEFAULT_ARENA);
    const tiltDeg = Math.abs(
      Math.asin(Math.max(-1, Math.min(1, 2 * (kin.bodyQuat[3] * kin.bodyQuat[0] - kin.bodyQuat[2] * kin.bodyQuat[1])))) *
        (180 / Math.PI)
    );

    if (!this.replayCursor) {
      this.latestMissionSnap = this.missionRuntime.step({
        x: kin.bodyPos[0],
        z: kin.bodyPos[2],
        heading: this.gait.getSnapshot().heading,
        speed,
        tiltDeg,
        hopActive: Boolean(kin.hopActive),
        collided,
        edgeWarn: bCheck.state === 'soft' || bCheck.state === 'hard',
        fallen: kin.gaitState === 'fallen',
        energyDeltaJ: energyDelta,
        dt,
      });

      if (this.latestMissionSnap.status !== 'running' && !this.clock.isEnded()) {
        this.clock.setPaused(true);
        this.onEpisodeComplete?.(this.latestMissionSnap, this.recorder.exportReplay());
      }

      // Record deterministic command frame & 2s keyframes
      this.recorder.recordStep(
        stepIndex,
        arbitrated.source,
        shaped,
        kin.bodyPos,
        kin.bodyQuat,
        kin.joints
      );
      if (stepIndex > 0 && stepIndex % 120 === 0) {
        this.recorder.recordKeyframe({
          step: stepIndex,
          gait: this.gait.getSnapshot(),
          energyJoules: this.energyJoules,
          distanceMeters: this.distanceMeters,
        });
      }
    }

    // 11. Sample live telemetry chart buffer at 10 Hz (every 6 steps)
    if (stepIndex % 6 === 0) {
      let maxSlip = 0;
      for (let i = 0; i < kin.feet.length; i++) {
        if (kin.feet[i].slipDistance > maxSlip) maxSlip = kin.feet[i].slipDistance;
      }
      const stepReward = Number((speed * 1.4 - (collided ? 3.0 : 0) - energyDelta * 0.2).toFixed(3));
      this.chartHistory.push({
        t: Number(nowSec.toFixed(2)),
        speed: Number(speed.toFixed(3)),
        cmdSpeed: Number(this.lastCmdSpeed.toFixed(3)),
        energy: Number(this.energyJoules.toFixed(2)),
        slip: Number((maxSlip * 1000).toFixed(2)), // mm
        tiltDeg: Number(tiltDeg.toFixed(1)),
        reward: stepReward,
      });
      if (this.chartHistory.length > this.maxChartSamples) {
        this.chartHistory.shift();
      }
    }

    // 12. Optional TelemetryFrame callback (keeps TelemetryStore & Analytics Tabs live)
    if (this.onFrameCallback && stepIndex % 2 === 0) {
      const nX = this.domainImuNoiseSigma > 0 ? gaussian(this.noiseRng, 0, this.domainImuNoiseSigma) : 0;
      const nZ = this.domainImuNoiseSigma > 0 ? gaussian(this.noiseRng, 0, this.domainImuNoiseSigma) : 0;
      const activeVel: [number, number, number] =
        this.digitalTwinEnabled && this.digitalTwinPose
          ? [this.digitalTwinPose.vel[0], this.digitalTwinPose.vel[1], this.digitalTwinPose.vel[2]]
          : [kin.bodyLinearVel[0] + nX, kin.bodyLinearVel[1], kin.bodyLinearVel[2] + nZ];

      const frame: TelemetryFrame = {
        schemaVersion: '4.0',
        seq: stepIndex,
        dt: Number(dt.toFixed(4)),
        t: Number(nowSec.toFixed(4)),
        episode: this.clock.getEpisodeNumber(),
        iteration: 2,
        bodies: [
          {
            id: 'torso',
            pos: [this.currPos[0], this.currPos[1], this.currPos[2]],
            quat: [this.currQuat[0], this.currQuat[1], this.currQuat[2], this.currQuat[3]],
            vel: activeVel,
          },
        ],
        joints: kin.joints.map((j) => ({
          name: j.name,
          angle: j.angle,
          velocity: j.velocity,
          torque: this.currTorques[j.name] ?? j.torque,
        })),
        feet: kin.feet.map((f) => ({
          id: f.id,
          pos: [f.worldPos[0], f.worldPos[1], f.worldPos[2]],
          contact: this.robotProfile.locomotionType === 'differential_4wd' ? true : f.contact,
        })),
        bodyHeightAboveGround: Number((this.currPos[1] - sampler(this.currPos[0], this.currPos[2])).toFixed(3)),
        slopeUnderBody: Number(tiltDeg.toFixed(2)),
        gait: {
          phase: Number(this.gait.getSnapshot().phase.masterPhase.toFixed(3)),
          speed: Number(speed.toFixed(3)),
          cmdSpeed: Number(this.lastCmdSpeed.toFixed(3)),
        },
        reward: Number((speed * 1.4 - (collided ? 3.0 : 0)).toFixed(3)),
        rewardComponents: {
          progress: Number((speed * 1.4).toFixed(3)),
          forward: Number((shaped.vx * 1.2).toFixed(3)),
          stability: Number(((kin.stabilityMargin ?? 1) * 0.8).toFixed(3)),
          energy: Number((-energyDelta * 0.25).toFixed(3)),
          collision: collided ? -3.0 : 0,
          collision_penalty: collided ? -3.0 : 0,
          boundary_penalty: bCheck.state === 'soft' || bCheck.state === 'hard' ? -1.5 : 0,
          goal_bonus: nextMarker ? Number(Math.max(0, (20 - this._pursuitOut.distToTarget) * 0.05).toFixed(3)) : 0,
        },
        collisions: collided
          ? [{ a: 'chassis', b: 'boulder', point: [this.currPos[0], this.currPos[1] - 0.2, this.currPos[2]], impulse: 3.0 }]
          : [],
        goalDistance: Number((this._pursuitOut.distToTarget ?? 0).toFixed(2)),
        energy: Number(this.energyJoules.toFixed(2)),
        boundary: {
          state: bCheck.state,
          distanceToEdge: bCheck.distanceToEdge,
        },
        valid: true,
        status: collided ? 'collision' : 'running',
      };
      this.onFrameCallback(frame);

      if (globalEpisodeRecorder.getIsRecording() && frame.seq % 2 === 0) {
        const currentSource = this.arbiter.getActiveSource();
        const datasetSource: DatasetControlSource =
          currentSource === 'cv'
            ? 'gesture'
            : currentSource === 'keyboard'
            ? 'keyboard'
            : currentSource === 'pointer' || this.autonomousWaypoints.length > 0
            ? 'nemotron'
            : 'manual';
        const perception = PerceptionStore.getInstance();
        const pCfg = perception.getLidarConfig();
        let ranges = perception.getLatestLidarRanges();
        if (!ranges || ranges.length !== pCfg.rayCount) {
          ranges = this.computeLidarScan(pCfg.rayCount, pCfg.maxRangeM, (pCfg.fovDeg * Math.PI) / 180).map((h) => h.dist);
        }
        globalEpisodeRecorder.recordStep(frame, shaped, datasetSource, collided, ranges);
      }
    }

    return kin;
  }

  /**
   * Produces alpha-interpolated render state between prevPos/prevQuat and currPos/currQuat
   * (zero allocations when `out` is reused).
   */
  public sampleRenderState(alpha: number, out: InterpolatedDroidRenderState): InterpolatedDroidRenderState {
    const a = Math.max(0, Math.min(1, alpha));
    out.pos[0] = this.prevPos[0] + (this.currPos[0] - this.prevPos[0]) * a;
    out.pos[1] = this.prevPos[1] + (this.currPos[1] - this.prevPos[1]) * a;
    out.pos[2] = this.prevPos[2] + (this.currPos[2] - this.prevPos[2]) * a;

    this._qA.set(this.prevQuat[0], this.prevQuat[1], this.prevQuat[2], this.prevQuat[3]);
    this._qB.set(this.currQuat[0], this.currQuat[1], this.currQuat[2], this.currQuat[3]);
    slerpShortest(this._qA, this._qB, a, this._qOut);

    out.quat[0] = this._qOut.x;
    out.quat[1] = this._qOut.y;
    out.quat[2] = this._qOut.z;
    out.quat[3] = this._qOut.w;
    out.yaw = Math.atan2(
      2 * (this._qOut.w * this._qOut.y + this._qOut.x * this._qOut.z),
      1 - 2 * (this._qOut.y * this._qOut.y + this._qOut.z * this._qOut.z)
    );

    for (const k in this.currJoints) {
      const pVal = this.prevJoints[k] ?? this.currJoints[k];
      out.joints[k] = pVal + (this.currJoints[k] - pVal) * a;
      out.jointTorques[k] = this.currTorques[k] ?? 0;
    }

    const kin = this.latestKinematic;
    out.time = this.clock.getElapsed();
    out.step = this.clock.getStep();
    if (kin) {
      out.vel[0] = kin.bodyLinearVel[0];
      out.vel[1] = kin.bodyLinearVel[1];
      out.vel[2] = kin.bodyLinearVel[2];
      out.speed = Math.hypot(kin.bodyLinearVel[0], kin.bodyLinearVel[2]);
      out.cmdSpeed = this.lastCmdSpeed;
      out.gaitState = kin.gaitState;
      out.gaitPattern = kin.gaitPattern ?? 'trot';
      out.froudeNumber = kin.froudeNumber;
      out.hopActive = Boolean(kin.hopActive);
      out.justLanded = Boolean(kin.justLanded);
      out.landingImpactSpeed = kin.landingImpactSpeed ?? 0;
      out.stabilityMargin = kin.stabilityMargin ?? 1.0;
      out.antennaAngles[0] = kin.antennaAngles?.[0] ?? 0;
      out.antennaAngles[1] = kin.antennaAngles?.[1] ?? 0;
      out.tiltDeg = Math.abs(
        Math.asin(Math.max(-1, Math.min(1, 2 * (out.quat[3] * out.quat[0] - out.quat[2] * out.quat[1])))) *
          (180 / Math.PI)
      );

      for (let i = 0; i < kin.feet.length; i++) {
        const f = kin.feet[i];
        if (!out.feet[i]) {
          out.feet[i] = { id: f.id, pos: [f.worldPos[0], f.worldPos[1], f.worldPos[2]], contact: f.contact, slip: f.slipDistance };
        } else {
          out.feet[i].id = f.id;
          out.feet[i].pos[0] = f.worldPos[0];
          out.feet[i].pos[1] = f.worldPos[1];
          out.feet[i].pos[2] = f.worldPos[2];
          out.feet[i].contact = f.contact;
          out.feet[i].slip = f.slipDistance;
        }
      }
    }

    out.profileId = this.robotProfile.id;
    if (!out.wheelAngles) {
      out.wheelAngles = [this.wheelSpinAngles[0], this.wheelSpinAngles[1], this.wheelSpinAngles[2], this.wheelSpinAngles[3]];
    } else {
      out.wheelAngles[0] = this.wheelSpinAngles[0];
      out.wheelAngles[1] = this.wheelSpinAngles[1];
      out.wheelAngles[2] = this.wheelSpinAngles[2];
      out.wheelAngles[3] = this.wheelSpinAngles[3];
    }

    const bCheck = evaluateBoundary(out.pos[0], out.pos[1], out.pos[2], DEFAULT_ARENA);
    out.distanceToEdge = bCheck.distanceToEdge;
    out.boundaryState = bCheck.state;
    return out;
  }

  /**
   * Computes a fan of LiDAR rays against the canonical TerrainService and hazard boulders (Phase W9.1 + Phase 2).
   */
  public computeLidarScan(rayCount = 24, maxRange = 14.0, fovRad = Math.PI * 0.85): LidarRayHit[] {
    const snap = this.gait.getSnapshot();
    const mountY = this.robotProfile.sensorMounts.lidar.offsetLocal[1];
    const ox = this.currPos[0];
    const oy = this.currPos[1] + mountY; // Sensor head mount
    const oz = this.currPos[2];
    const heading = this.digitalTwinEnabled && this.digitalTwinPose ? this.digitalTwinPose.yaw : snap.heading;
    const fov = fovRad;
    const hits: LidarRayHit[] = [];

    for (let i = 0; i < rayCount; i++) {
      const frac = rayCount > 1 ? i / (rayCount - 1) - 0.5 : 0;
      const angle = heading + frac * fov;
      const dx = Math.cos(angle);
      const dz = -Math.sin(angle);
      const dy = -0.14; // slight downward tilt to scan lunar regolith & boulders

      // Check terrain heightfield hit
      const terrainHit = this.terrain.raycast(ox, oy, oz, dx, dy, dz, maxRange, 0.35);
      let bestDist = terrainHit.dist;
      let hitPt = terrainHit.point;
      let isHit = terrainHit.hit;
      let isObstacle = false;

      // Check hazard boulder cylinder intersections
      for (let j = 0; j < this.hazardObstacles.length; j++) {
        const obs = this.hazardObstacles[j];
        const toX = obs.x - ox;
        const toZ = obs.z - oz;
        const proj = toX * dx + toZ * dz;
        if (proj <= 0.2 || proj >= bestDist) continue;
        const perpSq = toX * toX + toZ * toZ - proj * proj;
        const r = obs.radius + 0.08;
        if (perpSq <= r * r) {
          const hitD = Math.max(0.2, proj - Math.sqrt(r * r - perpSq));
          if (hitD < bestDist) {
            bestDist = hitD;
            const hx = ox + dx * hitD;
            const hz = oz + dz * hitD;
            hitPt = [hx, this.terrain.heightAt(hx, hz) + 0.18, hz];
            isHit = true;
            isObstacle = true;
          }
        }
      }

      hits.push({
        origin: [ox, oy, oz],
        hitPoint: hitPt,
        dist: Number(bestDist.toFixed(2)),
        hit: isHit,
        isObstacle,
      });
    }
    return hits;
  }

  public getFinalChecksum(): string {
    if (!this.latestKinematic) return '00000000';
    return computeStateChecksum(
      Math.max(0, this.clock.getStep() - 1),
      this.currPos,
      this.currQuat,
      this.latestKinematic.joints
    );
  }
}
