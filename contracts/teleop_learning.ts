import { z } from 'zod';

/**
 * 1. LandmarkFrame v1 Schema
 */
export const LandmarkFrameSchema = z.object({
  captureStamp: z.number(), // performance.now() at capture
  hands: z.array(z.object({
    handedness: z.enum(['Left', 'Right']),
    landmarks: z.array(z.tuple([z.number(), z.number(), z.number()])), // 21 normalized landmarks [x, y, z]
    confidence: z.number().min(0).max(1),
  })),
  face: z.object({
    landmarks: z.array(z.tuple([z.number(), z.number(), z.number()])).optional(),
    yaw: z.number().default(0),
    pitch: z.number().default(0),
    roll: z.number().default(0),
    confidence: z.number().min(0).max(1).default(1.0),
  }).optional(),
  backend: z.enum(['webgpu', 'wasm', 'cpu', 'replay', 'keyboard', 'fake']),
  timings: z.object({
    capture: z.number().default(0),
    inference: z.number().default(0),
    mapping: z.number().default(0),
    total: z.number().default(0),
  }),
});

export type LandmarkFrame = z.infer<typeof LandmarkFrameSchema>;

/**
 * 2. CalibrationProfile v1 Schema
 */
export const CalibrationProfileSchema = z.object({
  id: z.string(),
  handedness: z.enum(['Left', 'Right']).default('Right'),
  handSpaceBounds: z.object({
    minX: z.number().default(0.2),
    maxX: z.number().default(0.8),
    minY: z.number().default(0.2),
    maxY: z.number().default(0.8),
    minZ: z.number().default(-0.1),
    maxZ: z.number().default(0.1),
  }),
  gains: z.object({
    footReachScale: z.number().default(0.25),
    stiffnessScale: z.number().default(1.0),
    bodyRollScaleDeg: z.number().default(15.0),
    bodyHeightScaleM: z.number().default(0.06),
    cameraOrbitScale: z.number().default(1.2),
  }),
  filter: z.object({
    minCutoff: z.number().default(1.0),
    beta: z.number().default(0.007),
    dCutoff: z.number().default(1.0),
    deadzone: z.number().default(0.015),
  }),
  cameraResolution: z.tuple([z.number(), z.number()]).default([640, 480]),
  createdAt: z.string(),
});

export type CalibrationProfile = z.infer<typeof CalibrationProfileSchema>;

/**
 * 3. TeleopCommand v2 Schema
 */
export const TeleopCommandV2Schema = z.object({
  t: z.number(),
  limb: z.enum(['FL', 'FR', 'RL', 'RR', 'all']).default('FL'),
  footTarget: z.tuple([z.number(), z.number(), z.number()]), // [x, y, z] in body frame
  stanceStiffness: z.number().min(0).max(1).default(0.8),
  bodyHeightOffset: z.number().default(0), // m
  bodyRollOffset: z.number().default(0),   // rad
  speedCmd: z.number().optional(),
  headingCmd: z.number().optional(),
  cameraPose: z.object({
    yaw: z.number(),
    pitch: z.number(),
  }).optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  source: z.enum(['camera_mediapipe', 'keyboard_fallback', 'replay_landmark']),
  stamps: z.object({
    capture: z.number(),
    mapping: z.number(),
  }),
});

export type TeleopCommandV2 = z.infer<typeof TeleopCommandV2Schema>;

/**
 * 4. TakeoverSession v1 Schema
 */
