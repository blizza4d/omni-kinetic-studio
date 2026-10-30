'use client';

import React from 'react';
import { Cpu, Server, Clock, Zap, ArrowRight, Loader2 } from 'lucide-react';
import { JobStatus } from '@/contracts';

interface ColdStartCardProps {
  status: JobStatus;
  onSwitchToLocal: () => void;
}

export default function ColdStartCard({ status, onSwitchToLocal }: ColdStartCardProps) {
  if (status.status !== 'cold_start') return null;

  return (
    <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-lg p-1 font-mono text-xs select-none animate-fadeIn">
      <div className="analog-glass-elevated border border-sage/40 rounded-xl p-4 shadow-2xl bg-charcoal-deep/95 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-sage/20 border border-sage/40 text-sage">
              <Server className="w-4 h-4 animate-pulse" />
            </span>
            <div>
              <div className="font-bold text-cream text-xs flex items-center space-x-2">
                <span>Nebius Serverless Cold Start</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-sage/20 text-sage uppercase border border-sage/30">
                  L40S GPU
                </span>
              </div>
              <div className="text-[10px] text-cream-dim">
                Allocating dedicated headless simulation container
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 text-sage text-[11px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Booting node</span>
          </div>
        </div>

        {/* Status message */}
        <div className="p-2.5 rounded bg-charcoal/60 border border-cream/5 text-[11px] text-cream-dim flex items-center justify-between">
          <span>{status.message}</span>
          <span className="font-bold text-cream">{status.progress}%</span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-charcoal rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-sage h-full transition-all duration-300"
            style={{ width: `${Math.max(10, status.progress)}%` }}
          />
        </div>

        {/* Node Specs & Instant Action */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-[10px] text-cream-dim space-x-2">
            <span>Node: <strong className="text-cream">NVIDIA L40S (48GB)</strong></span>
            <span>•</span>
            <span>Driver: <strong className="text-cream">v535+</strong></span>
          </div>

          <button
            onClick={onSwitchToLocal}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-charcoal hover:bg-charcoal-light border border-cream/20 text-cream text-[11px] font-semibold transition-colors shadow-sm"
          >
            <Zap className="w-3 h-3 text-sage" />
            <span>Switch to Demo Local</span>
            <ArrowRight className="w-3 h-3 text-cream-dim" />
          </button>
        </div>
      </div>
    </div>
  );
}
