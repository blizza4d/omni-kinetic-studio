'use client';

import React, { useState } from 'react';
import { X, Radio, Check, Globe, Moon, ArrowRightLeft } from 'lucide-react';
import {
  DELAY_PRESETS,
  CommsPresetKey,
  SPEED_OF_LIGHT_KM_S,
  EARTH_MOON_AVG_DIST_KM,
} from '@/lib/comms/delay';

interface CommsDelayModalProps {
  isOpen: boolean;
  activePreset: CommsPresetKey;
  onClose: () => void;
  onSelectPreset: (presetKey: CommsPresetKey, customDelaySec?: number) => void;
}

export function CommsDelayModal({
  isOpen,
  activePreset,
  onClose,
  onSelectPreset,
}: CommsDelayModalProps) {
  const [selected, setSelected] = useState<CommsPresetKey>(activePreset);
  const [customMs, setCustomMs] = useState<number>(500);

  if (!isOpen) return null;

  const handleApply = () => {
    onSelectPreset(selected, selected === 'custom' ? customMs / 1000 : undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-deep/80 backdrop-blur-sm select-none font-mono text-xs">
      <div className="w-full max-w-lg bg-charcoal border border-cream/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-cream animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-cream/10 bg-charcoal-deep/60">
          <div className="flex items-center space-x-2.5">
            <Radio className="w-4 h-4 text-sage" />
            <span className="font-bold text-sm tracking-wide uppercase">Earth-Moon Comms Delay Mode</span>
            <span className="text-[10px] bg-sage/20 text-sage px-1.5 py-0.5 rounded border border-sage/40">
              PACK E ★
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
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Orbital Physics Explanation */}
          <div className="bg-charcoal-deep/80 p-3.5 rounded-xl border border-cream/10 space-y-2 text-[11px] leading-relaxed">
            <div className="flex items-center space-x-2 text-cream font-bold">
              <Globe className="w-3.5 h-3.5 text-sage" />
              <ArrowRightLeft className="w-3.5 h-3.5 text-cream-dim" />
              <Moon className="w-3.5 h-3.5 text-sage" />
              <span>Speed of Light in Vacuum: {SPEED_OF_LIGHT_KM_S.toLocaleString()} km/s</span>
            </div>
            <p className="text-cream-dim">
              At mean Earth-Moon distance ({EARTH_MOON_AVG_DIST_KM.toLocaleString()} km), physical radio command packets
              require <strong>1.28s</strong> one-way flight time, producing an unavoidable <strong>2.56s Round-Trip Time (RTT)</strong>.
            </p>
          </div>

          {/* Preset Options */}
          <div className="space-y-2">
            <span className="text-[11px] text-cream-dim uppercase tracking-wider block">
              Comms Latency Presets:
            </span>

            <div className="space-y-2">
              {(Object.keys(DELAY_PRESETS) as CommsPresetKey[]).map((key) => {
                const preset = DELAY_PRESETS[key];
                const isSelected = selected === key;
                return (
                  <div
                    key={key}
                    onClick={() => setSelected(key)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-sage/20 border-sage shadow-md shadow-sage/15'
                        : 'bg-charcoal-deep/50 border-cream/10 hover:border-cream/30'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-cream flex items-center space-x-2">
                        <span>{preset.name}</span>
                        {preset.rttSec > 0 && (
                          <span className="text-[10px] bg-charcoal px-1.5 py-0.5 rounded border border-cream/10 text-sage">
                            {preset.rttSec.toFixed(2)}s RTT
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-cream-dim mt-0.5">{preset.description}</div>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-sage shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Milliseconds Input */}
          {selected === 'custom' && (
            <div className="p-3 bg-charcoal-deep/70 rounded-xl border border-cream/10 space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-cream-dim">Custom Delay (One-Way):</span>
                <span className="font-bold text-cream tabular-nums">{customMs} ms ({customMs * 2} ms RTT)</span>
              </div>
              <input
                type="range"
                min={50}
                max={5000}
                step={50}
                value={customMs}
                onChange={(e) => setCustomMs(parseInt(e.target.value, 10))}
                className="w-full accent-sage"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-cream/10 bg-charcoal-deep/60">
          <span className="text-[10px] text-cream-dim">
            Buffers commands into a sim-time monotonic DelayLine.
          </span>
          <div className="flex items-center space-x-2">
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
              <span>Apply Setting</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