export const TakeoverSessionSchema = z.object({
  sessionId: z.string(),
  runId: z.string(),
  sourceMode: z.enum(['local_demo', 'cloud_nebius', 'cached_cloud']),
  snapshot: z.object({
    t: z.number(),
    episode: z.number(),
    robotPos: z.tuple([z.number(), z.number(), z.number()]),
    robotQuat: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    robotVel: z.tuple([z.number(), z.number(), z.number()]),
    jointAngles: z.record(z.string(), z.number()),
    feetWorldPos: z.record(z.string(), z.tuple([z.number(), z.number(), z.number()])),
    gaitPhase: z.number(),
  }),
  specHash: z.string(),
  terrainHash: z.string(),
  seed: z.number(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  blendSettings: z.object({
    blendDurationSec: z.number().default(0.5),
    idleTimeoutSec: z.number().default(1.5),
  }),
  validatorCounters: z.object({
    groundPenetrationsPrevented: z.number().default(0),
    boundaryClampsApplied: z.number().default(0),
    jointLimitClampsApplied: z.number().default(0),
  }),
});

export type TakeoverSession = z.infer<typeof TakeoverSessionSchema>;

/**
 * 5. DemonstrationEpisode v2 Schema
 */
export const DemonstrationEpisodeV2Schema = z.object({
  id: z.string(),
  takeoverSessionId: z.string(),
  policyVersion: z.string().default('v1'),
  frames: z.array(z.object({
    t: z.number(),
    observation: z.object({
      terrainPatch: z.array(z.number()), // 7x7 relative heights = 49 numbers
      velocity: z.tuple([z.number(), z.number(), z.number()]),
      rollPitch: z.tuple([z.number(), z.number()]),
      goalHeadingError: z.number(),
      boundaryDistance: z.number(),
    }),
    action: z.object({
      footOffsets: z.record(z.string(), z.tuple([z.number(), z.number(), z.number()])),
      bodyHeightOffset: z.number(),
      bodyRollOffset: z.number(),
    }),
    baselineAction: z.object({
      footOffsets: z.record(z.string(), z.tuple([z.number(), z.number(), z.number()])),
      bodyHeightOffset: z.number(),
      bodyRollOffset: z.number(),
    }),
    confidence: z.number(),
  })),
  source: z.enum(['camera_mediapipe', 'keyboard_fallback', 'replay_landmark']),
  duration: z.number(),
  calibrationId: z.string().optional(),
  labels: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export type DemonstrationEpisodeV2 = z.infer<typeof DemonstrationEpisodeV2Schema>;

/**
 * 6. DatasetManifest v1 Schema
 */
export const DatasetManifestSchema = z.object({
  manifestId: z.string(),
  totalEpisodes: z.number(),
  totalFrames: z.number(),
  sources: z.record(z.string(), z.number()),
  trainEpisodeIds: z.array(z.string()),
  valEpisodeIds: z.array(z.string()),
  heldOutSeeds: z.array(z.number()), // Strictly disjoint from train
  sha256Checksum: z.string(),
  createdAt: z.string(),
});

export type DatasetManifest = z.infer<typeof DatasetManifestSchema>;

/**
 * 7. PolicyCheckpoint v1 Schema
 */
export const PolicyCheckpointSchema = z.object({
  version: z.string(), // 'v1', 'v2', 'v3'
  parentVersion: z.string().nullable(),
  method: z.enum(['controller_pure', 'behavior_cloning_residual', 'dagger_residual']),
  architecture: z.object({
    inputDim: z.number().default(56),
    hiddenDims: z.array(z.number()).default([32, 32]),
    outputDim: z.number().default(14),
  }),
  weights: z.array(z.number()),
  weightsHash: z.string(),
  normalization: z.object({
    mean: z.array(z.number()),
    std: z.array(z.number()),
  }),
  clamps: z.object({
    maxFootOffsetM: z.number().default(0.04),
    maxRollOffsetRad: z.number().default(0.26), // ~15 deg
    maxHeightOffsetM: z.number().default(0.05),
  }),
  trainingDatasetIds: z.array(z.string()),
  createdAt: z.string(),
});

export type PolicyCheckpoint = z.infer<typeof PolicyCheckpointSchema>;

/**
 * 8. TrainingReport v1 Schema
 */
export const TrainingReportSchema = z.object({
  policyVersion: z.string(),
  datasetSize: z.number(),
  epochsTrained: z.number(),
  trainLossHistory: z.array(z.number()),
  valLossHistory: z.array(z.number()),
  finalValLoss: z.number(),
  durationSec: z.number(),
  device: z.enum(['client_worker_cpu', 'client_webgpu', 'cloud_l40s']),
  warnings: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export type TrainingReport = z.infer<typeof TrainingReportSchema>;

/**
 * 9. EvalReport v1 Schema
 */
export const EvalMetricStatsSchema = z.object({
  mean: z.number(),
  std: z.number(),
  ci95: z.tuple([z.number(), z.number()]), // [lower, upper]
});

export const EvalReportSchema = z.object({
  evalId: z.string(),
  policyA: z.string(), // e.g. 'v1'
  policyB: z.string(), // e.g. 'v2'
  seeds: z.array(z.number()),
  metrics: z.object({
    successRateA: EvalMetricStatsSchema,
    successRateB: EvalMetricStatsSchema,
    goalProgressA: EvalMetricStatsSchema,
    goalProgressB: EvalMetricStatsSchema,
    collisionCountA: EvalMetricStatsSchema,
    collisionCountB: EvalMetricStatsSchema,
    stallTimeSecA: EvalMetricStatsSchema,
    stallTimeSecB: EvalMetricStatsSchema,
    meanRewardA: EvalMetricStatsSchema,
    meanRewardB: EvalMetricStatsSchema,
  }),
  pairedDiffCI95: z.object({
    successRateDelta: z.tuple([z.number(), z.number()]),
    progressDelta: z.tuple([z.number(), z.number()]),
    rewardDelta: z.tuple([z.number(), z.number()]),
  }),
  verdict: z.enum(['improved', 'no_significant_change', 'worse']),
  verdictExplanation: z.string(),
  protocolHash: z.string(),
  createdAt: z.string(),
});

export type EvalReport = z.infer<typeof EvalReportSchema>;

/**
 * 10. JudgeScript v1 Schema
 */
export const JudgeScriptStepSchema = z.object({
  id: z.string(),
  caption: z.string(),
  durationMs: z.number(),
  action: z.string(),
  label: z.enum(['Live', 'Cached', 'Fixture', 'Scripted']),
  payload: z.record(z.string(), z.any()).optional(),
});

export const JudgeScriptSchema = z.object({
  scriptId: z.string(),
  title: z.string(),
  estimatedDurationSec: z.number(),
  steps: z.array(JudgeScriptStepSchema),
});

export type JudgeScript = z.infer<typeof JudgeScriptSchema>;

/**
 * 11. FlagSet v1 Schema
 */
export const FlagSetSchema = z.object({
  CLOUD_ENABLED: z.boolean(),
  LIVE_LLM_ENABLED: z.boolean(),
  VISION_ENABLED: z.boolean(),
  ONNX_PROVIDER_ENABLED: z.boolean(),
  LEARNING_ENABLED: z.boolean(),
  JUDGE_MODE_ENABLED: z.boolean(),
  DEBUG_ENABLED: z.boolean(),
});

export type FlagSet = z.infer<typeof FlagSetSchema>;
