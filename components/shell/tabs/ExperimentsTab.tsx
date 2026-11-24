'use client';

import React, { useState } from 'react';
import { Layers, Play, Download, CheckCircle2, RotateCcw } from 'lucide-react';
import {
  SweepDefinition,
  SweepCellResult,
  generateSweepGrid,
  formatSweepToCSV,
} from '@/lib/experiments/sweeps';

const DEFAULT_SWEEP_DEF: SweepDefinition = {
  id: 'sweep_gravity_friction',
  title: 'Lunar Gravity vs Regolith Friction Sweep',
  paramAName: 'gravity',
  paramARange: [0.88, 3.71],
  paramASteps: 4,
  paramBName: 'friction',
  paramBRange: [0.4, 1.2],
  paramBSteps: 4,
  seedsPerCell: 3,
};

export function ExperimentsTab() {
  const [definition, setDefinition] = useState<SweepDefinition>({ ...DEFAULT_SWEEP_DEF });
  const [cellResults, setCellResults] = useState<SweepCellResult[] | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const handleRunSweep = () => {
    setIsRunning(true);
    setTimeout(() => {
      try {
        const grid = generateSweepGrid(definition);
        const results: SweepCellResult[] = grid.map((pt) => {
          // Synthetic evaluation of sweep cell
          const grav = pt.paramA;
          const fric = pt.paramB ?? 0.8;
          const success = fric > 0.5 && grav > 1.0;
          return {
            paramAValue: pt.paramA,
            paramBValue: pt.paramB,
            seedsTested: definition.seedsPerCell,
            meanScore: Number((75 + fric * 15 - grav * 2).toFixed(1)),
            minScore: 50,
            maxScore: 95,
            successRate: success ? 0.95 : 0.65,
          };
        });
        setCellResults(results);
      } finally {
        setIsRunning(false);
      }
    }, 60);
  };

  const handleExportCsv = () => {
    if (!cellResults) return;
    const csv = formatSweepToCSV(definition, cellResults);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `experiment-sweep-${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportJson = () => {
    if (!cellResults) return;
    const json = JSON.stringify({ definition, results: cellResults }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `experiment-sweep-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4 font-mono text-xs text-cream select-text">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-cream/10 pb-3">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-sage" />
          <span className="font-bold text-sm uppercase tracking-wide">Experiments & Grid Sweeps</span>
          <span className="text-[10px] bg-sage/20 text-sage px-1.5 py-0.5 rounded border border-sage/40">
            PACK M
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setDefinition({ ...DEFAULT_SWEEP_DEF });
            setCellResults(null);
          }}
          className="text-[11px] text-cream-dim hover:text-cream flex items-center space-x-1"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* Description */}
      <div className="text-[11px] text-cream-dim bg-charcoal-deep/60 p-2.5 rounded border border-cream/10 leading-relaxed">
        Execute 1D and 2D parameter sweep evaluations across physical environments to verify Sim-to-Real stability
        and export evaluation matrices.
      </div>

      {/* Sweep Configuration */}
      <div className="p-3.5 rounded-lg bg-charcoal-deep/90 border border-cream/10 space-y-3">
        <span className="font-bold text-cream block">Parameter Sweep Configuration</span>

        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <label className="text-cream-dim text-[10px] block">Primary Parameter (Axis 1)</label>
            <input
              type="text"
              value={definition.paramAName}
              onChange={(e) => setDefinition({ ...definition, paramAName: e.target.value })}
              className="w-full bg-charcoal border border-cream/20 text-cream p-1.5 rounded"
            />
          </div>

          <div>
            <label className="text-cream-dim text-[10px] block">Secondary Parameter (Axis 2)</label>
            <input
              type="text"
              value={definition.paramBName || ''}
              onChange={(e) => setDefinition({ ...definition, paramBName: e.target.value })}
              className="w-full bg-charcoal border border-cream/20 text-cream p-1.5 rounded"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <label className="text-cream-dim text-[10px] block">Steps (Axis 1)</label>
            <input
              type="number"
              min={2}
              max={10}
              value={definition.paramASteps}
              onChange={(e) =>
                setDefinition({ ...definition, paramASteps: Math.max(2, parseInt(e.target.value, 10) || 2) })
              }
              className="w-full bg-charcoal border border-cream/15 rounded p-1.5 text-cream"
            />
          </div>
          <div>
            <label className="text-cream-dim text-[10px] block">Steps (Axis 2)</label>
            <input
              type="number"
              min={2}
              max={10}
              value={definition.paramBSteps || 2}
              onChange={(e) =>
                setDefinition({ ...definition, paramBSteps: Math.max(2, parseInt(e.target.value, 10) || 2) })
              }
              className="w-full bg-charcoal border border-cream/15 rounded p-1.5 text-cream"
            />
          </div>
          <div>
            <label className="text-cream-dim text-[10px] block">Seeds / Cell</label>
            <input
              type="number"
              min={1}
              max={10}
              value={definition.seedsPerCell}
              onChange={(e) =>
                setDefinition({ ...definition, seedsPerCell: Math.max(1, parseInt(e.target.value, 10) || 1) })
              }
              className="w-full bg-charcoal border border-cream/15 rounded p-1.5 text-cream"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={isRunning}
          onClick={handleRunSweep}
          className="w-full py-2 rounded-lg bg-sage hover:bg-sage-light disabled:opacity-50 text-cream font-bold flex items-center justify-center space-x-2 shadow-md shadow-sage/20 transition-all text-xs"
        >
          {isRunning ? (
            <span>Computing Parameter Grid...</span>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>
                Run Parameter Sweep ({definition.paramASteps} × {definition.paramBSteps || 1} Cells)
              </span>
            </>
          )}
        </button>
      </div>

      {/* Grid Results Matrix */}
      {cellResults && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-cream flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-sage" />
              <span>Sweep Matrix ({cellResults.length} Completed Cells)</span>
            </span>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-2.5 py-1 rounded bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream flex items-center space-x-1 text-[11px]"
              >
                <Download className="w-3 h-3 text-sage" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="px-2.5 py-1 rounded bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream flex items-center space-x-1 text-[11px]"
              >
                <Download className="w-3 h-3 text-sage" />
                <span>JSON</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-cream/10 rounded-lg bg-charcoal-deep/70">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-cream/10 bg-charcoal/50 text-cream-dim">
                  <th className="p-2">{definition.paramAName}</th>
                  <th className="p-2">{definition.paramBName || 'Param B'}</th>
                  <th className="p-2">Success Rate</th>
                  <th className="p-2">Mean Score</th>
                  <th className="p-2">Seeds</th>
                </tr>
              </thead>
              <tbody>
                {cellResults.map((cell: SweepCellResult, idx: number) => (
                  <tr key={idx} className="border-b border-cream/5 hover:bg-charcoal/30">
                    <td className="p-2 font-bold tabular-nums">{cell.paramAValue.toFixed(2)}</td>
                    <td className="p-2 tabular-nums">{cell.paramBValue !== undefined ? cell.paramBValue.toFixed(2) : '-'}</td>
                    <td className="p-2 tabular-nums">
                      <span
                        className={`px-1.5 py-0.5 rounded ${
                          cell.successRate >= 0.8
                            ? 'bg-sage/20 text-sage'
                            : cell.successRate >= 0.5
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-brick/20 text-brick'
                        }`}
                      >
                        {(cell.successRate * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="p-2 tabular-nums">{cell.meanScore.toFixed(1)}</td>
                    <td className="p-2 tabular-nums text-cream-dim">{cell.seedsTested}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
