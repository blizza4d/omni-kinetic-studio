import { z } from 'zod';

export const TerrainStatsSchema = z.object({
  min: z.number(),
  max: z.number(),
  relief: z.number(),
  meanSlope: z.number(),
  p95Slope: z.number(),
  craterCount: z.number(),
  flatFraction: z.number(),
});

export type TerrainStats = z.infer<typeof TerrainStatsSchema>;

export const TerrainRecipeSchema = z.object({
  fbmOctaves: z.number().default(5),
  fbmWavelength: z.number().default(28.0),
  fbmGain: z.number().default(0.5),
  fbmLacunarity: z.number().default(2.0),
  fbmAmplitude: z.number().default(0.9),
  ridgeWavelength: z.number().default(14.0),
  ridgeAmplitude: z.number().default(0.35),
  ridgeCoverage: z.number().default(0.40),
  primaryCratersMin: z.number().default(8),
  primaryCratersMax: z.number().default(16),
  secondaryCratersMin: z.number().default(30),
  secondaryCratersMax: z.number().default(60),
  regolithWavelength: z.number().default(0.6),
  regolithAmplitude: z.number().default(0.02),
  spawnClearRadius: z.number().default(3.0),
  goalClearRadius: z.number().default(4.0),
  corridorWidth: z.number().default(3.0),
  maxSlopeDegrees: z.number().default(28.0),
});

export type TerrainRecipe = z.infer<typeof TerrainRecipeSchema>;

export const TerrainFieldHeaderSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'),
  seed: z.number().int(),
  recipeVersion: z.string().default('1.0'),
  attempt: z.number().int().default(1),
  n: z.literal(257).default(257),
  spacing: z.number().default(0.1875),
  origin: z.literal('center').default('center'),
  extent: z.number().default(48.0),
  triangulation: z.literal('a-d').default('a-d'),
  hash: z.string().length(64),
  stats: TerrainStatsSchema,
  path: z.array(z.tuple([z.number(), z.number()])),
  generatorVersion: z.string().default('1.0'),
});

export type TerrainFieldHeader = z.infer<typeof TerrainFieldHeaderSchema>;

export interface TerrainFieldData extends TerrainFieldHeader {
  heights: Int16Array; // Stored in millimeters (mm), row-major N * N = 66,049 elements
}

export const TerrainReportSchema = z.object({
  seedsTested: z.array(z.number()),
  hashesPerTier: z.record(z.string(), z.string()),
  stats: TerrainStatsSchema,
  parityDeviations: z.object({
    mesh: z.number(), // max deviation in meters
    radar: z.number(),
    debris: z.number(),
    physics: z.number(),
  }),
  reachabilityResults: z.object({
    reachable: z.boolean(),
    pathLength: z.number(),
    corridorClearanceMin: z.number(),
  }),
});

export type TerrainReport = z.infer<typeof TerrainReportSchema>;
