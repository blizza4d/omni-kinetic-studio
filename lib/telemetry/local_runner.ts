import { TelemetryFrame, TelemetryBatch, TelemetryFrameSchema, EnvironmentSpec } from '@/contracts';
import { getTerrainHeight, TerrainConfig } from '@/lib/world/terrain';
import { evaluateBoundary, DEFAULT_ARENA } from '@/lib/world/bounds';
import { eulerToQuaternion, bodyToWorld, RobotPose } from '@/lib/frames';
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
  private filteredPitch = 0;
  private filteredRoll = 0;
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
      this.filteredPitch = 0;
      this.filteredRoll = 0;
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

    // In canonical frames, body forward in world is (cos theta, 0, -sin theta)
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
    this.robotHeading += steerDelta;

    // Step position along canonical forward vector (cos theta, 0, -sin theta)
    const fwdX = Math.cos(this.robotHeading);
    const fwdZ = -Math.sin(this.robotHeading);
    this.robotX += fwdX * forwardSpeed * this.dt;
    this.robotZ += fwdZ * forwardSpeed * this.dt;
    this.episodeStep++;

    // Sample terrain elevation & dynamically ground robot torso
    const groundElevation = getTerrainHeight(this.robotX, this.robotZ, terrainConfig);
    const gravY = Math.abs(this.envSpec?.gravity?.[1] ?? 1.62);
    const gravScale = Math.min(1.5, Math.max(0.2, 1.62 / Math.max(0.1, gravY)));
    const lowGravityBounce = Math.sin(this.episodeStep * this.dt * 6.5) * (0.025 * gravScale);
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

    // Terrain slope reaction (sampled along body forward and right)
    const rightX = Math.sin(this.robotHeading);
    const rightZ = Math.cos(this.robotHeading);

    const hFwd = getTerrainHeight(this.robotX + fwdX * 0.3, this.robotZ + fwdZ * 0.3, terrainConfig);
    const hBack = getTerrainHeight(this.robotX - fwdX * 0.3, this.robotZ - fwdZ * 0.3, terrainConfig);
    const hRight = getTerrainHeight(this.robotX + rightX * 0.2, this.robotZ + rightZ * 0.2, terrainConfig);
    const hLeft = getTerrainHeight(this.robotX - rightX * 0.2, this.robotZ - rightZ * 0.2, terrainConfig);

    const rawPitch = Math.atan2(hFwd - hBack, 0.6) * 0.6 * stabilityModifier;
    const rawRoll = Math.atan2(hLeft - hRight, 0.4) * 0.6 * stabilityModifier;

    // Time-filtered slope following (tau = 0.2s)
    const alphaSlope = this.dt / (0.2 + this.dt);
    this.filteredPitch += alphaSlope * (rawPitch - this.filteredPitch);
    this.filteredRoll += alphaSlope * (rawRoll - this.filteredRoll);
    this.filteredPitch = Math.max(-0.35, Math.min(0.35, this.filteredPitch));
    this.filteredRoll = Math.max(-0.35, Math.min(0.35, this.filteredRoll));

    // Torso orientation quaternion in canonical right-handed Y-up convention
    const torsoQuat = eulerToQuaternion(this.robotHeading, this.filteredPitch, this.filteredRoll);

    // Compute Foot Contact States (Stance when sin(phase) <= 0.08)
    const flContact = Math.sin(flPhase) <= 0.08;
    const frContact = Math.sin(frPhase) <= 0.08;
    const rlContact = Math.sin(rlPhase) <= 0.08;
    const rrContact = Math.sin(rrPhase) <= 0.08;

    // Body pose for foot coordinate transforms
    const bodyPose: RobotPose = {
      position: [this.robotX, groundElevation, this.robotZ],
      yaw: this.robotHeading,
      pitch: 0,
      roll: 0,
    };

    const calcFoot = (id: string, lx: number, lz: number, phase: number, contact: boolean) => {
      const wPos = bodyToWorld([lx, 0, lz], bodyPose);
      const groundH = getTerrainHeight(wPos[0], wPos[2], terrainConfig);
      const lift = contact ? 0.0 : Math.max(0, Math.sin(phase) * 0.055);
      const wy = Number((groundH + lift).toFixed(4));
      return { id, pos: [Number(wPos[0].toFixed(4)), wy, Number(wPos[2].toFixed(4))] as [number, number, number], contact };
    };

    const feet = [
      calcFoot('FL', 0.24, -0.15, flPhase, flContact),
      calcFoot('FR', 0.24, 0.15, frPhase, frContact),
      calcFoot('RL', -0.24, -0.15, rlPhase, rlContact),
      calcFoot('RR', -0.24, 0.15, rrPhase, rrContact),
    ];

    const jointStates = [
      { name: 'FL_hip_joint', angle: Number((0.08 * Math.sin(flPhase) + this.filteredRoll * 0.3).toFixed(4)), velocity: 0.6 },
      { name: 'FL_thigh_joint', angle: Number((0.38 * Math.sin(flPhase) + this.filteredPitch * 0.35).toFixed(4)), velocity: 1.2 },
      { name: 'FL_calf_joint', angle: Number((-0.72 + 0.25 * Math.cos(flPhase)).toFixed(4)), velocity: -1.4 },

      { name: 'FR_hip_joint', angle: Number((-0.08 * Math.sin(frPhase) - this.filteredRoll * 0.3).toFixed(4)), velocity: -0.6 },
      { name: 'FR_thigh_joint', angle: Number((0.38 * Math.sin(frPhase) + this.filteredPitch * 0.35).toFixed(4)), velocity: 1.2 },
      { name: 'FR_calf_joint', angle: Number((-0.72 + 0.25 * Math.cos(frPhase)).toFixed(4)), velocity: -1.4 },

      { name: 'RL_hip_joint', angle: Number((0.08 * Math.sin(rlPhase) + this.filteredRoll * 0.3).toFixed(4)), velocity: 0.6 },
      { name: 'RL_thigh_joint', angle: Number((0.38 * Math.sin(rlPhase) - this.filteredPitch * 0.35).toFixed(4)), velocity: 1.2 },
      { name: 'RL_calf_joint', angle: Number((-0.72 + 0.25 * Math.cos(rlPhase)).toFixed(4)), velocity: -1.4 },

      { name: 'RR_hip_joint', angle: Number((-0.08 * Math.sin(rrPhase) - this.filteredRoll * 0.3).toFixed(4)), velocity: -0.6 },
      { name: 'RR_thigh_joint', angle: Number((0.38 * Math.sin(rrPhase) - this.filteredPitch * 0.35).toFixed(4)), velocity: 1.2 },
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
    const currentDist = Math.hypot(this.robotX, this.robotZ);
    const boundaryPenalty = boundaryCheck.state === 'soft' || boundaryCheck.state === 'hard'
      ? Number((Math.max(0, currentDist - (arena.halfExtent - arena.softMargin)) * -2.5).toFixed(3))
      : 0;

    // Named reward components
    const rForward = Number((forwardSpeed * 1.5).toFixed(3));
    const rUpright = Number(Math.exp(-Math.abs(this.filteredPitch) * 2.0).toFixed(3));
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
          pos: [Number(this.robotX.toFixed(4)), Number(y.toFixed(4)), Number(this.robotZ.toFixed(4))],
          quat: torsoQuat,
          vel: [
            Number((fwdX * forwardSpeed).toFixed(3)),
            0.0,
            Number((fwdZ * forwardSpeed).toFixed(3)),
          ],
        },
      ],
      joints: jointStates,
      feet,
      bodyHeightAboveGround: bodyHeight,
      slopeUnderBody: Number(this.filteredPitch.toFixed(3)),
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
    this.robotX = this.envSpec?.spawn?.pos?.[0] ?? 0;
    this.robotZ = this.envSpec?.spawn?.pos?.[2] ?? 0;
    const goalX = this.envSpec?.goal?.pos?.[0] ?? 14.0;
    const goalZ = this.envSpec?.goal?.pos?.[2] ?? -10.0;
    this.robotHeading = Math.atan2(-(goalZ - this.robotZ), goalX - this.robotX);
    this.filteredPitch = 0;
    this.filteredRoll = 0;
    this.needsResetNextStep = false;
    this.resetReason = null;
  }
}
