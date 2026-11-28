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
import { mulberry32 } from '@/lib/sim/prng';

export interface PhysicsDomainState {
  gravityMps2: number;
  frictionCoeff: number;
  frictionMultiplier?: number;
  slipDamping: number;
  maxTorqueNm: number;
  torqueScale?: number;
  imuNoiseEnabled?: boolean;
  imuNoiseSigma: number;
  controlLatencyMs: number;
  seed?: number;
}

export const NOMINAL_FRICTION = 0.85;
export const NOMINAL_TORQUE_NM = 35.0;

export const DEFAULT_PHYSICS_DOMAIN: PhysicsDomainState = {
  gravityMps2: 1.62,
  frictionCoeff: NOMINAL_FRICTION,
  frictionMultiplier: 1.0,
  slipDamping: 0.25,
  maxTorqueNm: NOMINAL_TORQUE_NM,
  torqueScale: 1.0,
  imuNoiseEnabled: false,
  imuNoiseSigma: 0.0,
  controlLatencyMs: 0.0,
  seed: 42,
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
    const next: PhysicsDomainState = { ...domain, ...updated };
    const effImuSigma = next.imuNoiseEnabled === false ? 0 : next.imuNoiseSigma;
    setDomain(next);
    if (engine) {
      engine.applyDomainPhysics({
        gravityMps2: next.gravityMps2,
        frictionCoeff: next.frictionCoeff,
        slipDamping: next.slipDamping,
        maxTorqueNm: next.maxTorqueNm,
        imuNoiseSigma: effImuSigma,
        controlLatencyMs: next.controlLatencyMs,
        seed: next.seed,
      });
    }
    if (onDomainChange) {
      onDomainChange({ ...next, imuNoiseSigma: effImuSigma });
    }
  };

  const handlePresetGravity = (val: number) => {
    applyChange({ gravityMps2: val });
  };

  const handleRandomizeSeed = () => {
    const nextSeed = ((domain.seed ?? 42) * 1664525 + 1013904223) >>> 0 || 1337;
    const rng = mulberry32(nextSeed);
    const fricMult = Number((0.4 + rng() * 1.05).toFixed(2));
    const torqueScale = Number((0.55 + rng() * 0.65).toFixed(2));
    const imuSigma = Number((0.015 + rng() * 0.095).toFixed(3));
    const latencyMs = Math.round((rng() * 160) / 5) * 5;
    applyChange({
      seed: nextSeed,
      frictionMultiplier: fricMult,
      frictionCoeff: Number((NOMINAL_FRICTION * fricMult).toFixed(2)),
      torqueScale,
      maxTorqueNm: Number((NOMINAL_TORQUE_NM * torqueScale).toFixed(1)),
      imuNoiseEnabled: true,
      imuNoiseSigma: imuSigma,
      controlLatencyMs: latencyMs,
    });
  };

  const handleReset = () => {
    applyChange(DEFAULT_PHYSICS_DOMAIN);
  };

  const frictionMult = domain.frictionMultiplier ?? Number((domain.frictionCoeff / NOMINAL_FRICTION).toFixed(2));
  const torqueScale = domain.torqueScale ?? Number((domain.maxTorqueNm / NOMINAL_TORQUE_NM).toFixed(2));
  const imuEnabled = domain.imuNoiseEnabled ?? domain.imuNoiseSigma > 0;

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
          <span className="text-[9px] text-cream-dim tabular-nums">Seed #{domain.seed ?? 42}</span>
          <button
            type="button"
            onClick={handleRandomizeSeed}
            className="px-2 py-0.5 rounded bg-sage/20 hover:bg-sage/30 text-sage border border-sage/40 text-[9px] uppercase font-bold flex items-center space-x-1 transition-colors"
            title="Apply reproducible domain randomization seed & log to exported episodes"
          >
            <Sparkles className="w-3 h-3" />
            <span>Randomize Seed</span>
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
                  <span className="text-cream-dim">Ground Friction Multiplier:</span>
                  <span className="text-cream font-bold tabular-nums">
                    {frictionMult.toFixed(2)}x (μ={domain.frictionCoeff.toFixed(2)})
                  </span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="1.5"
                  step="0.05"
                  value={frictionMult}
                  onChange={(e) => {
                    const m = parseFloat(e.target.value);
                    applyChange({
                      frictionMultiplier: m,
                      frictionCoeff: Number((NOMINAL_FRICTION * m).toFixed(2)),
                    });
                  }}
                  className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-cream-dim">
                  <span>0.3x (Ice)</span>
                  <span>1.0x (Nominal)</span>
                  <span>1.5x (High Grip)</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-cream-dim">Max Torque Scale:</span>
                  <span className="text-cream font-bold tabular-nums">
                    {torqueScale.toFixed(2)}x ({domain.maxTorqueNm.toFixed(1)} N·m)
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.2"
                  step="0.05"
                  value={torqueScale}
                  onChange={(e) => {
                    const s = parseFloat(e.target.value);
                    applyChange({
                      torqueScale: s,
                      maxTorqueNm: Number((NOMINAL_TORQUE_NM * s).toFixed(1)),
                    });
                  }}
                  className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-cream-dim">
                  <span>0.5x (Derated)</span>
                  <span>1.0x (35 N·m)</span>
                  <span>1.2x (Boost)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sensor Noise & Comms Latency */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-cream-dim tracking-wider border-b border-cream/5 pb-1">
              <span>Sensor & Control Faults</span>
              <button
                type="button"
                onClick={() =>
                  applyChange({
                    imuNoiseEnabled: !imuEnabled,
                    imuNoiseSigma: !imuEnabled && domain.imuNoiseSigma === 0 ? 0.04 : domain.imuNoiseSigma,
                  })
                }
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border transition-colors ${
                  imuEnabled
                    ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                    : 'bg-charcoal text-cream-dim border-cream/10'
                }`}
              >
                IMU Noise: {imuEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-cream-dim">IMU / Pose Gaussian Noise (σ):</span>
                  <span className="text-cream font-bold tabular-nums">
                    ±{(imuEnabled ? domain.imuNoiseSigma : 0).toFixed(3)} m/s²
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.15"
                  step="0.005"
                  disabled={!imuEnabled}
                  value={domain.imuNoiseSigma}
                  onChange={(e) => applyChange({ imuNoiseSigma: parseFloat(e.target.value), imuNoiseEnabled: true })}
                  className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer disabled:opacity-40"
                />
                <div className="flex justify-between text-[9px] text-cream-dim">
                  <span>0.000 (Clean)</span>
                  <span>0.150 m/s² (Degraded MEMS)</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-cream-dim">Control Latency Buffer:</span>
                  <span className="text-cream font-bold tabular-nums">{domain.controlLatencyMs.toFixed(0)} ms</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="5"
                  value={Math.min(200, domain.controlLatencyMs)}
                  onChange={(e) => applyChange({ controlLatencyMs: parseFloat(e.target.value) })}
                  className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-cream-dim">
                  <span>0 ms (Real-time)</span>
                  <span>100 ms (WAN)</span>
                  <span>200 ms (Lag Spike)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
