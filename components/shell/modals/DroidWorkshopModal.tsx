'use client';

import React, { useState } from 'react';
import { X, Cpu, Check, AlertCircle, Weight, ArrowRight } from 'lucide-react';
import {
  MORPHOLOGY_PRESETS,
  MorphologyPresetKey,
  MorphologySpec,
  computeCoMWithPayload,
  validateMorphologyFeasibility,
} from '@/lib/droid/workshop';

interface DroidWorkshopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMorphology?: (presetKey: MorphologyPresetKey, spec: MorphologySpec) => void;
}

export function DroidWorkshopModal({ isOpen, onClose, onSelectMorphology }: DroidWorkshopModalProps) {
  const [selectedKey, setSelectedKey] = useState<MorphologyPresetKey>('scout');
  const [payloadKg, setPayloadKg] = useState<number>(0);

  if (!isOpen) return null;

  const currentSpec = MORPHOLOGY_PRESETS[selectedKey];
  const com = computeCoMWithPayload(currentSpec, payloadKg);
  const feasibility = validateMorphologyFeasibility(currentSpec, payloadKg);

  const handleApply = () => {
    if (onSelectMorphology) {
      onSelectMorphology(selectedKey, currentSpec);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-deep/80 backdrop-blur-sm select-none font-mono text-xs">
      <div className="w-full max-w-2xl bg-charcoal border border-cream/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-cream animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-cream/10 bg-charcoal-deep/60">
          <div className="flex items-center space-x-2.5">
            <Cpu className="w-4 h-4 text-sage" />
            <span className="font-bold text-sm tracking-wide uppercase">Droid Workshop & Morphology</span>
            <span className="text-[10px] bg-sage/20 text-sage px-1.5 py-0.5 rounded border border-sage/40">
              PACK C ★
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
        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Preset Selector Grid */}
          <div className="space-y-2">
            <span className="text-[11px] text-cream-dim uppercase tracking-wider block">
              Morphology Presets:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(Object.keys(MORPHOLOGY_PRESETS) as MorphologyPresetKey[]).map((key) => {
                const p = MORPHOLOGY_PRESETS[key];
                const isSelected = selectedKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedKey(key);
                      setPayloadKg(0);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-sage/20 border-sage shadow-md shadow-sage/15'
                        : 'bg-charcoal-deep/50 border-cream/10 hover:border-cream/30'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-cream">{p.name}</div>
                      <div className="text-[10px] text-cream-dim mt-0.5">{p.legCount} legs · {p.chassisMassKg} kg</div>
                    </div>
                    {isSelected && (
                      <span className="mt-2 text-[10px] text-sage flex items-center space-x-1 font-bold">
                        <Check className="w-3 h-3" />
                        <span>Active</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preset Specs & Payload Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Specs */}
            <div className="bg-charcoal-deep/70 p-4 rounded-xl border border-cream/10 space-y-2.5">
              <span className="font-bold text-cream text-[11px] uppercase tracking-wide block">
                Physical Specifications
              </span>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between border-b border-cream/5 py-1">
                  <span className="text-cream-dim">Chassis Mass</span>
                  <span className="font-bold tabular-nums">{currentSpec.chassisMassKg.toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between border-b border-cream/5 py-1">
                  <span className="text-cream-dim">Total Mass (w/ Payload)</span>
                  <span className="font-bold text-sage tabular-nums">{com.totalMassKg.toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between border-b border-cream/5 py-1">
                  <span className="text-cream-dim">Leg Thigh / Calf Length</span>
                  <span className="font-bold tabular-nums">
                    {currentSpec.thighLengthM}m / {currentSpec.calfLengthM}m
                  </span>
                </div>
                <div className="flex justify-between border-b border-cream/5 py-1">
                  <span className="text-cream-dim">Froude Trot-Gallop Speed</span>
                  <span className="font-bold tabular-nums">{currentSpec.froudeWalkSpeed.toFixed(2)} m/s</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-cream-dim">CoM Shift (X, Y, Z)</span>
                  <span className="font-bold tabular-nums">
                    [{com.comOffset[0].toFixed(3)}, {com.comOffset[1].toFixed(3)}, {com.comOffset[2].toFixed(3)}] m
                  </span>
                </div>
              </div>
            </div>

            {/* Payload & Stability */}
            <div className="bg-charcoal-deep/70 p-4 rounded-xl border border-cream/10 space-y-3">
              <span className="font-bold text-cream text-[11px] uppercase tracking-wide block">
                Payload Attachment
              </span>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-cream-dim flex items-center space-x-1">
                    <Weight className="w-3.5 h-3.5 text-sage" />
                    <span>Payload Mass:</span>
                  </span>
                  <span className="font-bold text-cream tabular-nums">{payloadKg.toFixed(1)} kg</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={currentSpec.maxPayloadKg}
                  step={0.5}
                  value={payloadKg}
                  onChange={(e) => setPayloadKg(parseFloat(e.target.value))}
                  className="w-full accent-sage"
                />
                <div className="flex justify-between text-[10px] text-cream-dim">
                  <span>0 kg</span>
                  <span>Max: {currentSpec.maxPayloadKg} kg</span>
                </div>
              </div>

              {/* Feasibility Check */}
              <div
                className={`p-2.5 rounded-lg border text-[11px] flex items-start space-x-2 ${
                  feasibility.feasible
                    ? 'bg-sage/10 border-sage/30 text-sage'
                    : 'bg-brick/10 border-brick/30 text-brick'
                }`}
              >
                {feasibility.feasible ? (
                  <Check className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">{feasibility.feasible ? 'Morphology Feasible' : 'Infeasible Setup'}</div>
                  <div className="text-[10px] text-cream-dim">{feasibility.reason}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-cream/10 bg-charcoal-deep/60">
          <span className="text-[11px] text-cream-dim">
            Note: Scout preset matches golden trace baseline byte-for-byte.
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
              disabled={!feasibility.feasible}
              onClick={handleApply}
              className="px-4 py-1.5 rounded-lg bg-sage hover:bg-sage-light disabled:opacity-50 text-cream font-bold text-xs flex items-center space-x-1 shadow-md shadow-sage/20"
            >
              <span>Deploy Preset</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
