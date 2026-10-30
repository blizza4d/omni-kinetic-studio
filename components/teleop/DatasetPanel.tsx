'use client';

import React, { useState } from 'react';
import {
  Layers,
  Sparkles,
  Download,
  Trash2,
  X,
  CheckCircle2,
  Play,
  RotateCcw,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { DemonstrationEpisode } from '@/contracts';

interface DatasetPanelProps {
  isOpen: boolean;
  onClose: () => void;
  episodes: any[];
  onTrainWithCorrections: (selectedEpisodeIds: string[]) => void;
}

export default function DatasetPanel({
  isOpen,
  onClose,
  episodes,
  onTrainWithCorrections,
}: DatasetPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    episodes.map((_, idx) => `ep_${idx + 1}`)
  );

  if (!isOpen) return null;

  const totalSteps = episodes.reduce((acc, ep) => acc + (ep.length || 0), 0);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleExport = () => {
    const dataset = {
      version: '1.0',
      type: 'DAgger_human_correction_episodes',
      totalEpisodes: episodes.length,
      createdAt: new Date().toISOString(),
      episodes,
    };
    const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omni_dagger_demonstration_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-deep/70 backdrop-blur-sm select-none font-mono text-xs">
      <div className="w-full max-w-lg analog-glass-elevated border border-cream/20 rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-cream/10 bg-charcoal-deep">
          <div className="flex items-center space-x-2.5">
            <span className="p-1.5 rounded-lg bg-sage/20 border border-sage/40 text-sage">
              <Layers className="w-4 h-4" />
            </span>
            <div>
              <div className="font-bold text-cream uppercase tracking-wider flex items-center space-x-2">
                <span>DAgger Demonstration Dataset</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sage/20 text-sage uppercase border border-sage/30">
                  {episodes.length} Episodes
                </span>
              </div>
              <div className="text-[10px] text-cream-dim">
                Human teleoperation trajectory corrections for Iteration N+1 policy training
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-cream-dim hover:text-cream hover:bg-charcoal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Truth-in-UI Banner */}
        <div className="px-5 py-2.5 bg-sage/10 border-b border-sage/20 text-[11px] text-cream flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-3.5 h-3.5 text-sage flex-shrink-0" />
            <span>Behavior Cloning Ingestion & Policy Rollout</span>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-charcoal border border-cream/10 uppercase text-cream-dim">
            [SIMULATED IMPROVEMENT (DEMO)]
          </span>
        </div>

        {/* Episode List */}
        <div className="flex-1 p-5 overflow-y-auto space-y-2.5">
          {episodes.length === 0 ? (
            <div className="text-center py-8 space-y-2 text-cream-dim">
              <Layers className="w-8 h-8 mx-auto opacity-40 text-sage" />
              <div className="font-bold text-cream">No Demonstrations Recorded Yet</div>
              <div className="text-[11px] max-w-xs mx-auto">
                Press [T] to open teleoperation mode and click &ldquo;Record Correction&rdquo; when correcting the robot.
              </div>
            </div>
          ) : (
            episodes.map((ep, idx) => {
              const epId = `ep_${idx + 1}`;
              const isChecked = selectedIds.includes(epId);
              const stepCount = ep.length || 0;
              const durationSec = (stepCount / 60).toFixed(1);

              return (
                <div
                  key={epId}
                  onClick={() => toggleSelect(epId)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                    isChecked
                      ? 'bg-charcoal-deep/90 border-sage/50 text-cream'
                      : 'bg-charcoal/40 border-cream/10 text-cream-dim opacity-60'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelect(epId)}
                      className="accent-sage rounded"
                    />
                    <div>
                      <div className="font-bold text-cream flex items-center space-x-2">
                        <span>Episode #{idx + 1}</span>
                        <span className="text-[9px] px-1 rounded bg-charcoal text-cream-dim border border-cream/10 uppercase">
                          Camera Teleop
                        </span>
                      </div>
                      <div className="text-[10px] text-cream-dim">
                        {stepCount} steps ({durationSec}s) • Confidence: 98.4%
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-[10px]">
                    <span className="text-sage font-bold">Ready</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-cream/10 bg-charcoal-deep flex items-center justify-between space-x-2">
          <button
            onClick={handleExport}
            disabled={episodes.length === 0}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream-dim hover:text-cream text-xs transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export (.json)</span>
          </button>

          <button
            onClick={() => {
              onTrainWithCorrections(selectedIds);
              onClose();
            }}
            disabled={episodes.length === 0}
            className="flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg bg-sage hover:bg-sage-light text-cream font-bold text-xs transition-colors shadow-lg shadow-sage/20 disabled:opacity-40"
          >
            <TrendingUp className="w-4 h-4" />
            <span>Train Iteration 2 with Corrections</span>
          </button>
        </div>
      </div>
    </div>
  );
}
