import { BuildStamp, BuildStampSchema, formatBuildStamp } from '@/contracts/build_stamp';

let currentGpuRenderer = 'Detecting...';
let currentModelIds = {
  ultra: 'nvidia/Nemotron-3-Ultra-550b-a55b',
  super: 'nvidia/nemotron-3-super-120b-a12b',
  nano: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
};

export function setRuntimeGpuRenderer(renderer: string) {
  if (renderer && renderer !== 'Unknown') {
    currentGpuRenderer = renderer;
  }
}

export function setRuntimeModelIds(ids: { ultra?: string; super?: string; nano?: string }) {
  currentModelIds = { ...currentModelIds, ...ids };
}

export function getBuildStamp(): BuildStamp {
  const isProd = process.env.NODE_ENV === 'production';
  const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || '780d751';
  const branch = process.env.NEXT_PUBLIC_GIT_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main';

  return BuildStampSchema.parse({
    sha: gitSha.substring(0, 8),
    branch,
    iterationTag: isProd ? 'v1.0.0-production' : 'v1.0.0-dev',
    buildType: isProd ? 'production' : 'development',
    contractVersions: {
      EnvironmentSpec: 'v4',
      TelemetryFrame: 'v4',
      TerrainField: 'v1',
      BuildStamp: 'v2',
      CompiledSpec: 'v1',
      VisualReport: 'v1',
      AcceptanceMatrix: 'v1',
    },
    gpuRenderer: currentGpuRenderer,
    modelIds: currentModelIds,
    createdAt: new Date().toISOString(),
  });
}

export { formatBuildStamp };
