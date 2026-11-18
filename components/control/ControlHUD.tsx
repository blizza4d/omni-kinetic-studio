'use client';

import React, { useRef, useState } from 'react';
import {
  Gamepad2,
  Keyboard,
  Hand,
  Cpu,
  Play,
  Camera,
  Eye,
  Compass,
  Video,
  Share2,
  Sliders,
  Trophy,
  MapPin,
  Radar,
  X,
  Check,
  ChevronRight,
  OctagonAlert,
  Sparkles,
} from 'lucide-react';
import { ControlArbiterSnapshot, GaitMode } from '@/lib/control/types';
import { InputVisualizerSnapshot, TouchInputState } from '@/lib/control/inputs';
import { CameraMode } from '@/lib/storage/settings';

export interface SensorOverlayFlags {
  lidar: boolean;
  contacts: boolean;
  stability: boolean;
  path: boolean;
}

interface ControlHUDProps {
  arbiter: ControlArbiterSnapshot;
  speed: number;
  cmdSpeed: number;
  gaitPattern: string;
  gaitOverride: GaitMode;
  froudeNumber: number;
  gravity: number;
  energyJoules: number;
  inputLatencyMs: number;
  showDebugLatency: boolean;
  cameraMode: CameraMode;
  pipEnabled: boolean;
  sensors: SensorOverlayFlags;
  showLegend: boolean;
  showVisualizer: boolean;
  showTouchControls: boolean;
  showCoachMarks: boolean;
  isReplay: boolean;
  isRecordingClip: boolean;
  clipSupported: boolean;
  visualizer: InputVisualizerSnapshot;
  touchState: TouchInputState;
  onToggleManual: () => void;
  onEmergencyStop: () => void;
  onGaitOverride: (gait: GaitMode) => void;
  onCameraMode: (mode: CameraMode) => void;
  onTogglePip: () => void;
  onToggleSensor: (key: keyof SensorOverlayFlags) => void;
  onToggleLegend: () => void;
  onDismissCoach: (dontShowAgain: boolean) => void;
  onOpenMissions: () => void;
  onOpenEditor: () => void;
  onOpenSettings: () => void;
  onScreenshot: () => void;
  onToggleClipRecord: () => void;
  onShareScenario: () => void;
  onTakeOverReplay: () => void;
}

const COACH_STEPS = [
  {
    title: '1. Take Control',
    body: 'Press [T] or click the mode chip below to switch between Autonomous Policy v1 and direct manual driving.',
  },
  {
    title: '2. Drive & Strafe',
    body: 'Use [W A S D] or Arrow keys to drive, [J / L] or [Shift+A/D] to strafe, and hold [Shift] to bound.',
  },
  {
    title: '3. Click-to-Move Waypoints',
    body: 'Click anywhere on the lunar terrain to drop a waypoint. Shift+Click queues a multi-point path; Esc clears.',
  },
  {
    title: '4. Low-Gravity Hop',
    body: 'Hold [Space] up to 0.6s to charge a crouch, then release to launch a true ballistic lunar hop!',
  },
];

