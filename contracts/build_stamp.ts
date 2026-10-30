import { z } from 'zod';

export const BuildStampSchema = z.object({
  sha: z.string().default('21842619'),
  branch: z.string().default('main'),
  iterationTag: z.string().default('iteration-4-baseline'),
  buildType: z.enum(['development', 'production']).default('production'),
  contractVersions: z.record(z.string(), z.string()).default({
    EnvironmentSpec: 'v4',
    TelemetryFrame: 'v4',
    TerrainField: 'v1',
    BuildStamp: 'v1',
    CompiledSpec: 'v1',
    VisualReport: 'v1',
  }),
  gpuRenderer: z.string().default('ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU (0x000025A2) Direct3D11 vs_5_0 ps_5_0, D3D11)'),
  modelIds: z.object({
    ultra: z.string().default('nvidia/Nemotron-3-Ultra-550b-a55b'),
    super: z.string().default('nvidia/nemotron-3-super-120b-a12b'),
    nano: z.string().default('nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'),
  }).default({}),
  createdAt: z.string().default(() => new Date().toISOString()),
});

export type BuildStamp = z.infer<typeof BuildStampSchema>;

export function formatBuildStamp(stamp: BuildStamp): string {
  return `${stamp.iterationTag} • git:${stamp.sha} (${stamp.branch}) • ${stamp.buildType}`;
}
