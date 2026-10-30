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
  return BuildStampSchema.parse({
    sha: '21842619',
    branch: 'main',
    iterationTag: 'iteration-5-dev (baseline: iteration-4-baseline)',
    buildType: isProd ? 'production' : 'development',
    contractVersions: {
      EnvironmentSpec: 'v4',
      TelemetryFrame: 'v4',
      TerrainField: 'v1',
      BuildStamp: 'v1',
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
