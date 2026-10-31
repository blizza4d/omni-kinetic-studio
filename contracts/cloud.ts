import { z } from 'zod';
import { BuildStampSchema } from './build_stamp';

/**
 * 1. CloudJob v1 Schema
 */
export const CloudJobSchema = z.object({
  jobId: z.string(),
  runId: z.string(),
  region: z.string().default('eu-north1'),
  imageDigest: z.string().default('cr.nemotron.nvidia.com/embodied-ai:latest@sha256:d8a2...'),
  resources: z.object({
    gpu: z.string().default('1x NVIDIA L40S 48GB'),
    vcpus: z.number().default(8),
    memoryGb: z.number().default(32),
  }),
  bucket: z.string().default('omni-kinetic-jobs'),
  prefix: z.string(),
  specHash: z.string(),
  terrainHash: z.string(),
  seed: z.number(),
  caps: z.object({
    maxDurationSec: z.number().default(180),
    maxCostUsd: z.number().default(5.0),
    maxTokens: z.number().default(200000),
  }),
  createdAt: z.string(),
});

export type CloudJob = z.infer<typeof CloudJobSchema>;

/**
 * 2. JobStatus v3 Schema
 */
export const JobStatusV3Schema = z.object({
  jobId: z.string(),
  state: z.enum(['queued', 'cold_start', 'running', 'succeeded', 'failed', 'cancelled']),
  status: z.enum(['queued', 'cold_start', 'running', 'succeeded', 'failed', 'cancelled']).optional(),
  progress: z.number().min(0).max(100),
  message: z.string(),
  mode: z.enum(['local_demo', 'cloud_nebius', 'cached_cloud']),
  elapsed: z.number().default(0),
  costSoFar: z.number().default(0.0),
  estimatedRange: z.tuple([z.number(), z.number()]).default([0.01, 0.05]),
  region: z.string().default('local'),
  heartbeatAge: z.number().default(0),
  lastError: z.string().optional(),
  currentEpisode: z.number().optional().default(1),
  currentReward: z.number().optional().default(0),
  collisionCount: z.number().default(0),
  successRate: z.number().default(1.0),
  timestamp: z.number().default(Date.now),
}).transform((data) => ({
  ...data,
  status: data.state,
}));

export type JobStatusV3 = z.infer<typeof JobStatusV3Schema>;

/**
 * 3. Telemetry Chunk & Manifest
 */
export const TelemetryChunkSchema = z.object({
  chunkIndex: z.number().int().min(0),
  seqStart: z.number().int(),
  seqEnd: z.number().int(),
  tStart: z.number(),
  tEnd: z.number(),
  frameCount: z.number().int(),
  checksum: z.string(),
  byteSize: z.number().int(),
  frames: z.array(z.record(z.string(), z.any())),
  buildStamp: z.string().optional(),
});

export type TelemetryChunk = z.infer<typeof TelemetryChunkSchema>;

export const TelemetryManifestSchema = z.object({
  jobId: z.string(),
  totalChunks: z.number().int(),
  totalFrames: z.number().int(),
  tStart: z.number(),
  tEnd: z.number(),
  chunks: z.array(z.object({
    chunkIndex: z.number().int(),
    seqStart: z.number().int(),
    seqEnd: z.number().int(),
    checksum: z.string(),
    key: z.string(),
  })),
  createdAt: z.string(),
});

export type TelemetryManifest = z.infer<typeof TelemetryManifestSchema>;

/**
 * 4. Relay Stats v1
 */
export const RelayStatsSchema = z.object({
  chunksReceived: z.number().int().default(0),
  gapsDetected: z.number().int().default(0),
  duplicatesDropped: z.number().int().default(0),
  reconnectCount: z.number().int().default(0),
  relayLagMs: z.number().default(0),
  bufferedMs: z.number().default(0),
  status: z.enum(['healthy', 'buffering', 'reconnecting', 'stalled']).default('healthy'),
});

export type RelayStats = z.infer<typeof RelayStatsSchema>;
