'use client';

import React from 'react';
import {
  Trophy,
  Activity,
  Zap,
  ShieldCheck,
  RotateCcw,
  Download,
  X,
  Cpu,
  Coins,
  CheckCircle2,
} from 'lucide-react';
import { RunSummary, EnvironmentSpec, TelemetryFrame } from '@/contracts';
import { exportSyntheticDataset, downloadDatasetFile } from '@/lib/dataset/synthetic_exporter';

interface RunSummaryCardProps {
  summary: RunSummary;
  envSpec: EnvironmentSpec;
  historyFrames: TelemetryFrame[];
  onReplay: () => void;
  onClose: () => void;
}

export default function RunSummaryCard({
  summary,
  envSpec,
  historyFrames,
  onReplay,
  onClose,
}: RunSummaryCardProps) {
  const handleExport = () => {
    const bundle = exportSyntheticDataset(envSpec, historyFrames);
    const filename = `${envSpec.taskName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_dataset.jsonl`;
    downloadDatasetFile(filename, bundle.jsonlContent);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-deep/70 backdrop-blur-sm select-none">
      <div className="w-full max-w-lg analog-glass-elevated border border-sage/40 rounded-xl overflow-hidden shadow-2xl font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-cream/10 bg-charcoal-deep">
          <div className="flex items-center space-x-2.5">
            <span className="p-1.5 rounded-lg bg-sage/20 border border-sage/40 text-sage">
              <Trophy className="w-4 h-4" />
            </span>
            <div>
              <div className="font-bold text-cream text-xs uppercase tracking-wider flex items-center space-x-2">
                <span>Simulation Run Complete</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sage/20 text-sage uppercase border border-sage/30">
                  {summary.success ? 'Success' : 'Incomplete'}
                </span>
              </div>
              <div className="text-[10px] text-cream-dim">{envSpec.taskName}</div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-cream-dim hover:text-cream hover:bg-charcoal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-cream">
          {/* Truth-in-UI Mode Badge */}
          <div className="p-2.5 rounded-lg bg-charcoal-deep/80 border border-cream/10 flex items-center justify-between text-[11px]">
            <div className="flex items-center space-x-2">
              <Cpu className="w-3.5 h-3.5 text-sage" />
              <span className="text-cream-dim">Execution Provider:</span>
              <span className="font-bold text-cream uppercase">
                {summary.mode === 'cloud_nebius' ? 'CLOUD: NEBIUS L40S' : 'DEMO: LOCAL RUNNER'}
              </span>
            </div>
            <span className="text-[9px] text-cream-dim px-2 py-0.5 rounded bg-charcoal border border-cream/5 uppercase">
              {summary.mode === 'cloud_nebius' ? 'Headless Serverless' : 'Deterministic Physics'}
            </span>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-3 rounded-lg bg-charcoal/40 border border-cream/5 space-y-1">
              <div className="text-cream-dim text-[10px] uppercase">Distance Covered</div>
              <div className="text-base font-bold text-cream">
                {summary.distanceCovered.toFixed(2)} m
              </div>
              <div className="text-[9px] text-cream-dim">Goal: {envSpec.successCriteria.targetDistance} m</div>
            </div>

            <div className="p-3 rounded-lg bg-charcoal/40 border border-cream/5 space-y-1">
              <div className="text-cream-dim text-[10px] uppercase">Mean Step Reward</div>
              <div className="text-base font-bold text-sage">
                {summary.meanReward > 0 ? `+${summary.meanReward.toFixed(2)}` : summary.meanReward.toFixed(2)}
              </div>
              <div className="text-[9px] text-cream-dim">Vectorized step reward</div>
            </div>

            <div className="p-3 rounded-lg bg-charcoal/40 border border-cream/5 space-y-1">
              <div className="text-cream-dim text-[10px] uppercase">Collisions Avoided</div>
              <div className="text-base font-bold text-cream">
                {summary.collisionCount === 0 ? '100% Clean' : `${summary.collisionCount} Touches`}
              </div>
              <div className="text-[9px] text-cream-dim">Torso impacts: 0</div>
            </div>

            <div className="p-3 rounded-lg bg-charcoal/40 border border-cream/5 space-y-1">
              <div className="text-cream-dim text-[10px] uppercase">Energy Consumed</div>
              <div className="text-base font-bold text-cream">
                {summary.energyConsumed.toFixed(1)} J
              </div>
              <div className="text-[9px] text-cream-dim">Duration: {summary.durationSeconds.toFixed(1)}s</div>
            </div>
          </div>

          {/* Token & Compute Accounting */}
          <div className="p-3 rounded-lg bg-charcoal-deep/60 border border-cream/10 flex items-center justify-between text-[11px]">
            <div className="flex items-center space-x-2">
              <Coins className="w-3.5 h-3.5 text-sage" />
              <span className="text-cream-dim">Compute / Token Spend:</span>
            </div>
            <div className="text-right">
              <span className="font-bold text-cream">
                ${summary.costUsd.toFixed(4)} USD
              </span>
              <span className="text-cream-dim text-[10px] ml-1.5">
                ({summary.tokens.total.toLocaleString()} tokens)
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-cream/10 bg-charcoal-deep/80 flex items-center justify-between space-x-2">
          <button
            onClick={onReplay}
            className="flex-1 py-2 px-3 rounded-lg bg-charcoal hover:bg-charcoal-light border border-cream/20 text-cream font-semibold flex items-center justify-center space-x-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Replay Run</span>
          </button>

          <button
            onClick={handleExport}
            className="flex-1 py-2 px-3 rounded-lg bg-sage hover:bg-sage-light text-cream font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-lg shadow-sage/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Dataset (JSONL)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
