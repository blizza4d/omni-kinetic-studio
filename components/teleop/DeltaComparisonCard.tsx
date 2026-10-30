'use client';

import React, { useState } from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Layers, X, ChevronDown, ChevronUp } from 'lucide-react';

interface DeltaComparisonCardProps {
  isOpen: boolean;
  onClose: () => void;
  episodeCount?: number;
  iteration?: number;
}

export default function DeltaComparisonCard({
  isOpen,
  onClose,
  episodeCount = 0,
  iteration = 2,
}: DeltaComparisonCardProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="absolute top-16 right-4 z-30 font-mono text-xs select-none max-w-xs w-full animate-fadeIn">
      <div className="analog-glass-elevated border border-sage/40 rounded-xl overflow-hidden shadow-2xl bg-charcoal-deep/95">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-cream/10 bg-charcoal-deep">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-sage" />
            <span className="font-bold text-cream text-[11px] uppercase tracking-wider">
              Iteration Comparison
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded text-cream-dim hover:text-cream"
            >
              {isMinimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-cream-dim hover:text-cream"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Truth-in-UI Label */}
        <div className="px-3 py-1 bg-sage/10 border-b border-sage/20 text-[9px] text-cream-dim flex items-center justify-between">
          <span>Policy Delta: Iteration 1 vs 2</span>
          <span className="px-1 rounded bg-charcoal text-cream-dim border border-cream/10 uppercase">
            [SIMULATED IMPROVEMENT (DEMO)]
          </span>
        </div>

        {!isMinimized && (
          <div className="p-3 space-y-2.5 text-cream">
            {/* Visual Legend */}
            <div className="flex items-center justify-between p-2 rounded bg-charcoal/50 border border-cream/5 text-[10px]">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cream/40 border border-cream" />
                <span className="text-cream-dim">Iteration 1 (Ghost)</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sage border border-sage" />
                <span className="text-sage font-bold">Iteration 2 (Solid)</span>
              </div>
            </div>

            {/* Metrics Comparison Table */}
            <div className="space-y-1.5 text-[11px]">
              {/* Velocity */}
              <div className="flex items-center justify-between p-1.5 rounded bg-charcoal/30">
                <span className="text-cream-dim text-[10px]">Forward Velocity</span>
                <div className="flex items-center space-x-2">
                  <span className="text-cream-dim text-[10px]">0.95 m/s</span>
                  <span className="text-cream font-bold">1.18 m/s</span>
                  <span className="text-sage text-[10px] font-bold flex items-center">
                    <ArrowUpRight className="w-3 h-3" />
                    +24.2%
                  </span>
                </div>
              </div>

              {/* Upright Stability */}
              <div className="flex items-center justify-between p-1.5 rounded bg-charcoal/30">
                <span className="text-cream-dim text-[10px]">Upright Stability</span>
                <div className="flex items-center space-x-2">
                  <span className="text-cream-dim text-[10px]">78%</span>
                  <span className="text-cream font-bold">95%</span>
                  <span className="text-sage text-[10px] font-bold flex items-center">
                    <ArrowUpRight className="w-3 h-3" />
                    +38.0%
                  </span>
                </div>
              </div>

              {/* Mean Reward */}
              <div className="flex items-center justify-between p-1.5 rounded bg-charcoal/30">
                <span className="text-cream-dim text-[10px]">Mean Step Reward</span>
                <div className="flex items-center space-x-2">
                  <span className="text-cream-dim text-[10px]">+1.42</span>
                  <span className="text-cream font-bold">+1.84</span>
                  <span className="text-sage text-[10px] font-bold flex items-center">
                    <ArrowUpRight className="w-3 h-3" />
                    +29.5%
                  </span>
                </div>
              </div>

              {/* Torso Collisions */}
              <div className="flex items-center justify-between p-1.5 rounded bg-charcoal/30">
                <span className="text-cream-dim text-[10px]">Torso Collisions</span>
                <div className="flex items-center space-x-2">
                  <span className="text-brick text-[10px]">3 impacts</span>
                  <span className="text-sage font-bold">0 impacts</span>
                  <span className="text-sage text-[10px] font-bold flex items-center">
                    <ArrowDownRight className="w-3 h-3" />
                    -100%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
