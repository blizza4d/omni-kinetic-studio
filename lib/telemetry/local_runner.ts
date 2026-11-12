import { TelemetryFrame, TelemetryBatch, TelemetryFrameSchema, EnvironmentSpec } from '@/contracts';
import { getTerrainHeight, TerrainConfig } from '@/lib/world/terrain';
import { evaluateBoundary, DEFAULT_ARENA } from '@/lib/world/bounds';
import { GaitController } from '@/lib/droid/gait/GaitController';
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
  private robotHeading = 0.6202; // Radians heading toward goal at (14, -10): atan2(-(-10), 14)
  private needsResetNextStep = false;
  private resetReason: 'out_of_bounds' | 'fell_through_world' | 'success' | null = null;

  // Integrated Physically Grounded Gait Controller
  private gaitController: GaitController;

  constructor(jobId = 'local_job', fps = 60, iteration = 1) {
    this.jobId = jobId;
    this.fps = fps;
    this.dt = 1.0 / fps;
    this.iteration = iteration;
    this.gaitController = new GaitController(0, 0, this.robotHeading);
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
    this.reset();
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
      const initialGoalX = this.envSpec?.goal?.pos?.[0] ?? 14.0;
      const initialGoalZ = this.envSpec?.goal?.pos?.[2] ?? -10.0;
      this.robotHeading = Math.atan2(-(initialGoalZ - this.robotZ), initialGoalX - this.robotX);
      this.needsResetNextStep = false;
      this.resetReason = null;
      this.gaitController.reset(this.robotX, this.robotZ, this.robotHeading);
    }

    const terrainConfig: TerrainConfig = {
      seed: this.envSpec?.terrain?.seed ?? 42,
      width: this.envSpec?.terrain?.bounds?.[0] ?? 40,
      length: this.envSpec?.terrain?.bounds?.[1] ?? 40,
      segments: 128,
      roughness: this.envSpec?.terrain?.roughness ?? 0.65,
      amplitude: 1.8,
    };

    const terrainSampler = (x: number, z: number) => getTerrainHeight(x, z, terrainConfig);

    const isRetrained = this.iteration >= 2 || this.hasDemonstrations;
    const policyBoost = isRetrained ? 1.24 : 1.0;

    // Spawn and Goal coordinates
    const spawnX = this.envSpec?.spawn?.pos?.[0] ?? 0;
    const spawnZ = this.envSpec?.spawn?.pos?.[2] ?? 0;
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

    // Pure pursuit path following along the spawn->goal line
    const dxPath = goalX - spawnX;
    const dzPath = goalZ - spawnZ;
    const lineLen = Math.hypot(dxPath, dzPath);
    const uProj = lineLen > 0
      ? Math.max(0, Math.min(1, ((this.robotX - spawnX) * dxPath + (this.robotZ - spawnZ) * dzPath) / (lineLen * lineLen)))
      : 1.0;

    const lookaheadDistM = Math.min(1.4, Math.max(0.8, 0.8 + 0.5 * forwardSpeed));
    const uLook = lineLen > 0 ? Math.min(1.0, uProj + lookaheadDistM / lineLen) : 1.0;
    const targetX = spawnX + uLook * dxPath;
    const targetZ = spawnZ + uLook * dzPath;

    // Canonical forward in world is (cos theta, 0, -sin theta)
    const targetHeading = Math.atan2(-(targetZ - this.robotZ), targetX - this.robotX);

    // Boundary assist only activates when strictly inside the soft margin
    const edgeDistX = arena.halfExtent - Math.abs(this.robotX);
    const edgeDistZ = arena.halfExtent - Math.abs(this.robotZ);
    const distToEdge = Math.min(edgeDistX, edgeDistZ);

    let steeringTarget = targetHeading;
    if (distToEdge < arena.softMargin) {
      const angleToCenter = Math.atan2(this.robotZ, -this.robotX);
      const blend = (arena.softMargin - distToEdge) / arena.softMargin;
      steeringTarget = targetHeading * (1.0 - blend) + angleToCenter * blend;
    }

    // Continuous yaw unwrapping
    let diff = steeringTarget - this.robotHeading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    // Yaw damping / smooth heading rate-limiting
    const maxTurnRate = 2.0; // rad/s
    const maxDelta = maxTurnRate * this.dt;
    const steerDelta = Math.max(-maxDelta, Math.min(maxDelta, diff * 6.0 * this.dt));
    const yawRate = steerDelta / this.dt;

    // Step physics & zero-slip gait controller
    const gravY = Math.abs(this.envSpec?.gravity?.[1] ?? 1.62);
    const kinematicState = this.gaitController.step(
      { vx: forwardSpeed, yawRate },
      gravY,
      terrainSampler,
      this.dt
    );

    this.robotX = kinematicState.bodyPos[0];
    this.robotZ = kinematicState.bodyPos[2];
    this.robotHeading += steerDelta;
    this.episodeStep++;

    const y = kinematicState.bodyPos[1];
    const bodyHeight = 0.385;

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

    // Convert foot targets to TelemetryFrame format
    const feet = kinematicState.feet.map((f) => ({
      id: f.id,
      pos: [Number(f.worldPos[0].toFixed(4)), Number(f.worldPos[1].toFixed(4)), Number(f.worldPos[2].toFixed(4))] as [number, number, number],
      contact: f.contact,
    }));

    // Collisions
    const collisions: any[] = [];
    const collisionInterval = this.hasDemonstrations ? 600 : 240;
    if (this.episodeStep > 50 && this.episodeStep % collisionInterval === 60 && status === 'running') {
      this.collisionCount++;
      status = 'collision';
      collisions.push({
        a: 'FL_calf',
        b: 'debris_boulder_07',
        point: [Number((this.robotX + 0.22).toFixed(3)), Number((y - 0.35).toFixed(3)), Number((this.robotZ + 0.1).toFixed(3))],
        impulse: 3.4,
      });
    }

    // Boundary penalty inside soft margin
    const currentDist = Math.hypot(this.robotX, this.robotZ);
    const boundaryPenalty = boundaryCheck.state === 'soft' || boundaryCheck.state === 'hard'
      ? Number((Math.max(0, currentDist - (arena.halfExtent - arena.softMargin)) * -2.5).toFixed(3))
      : 0;

    // Named reward components
    const rForward = Number((forwardSpeed * 1.5).toFixed(3));
    const rUpright = Number(Math.exp(-Math.abs(kinematicState.bodyLinearVel[1]) * 2.0).toFixed(3));
    const rCollision = collisions.length > 0 ? -3.0 : 0.0;
    const rEnergy = -0.015;
    const totalStepReward = Number((rForward + 0.6 * rUpright + rCollision + rEnergy + boundaryPenalty).toFixed(3));
    this.totalReward += totalStepReward;

    const fwdX = Math.cos(this.robotHeading);
    const fwdZ = -Math.sin(this.robotHeading);

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
          pos: [Number(this.robotX.toFixed(4)), Number(y.toFixed(4)), Number(this.robotZ.toFixed(4))],
          quat: kinematicState.bodyQuat,
          vel: [
            Number((fwdX * forwardSpeed).toFixed(3)),
            Number(kinematicState.bodyLinearVel[1].toFixed(3)),
            Number((fwdZ * forwardSpeed).toFixed(3)),
          ],
        },
      ],
      joints: kinematicState.joints,
      feet,
      bodyHeightAboveGround: bodyHeight,
      slopeUnderBody: Number((Math.asin(Math.max(-1, Math.min(1, kinematicState.bodyQuat[0])) * 2)).toFixed(3)),
      gait: {
        phase: Number((kinematicState.cadenceHz * t * 2 * Math.PI % (2 * Math.PI)).toFixed(3)),
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
    this.robotX = this.envSpec?.spawn?.pos?.[0] ?? 0;
    this.robotZ = this.envSpec?.spawn?.pos?.[2] ?? 0;
    const goalX = this.envSpec?.goal?.pos?.[0] ?? 14.0;
    const goalZ = this.envSpec?.goal?.pos?.[2] ?? -10.0;
    this.robotHeading = Math.atan2(-(goalZ - this.robotZ), goalX - this.robotX);
    this.needsResetNextStep = false;
    this.resetReason = null;
    this.gaitController.reset(this.robotX, this.robotZ, this.robotHeading);
  }
}
