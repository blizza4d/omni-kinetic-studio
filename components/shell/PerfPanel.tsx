'use client';

import React, { useState, useEffect } from 'react';
import { PerfProbe } from '@/lib/perf/probe';
import { Cpu, Activity, Layers, AlertTriangle, ShieldCheck, RefreshCw, X, ChevronDown } from 'lucide-react';

interface PerfPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onTierChange?: (tier: 'ultra' | 'high' | 'medium' | 'low' | 'potato') => void;
}

export default function PerfPanel({ isOpen, onClose, onTierChange }: PerfPanelProps) {
  const [snapshot, setSnapshot] = useState(() => PerfProbe.getInstance().getSnapshot());
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!isOpen || !autoRefresh) return;
    const interval = setInterval(() => {
      setSnapshot(PerfProbe.getInstance().getSnapshot());
    }, 250); // 4 Hz update rate
    return () => clearInterval(interval);
  }, [isOpen, autoRefresh]);

  if (!isOpen) return null;

  const probe = PerfProbe.getInstance();
  const tiers: Array<'ultra' | 'high' | 'medium' | 'low' | 'potato'> = ['ultra', 'high', 'medium', 'low', 'potato'];

  const handleTierSelect = (tier: 'ultra' | 'high' | 'medium' | 'low' | 'potato') => {
    probe.setTier(tier);
    if (onTierChange) onTierChange(tier);
    setSnapshot(probe.getSnapshot());
  };

  const handleTestStall = () => {
    probe.injectStall(60);
    setSnapshot(probe.getSnapshot());
  };

  return (
    <div className="fixed top-14 right-4 z-50 w-96 analog-glass p-4 text-cream font-mono text-[11px] space-y-3.5 shadow-2xl border border-cream/15">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-cream/10">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-sage" />
          <span className="font-bold uppercase tracking-wider text-[12px]">PerfProbe Diagnostics</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-cream-dim px-1.5 py-0.5 rounded bg-charcoal-deep border border-cream/10">
            {snapshot.gpu.isHardware ? 'HARDWARE GPU' : 'SOFTWARE RASTER'}
          </span>
          <button onClick={onClose} className="p-1 hover:text-cream text-cream-dim">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Frame Time Percentiles */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
          <div className="text-[10px] text-cream-dim">p50 Frame</div>
          <div className={`text-sm font-bold ${snapshot.p50 <= 12 ? 'text-sage' : snapshot.p50 <= 16.7 ? 'text-cream' : 'text-brick'}`}>
            {snapshot.p50} ms
          </div>
        </div>
        <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
          <div className="text-[10px] text-cream-dim">p95 Frame</div>
          <div className={`text-sm font-bold ${snapshot.p95 <= 20 ? 'text-sage' : 'text-brick'}`}>
            {snapshot.p95} ms
          </div>
        </div>
        <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
          <div className="text-[10px] text-cream-dim">p99 Frame</div>
          <div className="text-sm font-bold text-cream">
            {snapshot.p99} ms
          </div>
        </div>
      </div>

      {/* Active Quality Tier Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-cream-dim">
          <span>QUALITY TIER (Q)</span>
          <span className="uppercase text-sage font-bold">{snapshot.tier}</span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {tiers.map((t) => (
            <button
              key={t}
              onClick={() => handleTierSelect(t)}
              className={`py-1 text-[10px] uppercase font-bold rounded border transition-colors ${
                snapshot.tier === t
                  ? 'bg-sage text-cream border-sage'
                  : 'bg-charcoal-deep/40 text-cream-dim border-cream/10 hover:text-cream hover:bg-charcoal-deep'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Render Info & Triangles */}
      <div className="space-y-1.5 p-2 rounded bg-charcoal-deep/40 border border-cream/5 text-[10px]">
        <div className="flex justify-between">
          <span className="text-cream-dim">Draw Calls:</span>
          <span className={`font-bold ${snapshot.rendererInfo.drawCalls <= 150 ? 'text-sage' : 'text-brick'}`}>
            {snapshot.rendererInfo.drawCalls} / 150 budget
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-cream-dim">Triangles:</span>
          <span className="font-bold text-cream">
            {snapshot.rendererInfo.triangles.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-cream-dim">Geometries / Textures:</span>
          <span className="text-cream">
            {snapshot.rendererInfo.geometries} / {snapshot.rendererInfo.textures}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-cream-dim">Long Tasks (&gt;50ms):</span>
          <span className={`font-bold ${snapshot.longTaskCount === 0 ? 'text-sage' : 'text-brick'}`}>
            {snapshot.longTaskCount}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-cream-dim">React Commits / sec:</span>
          <span className={`font-bold ${snapshot.commitsPerSecond <= 10 ? 'text-sage' : 'text-brick'}`}>
            {snapshot.commitsPerSecond} /s
          </span>
        </div>
        {snapshot.memory && (
          <div className="flex justify-between">
            <span className="text-cream-dim">JS Heap:</span>
            <span className="text-cream">{snapshot.memory.usedMb} MB / {snapshot.memory.totalMb} MB</span>
          </div>
        )}
      </div>

      {/* Subsystem Costs */}
      <div className="space-y-1 text-[10px]">
        <span className="text-cream-dim uppercase text-[9px]">Subsystem Timings:</span>
        <div className="flex justify-between">
          <span>Physics Worker:</span>
          <span className="text-cream">{snapshot.subsystemMs.physics} ms</span>
        </div>
        <div className="flex justify-between">
          <span>Telemetry Ingest:</span>
          <span className="text-cream">{snapshot.subsystemMs.telemetry} ms</span>
        </div>
        <div className="flex justify-between">
          <span>Radar Draw:</span>
          <span className="text-cream">{snapshot.subsystemMs.radar} ms</span>
        </div>
      </div>

      {/* GPU String */}
      <div className="text-[9px] text-cream-dim truncate p-1.5 rounded bg-charcoal-deep border border-cream/5" title={snapshot.gpu.renderer}>
        GPU: {snapshot.gpu.renderer}
      </div>

      {/* Action: Test 60ms Stall Injection */}
      <button
        onClick={handleTestStall}
        className="w-full py-1.5 rounded bg-brick/20 hover:bg-brick/30 text-brick-light border border-brick/40 font-bold text-[10px] flex items-center justify-center space-x-1.5 transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Inject 60ms Stall (Test Hook)</span>
      </button>
    </div>
  );
}
