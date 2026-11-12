'use client';

import React, { useState, useEffect } from 'react';
import { PerfProbe } from '@/lib/perf/probe';
import { Activity, AlertTriangle } from 'lucide-react';

interface FpsBadgeProps {
  onTogglePanel: () => void;
  tier?: 'ultra' | 'high' | 'medium' | 'low' | 'potato';
}

export default function FpsBadge({ onTogglePanel, tier = 'high' }: FpsBadgeProps) {
  const [metrics, setMetrics] = useState(() => PerfProbe.getInstance().getMetrics());
  const [longTasks, setLongTasks] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const probe = PerfProbe.getInstance();
      setMetrics(probe.getMetrics());
      setLongTasks(probe.getSnapshot().longTaskCount);
    }, 500); // 2 Hz update rate for readable text
    return () => clearInterval(interval);
  }, []);

  const p50Color = !metrics.isMeasuring
    ? 'text-cream-dim'
    : metrics.p50 <= 12.0
    ? 'text-sage'
    : metrics.p50 <= 16.7
    ? 'text-cream'
    : 'text-brick';

  return (
    <button
      data-testid="fps-badge"
      onClick={onTogglePanel}
      title="Click or press 'P' to toggle detailed PerfProbe diagnostics panel"
      className="flex items-center space-x-2 px-2.5 py-1 rounded analog-glass hover:bg-charcoal-deep transition-colors text-[11px] font-mono border border-cream/15"
    >
      <Activity className={`w-3.5 h-3.5 ${metrics.p95 > 20 ? 'text-brick animate-pulse' : 'text-sage'}`} />

      {/* Honest rolling metrics */}
      {!metrics.isMeasuring ? (
        <span className="text-[10px] text-cream-dim italic">
          {metrics.isWarmingUp ? 'WARMUP...' : 'MEASURING...'}
        </span>
      ) : (
        <>
          <span className="flex items-baseline space-x-1">
            <span className={`font-bold ${p50Color}`}>{metrics.p50}ms</span>
            <span className="text-[9px] text-cream-dim">p50</span>
          </span>

          <span className="text-cream/20">/</span>

          <span className="flex items-baseline space-x-1">
            <span className={`font-semibold ${metrics.p95 <= 20 ? 'text-cream' : 'text-brick'}`}>{metrics.p95}ms</span>
            <span className="text-[9px] text-cream-dim">p95</span>
          </span>
        </>
      )}

      {/* Long task indicator if any with descriptive label and tooltip */}
      {longTasks > 0 && (
        <span
          title={`${longTasks} long task${longTasks > 1 ? 's' : ''} (>50ms) detected in main thread. Click to open P panel diagnostics.`}
          className="flex items-center space-x-1 text-brick text-[10px] font-bold px-1.5 py-0.5 rounded bg-brick/15 border border-brick/30"
        >
          <AlertTriangle className="w-3 h-3 text-brick" />
          <span>{longTasks} long task{longTasks > 1 ? 's' : ''}</span>
        </span>
      )}

      {/* Active tier */}
      <span className="px-1.5 py-0.2 rounded text-[9px] uppercase font-bold bg-charcoal-deep text-cream-dim border border-cream/10">
        {tier}
      </span>
    </button>
  );
}
