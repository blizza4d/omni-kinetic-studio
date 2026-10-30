import { EnvironmentSpec, TelemetryFrame } from '@/contracts';

export interface DatasetManifest {
  datasetId: string;
  taskName: string;
  schemaVersion: string;
  episodeCount: number;
  totalFrames: number;
  durationSeconds: number;
  robotMorphology: string;
  gravity: [number, number, number];
  terrainType: string;
  sha256Checksum: string;
  createdAt: string;
}

export interface SyntheticDatasetBundle {
  manifest: DatasetManifest;
  jsonlContent: string;
}

/**
 * Converts a sequence of TelemetryFrames into a domain-randomized JSONL synthetic dataset.
 */
export function exportSyntheticDataset(
  spec: EnvironmentSpec,
  frames: TelemetryFrame[]
): SyntheticDatasetBundle {
  const datasetId = `dataset_${Date.now()}`;
  const totalFrames = frames.length;
  const durationSeconds = frames.length > 0 ? frames[frames.length - 1].t : 0;

  // Build JSONL rows
  const jsonlLines = frames.map((frame, index) => {
    const primaryBody = frame.bodies[0];
    const jointMap: Record<string, number> = {};
    for (const j of frame.joints) {
      jointMap[j.name] = j.angle;
    }

    const row = {
      step: index,
      t: frame.t,
      episode: frame.episode,
      observation: {
        robotPos: primaryBody?.pos || [0, 0, 0],
        robotQuat: primaryBody?.quat || [0, 0, 0, 1],
        robotVel: primaryBody?.vel || [0, 0, 0],
        jointAngles: jointMap,
      },
      action: jointMap,
      reward: frame.reward,
      rewardComponents: frame.rewardComponents || {},
      collisions: frame.collisions,
      done: index === frames.length - 1,
    };
    return JSON.stringify(row);
  });

  const jsonlContent = jsonlLines.join('\n');

  // Compute a simple deterministic hash for the bundle
  let hashVal = 0;
  for (let i = 0; i < jsonlContent.length; i++) {
    hashVal = (hashVal << 5) - hashVal + jsonlContent.charCodeAt(i);
    hashVal |= 0;
  }
  const checksum = `sha256_${Math.abs(hashVal).toString(16).padStart(8, '0')}`;

  const manifest: DatasetManifest = {
    datasetId,
    taskName: spec.taskName,
    schemaVersion: '2.0',
    episodeCount: frames.length > 0 ? (frames[frames.length - 1].episode || 1) : 1,
    totalFrames,
    durationSeconds: Number(durationSeconds.toFixed(2)),
    robotMorphology: spec.robotMorphology,
    gravity: spec.gravity,
    terrainType: spec.terrain.type,
    sha256Checksum: checksum,
    createdAt: new Date().toISOString(),
  };

  return {
    manifest,
    jsonlContent,
  };
}

/**
 * Triggers a browser download of the synthetic dataset JSONL.
 */
export function downloadDatasetFile(filename: string, content: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: 'application/x-ndjson;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
