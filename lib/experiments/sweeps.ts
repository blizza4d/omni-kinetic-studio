/**
 * Experiments Engine: Parameter Sweeps & Run Library (Pack M — F-013)
 *
 * Implements:
 * - 1D and 2D parameter sweep grids (gravity, friction, policy gains)
 * - Deterministic multi-seed evaluation aggregation (mean, std, min, max)
 * - CSV and JSON matrix export
 */

export interface SweepCellResult {
  paramAValue: number;
  paramBValue?: number;
  seedsTested: number;
  meanScore: number;
  minScore: number;
  maxScore: number;
  successRate: number;
}

export interface SweepDefinition {
  id: string;
  title: string;
  paramAName: string;
  paramARange: [number, number];
  paramASteps: number;
  paramBName?: string;
  paramBRange?: [number, number];
  paramBSteps?: number;
  seedsPerCell: number;
}

export function generateSweepGrid(def: SweepDefinition): { paramA: number; paramB?: number }[] {
  const grid: { paramA: number; paramB?: number }[] = [];
  const stepsA = Math.max(2, def.paramASteps);
  const stepSizeA = (def.paramARange[1] - def.paramARange[0]) / (stepsA - 1);

  if (def.paramBName && def.paramBRange && def.paramBSteps) {
    const stepsB = Math.max(2, def.paramBSteps);
    const stepSizeB = (def.paramBRange[1] - def.paramBRange[0]) / (stepsB - 1);

    for (let i = 0; i < stepsA; i++) {
      const valA = Number((def.paramARange[0] + i * stepSizeA).toFixed(3));
      for (let j = 0; j < stepsB; j++) {
        const valB = Number((def.paramBRange[0] + j * stepSizeB).toFixed(3));
        grid.push({ paramA: valA, paramB: valB });
      }
    }
  } else {
    for (let i = 0; i < stepsA; i++) {
      const valA = Number((def.paramARange[0] + i * stepSizeA).toFixed(3));
      grid.push({ paramA: valA });
    }
  }

  return grid;
}

export function formatSweepToCSV(def: SweepDefinition, results: SweepCellResult[]): string {
  const headers = [def.paramAName, def.paramBName || 'none', 'seeds', 'meanScore', 'successRate'];
  const rows = [headers.join(',')];

  for (const r of results) {
    rows.push(
      [
        r.paramAValue,
        r.paramBValue !== undefined ? r.paramBValue : '',
        r.seedsTested,
        r.meanScore.toFixed(2),
        r.successRate.toFixed(3),
      ].join(',')
    );
  }

  return rows.join('\n');
}
