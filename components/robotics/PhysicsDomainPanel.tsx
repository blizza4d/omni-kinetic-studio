'use client';

import React, { useState } from 'react';
import {
  Sliders,
  Globe2,
  Sparkles,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { SimEngine } from '@/lib/sim/SimEngine';
import {
  sampleDomain,
  DEFAULT_RANDOMIZATION_CONFIG,
} from '@/lib/sim2real/toolkit';

export interface PhysicsDomainState {
  gravityMps2: number;
  frictionCoeff: number;
  slipDamping: number;
  maxTorqueNm: number;
  imuNoiseSigma: number;
  controlLatencyMs: number;
}

export const DEFAULT_PHYSICS_DOMAIN: PhysicsDomainState = {
  gravityMps2: 1.62,
  frictionCoeff: 0.85,
  slipDamping: 0.25,
  maxTorqueNm: 35.0,
  imuNoiseSigma: 0.02,
  controlLatencyMs: 0.0,
};

interface PhysicsDomainPanelProps {
  engine?: SimEngine | null;
  onDomainChange?: (domain: PhysicsDomainState) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

export default function PhysicsDomainPanel({
  engine,
  onDomainChange,
  isCollapsed = false,
  onToggleCollapse,
  className = '',
}: PhysicsDomainPanelProps) {
  const [domain, setDomain] = useState<PhysicsDomainState>(DEFAULT_PHYSICS_DOMAIN);

  const applyChange = (updated: Partial<PhysicsDomainState>) => {
    const next = { ...domain, ...updated };
    setDomain(next);
    if (engine) {
      engine.applyDomainPhysics(next);
    }
    if (onDomainChange) {
      onDomainChange(next);
    }
  };

  const handlePresetGravity = (val: number) => {
    applyChange({ gravityMps2: val });
  };

  const handleRandomizeDomain = () => {
    const sampled = sampleDomain(DEFAULT_RANDOMIZATION_CONFIG, domain.gravityMps2, Math.random);
    applyChange({
      frictionCoeff: sampled.friction,
      imuNoiseSigma: sampled.rangeNoiseStd,
      controlLatencyMs: sampled.motorLatencySteps * 16.67,
      maxTorqueNm: Number((35 * sampled.motorStrength).toFixed(1)),
    });
  };

  const handleReset = () => {
    applyChange(DEFAULT_PHYSICS_DOMAIN);
  };

  return (
    <div
      className={`analog-glass-elevated border border-cream/15 rounded-xl overflow-hidden shadow-2xl flex flex-col font-mono text-xs select-none transition-all duration-200 ${className}`}
      data-testid="physics-domain-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#1F1F1F] border-b border-cream/10">
        <div className="flex items-center space-x-2">
          <Sliders className="w-4 h-4 text-sage" />
          <span className="font-bold tracking-wider text-cream uppercase text-[11px]">
            Sim-to-Real Domain Randomization
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleRandomizeDomain}
            className="px-2 py-0.5 rounded bg-sage/20 hover:bg-sage/30 text-sage border border-sage/40 text-[9px] uppercase font-bold flex items-center space-x-1 transition-colors"
            title="Randomize physics domain using Wilson 95% CI distributions"
          >
            <Sparkles className="w-3 h-3" />
            <span>Randomize</span>
          </button>
          <button
            onClick={handleReset}
            className="p-1 rounded text-cream-dim hover:text-cream hover:bg-cream/10 transition-colors"
            title="Reset domain to default baseline"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded text-cream-dim hover:text-cream hover:bg-cream/10 transition-colors"
            >
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3.5 space-y-4 overflow-y-auto max-h-[calc(100vh-280px)] custom-scrollbar">
          {/* Gravity Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-cream-dim tracking-wider border-b border-cream/5 pb-1">
              <span className="flex items-center space-x-1">
                <Globe2 className="w-3 h-3 text-sage" />
                <span>Gravity Vector ({domain.gravityMps2.toFixed(2)} m/s²)</span>
              </span>
              <span className="text-[9px] text-cream-dim">
                {(domain.gravityMps2 / 9.81).toFixed(3)} g
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: 'Moon', val: 1.62 },
                { label: 'Mars', val: 3.72 },
                { label: 'Earth', val: 9.81 },
                { label: 'Micro-G', val: 0.5 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetGravity(preset.val)}
                  className={`py-1 px-1.5 rounded text-[9px] uppercase font-bold transition-colors ${
                    Math.abs(domain.gravityMps2 - preset.val) < 0.05
                      ? 'bg-sage text-charcoal-deep'
                      : 'bg-charcoal text-cream-dim hover:text-cream border border-cream/10'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <input
                type="range"
                min="0.1"
                max="20.0"
                step="0.05"
                value={domain.gravityMps2}
                onChange={(e) => applyChange({ gravityMps2: parseFloat(e.target.value) })}
                className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-cream-dim">
                <span>0.1 m/s² (Deep Space)</span>
                <span>20.0 m/s² (Super-Jupiter)</span>
              </div>
            </div>
          </div>

          {/* Surface & Actuator Physics */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase text-cream-dim tracking-wider border-b border-cream/5 pb-1">
              Surface & Actuator Dynamics
            </div>

            <div className="space-y-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-cream-dim">Friction Coefficient (μ):</span>
                  <span className="text-cream font-bold tabular-nums">{domain.frictionCoeff.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.05"
                  value={domain.frictionCoeff}
                  onChange={(e) => applyChange({ frictionCoeff: parseFloat(e.target.value) })}
                  className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-cream-dim">
                  <span>0.10 (Ice)</span>
                  <span>0.55 (Regolith)</span>
                  <span>1.50 (High Traction)</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-cream-dim">Joint Max Torque Limit:</span>
                  <span className="text-cream font-bold tabular-nums">{domain.maxTorqueNm.toFixed(0)} N·m</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="1"
                  value={domain.maxTorqueNm}
                  onChange={(e) => applyChange({ maxTorqueNm: parseFloat(e.target.value) })}
                  className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-cream-dim">
                  <span>10 N·m (Compliant)</span>
                  <span>35 N·m (Nominal)</span>
                  <span>60 N·m (Rigid)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sensor Noise & Comms Latency */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase text-cream-dim tracking-wider border-b border-cream/5 pb-1">
              Sensors & Transport Latency
            </div>

            <div className="space-y-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-cream-dim">IMU Gaussian Noise (σ):</span>
                  <span className="text-cream font-bold tabular-nums">±{domain.imuNoiseSigma.toFixed(3)} m/s²</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.15"
                  step="0.005"
                  value={domain.imuNoiseSigma}
                  onChange={(e) => applyChange({ imuNoiseSigma: parseFloat(e.target.value) })}
                  className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-cream-dim">
                  <span>Zero Noise (Perfect)</span>
                  <span>0.15 m/s² (Noisy MEMS)</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-cream-dim">Control Transport Latency:</span>
                  <span className="text-cream font-bold tabular-nums">{domain.controlLatencyMs.toFixed(0)} ms</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="250"
                  step="5"
                  value={domain.controlLatencyMs}
                  onChange={(e) => applyChange({ controlLatencyMs: parseFloat(e.target.value) })}
                  className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-cream-dim">
                  <span>0 ms (Real-time Bus)</span>
                  <span>120 ms (5G Network)</span>
                  <span>250 ms (Deep Space)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
