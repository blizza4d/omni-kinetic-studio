'use client';

import React, { useState, useRef } from 'react';
import {
  FlaskConical,
  Play,
  Square,
  FileText,
  FileJson,
  CheckCircle2,
  XCircle,
  Eye,
} from 'lucide-react';
import {
  BENCHMARK_SCENARIO_LIST,
  BenchmarkScenarioId,
  BenchmarkScorecard,
  BenchmarkTrialResult,
  runBenchmarkSuite,
  exportBenchmarkJson,
  exportBenchmarkMarkdown,
} from '@/lib/sim2real/benchmark';
import { RobotProfileId } from '@/lib/robotics/profiles';
import { NemotronTaskPlan } from '@/lib/nebius/taskPlanner';

interface BenchmarkPanelProps {
  profileId: RobotProfileId;
  activePlan?: NemotronTaskPlan | null;
  onPreviewScenario?: (scenarioId: BenchmarkScenarioId) => void;
  className?: string;
}

export default function BenchmarkPanel({
  profileId,
  activePlan = null,
  onPreviewScenario,
  className = '',
}: BenchmarkPanelProps) {
  const [scenarioId, setScenarioId] = useState<BenchmarkScenarioId>('obstacle_slalom');
  const [trialCount, setTrialCount] = useState<number>(5);
  const [useNemotronPlan, setUseNemotronPlan] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [liveTrials, setLiveTrials] = useState<BenchmarkTrialResult[]>([]);
  const [report, setReport] = useState<BenchmarkScorecard | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleStart = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsRunning(true);
    setReport(null);
    setLiveTrials([]);
    setProgress({ done: 0, total: trialCount });

    try {
      const result = await runBenchmarkSuite({
        scenarioId,
        trialCount,
        profileId,
        customPlan: useNemotronPlan ? activePlan : null,
        abortSignal: ctrl.signal,
        onProgress: (u) => {
          setProgress({ done: u.completedTrials, total: u.totalTrials });
          setLiveTrials((prev) => [...prev, u.latestTrial]);
        },
      });
      setReport(result);
    } finally {
      setIsRunning(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsRunning(false);
  };

  const handleDownload = (format: 'json' | 'md') => {
    if (!report) return;
    const content = format === 'json' ? exportBenchmarkJson(report) : exportBenchmarkMarkdown(report);
    const mime = format === 'json' ? 'application/json;charset=utf-8;' : 'text/markdown;charset=utf-8;';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark_${report.scenarioId}_${report.profileId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`analog-glass-elevated border border-cream/15 rounded-xl overflow-hidden shadow-2xl flex flex-col font-mono text-xs select-none ${className}`}
      data-testid="benchmark-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#1F1F1F] border-b border-cream/10">
        <div className="flex items-center space-x-2">
          <FlaskConical className="w-4 h-4 text-sage" />
          <span className="font-bold tracking-wider text-cream uppercase text-[11px]">
            Sim-to-Real Benchmark Suite
          </span>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-sage/20 text-sage border border-sage/30 uppercase">
          Batch Stress-Test
        </span>
      </div>

      <div className="p-3.5 space-y-3.5 overflow-y-auto flex-1 custom-scrollbar">
        {/* Scenario Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase text-cream-dim">
            <span>Test Scenario</span>
            {onPreviewScenario && (
              <button
                type="button"
                onClick={() => onPreviewScenario(scenarioId)}
                className="text-[9px] text-sage hover:underline flex items-center space-x-1"
                title="Load this benchmark terrain & waypoints in the 3D viewport"
              >
                <Eye className="w-3 h-3" />
                <span>Stage in 3D</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {BENCHMARK_SCENARIO_LIST.map((sc) => (
              <button
                key={sc.id}
                type="button"
                disabled={isRunning}
                onClick={() => setScenarioId(sc.id)}
                className={`p-2 rounded-lg text-left border transition-colors ${
                  scenarioId === sc.id
                    ? 'bg-sage/20 border-sage text-cream'
                    : 'bg-charcoal-deep/60 border-cream/10 text-cream-dim hover:text-cream'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[10px] uppercase">{sc.name}</span>
                  <span className="text-[9px] text-cream-dim">
                    μ={sc.frictionRange[0]}..{sc.frictionRange[1]} · g={sc.gravityRange[0]}..{sc.gravityRange[1]} m/s²
                  </span>
                </div>
                <div className="text-[9px] text-cream-dim mt-0.5 leading-snug">{sc.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Trial Config & Run Action */}
        <div className="p-2.5 rounded-lg bg-charcoal-deep/70 border border-cream/10 space-y-2.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-cream-dim uppercase font-bold">Batch Trials (N):</span>
            <div className="flex items-center space-x-1">
              {[3, 5, 10, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={isRunning}
                  onClick={() => setTrialCount(n)}
                  className={`px-2 py-0.5 rounded font-bold transition-colors ${
                    trialCount === n
                      ? 'bg-sage text-charcoal-deep'
                      : 'bg-charcoal text-cream-dim hover:text-cream border border-cream/10'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {activePlan && activePlan.waypoints.length > 0 && (
            <label className="flex items-center justify-between text-[10px] cursor-pointer">
              <span className="text-cream-dim">Override trajectory with active Nemotron Plan:</span>
              <input
                type="checkbox"
                checked={useNemotronPlan}
                disabled={isRunning}
                onChange={(e) => setUseNemotronPlan(e.target.checked)}
                className="accent-sage"
              />
            </label>
          )}

          {isRunning ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-sage font-bold animate-pulse">
                  Running Randomized Trial {progress.done} / {progress.total}...
                </span>
                <span className="tabular-nums text-cream-dim">
                  {progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-charcoal overflow-hidden">
                <div
                  className="h-full bg-sage transition-all duration-150"
                  style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <button
                type="button"
                onClick={handleStop}
                className="w-full py-1.5 rounded bg-brick/25 hover:bg-brick/35 border border-brick/50 text-cream font-bold text-[10px] uppercase flex items-center justify-center space-x-1.5"
              >
                <Square className="w-3 h-3 fill-current text-brick" />
                <span>Abort Benchmark</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleStart()}
              className="w-full py-2 px-3 rounded bg-sage/20 hover:bg-sage/30 border border-sage/45 hover:border-sage text-cream font-bold uppercase tracking-wider text-[11px] flex items-center justify-center space-x-2 transition-all"
            >
              <Play className="w-3.5 h-3.5 text-sage fill-current" />
              <span>Run {trialCount}-Trial Stress Test</span>
            </button>
          )}
        </div>

        {/* Evaluation Scorecard */}
        {report && (
          <div className="p-3 rounded-lg bg-charcoal-deep/80 border border-sage/35 space-y-3" data-testid="benchmark-scorecard">
            <div className="flex items-center justify-between border-b border-cream/10 pb-1.5">
              <div>
                <div className="font-bold text-cream uppercase text-[10px]">Evaluation Scorecard</div>
                <div className="text-[9px] text-cream-dim">
                  {report.scenarioName} · {report.trialCount} Trials · 95% CI [{report.wilson95Pct[0]}%..{report.wilson95Pct[1]}%]
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => handleDownload('json')}
                  className="p-1.5 rounded bg-charcoal hover:bg-cream/10 border border-cream/15 text-cream-dim hover:text-cream"
                  title="Export Benchmark JSON Report"
                >
                  <FileJson className="w-3.5 h-3.5 text-sage" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('md')}
                  className="p-1.5 rounded bg-charcoal hover:bg-cream/10 border border-cream/15 text-cream-dim hover:text-cream"
                  title="Export Benchmark Markdown Report"
                >
                  <FileText className="w-3.5 h-3.5 text-sage" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded bg-charcoal border border-cream/10">
                <div className="text-[9px] text-cream-dim uppercase">Success Rate</div>
                <div className={`text-base font-bold tabular-nums ${report.successRatePct >= 80 ? 'text-sage' : report.successRatePct >= 50 ? 'text-amber-300' : 'text-brick'}`}>
                  {report.successRatePct}% <span className="text-[10px] font-normal text-cream-dim">({report.successCount}/{report.trialCount})</span>
                </div>
              </div>
              <div className="p-2 rounded bg-charcoal border border-cream/10">
                <div className="text-[9px] text-cream-dim uppercase">Mean Time to Goal</div>
                <div className="text-base font-bold text-cream tabular-nums">{report.meanTimeToGoalSec.toFixed(2)} s</div>
              </div>
              <div className="p-2 rounded bg-charcoal border border-cream/10">
                <div className="text-[9px] text-cream-dim uppercase">Path Efficiency</div>
                <div className="text-base font-bold text-cream tabular-nums">{report.meanPathEfficiencyPct.toFixed(1)}%</div>
              </div>
              <div className="p-2 rounded bg-charcoal border border-cream/10">
                <div className="text-[9px] text-cream-dim uppercase">Safety Violations</div>
                <div className={`text-base font-bold tabular-nums ${report.totalSafetyViolations === 0 ? 'text-sage' : 'text-amber-300'}`}>
                  {report.totalSafetyViolations} <span className="text-[9px] font-normal text-cream-dim">({report.totalTiltViolations}T / {report.totalCollisions}C)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Per-Trial Feed */}
        {liveTrials.length > 0 && (
          <div className="space-y-1">
            <div className="text-[9px] font-bold uppercase text-cream-dim border-b border-cream/5 pb-1">
              Randomized Trial Matrix ({liveTrials.length})
            </div>
            <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar">
              {liveTrials.map((t) => (
                <div
                  key={t.trialIndex}
                  className="px-2 py-1.5 rounded bg-charcoal-deep/60 border border-cream/5 flex items-center justify-between text-[9px]"
                >
                  <div className="flex items-center space-x-1.5">
                    {t.success ? (
                      <CheckCircle2 className="w-3 h-3 text-sage shrink-0" />
                    ) : (
                      <XCircle className="w-3 h-3 text-brick shrink-0" />
                    )}
                    <span className="font-bold text-cream">#{t.trialIndex}</span>
                    <span className="text-cream-dim tabular-nums">
                      g={t.gravityMps2} · μ={t.frictionCoeff}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 tabular-nums text-cream-dim">
                    <span>{t.timeToGoalSec.toFixed(1)}s</span>
                    <span>{t.pathEfficiencyPct.toFixed(0)}% eff</span>
                    <span className={t.collisions + t.tiltViolations > 0 ? 'text-amber-300' : 'text-sage'}>
                      {t.tiltViolations}T/{t.collisions}C
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
