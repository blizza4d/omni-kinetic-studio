'use client';

import React, { useState, useEffect } from 'react';
import { Coins, RotateCcw, AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { UsageState } from '@/lib/nebius/usage';

interface TokenSpendPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSpendUpdated?: (state: UsageState) => void;
}

export default function TokenSpendPopover({
  isOpen,
  onClose,
  onSpendUpdated,
}: TokenSpendPopoverProps) {
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    const fetchUsage = async () => {
      try {
        const res = await fetch('/api/usage');
        if (res.ok && !isCancelled) {
          const data: UsageState = await res.json();
          setUsage(data);
          if (onSpendUpdated) onSpendUpdated(data);
        }
      } catch (err) {
        console.warn('Failed to fetch usage state:', err);
      }
    };

    fetchUsage();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, onSpendUpdated]);

  const handleReset = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      if (res.ok) {
        const data: UsageState = await res.json();
        setUsage(data);
        if (onSpendUpdated) onSpendUpdated(data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const budgetPercent = usage
    ? Math.min(100, (usage.totalCostUsd / usage.budgetLimitUsd) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-deep/70 backdrop-blur-sm">
      <div className="w-full max-w-md analog-glass-elevated border border-cream/20 rounded-xl overflow-hidden shadow-2xl font-mono text-xs select-none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cream/10 bg-charcoal-deep">
          <div className="flex items-center space-x-2">
            <Coins className="w-4 h-4 text-sage" />
            <h2 className="font-bold text-cream uppercase tracking-wider text-xs">
              Token & Cost Accounting
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-cream-dim hover:text-cream hover:bg-charcoal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 text-cream">
          {/* Budget Limit Progress Bar */}
          <div className="space-y-1.5 p-3 rounded-lg bg-charcoal-deep/80 border border-cream/10">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-cream-dim">Session Budget Spend:</span>
              <span className="font-bold text-cream">
                ${usage?.totalCostUsd.toFixed(4) || '0.0000'} / ${usage?.budgetLimitUsd.toFixed(2) || '5.00'}
              </span>
            </div>
            <div className="w-full bg-charcoal rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  budgetPercent > 80 ? 'bg-brick' : 'bg-sage'
                }`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-cream-dim pt-1">
              <span>{budgetPercent.toFixed(1)}% of $5.00 max</span>
              {budgetPercent > 80 && (
                <span className="text-brick flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Approaching limit</span>
                </span>
              )}
            </div>
          </div>

          {/* Model Breakdown */}
          <div className="space-y-2">
            <div className="text-[10px] text-cream-dim uppercase tracking-wider">
              Token Spend By Tier
            </div>

            <div className="space-y-1.5">
              {/* Ultra Tier */}
              <div className="flex items-center justify-between p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div>
                  <div className="font-semibold text-cream">Nemotron 3 Ultra (550B)</div>
                  <div className="text-[10px] text-cream-dim">
                    {usage?.ultra?.promptTokens.toLocaleString() || 0} prompt /{' '}
                    {usage?.ultra?.completionTokens.toLocaleString() || 0} comp
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sage">
                    ${usage?.ultra?.costUsd.toFixed(4) || '0.0000'}
                  </div>
                  <div className="text-[9px] text-cream-dim">Physical Reasoning</div>
                </div>
              </div>

              {/* Super Tier */}
              <div className="flex items-center justify-between p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div>
                  <div className="font-semibold text-cream">Nemotron 3 Super (120B)</div>
                  <div className="text-[10px] text-cream-dim">
                    {usage?.super?.promptTokens.toLocaleString() || 0} prompt /{' '}
                    {usage?.super?.completionTokens.toLocaleString() || 0} comp
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sage">
                    ${usage?.super?.costUsd.toFixed(4) || '0.0000'}
                  </div>
                  <div className="text-[9px] text-cream-dim">Verification & Critique</div>
                </div>
              </div>

              {/* Nano Tier */}
              <div className="flex items-center justify-between p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div>
                  <div className="font-semibold text-cream">Nemotron 3 Nano (30B)</div>
                  <div className="text-[10px] text-cream-dim">
                    {usage?.nano?.promptTokens.toLocaleString() || 0} prompt /{' '}
                    {usage?.nano?.completionTokens.toLocaleString() || 0} comp
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sage">
                    ${usage?.nano?.costUsd.toFixed(4) || '0.0000'}
                  </div>
                  <div className="text-[9px] text-cream-dim">Diagnostics Translation</div>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing Model Note */}
          <div className="p-2.5 rounded bg-sage/10 border border-sage/20 text-[10px] text-cream-dim flex items-start space-x-2">
            <ShieldCheck className="w-3.5 h-3.5 text-sage shrink-0 mt-0.5" />
            <div>
              <span>
                Standard rates: Ultra ($0.012/1K), Super ($0.004/1K), Nano ($0.0008/1K). Demo sessions use local mock counting when API key is unconfigured.
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-cream/10 bg-charcoal-deep">
          <button
            onClick={handleReset}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream-dim hover:text-cream transition-colors text-[11px] disabled:opacity-50"
          >
            <RotateCcw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Reset Accounting</span>
          </button>

          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-sage hover:bg-sage/80 text-cream font-bold transition-colors text-[11px]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
