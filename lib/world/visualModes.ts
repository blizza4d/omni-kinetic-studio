/**
 * Visual Render Modes: Thermal, Night Vision, Slope Map, Coverage (Pack O — F-015)
 *
 * Implements shader uniform configurations and analytical coverage calculation:
 * - Standard: Natural lit lunar regolith
 * - Thermal: False-color heatmap representing surface and motor temperature
 * - Night Vision: Phosphor green spectral response with subtle lunar noise
 * - Slope Map: Gradient visualization of terrain incline angles
 * - Coverage Heatmap: Discretized cell visitation grid
 */

export type VisualRenderMode = 'standard' | 'thermal' | 'night_vision' | 'slope' | 'coverage';

export interface VisualModeConfig {
  mode: VisualRenderMode;
  label: string;
  description: string;
  colorFilter: string;
}

export const VISUAL_RENDER_MODES: Record<VisualRenderMode, VisualModeConfig> = {
  standard: {
    mode: 'standard',
    label: 'Standard',
    description: 'Natural low-angle solar illumination on airless regolith',
    colorFilter: 'none',
  },
  thermal: {
    mode: 'thermal',
    label: 'Thermal IR',
    description: 'False-color infrared temperature distribution (180K - 380K)',
    colorFilter: 'hue-rotate(220deg) saturate(1.8)',
  },
  night_vision: {
    mode: 'night_vision',
    label: 'Night Vision',
    description: 'Intensified phosphor green with high-contrast shadows',
    colorFilter: 'sepia(1) hue-rotate(85deg) saturate(2.4) contrast(1.3)',
  },
  slope: {
    mode: 'slope',
    label: 'Slope Gradient',
    description: 'Surface gradient steepness map for rover traversability',
    colorFilter: 'hue-rotate(140deg) saturate(1.4)',
  },
  coverage: {
    mode: 'coverage',
    label: 'Survey Coverage',
    description: 'Cumulative spatial exploration heatmap',
    colorFilter: 'saturate(0.5) contrast(1.1)',
  },
};

export class CoverageGrid {
  private readonly visitedCells = new Set<string>();
  private readonly cellSize = 1.0; // 1 meter grid cells
  private readonly totalArenaCells = 40 * 40; // 1,600 cells

  public reset(): void {
    this.visitedCells.clear();
  }

  public recordPosition(x: number, z: number): void {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    this.visitedCells.add(`${cx},${cz}`);
  }

  public getCoverageStats(): { visitedCount: number; coveragePct: number } {
    const count = this.visitedCells.size;
    const pct = Math.min(100, (count / this.totalArenaCells) * 100);
    return {
      visitedCount: count,
      coveragePct: Number(pct.toFixed(2)),
    };
  }
}