export default function ControlHUD({
  arbiter,
  speed,
  cmdSpeed,
  gaitPattern,
  gaitOverride,
  froudeNumber,
  gravity,
  energyJoules,
  inputLatencyMs,
  showDebugLatency,
  cameraMode,
  pipEnabled,
  sensors,
  showLegend,
  showVisualizer,
  showTouchControls,
  showCoachMarks,
  isReplay,
  isRecordingClip,
  clipSupported,
  visualizer,
  touchState,
  onToggleManual,
  onEmergencyStop,
  onGaitOverride,
  onCameraMode,
  onTogglePip,
  onToggleSensor,
  onToggleLegend,
  onDismissCoach,
  onOpenMissions,
  onOpenEditor,
  onOpenSettings,
  onScreenshot,
  onToggleClipRecord,
  onShareScenario,
  onTakeOverReplay,
}: ControlHUDProps) {
  const [sensorsOpen, setSensorsOpen] = useState(false);
  const [coachIdx, setCoachIdx] = useState(0);
  const [dontShowCoach, setDontShowCoach] = useState(true);

  // Touch joystick pointer capture state
  const leftPadRef = useRef<HTMLDivElement | null>(null);
  const rightPadRef = useRef<HTMLDivElement | null>(null);
  const [leftKnob, setLeftKnob] = useState({ x: 0, y: 0 });
  const [rightKnob, setRightKnob] = useState({ x: 0, y: 0 });

  const handlePadMove = (
    e: React.PointerEvent<HTMLDivElement>,
    padEl: HTMLDivElement | null,
    isLeft: boolean
  ) => {
    if (!padEl) return;
    const rect = padEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.4;
    let dx = (e.clientX - cx) / maxR;
    let dy = (e.clientY - cy) / maxR;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    touchState.active = true;
    if (isLeft) {
      touchState.moveX = dx;
      touchState.moveY = -dy;
      setLeftKnob({ x: dx * 28, y: dy * 28 });
    } else {
      touchState.yawX = dx;
      setRightKnob({ x: dx * 28, y: 0 });
    }
  };

  const resetPad = (isLeft: boolean) => {
    if (isLeft) {
      touchState.moveX = 0;
      touchState.moveY = 0;
      setLeftKnob({ x: 0, y: 0 });
    } else {
      touchState.yawX = 0;
      setRightKnob({ x: 0, y: 0 });
    }
    if (Math.hypot(touchState.moveX, touchState.moveY) < 0.01 && Math.abs(touchState.yawX) < 0.01) {
      touchState.active = false;
    }
  };

  const SourceIcon =
    arbiter.activeSource === 'gamepad'
      ? Gamepad2
      : arbiter.activeSource === 'touch'
      ? Hand
      : arbiter.activeSource === 'policy'
      ? Cpu
      : arbiter.activeSource === 'replay'
      ? Play
      : Keyboard;

  const activeSensorCount = Object.values(sensors).filter(Boolean).length;

  return (
    <>
      {/* Replay Watermark Banner */}
      {isReplay && (
        <div className="pointer-events-auto absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-3 px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/50 backdrop-blur-md font-mono text-[11px] text-amber-200 shadow-xl">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-bold tracking-wider">REPLAY MODE (SCORING DISABLED)</span>
          <button
            type="button"
            onClick={onTakeOverReplay}
            className="px-2.5 py-0.5 rounded bg-amber-400 text-charcoal-deep font-bold hover:bg-amber-300 transition-colors"
          >
            Take over from here
          </button>
        </div>
      )}

      {/* First-Run 4-Step Coach Marks */}
      {showCoachMarks && (
        <div className="pointer-events-auto absolute top-16 left-4 z-40 w-80 p-3.5 rounded-xl bg-charcoal-deep/95 border border-sage/60 shadow-2xl backdrop-blur-md font-mono text-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center space-x-1.5 text-sage font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{COACH_STEPS[coachIdx].title}</span>
            </span>
            <button
              type="button"
              onClick={() => onDismissCoach(dontShowCoach)}
              aria-label="Skip tutorial"
              className="text-cream-dim hover:text-cream"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-cream/90 leading-relaxed">{COACH_STEPS[coachIdx].body}</p>
          <div className="flex items-center justify-between pt-1 border-t border-hairline">
            <label className="flex items-center space-x-1.5 text-[10px] text-cream-dim cursor-pointer">
              <input
                type="checkbox"
                checked={dontShowCoach}
                onChange={(e) => setDontShowCoach(e.target.checked)}
                className="accent-sage"
              />
              <span>Don&apos;t show again</span>
            </label>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => onDismissCoach(dontShowCoach)}
                className="px-2 py-1 rounded text-[10px] text-cream-dim hover:text-cream"
              >
                Skip
              </button>
              {coachIdx < COACH_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCoachIdx((i) => i + 1)}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-sage text-cream text-[10px] font-bold hover:bg-sage/90"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onDismissCoach(dontShowCoach)}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-sage text-cream text-[10px] font-bold hover:bg-sage/90"
                >
                  <Check className="w-3 h-3" />
                  <span>Drive</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom-Left Compact Control HUD */}
      <div
        className="pointer-events-auto absolute bottom-20 left-3 z-20 flex flex-col space-y-2 max-w-[330px] font-mono select-none"
        role="region"
        aria-label="Droid Control HUD"
      >
        {/* Studio Quick Action Strip: Missions, Editor, Sensors, Capture, Share, Settings */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={onOpenMissions}
            title="Missions & Challenges"
            className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-charcoal-deep/90 border border-hairline hover:border-sage text-[10px] text-cream transition-colors"
          >
            <Trophy className="w-3 h-3 text-amber-400" />
            <span>Missions</span>
          </button>
          <button
            type="button"
            onClick={onOpenEditor}
            title="Scenario & Environment Editor [E]"
            className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-charcoal-deep/90 border border-hairline hover:border-sage text-[10px] text-cream transition-colors"
          >
            <MapPin className="w-3 h-3 text-sage" />
            <span>Scenario</span>
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSensorsOpen((v) => !v)}
              title="Toggle Sensor Overlays (LiDAR, GRF, Support Polygon, Path)"
              className={`flex items-center space-x-1 px-2 py-1 rounded-lg border text-[10px] transition-colors ${
                activeSensorCount > 0
                  ? 'bg-sage/25 border-sage text-cream'
                  : 'bg-charcoal-deep/90 border-hairline text-cream hover:border-sage'
              }`}
            >
              <Radar className="w-3 h-3" />
              <span>Sensors{activeSensorCount > 0 ? ` (${activeSensorCount})` : ''}</span>
            </button>
            {sensorsOpen && (
              <div className="absolute left-0 bottom-full mb-1.5 w-48 p-2 rounded-xl bg-charcoal-deep border border-cream/15 shadow-2xl text-[10px] space-y-1 z-50">
                <div className="text-cream font-bold uppercase tracking-wider pb-1 border-b border-hairline">
                  Sensor Overlays
                </div>
                {(
                  [
                    ['lidar', 'LiDAR Range Scan (24 rays)'],
                    ['contacts', 'Foot GRF & Contact Vectors'],
                    ['stability', 'Support Polygon & CoM'],
                    ['path', 'Planned Path & Trajectory'],
                  ] as [keyof SensorOverlayFlags, string][]
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between py-0.5 text-cream-dim hover:text-cream cursor-pointer">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={sensors[key]}
                      onChange={() => onToggleSensor(key)}
                      className="accent-sage"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onScreenshot}
            title="Capture 2x PNG Screenshot [F12]"
            aria-label="Capture Screenshot"
            className="p-1.5 rounded-lg bg-charcoal-deep/90 border border-hairline hover:border-sage text-cream"
          >
            <Camera className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onToggleClipRecord}
            disabled={!clipSupported}
            title={
              !clipSupported
                ? 'Clip recording unsupported in this browser'
                : isRecordingClip
                ? 'Stop & Save WebM Clip'
                : 'Record WebM Clip (max 30s)'
            }
            aria-label="Record Video Clip"
            className={`p-1.5 rounded-lg border transition-colors ${
              !clipSupported
                ? 'bg-charcoal-deep/50 border-hairline text-cream-dim/40 cursor-not-allowed'
                : isRecordingClip
                ? 'bg-brick/30 border-brick text-cream animate-pulse'
                : 'bg-charcoal-deep/90 border-hairline hover:border-sage text-cream'
            }`}
          >
            <Video className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onShareScenario}
            title="Copy Shareable Scenario Link (#s=)"
            aria-label="Share Scenario Link"
            className="p-1.5 rounded-lg bg-charcoal-deep/90 border border-hairline hover:border-sage text-cream"
          >
            <Share2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            title="Controls, Remapping & Studio Settings"
            aria-label="Open Settings"
            className="p-1.5 rounded-lg bg-charcoal-deep/90 border border-hairline hover:border-sage text-cream"
          >
            <Sliders className="w-3 h-3" />
          </button>
        </div>

        {/* Main Drive Mode + Speed/Gait/Froude Panel */}
        <div className="bg-charcoal-deep/90 backdrop-blur-md border border-hairline rounded-xl p-2.5 shadow-2xl space-y-2">
          {/* Top Row: Control Mode Chip + Emergency Stop */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onToggleManual}
              className={`flex-1 flex items-center space-x-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                arbiter.isManual
                  ? 'bg-sage/25 border-sage text-cream'
                  : 'bg-charcoal border-hairline text-cream-dim hover:text-cream hover:border-cream/30'
              }`}
              title="Click or press [T] to switch between Manual Control and Autonomous Policy"
            >
              <SourceIcon className="w-3.5 h-3.5 text-sage shrink-0" />
              <span className="truncate">{arbiter.modeLabel}</span>
              <kbd className="ml-auto px-1 py-0.5 rounded bg-charcoal-deep text-[9px] text-cream-dim border border-hairline">
                T
              </kbd>
            </button>
            <button
              type="button"
              onClick={onEmergencyStop}
              title="Emergency Stop / Recover [X]"
              aria-label="Emergency Stop"
              className="px-2 py-1.5 rounded-lg bg-brick/20 border border-brick/50 text-cream hover:bg-brick/35 text-[10px] font-bold flex items-center space-x-1"
            >
              <OctagonAlert className="w-3.5 h-3.5 text-brick" />
              <span>STOP</span>
            </button>
          </div>

          {/* Speed / Gait / Froude / Energy Telemetry Row */}
          <div className="grid grid-cols-3 gap-1.5 text-[10px] tabular-nums">
            <div className="bg-charcoal/80 rounded-lg px-2 py-1 border border-hairline">
              <div className="text-[9px] text-cream-dim uppercase">Speed</div>
              <div className="text-cream font-bold">
                {speed.toFixed(2)} <span className="text-cream-dim font-normal">/ {cmdSpeed.toFixed(1)} m/s</span>
              </div>
            </div>
            <div
              className="bg-charcoal/80 rounded-lg px-2 py-1 border border-hairline"
              title={`Froude Number Fr = v²/(g·L) = ${froudeNumber.toFixed(2)} at g=${gravity.toFixed(2)} m/s². Transitions to bound near Fr ≈ 0.5.`}
            >
              <div className="text-[9px] text-cream-dim uppercase">Gait · Fr</div>
              <div className="text-sage font-bold uppercase">
                {gaitPattern} <span className="text-cream-dim font-normal">{froudeNumber.toFixed(2)}</span>
              </div>
            </div>
            <div className="bg-charcoal/80 rounded-lg px-2 py-1 border border-hairline">
              <div className="text-[9px] text-cream-dim uppercase">Energy</div>
              <div className="text-cream font-bold">{energyJoules.toFixed(1)} J</div>
            </div>
          </div>

          {/* Hop Charge Meter (shown live while holding Space) */}
          {visualizer.hopCharging && (
            <div className="space-y-0.5">
              <div className="flex justify-between text-[9px] text-amber-300 font-bold uppercase">
                <span>Hop Charge</span>
                <span>{Math.round(visualizer.hopCharge * 100)}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-charcoal overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-75"
                  style={{ width: `${Math.round(visualizer.hopCharge * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Gait Selector Pills (0..4) */}
          <div className="flex items-center justify-between gap-1">
            {(['auto', 'walk', 'trot', 'bound', 'pronk'] as GaitMode[]).map((g, idx) => (
              <button
                key={g}
                type="button"
                onClick={() => onGaitOverride(g)}
                className={`flex-1 py-0.5 rounded text-[9px] uppercase font-semibold border transition-colors ${
                  gaitOverride === g
                    ? 'bg-sage text-cream border-sage'
                    : 'bg-charcoal/60 text-cream-dim border-hairline hover:text-cream'
                }`}
                title={`Force ${g} gait [${idx}]`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Camera Mode Pills + PiP Toggle */}
          <div className="flex items-center gap-1 pt-0.5 border-t border-hairline">
            <Compass className="w-3 h-3 text-cream-dim shrink-0 mr-0.5" />
            {(
              [
                ['follow', 'Follow'],
                ['orbit', 'Orbit'],
                ['topdown', 'Top'],
                ['fpv', 'FPV'],
                ['freefly', 'Free'],
              ] as [CameraMode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => onCameraMode(m)}
                className={`px-1.5 py-0.5 rounded text-[9px] border transition-colors ${
                  cameraMode === m
                    ? 'bg-cream/20 border-cream/50 text-cream font-bold'
                    : 'bg-charcoal/50 border-hairline text-cream-dim hover:text-cream'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={onTogglePip}
              title="Toggle Picture-in-Picture Droid Camera"
              className={`ml-auto px-1.5 py-0.5 rounded text-[9px] border flex items-center space-x-1 ${
                pipEnabled
                  ? 'bg-sage/30 border-sage text-cream font-bold'
                  : 'bg-charcoal/50 border-hairline text-cream-dim hover:text-cream'
              }`}
            >
              <Eye className="w-2.5 h-2.5" />
              <span>PiP</span>
            </button>
          </div>

          {/* Adaptive Key Legend (Dismissible with H) */}
          {showLegend && (
            <div className="pt-1 border-t border-hairline flex items-center justify-between text-[9px] text-cream-dim">
              <span>
                {visualizer.gamepadConnected
                  ? 'L-Stick Move · R-Stick Turn · RT Sprint · A Hop · B Stop'
                  : 'WASD Drive · Shift Bound · Space Hop · C/V Height · Click Waypoint'}
              </span>
              <button
                type="button"
                onClick={onToggleLegend}
                title="Hide legend [H]"
                className="ml-1 text-cream-dim hover:text-cream"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Optional Live Input Visualizer + Debug Latency */}
          {(showVisualizer || showDebugLatency) && (
            <div className="pt-1 border-t border-hairline flex items-center justify-between text-[9px] text-cream-dim">
              {showVisualizer && (
                <div className="flex items-center space-x-1">
                  {['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].map((k) => {
                    const active = visualizer.keysHeld.includes(k) || (k === 'Space' && visualizer.hopCharging);
                    return (
                      <span
                        key={k}
                        className={`px-1 py-0.5 rounded border text-[8px] ${
                          active ? 'bg-sage border-sage text-cream font-bold' : 'bg-charcoal border-hairline'
                        }`}
                      >
                        {k.replace('Key', '')}
                      </span>
                    );
                  })}
                </div>
              )}
              {showDebugLatency && (
                <span className="ml-auto text-sage tabular-nums">
                  Input Latency: {inputLatencyMs > 0 ? `${inputLatencyMs.toFixed(1)}ms` : '<16ms'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Touch Dual Virtual Joystick & Large 44px+ Action Pads (Coarse Pointer or Settings Enabled) */}
      {showTouchControls && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex items-end justify-between px-4 pb-[env(safe-area-inset-bottom)]"
          style={{ touchAction: 'none' }}
        >
          {/* Left Move Joystick */}
          <div
            ref={leftPadRef}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              handlePadMove(e, leftPadRef.current, true);
            }}
            onPointerMove={(e) => {
              if (e.buttons > 0 || e.pressure > 0) handlePadMove(e, leftPadRef.current, true);
            }}
            onPointerUp={() => resetPad(true)}
            onPointerCancel={() => resetPad(true)}
            className="pointer-events-auto relative w-28 h-28 rounded-full bg-charcoal-deep/70 border border-cream/25 backdrop-blur-sm flex items-center justify-center"
            style={{ touchAction: 'none' }}
            aria-label="Movement virtual joystick"
          >
            <div
              className="w-11 h-11 rounded-full bg-sage/80 border border-cream shadow-lg"
              style={{ transform: `translate(${leftKnob.x}px, ${leftKnob.y}px)` }}
            />
          </div>

          {/* Right Yaw Pad + Action Buttons (>= 44px touch targets) */}
          <div className="pointer-events-auto flex items-end space-x-2" style={{ touchAction: 'none' }}>
            <div className="flex flex-col space-y-2">
              <button
                type="button"
                onPointerDown={() => { touchState.hopHeld = true; touchState.active = true; }}
                onPointerUp={() => { touchState.hopHeld = false; }}
                onPointerCancel={() => { touchState.hopHeld = false; }}
                className="min-w-[52px] min-h-[46px] rounded-xl bg-amber-500/80 border border-amber-300 text-charcoal-deep font-mono text-xs font-bold shadow-lg"
              >
                HOP
              </button>
              <button
                type="button"
                onClick={() => { touchState.sprint = !touchState.sprint; }}
                className={`min-w-[52px] min-h-[46px] rounded-xl border font-mono text-[10px] font-bold shadow-lg ${
                  touchState.sprint ? 'bg-sage border-cream text-cream' : 'bg-charcoal-deep/80 border-cream/25 text-cream'
                }`}
              >
                BOUND
              </button>
              <button
                type="button"
                onClick={onEmergencyStop}
                className="min-w-[52px] min-h-[46px] rounded-xl bg-brick/80 border border-cream/30 text-cream font-mono text-[10px] font-bold shadow-lg"
              >
                STOP
              </button>
            </div>
            <div
              ref={rightPadRef}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                handlePadMove(e, rightPadRef.current, false);
              }}
              onPointerMove={(e) => {
                if (e.buttons > 0 || e.pressure > 0) handlePadMove(e, rightPadRef.current, false);
              }}
              onPointerUp={() => resetPad(false)}
              onPointerCancel={() => resetPad(false)}
              className="relative w-24 h-24 rounded-full bg-charcoal-deep/70 border border-cream/25 backdrop-blur-sm flex items-center justify-center"
              style={{ touchAction: 'none' }}
              aria-label="Turn yaw virtual pad"
            >
              <span className="text-[9px] font-mono text-cream-dim absolute top-2">YAW</span>
              <div
                className="w-10 h-10 rounded-full bg-cream/70 border border-charcoal-deep shadow-lg"
                style={{ transform: `translate(${rightKnob.x}px, 0px)` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
