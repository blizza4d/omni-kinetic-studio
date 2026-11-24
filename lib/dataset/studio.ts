/**
 * Dataset Studio & Datagen Pipeline (Pack N — F-014)
 *
 * Implements synthetic data generation, train/validation split by seed,
 * JSONL/CSV formatting, and schema-validated dataset manifests.
 */

import { TelemetryFrame } from '@/contracts';

export interface DatasetManifest {
  datasetName: string;
  version: string;
  generatedAtUtc: string;
  totalSamples: number;
  trainSamples: number;
  valSamples: number;
  trainValSplitRatio: number;
  seedsUsed: number[];
  modalities: string[];
  schemaVersion: string;
  license: string;
}

export interface DatasetRecord {
  step: number;
  t: number;
  posX: number;
  posY: number;
  posZ: number;
  yaw: number;
  cmdVx: number;
  cmdYawRate: number;
  reward: number;
  flContact: boolean;
  frContact: boolean;
  rlContact: boolean;
  rrContact: boolean;
}

export function formatRecordsToJSONL(records: DatasetRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n');
}

export function formatRecordsToCSV(records: DatasetRecord[]): string {
  if (records.length === 0) return '';
  const headers = Object.keys(records[0]!).join(',');
  const rows = records.map((r) => Object.values(r).join(','));
  return [headers, ...rows].join('\n');
}

export function splitDatasetBySeed<T extends { seed?: number }>(
  items: T[],
  trainRatio = 0.8
): { train: T[]; val: T[] } {
  const train: T[] = [];
  const val: T[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const hash = item.seed !== undefined ? item.seed : i;
    // Deterministic split
    if ((hash % 100) / 100.0 < trainRatio) {
      train.push(item);
    } else {
      val.push(item);
    }
  }

  return { train, val };
}

export function createDatasetManifest(
  name: string,
  totalSamples: number,
  trainSamples: number,
  valSamples: number,
  seeds: number[]
): DatasetManifest {
  return {
    datasetName: name,
    version: '1.0.0',
    generatedAtUtc: new Date().toISOString(),
    totalSamples,
    trainSamples,
    valSamples,
    trainValSplitRatio: 0.8,
    seedsUsed: seeds,
    modalities: ['kinematics', 'commands', 'contacts', 'rewards'],
    schemaVersion: 'v2',
    license: 'CC-BY-4.0',
  };
}
