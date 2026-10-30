'use client';

import React from 'react';
import {
  BrainCircuit,
  FileJson,
  Cpu,
  Mountain,
  Layers,
  Bot,
  Code2,
  ShieldCheck,
  FlaskConical,
  Database,
  CheckCheck,
  Rocket,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export type StageKey =
  | 'interpret'
  | 'draft'
  | 'compile'
  | 'terrain'
  | 'debris'
  | 'robot'
  | 'reward'
  | 'safety'
  | 'sandbox'
  | 'datagen'
  | 'critique'
  | 'gate'
  | 'deploy'
  | 'spec'; // backward compatible aliases

export interface StageState {
  key: StageKey;
  label: string;
  tier: string;
  status: 'idle' | 'running' | 'complete' | 'failed';
  durationMs?: number;
}

interface StageRailProps {
  stages: Record<string, StageState>;
  activeStage: StageKey | string | null;
}

const STAGE_ORDER: StageKey[] = [
  'interpret',
  'draft',
  'compile',
  'terrain',
  'debris',
  'robot',
  'reward',
  'safety',
  'sandbox',
  'datagen',
  'critique',
];

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  interpret: BrainCircuit,
  draft: FileJson,
  compile: Cpu,
  terrain: Mountain,
  debris: Layers,
  robot: Bot,
  reward: Code2,
  safety: ShieldCheck,
  sandbox: FlaskConical,
  datagen: Database,
  critique: CheckCheck,
  gate: ShieldCheck,
  deploy: Rocket,
  spec: FileJson,
};

export default function StageRail({ stages, activeStage }: StageRailProps) {
  return (
    <div className="w-full flex items-center justify-between px-3 py-2 analog-glass-elevated border-b border-cream/10 font-mono text-[11px] overflow-x-auto select-none">
      <div className="flex items-center space-x-1 sm:space-x-2 w-full justify-between">
        {STAGE_ORDER.map((key, idx) => {
          const stage = stages[key] || {
            key,
            label: key,
            tier: 'ultra',
            status: 'idle',
          };
          const Icon = ICONS[key];
          const isRunning = stage.status === 'running';
          const isComplete = stage.status === 'complete';
          const isFailed = stage.status === 'failed';

          return (
            <React.Fragment key={key}>
              <div
                className={`flex items-center space-x-1.5 px-2 py-1 rounded transition-all ${
                  isRunning
                    ? 'bg-sage/20 border border-sage/60 text-cream shadow-sm shadow-sage/30 animate-pulse'
                    : isComplete
                    ? 'bg-charcoal-deep border border-sage/30 text-cream'
                    : isFailed
                    ? 'bg-brick/20 border border-brick/60 text-brick'
                    : 'bg-charcoal-deep/40 border border-cream/5 text-cream-dim opacity-60'
                }`}
                title={`${stage.label} (${stage.tier.toUpperCase()})`}
              >
                {/* Icon / Spinner */}
                {isRunning ? (
                  <Loader2 className="w-3.5 h-3.5 text-sage animate-spin flex-shrink-0" />
                ) : isComplete ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-sage flex-shrink-0" />
                ) : isFailed ? (
                  <AlertCircle className="w-3.5 h-3.5 text-brick flex-shrink-0" />
                ) : (
                  <Icon className="w-3.5 h-3.5 text-cream-dim flex-shrink-0" />
                )}

                {/* Stage Label */}
                <span className="font-semibold text-[10px] uppercase hidden md:inline">
                  {stage.label}
                </span>

                {/* Duration or Tier pill */}
                {stage.durationMs ? (
                  <span className="text-[9px] text-cream-dim">
                    {stage.durationMs < 1000 ? `${stage.durationMs}ms` : `${(stage.durationMs / 1000).toFixed(1)}s`}
                  </span>
                ) : (
                  <span className="text-[8px] uppercase tracking-tighter opacity-50 hidden lg:inline">
                    {stage.tier}
                  </span>
                )}
              </div>

              {/* Connecting line between stages */}
              {idx < STAGE_ORDER.length - 1 && (
                <div
                  className={`h-0.5 flex-1 max-w-[20px] transition-colors ${
                    isComplete ? 'bg-sage/40' : 'bg-cream/10'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
