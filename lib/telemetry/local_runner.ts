import { TelemetryFrame, TelemetryBatch, TelemetryFrameSchema, EnvironmentSpec } from '@/contracts';
import { getTerrainHeight, TerrainConfig } from '@/lib/world/terrain';
import { evaluateBoundary, DEFAULT_ARENA } from '@/lib/world/bounds';
import fs from 'fs';
import path from 'path';

export class LocalSimulationRunner {
  private jobId: string;
  private envSpec: EnvironmentSpec | null = null;
  private currentStep = 0;
  private fps = 60;
  private dt: number;
  private totalReward = 0;
  private collisionCount = 0;
  private static staticCachedFrames: TelemetryFrame[] | null = null;
  private cachedFrames: TelemetryFrame[] = [];
  private iteration = 1;
  private hasDemonstrations = false;

  // Dynamic kinematic simulation state
  private currentEpisode = 1;
  private episodeStep = 0;
  private robotX = 0;
  private robotZ = 0;
  private robotHeading = -0.62; // Radians heading toward goal at (14, -10)
  private needsResetNextStep = false;
  private resetReason: 'out_of_bounds' | 'fell_through_world' | 'success' | null = null;

  constructor(jobId: string, fps = 60, iteration = 1) {
    this.jobId = jobId;
    this.fps = fps;
    this.dt = 1.0 / fps;
    this.iteration = iteration;
    this.loadBundledFixtures();
  }

