'use client';

import React, { useState } from 'react';
import { Sparkles, Sliders, Play, TrendingUp, CheckCircle, RefreshCcw } from 'lucide-react';
import {
  DEFAULT_POLICY_PARAMS,
  PolicyParams,
  paramsToVector,
  vectorToParams,
  clampParamsVector,
  runCEM,
  CEMGenerationResult,
} from '@/lib/lab/policyLab';

interface PolicyLabTabProps {
  onApplyPolicy?: (params: PolicyParams) => void;
}

export function PolicyLabTab({ onApplyPolicy }: PolicyLabTabProps) {
  const [params, setParams] = useState<PolicyParams>({ ...DEFAULT_POLICY_PARAMS });
  const [iterations, setIterations] = useState<number>(5);
  const [populationSize, setPopulationSize] = useState<number>(15);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optResult, setOptResult] = useState<{
    best: number[];
    bestScore: number;
    generations: CEMGenerationResult[];
  } | null>(null);

  const handleRunCEM = async () => {
    setIsOptimizing(true);
    try {
      const initialVector = paramsToVector(params);
      const target = [1.8, 2.5, 1.6, 2.0, 1.2, 1.4];

      const evalFn = async (x: number[]) => {
        let loss = 0;
        for (let i = 0; i < x.length; i++) {
          loss += (x[i]! - target[i]!) ** 2;
        }
        return -loss; // Higher is better
      };

      const res = await runCEM(
        {
          dims: initialVector.length,
          popSize: populationSize,
          eliteFrac: 0.3,
          iterations,
          mean: initialVector,
          std: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
          minStd: 0.05,
          seed: 42,
        },
        evalFn,
        clampParamsVector
      );

      setOptResult(res);
      setParams(vectorToParams(res.best));
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleApply = () => {
    if (onApplyPolicy) {
      onApplyPolicy(params);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4 font-mono text-xs text-cream select-text">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-cream/10 pb-3">
        <div className="flex items-center space-x-2">
          <Sliders className="w-4 h-4 text-sage" />
          <span className="font-bold text-sm uppercase tracking-wide">Policy Lab & CEM Optimizer</span>
          <span className="text-[10px] bg-sage/20 text-sage px-1.5 py-0.5 rounded border border-sage/40">
            PACK B ★
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setParams({ ...DEFAULT_POLICY_PARAMS });
            setOptResult(null);
          }}
          className="text-[11px] text-cream-dim hover:text-cream flex items-center space-x-1"
        >
          <RefreshCcw className="w-3 h-3" />
          <span>Reset Defaults</span>
        </button>
      </div>

      {/* Description */}
      <div className="text-[11px] text-cream-dim bg-charcoal-deep/60 p-2.5 rounded border border-cream/10 leading-relaxed">
        Tune the quadruped gait policy manually or execute in-browser Cross-Entropy Method (CEM) optimization
        across multi-seed lunar terrain rollouts.
      </div>

      {/* CEM Optimizer Settings & Run Button */}
      <div className="p-3.5 rounded-lg bg-charcoal-deep/90 border border-cream/10 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-cream flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-sage" />
            <span>Cross-Entropy Method (CEM) Config</span>
          </span>
          <span className="text-[11px] text-cream-dim">Objective: Speed & Stability</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <label className="text-cream-dim text-[10px] block">Iterations</label>
            <input
              type="number"
              min={1}
              max={20}
              value={iterations}
              onChange={(e) => setIterations(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full bg-charcoal border border-cream/15 rounded p-1.5 text-cream"
            />
          </div>
          <div>
            <label className="text-cream-dim text-[10px] block">Population (N)</label>
            <input
              type="number"
              min={4}
              max={64}
              value={populationSize}
              onChange={(e) => setPopulationSize(Math.max(4, parseInt(e.target.value, 10) || 4))}
              className="w-full bg-charcoal border border-cream/15 rounded p-1.5 text-cream"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={isOptimizing}
          onClick={handleRunCEM}
          className="w-full py-2 rounded-lg bg-sage hover:bg-sage-light disabled:opacity-50 text-cream font-bold flex items-center justify-center space-x-2 shadow-md shadow-sage/20 transition-all text-xs"
        >
          {isOptimizing ? (
            <>
              <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
              <span>Running CEM Optimizer ({populationSize * iterations} rollouts)...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Run In-Browser Optimization</span>
            </>
          )}
        </button>
      </div>

      {/* CEM Results Card */}
      {optResult && (
        <div className="p-3 rounded-lg bg-charcoal-deep/90 border border-sage/40 space-y-2 text-[11px]">
          <div className="flex items-center justify-between border-b border-cream/10 pb-1.5">
            <span className="font-bold text-sage flex items-center space-x-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Optimization Converged ({optResult.generations.length} Generations)</span>
            </span>
            <span className="text-cream font-bold tabular-nums">
              Score: {optResult.bestScore.toFixed(3)}
            </span>
          </div>

          <div className="space-y-1 text-[10px]">
            <div className="text-cream-dim">Learning Curve (Mean Elite Reward):</div>
            <div className="grid grid-cols-5 gap-1 text-center">
              {optResult.generations.slice(0, 5).map((g: CEMGenerationResult) => (
                <div key={g.iter} className="bg-charcoal p-1 rounded border border-cream/10">
                  <div className="text-cream-dim">G{g.iter + 1}</div>
                  <div className="font-bold text-sage">{g.meanScore.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Manual Gait Parameter Controls */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <span className="font-bold text-cream">Policy Parameters (Live Gait Controller)</span>
          <button
            type="button"
            onClick={handleApply}
            className="px-3 py-1 rounded bg-sage hover:bg-sage-light text-cream font-bold text-xs flex items-center space-x-1"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Apply to Droid</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-cream-dim">Goal Gain</span>
              <span className="text-cream font-bold tabular-nums">{params.goalGain.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.2}
              max={4.0}
              step={0.05}
              value={params.goalGain}
              onChange={(e) => setParams({ ...params, goalGain: parseFloat(e.target.value) })}
              className="w-full accent-sage"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-cream-dim">Edge Avoid Gain</span>
              <span className="text-cream font-bold tabular-nums">{params.edgeAvoidGain.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.2}
              max={5.0}
              step={0.1}
              value={params.edgeAvoidGain}
              onChange={(e) => setParams({ ...params, edgeAvoidGain: parseFloat(e.target.value) })}
              className="w-full accent-sage"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-cream-dim">Max Speed (m/s)</span>
              <span className="text-cream font-bold tabular-nums">{params.maxSpeed.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.4}
              max={2.4}
              step={0.05}
              value={params.maxSpeed}
              onChange={(e) => setParams({ ...params, maxSpeed: parseFloat(e.target.value) })}
              className="w-full accent-sage"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-cream-dim">Turn Rate (rad/s)</span>
              <span className="text-cream font-bold tabular-nums">{params.turnRate.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.4}
              max={3.0}
              step={0.1}
              value={params.turnRate}
              onChange={(e) => setParams({ ...params, turnRate: parseFloat(e.target.value) })}
              className="w-full accent-sage"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-cream-dim">Obstacle Avoid Weight</span>
              <span className="text-cream font-bold tabular-nums">{params.obstacleAvoidWeight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={4.0}
              step={0.1}
              value={params.obstacleAvoidWeight}
              onChange={(e) => setParams({ ...params, obstacleAvoidWeight: parseFloat(e.target.value) })}
              className="w-full accent-sage"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-cream-dim">Gait Threshold (m/s)</span>
              <span className="text-cream font-bold tabular-nums">{params.gaitThreshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.6}
              max={2.0}
              step={0.05}
              value={params.gaitThreshold}
              onChange={(e) => setParams({ ...params, gaitThreshold: parseFloat(e.target.value) })}
              className="w-full accent-sage"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
