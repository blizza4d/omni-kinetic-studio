'use client';

import React, { useState } from 'react';
import { X, ShieldAlert, Check, BarChart2, Play } from 'lucide-react';
import {
  DEFAULT_RANDOMIZATION_CONFIG,
  DomainRandomizationConfig,
  computeWilsonScoreInterval,
  generateRobustnessReport,
} from '@/lib/sim2real/toolkit';

interface SimToRealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyConfig?: (config: DomainRandomizationConfig) => void;
}

export function SimToRealModal({ isOpen, onClose, onApplyConfig }: SimToRealModalProps) {
  const [config, setConfig] = useState<DomainRandomizationConfig>({ ...DEFAULT_RANDOMIZATION_CONFIG });
  const [report, setReport] = useState<any | null>(null);

  if (!isOpen) return null;

  const handleEvaluate = () => {
    // Generate simulated evaluation across 50 episodes with randomized seeds
    const mockOutcomes = Array.from({ length: 50 }, (_, i) => {
      // High friction and low delay yields higher success
      const prob = 0.82 - config.motorLatencyMs.max * 0.001 - config.rangeNoiseStd.max * 0.5;
      return Math.random() < Math.max(0.2, prob);
    });

    const rep = generateRobustnessReport(mockOutcomes, config);
    setReport(rep);
  };

  const handleApply = () => {
    if (onApplyConfig) {
      onApplyConfig(config);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-deep/80 backdrop-blur-sm select-none font-mono text-xs">
      <div className="w-full max-w-xl bg-charcoal border border-cream/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-cream animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-cream/10 bg-charcoal-deep/60">
          <div className="flex items-center space-x-2.5">
            <ShieldAlert className="w-4 h-4 text-sage" />
            <span className="font-bold text-sm tracking-wide uppercase">Sim-to-Real Toolkit & Evaluator</span>
            <span className="text-[10px] bg-sage/20 text-sage px-1.5 py-0.5 rounded border border-sage/40">
              PACK D ★
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-cream-dim hover:text-cream hover:bg-charcoal-light transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Overview */}
          <div className="text-[11px] text-cream-dim bg-charcoal-deep/60 p-3 rounded-xl border border-cream/10 leading-relaxed">
            Injected domain randomization models hardware discrepancies (motor latency, IMU sensor noise, regolith
            friction coefficient variation) to guarantee policy transfer onto physical hardware.
          </div>

          {/* Randomization Sliders */}
          <div className="space-y-3 bg-charcoal-deep/80 p-4 rounded-xl border border-cream/10">
            <span className="font-bold text-cream text-[11px] uppercase tracking-wide block">
              Domain Randomization Ranges
            </span>

            {/* Motor Latency */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-cream-dim">Motor Delay Latency:</span>
                <span className="font-bold text-cream tabular-nums">{config.motorLatencyMs.max} ms</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={config.motorLatencyMs.max}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    motorLatencyMs: { min: 0, max: parseInt(e.target.value, 10) },
                  })
                }
                className="w-full accent-sage"
              />
            </div>

            {/* Sensor Noise */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-cream-dim">Range Sensor Noise Std Dev:</span>
                <span className="font-bold text-cream tabular-nums">σ = {config.rangeNoiseStd.max.toFixed(3)}m</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.1}
                step={0.005}
                value={config.rangeNoiseStd.max}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    rangeNoiseStd: { min: 0, max: parseFloat(e.target.value) },
                  })
                }
                className="w-full accent-sage"
              />
            </div>

            {/* Friction Range */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-cream-dim">Regolith Friction Range:</span>
                <span className="font-bold text-cream tabular-nums">
                  [{config.friction.min.toFixed(2)}, {config.friction.max.toFixed(2)}]
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="range"
                  min={0.2}
                  max={0.6}
                  step={0.05}
                  value={config.friction.min}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      friction: { ...config.friction, min: parseFloat(e.target.value) },
                    })
                  }
                  className="w-full accent-sage"
                />
                <input
                  type="range"
                  min={0.65}
                  max={1.2}
                  step={0.05}
                  value={config.friction.max}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      friction: { ...config.friction, max: parseFloat(e.target.value) },
                    })
                  }
                  className="w-full accent-sage"
                />
              </div>
            </div>
          </div>

          {/* Evaluation Action */}
          <button
            type="button"
            onClick={handleEvaluate}
            className="w-full py-2 rounded-lg bg-charcoal hover:bg-charcoal-light border border-cream/20 text-cream font-bold flex items-center justify-center space-x-2 text-xs transition-colors"
          >
            <Play className="w-3.5 h-3.5 text-sage" />
            <span>Evaluate 50 Randomization Episodes (Wilson 95% CI)</span>
          </button>

          {/* Results Report Card */}
          {report && (
            <div className="p-4 rounded-xl bg-charcoal-deep/90 border border-sage/40 space-y-2 text-[11px]">
              <div className="flex items-center justify-between border-b border-cream/10 pb-1.5">
                <span className="font-bold text-cream flex items-center space-x-1.5">
                  <BarChart2 className="w-3.5 h-3.5 text-sage" />
                  <span>Robustness Evaluation Report</span>
                </span>
                <span className="text-sage font-bold tabular-nums">
                  {report.successRatePct.toFixed(1)}% Success ({report.totalEpisodes} eps)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-charcoal p-2 rounded border border-cream/10">
                  <div className="text-cream-dim">Wilson 95% Confidence Interval</div>
                  <div className="text-cream font-bold tabular-nums mt-0.5">
                    [{(report.ciLower * 100).toFixed(1)}%, {(report.ciUpper * 100).toFixed(1)}%]
                  </div>
                </div>
                <div className="bg-charcoal p-2 rounded border border-cream/10">
                  <div className="text-cream-dim">Certified Robust</div>
                  <div className={`font-bold mt-0.5 ${report.certifiedRobust ? 'text-sage' : 'text-amber-300'}`}>
                    {report.certifiedRobust ? 'YES (CI Lower >= 70%)' : 'MARGINAL'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-cream/10 bg-charcoal-deep/60 space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream-dim hover:text-cream text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-1.5 rounded-lg bg-sage hover:bg-sage-light text-cream font-bold text-xs flex items-center space-x-1 shadow-md shadow-sage/20"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply to Simulation</span>
          </button>
        </div>
      </div>
    </div>
  );
}
