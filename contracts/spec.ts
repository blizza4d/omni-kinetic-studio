import { z } from 'zod';

export const ArenaSpecSchema = z.object({
  shape: z.enum(['rectangle', 'cylinder']).default('rectangle'),
  halfExtent: z.number().default(18), // meters
  softMargin: z.number().default(2), // meters inside boundary
  hardMargin: z.number().default(20), // absolute containment threshold
  catchPlane: z.number().default(-5.0).optional(),
});
export type ArenaSpec = z.infer<typeof ArenaSpecSchema>;

export const SpawnSpecSchema = z.object({
  pos: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  heading: z.number().default(0),
  clearRadius: z.number().default(2.5),
});
export type SpawnSpec = z.infer<typeof SpawnSpecSchema>;

export const GoalSpecSchema = z.object({
  pos: z.tuple([z.number(), z.number(), z.number()]).default([14.0, 0, -10.0]),
  tolerance: z.number().default(1.0),
  clearRadius: z.number().default(2.5),
});
export type GoalSpec = z.infer<typeof GoalSpecSchema>;

/**
 * EnvironmentSpec v4.0 Schema
 */
export const EnvironmentSpecV4Schema = z.object({
  schemaVersion: z.string().default('4.0'),
  taskId: z.string().default(() => `task_${Date.now()}`),
  taskName: z.string(),
  description: z.string(),
  gravity: z.tuple([z.number(), z.number(), z.number()]).default([0, -1.62, 0]), // [gx, gy, gz]
  terrain: z.object({
    type: z.enum(['flat', 'heightfield', 'cratered_debris', 'uneven']).default('cratered_debris'),
    seed: z.number().int().default(42),
    roughness: z.number().min(0).max(1).default(0.4),
    friction: z.number().positive().default(0.8),
    bounds: z.tuple([z.number(), z.number()]).default([48, 48]), // [width, length]
    octaves: z.number().default(4).optional(),
    amplitude: z.number().default(1.8).optional(),
    skirt: z.number().default(1.8).optional(),
    segmentsByTier: z.record(z.string(), z.number()).default({
      ultra: 256,
      high: 128,
      medium: 96,
      low: 64,
      potato: 32,
    }).optional(),
  }),
  arena: ArenaSpecSchema.default({
    shape: 'rectangle',
    halfExtent: 18,
    softMargin: 2,
    hardMargin: 20,
    catchPlane: -5.0,
  }),
  spawn: SpawnSpecSchema.default({
    pos: [0, 0, 0],
    heading: 0,
  }),
  goal: GoalSpecSchema.default({
    pos: [14.0, 0, -10.0],
    tolerance: 1.0,
  }),
  corridorSeed: z.number().default(42).optional(),
  debrisDensity: z.number().min(0).max(1).default(0.4),
  debris: z.object({
    count: z.number().default(1800),
    sizeRange: z.tuple([z.number(), z.number()]).default([0.15, 0.55]),
    seed: z.number().default(42),
    distribution: z.enum(['poisson_corridor', 'clustered', 'uniform']).default('poisson_corridor').optional(),
  }).default({}),
  robotMorphology: z.enum(['quadruped_12dof', 'biped_6dof', 'manipulator_7dof']).default('quadruped_12dof'),
  robot: z.object({
    massKg: z.number().default(12.5),
    baseSpeed: z.number().default(1.2), // m/s
    cadenceHz: z.number().default(1.6), // steps/s
  }).default({}),
  motion: z.object({
    gait: z.enum(['trot', 'walk', 'pace', 'bound']).default('trot'),
    stepHeight: z.number().default(0.08), // m
    strideLength: z.number().default(0.35), // m
    stanceDutyFactor: z.number().default(0.5),
  }).default({}),
  sensorConfig: z.object({
    hasCamera: z.boolean().default(true),
    hasImu: z.boolean().default(true),
    hasFootContactSensors: z.boolean().default(true),
    updateRateHz: z.number().positive().default(60),
  }).default({}),
  episodeLength: z.number().int().positive().default(1000),
  successCriteria: z.object({
    targetDistance: z.number().positive().default(14.0),
    maxTiltDegrees: z.number().positive().default(45.0),
    surviveTimeSeconds: z.number().positive().default(30.0),
  }).default({}),
  rationale: z.string().default('Decomposed physical AI spec synthesized by NVIDIA Nemotron.'),
});

export type EnvironmentSpecV4 = z.infer<typeof EnvironmentSpecV4Schema>;
export const EnvironmentSpecSchema = EnvironmentSpecV4Schema;
export type EnvironmentSpec = EnvironmentSpecV4;

/**
 * Adjustment record when SpecCompiler clamps or modifies a parameter
 */
export const SpecAdjustmentSchema = z.object({
  field: z.string(),
  from: z.any(),
  to: z.any(),
  reason: z.string(),
});

export type SpecAdjustment = z.infer<typeof SpecAdjustmentSchema>;

/**
 * SpecCompileReport v1 Schema
 */
export const SpecCompileReportSchema = z.object({
  adjustments: z.array(SpecAdjustmentSchema),
  reachability: z.object({
    reachable: booleanCheck(),
    pathLengthM: z.number(),
    waypointsCount: z.number(),
    minClearanceM: z.number(),
  }),
  attempts: z.number().int().positive(),
  terrainStats: z.object({
    minHeightM: z.number(),
    maxHeightM: z.number(),
    meanSlopeDeg: z.number(),
    maxSlopeDeg: z.number(),
    reliefM: z.number(),
  }),
  warnings: z.array(z.string()),
});

function booleanCheck() {
  return z.boolean();
}

export type SpecCompileReport = z.infer<typeof SpecCompileReportSchema>;

/**
 * CompiledSpec v1 Schema
 */
export const CompiledSpecSchema = z.object({
  spec: EnvironmentSpecV4Schema,
  specHash: z.string(),
  seed: z.number().int(),
  attempt: z.number().int(),
  path: z.array(z.tuple([z.number(), z.number()])),
  compiledAt: z.string(),
  report: SpecCompileReportSchema,
});

export type CompiledSpec = z.infer<typeof CompiledSpecSchema>;

/**
 * RewardSpec v2 Schema
 */
export const RewardComponentSpecSchema = z.object({
  name: z.string(),
  weight: z.number(),
  description: z.string(),
});

export const RewardSpecSchema = z.object({
  entrypoint: z.string().default('compute_step_reward'),
  components: z.array(RewardComponentSpecSchema),
  weights: z.record(z.string(), z.number()),
  summary: z.string(),
  sandboxLimits: z.object({
    maxExecutionMs: z.number().default(5.0),
    maxMemoryMb: z.number().default(16.0),
  }),
  fixtureResults: z.object({
    totalReward: z.number(),
    components: z.record(z.string(), z.number()),
    passed: z.boolean(),
    executionMs: z.number(),
  }).optional(),
});

export type RewardSpec = z.infer<typeof RewardSpecSchema>;
