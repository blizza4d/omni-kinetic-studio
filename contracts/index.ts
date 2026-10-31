import { z } from 'zod';
import { EnvironmentSpecSchema, EnvironmentSpec } from './spec';
export * from './terrain';
export * from './build_stamp';
export * from './spec';

/**
 * 2. Telemetry Frame Schema (v3.0)
 */
export const BodyStateSchema = z.object({
  id: z.string(),
  pos: z.tuple([z.number(), z.number(), z.number()]), // [x, y, z]
  quat: z.tuple([z.number(), z.number(), z.number(), z.number()]), // [qx, qy, qz, qw]
  vel: z.tuple([z.number(), z.number(), z.number()]), // [vx, vy, vz]
});

export type BodyState = z.infer<typeof BodyStateSchema>;

export const JointStateSchema = z.object({
  name: z.string(),
  angle: z.number(), // radians
  velocity: z.number(), // rad/s
  torque: z.number().optional(), // N*m
});

export type JointState = z.infer<typeof JointStateSchema>;

export const CollisionEventSchema = z.object({
  a: z.string(),
  b: z.string(),
  point: z.tuple([z.number(), z.number(), z.number()]),
  impulse: z.number(),
});

export type CollisionEvent = z.infer<typeof CollisionEventSchema>;

export const BoundaryStateSchema = z.object({
  state: z.enum(['inside', 'soft', 'hard', 'out']),
  distanceToEdge: z.number(),
});

export type BoundaryState = z.infer<typeof BoundaryStateSchema>;

export const FootStateSchema = z.object({
  id: z.string(), // 'FL', 'FR', 'RL', 'RR'
  pos: z.tuple([z.number(), z.number(), z.number()]), // [x, y, z] world pos
  contact: z.boolean(),
});

export type FootState = z.infer<typeof FootStateSchema>;

export const TelemetryFrameSchema = z.object({
  schemaVersion: z.string().default('4.0').optional(),
  seq: z.number().int().optional().default(0),
  dt: z.number().optional().default(0.0167),
  t: z.number(), // timestamp in seconds
  episode: z.number().int(),
  iteration: z.number().int().default(1),
  bodies: z.array(BodyStateSchema),
  joints: z.array(JointStateSchema),
  feet: z.array(FootStateSchema).default([]),
  bodyHeightAboveGround: z.number().optional().default(0.44),
  slopeUnderBody: z.number().optional().default(0),
  gait: z.object({
    phase: z.number().default(0),
    speed: z.number().default(0.95),
    cmdSpeed: z.number().default(0.95),
  }).optional(),
  reward: z.number(),
  rewardComponents: z.record(z.string(), z.number()).optional().default({}),
  collisions: z.array(CollisionEventSchema).default([]),
  goalDistance: z.number().optional().default(14.0),
  energy: z.number().optional().default(0.0),
  boundary: BoundaryStateSchema.optional().default({ state: 'inside', distanceToEdge: 18.0 }),
  valid: z.boolean().default(true),
  episodeEvent: z.enum(['reset', 'out_of_bounds', 'fell_through_world', 'success', 'timeout']).optional(),
  status: z.enum(['running', 'collision', 'goal_reached', 'stalled', 'recovering', 'out_of_bounds', 'fell_through_world', 'reset']).optional().default('running'),
});

export type TelemetryFrame = z.infer<typeof TelemetryFrameSchema>;

/**
 * Batched telemetry message transported over SSE
 */
export const TelemetryBatchSchema = z.object({
  jobId: z.string(),
  batchId: z.number().int(),
  frames: z.array(TelemetryFrameSchema),
});

export type TelemetryBatch = z.infer<typeof TelemetryBatchSchema>;

/**
 * 3. Run Summary (v2.0)
 */
export const RunSummarySchema = z.object({
  success: z.boolean(),
  distanceCovered: z.number(),
  meanReward: z.number(),
  collisionCount: z.number(),
  boundaryEvents: z.number().default(0),
  energyConsumed: z.number(),
  durationSeconds: z.number(),
  tokens: z.object({
    ultra: z.number().default(0),
    super: z.number().default(0),
    nano: z.number().default(0),
    total: z.number().default(0),
  }),
  costUsd: z.number(),
  mode: z.enum(['cloud_nebius', 'local_demo']),
  sourceLabels: z.array(z.string()).default([]),
});

export type RunSummary = z.infer<typeof RunSummarySchema>;

/**
 * 4. Job Status Schema (v2.0)
 */