  private loadBundledFixtures() {
    if (LocalSimulationRunner.staticCachedFrames) {
      this.cachedFrames = LocalSimulationRunner.staticCachedFrames;
      return;
    }
    try {
      const fixturePath = path.resolve(process.cwd(), 'sim/fixtures/low_gravity_quadruped.jsonl');
      if (fs.existsSync(fixturePath)) {
        const content = fs.readFileSync(fixturePath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        LocalSimulationRunner.staticCachedFrames = lines.map((line) => {
          const raw = JSON.parse(line);
          return TelemetryFrameSchema.parse(raw);
        });
        this.cachedFrames = LocalSimulationRunner.staticCachedFrames;
      }
    } catch (err) {
      console.warn('[LocalRunner] Fixture load error, dynamic runner active:', err);
    }
  }

  public setEnvironmentSpec(spec: EnvironmentSpec) {
    this.envSpec = spec;
  }

  public setIteration(iter: number) {
    this.iteration = iter;
  }

  public setDemonstrationsActive(active: boolean) {
    this.hasDemonstrations = active;
  }

  public generateFrame(stepIndex: number): TelemetryFrame {
    const t = stepIndex * this.dt;

    // Handle episode reset if previous step triggered out-of-bounds or goal
    if (this.needsResetNextStep) {
      this.currentEpisode++;
      this.episodeStep = 0;
      this.robotX = this.envSpec?.spawn?.pos?.[0] ?? 0;
      this.robotZ = this.envSpec?.spawn?.pos?.[2] ?? 0;
      this.robotHeading = -0.62;
      this.needsResetNextStep = false;
      this.resetReason = null;
    }

    const terrainConfig: TerrainConfig = {
      seed: this.envSpec?.terrain?.seed ?? 42,
      width: this.envSpec?.terrain?.bounds?.[0] ?? 40,
      length: this.envSpec?.terrain?.bounds?.[1] ?? 40,
      segments: 128,
      roughness: this.envSpec?.terrain?.roughness ?? 0.65,
      amplitude: 1.8,
    };

    const isRetrained = this.iteration >= 2 || this.hasDemonstrations;
    const policyBoost = isRetrained ? 1.24 : 1.0;
    const stabilityModifier = isRetrained ? 0.35 : 1.0;

    // Goal at (14m, -10m)
    const goalX = this.envSpec?.goal?.pos?.[0] ?? 14.0;
    const goalZ = this.envSpec?.goal?.pos?.[2] ?? -10.0;
    const goalDist = Math.hypot(goalX - this.robotX, goalZ - this.robotZ);

    // Dynamic locomotion stepping along heading
    const baseSpeed = this.envSpec?.robot?.baseSpeed ?? 0.95;
    const forwardSpeed = (baseSpeed + 0.08 * Math.cos(this.episodeStep * this.dt * 2.0)) * policyBoost;
    
    // Check boundary
    const arena = {
      halfExtent: this.envSpec?.arena?.halfExtent ?? DEFAULT_ARENA.halfExtent,
      softMargin: this.envSpec?.arena?.softMargin ?? DEFAULT_ARENA.softMargin,
      hardMargin: this.envSpec?.arena?.hardMargin ?? DEFAULT_ARENA.hardMargin,
      floorCatchY: DEFAULT_ARENA.floorCatchY,
    };

    const currentDist = Math.hypot(this.robotX, this.robotZ);

    // Soft steering assist when approaching the soft margin (dist > 16m)
    if (currentDist > arena.halfExtent - arena.softMargin) {
      const angleToOrigin = Math.atan2(-this.robotZ, -this.robotX);
      const angleDiff = angleToOrigin - this.robotHeading;
      this.robotHeading += Math.sin(angleDiff) * 0.08; // curve inward
    } else {
      // Steer smoothly toward goal
      const angleToGoal = Math.atan2(goalZ - this.robotZ, goalX - this.robotX);
      const angleDiff = angleToGoal - this.robotHeading;
      this.robotHeading += Math.sin(angleDiff) * 0.03;
    }

    // Step position
    this.robotX += Math.cos(this.robotHeading) * forwardSpeed * this.dt;
    this.robotZ += Math.sin(this.robotHeading) * forwardSpeed * this.dt;
    this.episodeStep++;

    // Sample terrain elevation & dynamically ground robot torso
    const groundElevation = getTerrainHeight(this.robotX, this.robotZ, terrainConfig);
    const lowGravityBounce = Math.sin(this.episodeStep * this.dt * 6.5) * 0.025;
    const bodyHeight = 0.385; // Calibrated for 0.22m thigh + 0.22m calf IK reach
    const y = groundElevation + bodyHeight + lowGravityBounce;

    // Evaluate Boundary Invariants
    const boundaryCheck = evaluateBoundary(this.robotX, y, this.robotZ, arena);

    let status: 'running' | 'collision' | 'goal_reached' | 'stalled' | 'recovering' | 'out_of_bounds' | 'fell_through_world' | 'reset' = 'running';
    let episodeEvent: 'reset' | 'out_of_bounds' | 'fell_through_world' | 'success' | 'timeout' | undefined = undefined;

    if (boundaryCheck.isOutOfBounds) {
      status = 'out_of_bounds';
      episodeEvent = 'out_of_bounds';
      this.needsResetNextStep = true;
      this.resetReason = 'out_of_bounds';
    } else if (boundaryCheck.isFellThrough) {
      status = 'fell_through_world';
      episodeEvent = 'fell_through_world';
      this.needsResetNextStep = true;
      this.resetReason = 'fell_through_world';
    } else if (goalDist < 1.0) {
      status = 'goal_reached';
      episodeEvent = 'success';
      this.needsResetNextStep = true;
      this.resetReason = 'success';
    }

    // Trot Gait cyclic phases (speed-proportional cadence from active Spec)
    const baseCadence = this.envSpec?.robot?.cadenceHz ?? 1.6;
    const cadence = baseCadence * (forwardSpeed / Math.max(0.1, baseSpeed));
    const omega = 2.0 * Math.PI * cadence;
    const gaitPhase = (omega * this.episodeStep * this.dt) % (Math.PI * 2);
    const flPhase = gaitPhase;
    const frPhase = gaitPhase + Math.PI;
    const rlPhase = gaitPhase + Math.PI;
    const rrPhase = gaitPhase;

    // Terrain slope reaction
    const slopeX = getTerrainHeight(this.robotX + 0.3, this.robotZ, terrainConfig) - getTerrainHeight(this.robotX - 0.3, this.robotZ, terrainConfig);
    const slopeZ = getTerrainHeight(this.robotX, this.robotZ + 0.3, terrainConfig) - getTerrainHeight(this.robotX, this.robotZ - 0.3, terrainConfig);
    const terrainPitch = Math.atan2(slopeX, 0.6) * stabilityModifier;
    const terrainRoll = Math.atan2(slopeZ, 0.6) * stabilityModifier;

    // Compute Foot Contact States (Stance when sin(phase) <= 0.05)
    const flContact = Math.sin(flPhase) <= 0.08;
    const frContact = Math.sin(frPhase) <= 0.08;
    const rlContact = Math.sin(rlPhase) <= 0.08;
    const rrContact = Math.sin(rrPhase) <= 0.08;

    // World foot coordinates with ground height conformance
    const cosH = Math.cos(this.robotHeading);
    const sinH = Math.sin(this.robotHeading);

    const calcFoot = (id: string, lx: number, lz: number, phase: number, contact: boolean) => {
      const wx = this.robotX + cosH * lx - sinH * lz;
      const wz = this.robotZ + sinH * lx + cosH * lz;
      const groundH = getTerrainHeight(wx, wz, terrainConfig);
      const lift = contact ? 0.0 : Math.max(0, Math.sin(phase) * 0.055);
      const wy = Number((groundH + lift).toFixed(4));
      return { id, pos: [Number(wx.toFixed(4)), wy, Number(wz.toFixed(4))] as [number, number, number], contact };
    };

    const feet = [
      calcFoot('FL', 0.24, -0.15, flPhase, flContact),
      calcFoot('FR', 0.24, 0.15, frPhase, frContact),
      calcFoot('RL', -0.24, -0.15, rlPhase, rlContact),
      calcFoot('RR', -0.24, 0.15, rrPhase, rrContact),
    ];

    const jointStates = [
      { name: 'FL_hip_joint', angle: Number((0.08 * Math.sin(flPhase) + terrainRoll * 0.3).toFixed(4)), velocity: 0.6 },
      { name: 'FL_thigh_joint', angle: Number((0.38 * Math.sin(flPhase) + terrainPitch * 0.35).toFixed(4)), velocity: 1.2 },
      { name: 'FL_calf_joint', angle: Number((-0.72 + 0.25 * Math.cos(flPhase)).toFixed(4)), velocity: -1.4 },

      { name: 'FR_hip_joint', angle: Number((-0.08 * Math.sin(frPhase) - terrainRoll * 0.3).toFixed(4)), velocity: -0.6 },
      { name: 'FR_thigh_joint', angle: Number((0.38 * Math.sin(frPhase) + terrainPitch * 0.35).toFixed(4)), velocity: 1.2 },
      { name: 'FR_calf_joint', angle: Number((-0.72 + 0.25 * Math.cos(frPhase)).toFixed(4)), velocity: -1.4 },

      { name: 'RL_hip_joint', angle: Number((0.08 * Math.sin(rlPhase) + terrainRoll * 0.3).toFixed(4)), velocity: 0.6 },
      { name: 'RL_thigh_joint', angle: Number((0.38 * Math.sin(rlPhase) - terrainPitch * 0.35).toFixed(4)), velocity: 1.2 },
      { name: 'RL_calf_joint', angle: Number((-0.72 + 0.25 * Math.cos(rlPhase)).toFixed(4)), velocity: -1.4 },

      { name: 'RR_hip_joint', angle: Number((-0.08 * Math.sin(rrPhase) - terrainRoll * 0.3).toFixed(4)), velocity: -0.6 },
      { name: 'RR_thigh_joint', angle: Number((0.38 * Math.sin(rrPhase) - terrainPitch * 0.35).toFixed(4)), velocity: 1.2 },
      { name: 'RR_calf_joint', angle: Number((-0.72 + 0.25 * Math.cos(rrPhase)).toFixed(4)), velocity: -1.4 },
    ];

    // Collisions
    const collisions: any[] = [];
    const collisionInterval = this.hasDemonstrations ? 600 : 240;
    if (this.episodeStep > 50 && this.episodeStep % collisionInterval === 60 && status === 'running') {
      this.collisionCount++;
      status = 'collision';
      collisions.push({
        a: 'FL_calf',
        b: 'debris_boulder_07',
        point: [Number((this.robotX + 0.22).toFixed(3)), Number(groundElevation.toFixed(3)), Number((this.robotZ + 0.1).toFixed(3))],
        impulse: 3.4,
      });
    }

    // Boundary penalty inside soft margin
    const boundaryPenalty = boundaryCheck.state === 'soft' || boundaryCheck.state === 'hard'
      ? Number((Math.max(0, currentDist - (arena.halfExtent - arena.softMargin)) * -2.5).toFixed(3))
      : 0;

    // Named reward components
    const rForward = Number((forwardSpeed * 1.5).toFixed(3));
    const rUpright = Number(Math.exp(-Math.abs(terrainPitch) * 2.0).toFixed(3));
    const rCollision = collisions.length > 0 ? -3.0 : 0.0;
    const rEnergy = -0.015;
    const totalStepReward = Number((rForward + 0.6 * rUpright + rCollision + rEnergy + boundaryPenalty).toFixed(3));
    this.totalReward += totalStepReward;

    return {
      schemaVersion: '4.0',
      seq: stepIndex,
      dt: Number(this.dt.toFixed(4)),
      t: Number(t.toFixed(4)),
      episode: this.currentEpisode,
      iteration: this.iteration,
      bodies: [
        {
          id: 'torso',
          pos: [Number(this.robotX.toFixed(4)), Number(this.robotZ.toFixed(4)), Number(y.toFixed(4))],
          quat: [0.0, Number((0.02 * Math.sin(t * 2.5)).toFixed(4)), 0.0, 0.999],
          vel: [
            Number((Math.cos(this.robotHeading) * forwardSpeed).toFixed(3)),
            0.0,
            Number((Math.sin(this.robotHeading) * forwardSpeed).toFixed(3)),
          ],
        },
      ],
      joints: jointStates,
      feet,
      bodyHeightAboveGround: bodyHeight,
      slopeUnderBody: Number(terrainPitch.toFixed(3)),
      gait: {
        phase: Number(gaitPhase.toFixed(3)),
        speed: Number(forwardSpeed.toFixed(3)),
        cmdSpeed: Number(forwardSpeed.toFixed(3)),
      },
      reward: totalStepReward,
      rewardComponents: {
        progress: rForward,
        forward: rForward,
        stability: rUpright,
        energy: rEnergy,
        collision: rCollision,
        collision_penalty: rCollision,
        boundary_penalty: boundaryPenalty,
        goal_bonus: Number(Math.max(0, (25.0 - goalDist) * 0.05).toFixed(3)),
      },
      collisions,
      goalDistance: Number(goalDist.toFixed(2)),
      energy: Number((t * 0.4).toFixed(2)),
      boundary: {
        state: boundaryCheck.state,
        distanceToEdge: boundaryCheck.distanceToEdge,
      },
      valid: true,
      episodeEvent,
      status,
    };
  }

  public getNextBatch(batchSize = 30): TelemetryBatch {
    const frames: TelemetryFrame[] = [];
    for (let i = 0; i < batchSize; i++) {
      frames.push(this.generateFrame(this.currentStep++));
    }
    const batchId = Math.floor(this.currentStep / batchSize);
    return {
      jobId: this.jobId,
      batchId,
      frames,
    };
  }

  public reset() {
    this.currentStep = 0;
    this.totalReward = 0;
    this.collisionCount = 0;
    this.currentEpisode = 1;
    this.episodeStep = 0;
    this.robotX = 0;
    this.robotZ = 0;
    this.robotHeading = -0.62;
    this.needsResetNextStep = false;
    this.resetReason = null;
  }
}
