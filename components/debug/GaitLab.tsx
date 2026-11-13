'use client';

import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Play,
  RotateCcw,
  Zap,
  Activity,
  Shield,
  Layers,
  X,
  Sparkles,
  Compass,
} from 'lucide-react';

export interface GaitLabProps {
  isOpen?: boolean;
  onClose: () => void;
  isNewAnimation: boolean;
  onToggleAnimation: (enabled: boolean) => void;
  gravity?: number;
  onGravityChange?: (g: number) => void;
  speed?: number;
  onSpeedChange?: (v: number) => void;
  gaitState?: string;
  froudeNumber?: number;
  jerkRMS?: number;
}

export default function GaitLab({
  isOpen = true,
  onClose,
  isNewAnimation,
  onToggleAnimation,
  gravity = 1.62,
  onGravityChange = () => {},
  speed = 1.0,
  onSpeedChange = () => {},
  gaitState = 'walk',
  froudeNumber = 1.45,
  jerkRMS = 12.4,
}: GaitLabProps) {
  const [strideScale, setStrideScale] = useState(1.0);
  const [swingHeightScale, setSwingHeightScale] = useState(1.0);
  const [secondaryStrength, setSecondaryStrength] = useState(1.0);
  const [cameraHalfLife, setCameraHalfLife] = useState(0.18);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 rounded-xl border border-hairline bg-charcoal/95 p-5 text-cream shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-sage" />
          <h3 className="font-mono text-sm font-bold tracking-wider text-cream">
            GAIT LAB (TUNING & A/B)
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-cream/60 transition-colors hover:bg-charcoal-light hover:text-cream"
          title="Close Gait Lab (G)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* A/B System Toggle */}
      <div className="my-4 rounded-lg border border-hairline/60 bg-charcoal-deep/80 p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-semibold text-cream">
            ANIMATION ENGINE:
          </span>
          <button
            onClick={() => onToggleAnimation(!isNewAnimation)}
            className={`rounded px-3 py-1 font-mono text-xs font-bold transition-all ${
              isNewAnimation
                ? 'bg-sage text-charcoal-deep shadow-md'
                : 'bg-brick text-cream'
            }`}
          >
            {isNewAnimation ? '✨ NEW (FLUID / INTERPOLATED)' : '⚠️ LEGACY (BASELINE)'}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-cream/60">
          {isNewAnimation
            ? 'Sub-frame interpolation, 120Hz fixed step, soft TwoBoneIK, and damped camera follow active.'
            : 'Un-interpolated 500ms discrete batches and raw 0.12 camera lerp.'}
        </p>
      </div>

      {/* Live Telemetry Metrics */}
      <div className="grid grid-cols-3 gap-2 py-2 font-mono text-[11px]">
        <div className="rounded border border-hairline/40 bg-charcoal-deep/50 p-2 text-center">
          <div className="text-cream/50">STATE</div>
          <div className="mt-0.5 font-bold text-sage">{gaitState.toUpperCase()}</div>
        </div>
        <div className="rounded border border-hairline/40 bg-charcoal-deep/50 p-2 text-center">
          <div className="text-cream/50">FROUDE (Fr)</div>
          <div className="mt-0.5 font-bold text-cream">{froudeNumber.toFixed(2)}</div>
        </div>
        <div className="rounded border border-hairline/40 bg-charcoal-deep/50 p-2 text-center">
          <div className="text-cream/50">JERK RMS</div>
          <div className="mt-0.5 font-bold text-cream">{jerkRMS.toFixed(1)} m/s³</div>
        </div>
      </div>

      {/* Tuning Controls */}
      <div className="space-y-3 pt-2">
        {/* Speed Slider */}
        <div>
          <div className="flex justify-between font-mono text-xs text-cream/80">
            <span>FORWARD SPEED</span>
            <span className="text-sage">{speed.toFixed(2)} m/s</span>
          </div>
          <input
            type="range"
            min="0"
            max="2.0"
            step="0.05"
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-charcoal-light accent-sage"
          />
        </div>

        {/* Gravity Presets */}
        <div>
          <div className="mb-1 flex justify-between font-mono text-xs text-cream/80">
            <span>GRAVITY REGIME</span>
            <span className="text-sage">{gravity.toFixed(2)} m/s²</span>
          </div>
          <div className="flex gap-1.5">
            {[
              { name: 'Moon', g: 1.62 },
              { name: 'Mars', g: 3.71 },
              { name: 'Earth', g: 9.81 },
            ].map((p) => (
              <button
                key={p.name}
                onClick={() => onGravityChange(p.g)}
                className={`flex-1 rounded border py-1 font-mono text-xs transition-colors ${
                  Math.abs(gravity - p.g) < 0.1
                    ? 'border-sage bg-sage/20 text-cream'
                    : 'border-hairline bg-charcoal-light/60 text-cream/60 hover:text-cream'
                }`}
              >
                {p.name} ({p.g})
              </button>
            ))}
          </div>
        </div>

        {/* Stride & Swing Height Multipliers */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <div className="flex justify-between font-mono text-[11px] text-cream/70">
              <span>STRIDE SCALE</span>
              <span>{strideScale.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={strideScale}
              onChange={(e) => setStrideScale(parseFloat(e.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded bg-charcoal-light accent-sage"
            />
          </div>
          <div>
            <div className="flex justify-between font-mono text-[11px] text-cream/70">
              <span>SWING CLEARANCE</span>
              <span>{swingHeightScale.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={swingHeightScale}
              onChange={(e) => setSwingHeightScale(parseFloat(e.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded bg-charcoal-light accent-sage"
            />
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3 font-mono text-[10px] text-cream/50">
        <span>PRESS [G] TO TOGGLE LAB</span>
        <span>A/B TEST ACTIVE</span>
      </div>
    </div>
  );
}