export const JobStatusSchema = z.object({
  jobId: z.string(),
  status: z.enum(['queued', 'cold_start', 'running', 'succeeded', 'failed', 'cancelled']),
  progress: z.number().min(0).max(100),
  mode: z.enum(['cloud_nebius', 'local_demo']),
  elapsed: z.number().default(0),
  currentEpisode: z.number().optional(),
  currentReward: z.number().optional(),
  collisionCount: z.number().default(0),
  successRate: z.number().min(0).max(1).default(0),
  message: z.string(),
  timestamp: z.number(),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;

/**
 * 5. Teleoperation Command Schema (v1.0)
 */
export const TeleopCommandSchema = z.object({
  t: z.number(),
  limb: z.enum(['FL', 'FR', 'RL', 'RR', 'all']).default('all'),
  activeLimb: z.enum(['FL', 'FR', 'RL', 'RR', 'all']).optional(),
  jointTargets: z.record(z.string(), z.number()),
  cameraPose: z.object({
    yaw: z.number(),
    pitch: z.number(),
  }).optional(),
  confidence: z.number().min(0).max(1),
  stiffness: z.number().min(0).max(1),
  source: z.enum(['camera_mediapipe', 'keyboard_fallback', 'replay_landmark']).default('camera_mediapipe'),
}).transform((data) => ({
  ...data,
  activeLimb: data.activeLimb ?? data.limb,
  limb: data.limb ?? data.activeLimb ?? 'all',
}));

export type TeleopCommand = z.infer<typeof TeleopCommandSchema>;

/**
 * 6. Demonstration Episode & Steps (v1.0)
 */
export const DemonstrationStepSchema = z.object({
  t: z.number().optional(),
  timestamp: z.number().optional(),
  observation: z.object({
    robotPos: z.tuple([z.number(), z.number(), z.number()]),
    robotQuat: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    jointAngles: z.record(z.string(), z.number()),
  }),
  action: z.record(z.string(), z.number()),
  confidence: z.number().default(1.0),
}).transform((data) => ({
  ...data,
  t: data.t ?? data.timestamp ?? 0,
  timestamp: data.timestamp ?? data.t ?? 0,
}));

export type DemonstrationStep = z.infer<typeof DemonstrationStepSchema>;

export const DemonstrationEpisodeSchema = z.object({
  id: z.string(),
  iteration: z.number().int().default(1),
  duration: z.number(),
  source: z.enum(['camera_mediapipe', 'keyboard_fallback', 'replay_landmark']),
  frames: z.array(DemonstrationStepSchema),
  confidenceMean: z.number().default(1.0),
  createdAt: z.string(),
});

export type DemonstrationEpisode = z.infer<typeof DemonstrationEpisodeSchema>;

/**
 * 7. Architect Output
 */
export const ArchitectOutputSchema = z.object({
  spec: EnvironmentSpecSchema,
  rewardCode: z.string(),
  datagenCode: z.string(),
  safetyGatePassed: z.boolean(),
  safetyGateReport: z.string(),
  reasoningNotes: z.string(),
  tierResolved: z.object({
    reasoning: z.string(),
    fast: z.string(),
  }).optional(),
  sourceLabel: z.enum(['live_nebius', 'recorded_fixture']).default('live_nebius'),
});

export type ArchitectOutput = z.infer<typeof ArchitectOutputSchema>;

/**
 * 8. Performance Report (v1.0)
 */
export const PerfReportSchema = z.object({
  build: z.enum(['dev', 'prod']),
  renderer: z.object({
    renderer: z.string(),
    vendor: z.string(),
    isHardware: z.boolean(),
  }),
  tier: z.enum(['ultra', 'high', 'medium', 'low', 'potato']),
  duration: z.number(),
  frameTime: z.object({
    p50: z.number(),
    p95: z.number(),
    p99: z.number(),
    mean: z.number(),
    max: z.number(),
  }),
  longTasks: z.number(),
  inputLatencyP95: z.number().default(0),
  drawCalls: z.number(),
  triangles: z.number(),
  heap: z.object({
    startMb: z.number(),
    endMb: z.number(),
  }).optional(),
  subsystemCosts: z.record(z.string(), z.number()).default({}),
  droppedFrames: z.number().default(0),
  invalidFrames: z.number().default(0),
});

export type PerfReport = z.infer<typeof PerfReportSchema>;

/**
 * 9. Bounds Report (v1.0)
 */
export const BoundsReportSchema = z.object({
  episodes: z.number(),
  policies: z.array(z.string()),
  statusCounts: z.record(z.string(), z.number()),
  nanCount: z.number(),
  escapeCount: z.number(),
  fallThroughCount: z.number(),
  maxDistanceOutsideArena: z.number(),
  passed: z.boolean(),
});

export type BoundsReport = z.infer<typeof BoundsReportSchema>;

export * from './cloud';
export * from './teleop_learning';

