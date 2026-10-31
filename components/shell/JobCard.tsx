'use client';

import React, { useState } from 'react';
import {
  Server,
  Cpu,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RotateCcw,
  StopCircle,
  ChevronDown,
  ChevronUp,
  Terminal,
  Zap,
} from 'lucide-react';
import { JobStatusV3 } from '@/contracts';

interface JobCardProps {
  status: JobStatusV3;
  logs?: string[];
  onCancel?: () => void;
  onRetry?: () => void;
  onSwitchToLocal?: () => void;
}

export default function JobCard({
  status,
  logs = [],
  onCancel,
  onRetry,
  onSwitchToLocal,
}: JobCardProps) {
  const [showLogs, setShowLogs] = useState(false);

  const isCloud = status.mode === 'cloud_nebius';
  const isCached = status.mode === 'cached_cloud';
  const isRunning = status.state === 'running' || status.state === 'cold_start';
  const isColdStart = status.state === 'cold_start';

  const badgeColor = isCloud
    ? 'bg-sage/20 text-sage border-sage/40'
    : isCached
    ? 'bg-cream/20 text-cream border-cream/40'
    : 'bg-cream-dim/20 text-cream-dim border-cream-dim/40';

  const badgeText = isCloud
    ? `CLOUD: ${status.region}`
    : isCached
    ? 'CACHED CLOUD RUN'
    : 'DEMO: LOCAL RUNNER';

  return (
    <div className="font-mono text-xs p-3 rounded-xl border border-hairline bg-charcoal-deep/90 shadow-xl space-y-3 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="p-1.5 rounded-lg bg-charcoal border border-hairline text-cream">
            {isCloud ? <Server className="w-4 h-4 text-sage" /> : <Cpu className="w-4 h-4 text-cream" />}
          </span>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-cream text-[11px] truncate max-w-[140px]">{status.jobId}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-semibold ${badgeColor}`}>
                {badgeText}
              </span>
            </div>
            <div className="text-[10px] text-cream-dim">
              Region: {status.region} • Ep: {status.currentEpisode || 1}
            </div>
          </div>
        </div>

        {/* State Pill */}
        <div className="flex items-center space-x-1.5">
          {status.state === 'running' && (
            <span className="flex items-center space-x-1 text-sage text-[11px]">
              <span className="w-2 h-2 rounded-full bg-sage animate-ping" />
              <span>Running</span>
            </span>
          )}
          {status.state === 'cold_start' && (
            <span className="flex items-center space-x-1 text-cream text-[11px]">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>Cold Start</span>
            </span>
          )}
          {status.state === 'succeeded' && (
            <span className="flex items-center space-x-1 text-sage text-[11px]">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Succeeded</span>
            </span>
          )}
          {status.state === 'cancelled' && (
            <span className="flex items-center space-x-1 text-cream-dim text-[11px]">
              <StopCircle className="w-3.5 h-3.5" />
              <span>Cancelled</span>
            </span>
          )}
          {status.state === 'failed' && (
            <span className="flex items-center space-x-1 text-brick text-[11px]">
              <XCircle className="w-3.5 h-3.5" />
              <span>Failed</span>
            </span>
          )}
        </div>
      </div>

      {/* Progress & Message */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-cream-dim">
          <span className="truncate pr-2">{status.message}</span>
          <span className="font-bold text-cream">{status.progress}%</span>
        </div>
        <div className="w-full bg-charcoal rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${status.state === 'failed' ? 'bg-brick' : 'bg-sage'}`}
            style={{ width: `${Math.max(5, status.progress)}%` }}
          />
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-charcoal/60 border border-hairline text-[10px]">
        <div>
          <div className="text-cream-dim">Elapsed</div>
          <div className="font-bold text-cream">{status.elapsed}s</div>
        </div>
        <div>
          <div className="text-cream-dim">Cost So Far</div>
          <div className="font-bold text-cream">${status.costSoFar.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-cream-dim">Est. Cost Range</div>
          <div className="font-bold text-cream">${status.estimatedRange[0]} - ${status.estimatedRange[1]}</div>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center space-x-1 text-[10px] text-cream-dim hover:text-cream transition-colors"
        >
          <Terminal className="w-3 h-3" />
          <span>Logs ({logs.length})</span>
          {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <div className="flex items-center space-x-2">
          {isColdStart && onSwitchToLocal && (
            <button
              onClick={onSwitchToLocal}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-charcoal hover:bg-charcoal-light border border-sage/40 text-sage text-[10px] font-semibold transition-colors"
            >
              <Zap className="w-3 h-3" />
              <span>Switch to Local</span>
            </button>
          )}

          {isRunning && onCancel && (
            <button
              onClick={onCancel}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-charcoal hover:bg-brick/20 border border-brick/40 text-brick text-[10px] font-semibold transition-colors"
            >
              <StopCircle className="w-3 h-3" />
              <span>Cancel</span>
            </button>
          )}

          {!isRunning && onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-charcoal hover:bg-sage/20 border border-sage/40 text-sage text-[10px] font-semibold transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Logs View */}
      {showLogs && (
        <div className="p-2.5 rounded bg-charcoal-deep border border-hairline max-h-36 overflow-y-auto text-[10px] space-y-0.5 text-cream-dim font-mono">
          {logs.length === 0 ? (
            <div className="text-cream-dim italic">Waiting for log records...</div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="leading-tight">
                {log}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
