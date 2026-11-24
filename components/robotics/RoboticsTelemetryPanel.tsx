'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Activity,
  Compass,
  Gauge,
  Zap,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Power,
  RotateCcw,
} from 'lucide-react';
import { TelemetryStore } from '@/lib/telemetry/store';
import {
  extractRoboticsTelemetry,
  RoboticsTelemetryData,
  DEFAULT_ROBOTICS_TELEMETRY,
} from '@/lib/telemetry/robotics';

interface RoboticsTelemetryPanelProps {
  telemetryStore: TelemetryStore;
  onEmergencyStop: () => void;
  onClearEmergencyStop: () => void;
  eStopActive: boolean;
  controlLatencyMs?: number;
  webglFps?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

export default function RoboticsTelemetryPanel({
  telemetryStore,
  onEmergencyStop,
  onClearEmergencyStop,
  eStopActive,
  controlLatencyMs = 2.1,
  webglFps = 60,
  isCollapsed = false,
  onToggleCollapse,
  className = '',
}: RoboticsTelemetryPanelProps) {
  const [data, setData] = useState<RoboticsTelemetryData>(DEFAULT_ROBOTICS_TELEMETRY);
  const rafId = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Poll TelemetryStore at ~20 Hz (50ms) to eliminate React overhead while keeping visual streaming fluid
  useEffect(() => {
    let mounted = true;

    const poll = (now: number) => {
      if (!mounted) return;
      if (now - lastUpdateRef.current >= 50) {
        lastUpdateRef.current = now;
        const latestFrame = telemetryStore.getLatestFrame();
        const telemetry = extractRoboticsTelemetry(
          latestFrame,
          eStopActive,
          controlLatencyMs,
          webglFps
        );
        setData(telemetry);
      }
      rafId.current = requestAnimationFrame(poll);
    };

    rafId.current = requestAnimationFrame(poll);

    return () => {
      mounted = false;
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [telemetryStore, eStopActive, controlLatencyMs, webglFps]);

  const { pose, velocity, actuators, safety, system } = data;

  return (
    <div
      className={`analog-glass-elevated border border-cream/15 rounded-xl overflow-hidden shadow-2xl flex flex-col font-mono text-xs select-none transition-all duration-200 ${className}`}
      data-testid="robotics-telemetry-panel"
    >
      {/* Top Header / Title Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#1F1F1F] border-b border-cream/10">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-sage" />
          <span className="font-bold tracking-wider text-cream uppercase text-[11px]">
            Robotics State Inspector
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-sage/20 text-sage border border-sage/30 uppercase">
            20 Hz Live
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-cream-dim">
            {system.webglFps} FPS · {system.controlLatencyMs.toFixed(1)}ms loop
          </span>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded text-cream-dim hover:text-cream hover:bg-cream/10 transition-colors"
              title={isCollapsed ? 'Expand Telemetry' : 'Collapse Telemetry'}
              aria-label="Toggle panel collapse"
            >
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Prominent E-STOP Control Header */}
      <div className="p-3 bg-[#2A2A2A]/80 border-b border-cream/10">
        {eStopActive ? (
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-brick/30 border border-brick/60 animate-pulse">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-brick flex-shrink-0" />
              <div>
                <div className="font-bold text-brick uppercase tracking-wider text-[11px]">
                  E-STOP ACTIVATED
                </div>
                <div className="text-[10px] text-cream-dim">Actuators locked · Autonomous commands halted</div>
              </div>
            </div>
            <button
              onClick={onClearEmergencyStop}
              className="px-3 py-1.5 rounded bg-cream/10 hover:bg-cream/20 text-cream text-[10px] uppercase font-bold tracking-wider border border-cream/20 flex items-center space-x-1.5 transition-colors"
            >
              <RotateCcw className="w-3 h-3 text-sage" />
              <span>Reset E-Stop</span>
            </button>
          </div>
        ) : (
          <button
            onClick={onEmergencyStop}
            className="w-full group py-2 px-3 rounded-lg bg-brick/20 hover:bg-brick/30 border border-brick/40 hover:border-brick/70 text-cream flex items-center justify-between transition-all"
            title="Immediately cut power to all joint actuators [Hotkey: Spacebar]"
          >
            <div className="flex items-center space-x-2">
              <Power className="w-4 h-4 text-brick group-hover:scale-110 transition-transform" />
              <span className="font-bold uppercase tracking-wider text-cream text-[11px]">
                EMERGENCY STOP (E-STOP)
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-charcoal-deep border border-brick/30 text-brick font-bold">
              SPACEBAR
            </span>
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className="p-3.5 space-y-4 overflow-y-auto max-h-[calc(100vh-280px)] custom-scrollbar">
          {/* Section 1: Pose & Kinematics */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-cream-dim tracking-wider border-b border-cream/5 pb-1">
              <span className="flex items-center space-x-1">
                <Compass className="w-3 h-3 text-sage" />
                <span>Pose & Kinematics</span>
              </span>
              <span className="text-[9px] text-cream-dim">Single Frame Convention (+X Fwd, +Y Up, +Z Right)</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div className="text-[9px] text-cream-dim uppercase">Pos X (East)</div>
                <div className="text-sm font-bold text-cream tabular-nums">{pose.x.toFixed(3)} m</div>
              </div>
              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div className="text-[9px] text-cream-dim uppercase">Pos Y (Height)</div>
                <div className="text-sm font-bold text-cream tabular-nums">{pose.y.toFixed(3)} m</div>
              </div>
              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div className="text-[9px] text-cream-dim uppercase">Pos Z (South)</div>
                <div className="text-sm font-bold text-cream tabular-nums">{pose.z.toFixed(3)} m</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div className="text-[9px] text-cream-dim uppercase">Roll (φ)</div>
                <div className="text-sm font-bold text-cream tabular-nums">{pose.rollDeg.toFixed(1)}°</div>
              </div>
              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div className="text-[9px] text-cream-dim uppercase">Pitch (θ)</div>
                <div className="text-sm font-bold text-cream tabular-nums">{pose.pitchDeg.toFixed(1)}°</div>
              </div>
              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div className="text-[9px] text-cream-dim uppercase">Yaw (ψ)</div>
                <div className="text-sm font-bold text-cream tabular-nums">{pose.yawDeg.toFixed(1)}°</div>
              </div>
            </div>

            <div className="p-2 rounded bg-charcoal-deep/40 border border-cream/5 flex items-center justify-between text-[10px]">
              <span className="text-cream-dim">Quaternion [qx, qy, qz, qw]:</span>
              <span className="text-cream font-mono tabular-nums">
                [{pose.quat[0].toFixed(3)}, {pose.quat[1].toFixed(3)}, {pose.quat[2].toFixed(3)}, {pose.quat[3].toFixed(3)}]
              </span>
            </div>
          </div>

          {/* Section 2: Velocities */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-cream-dim tracking-wider border-b border-cream/5 pb-1">
              <span className="flex items-center space-x-1">
                <Gauge className="w-3 h-3 text-sage" />
                <span>Velocities & Flow</span>
              </span>
              <span className="text-[9px] text-cream-dim">
                Cmd: {velocity.cmdSpeedMps.toFixed(2)} m/s
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div className="text-[9px] text-cream-dim uppercase">Linear Speed</div>
                <div className="text-sm font-bold text-cream tabular-nums">
                  {velocity.speedMps.toFixed(3)} <span className="text-[10px] font-normal text-cream-dim">m/s</span>
                </div>
              </div>
              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div className="text-[9px] text-cream-dim uppercase">Vertical Vy</div>
                <div className="text-sm font-bold text-cream tabular-nums">
                  {velocity.vy.toFixed(3)} <span className="text-[10px] font-normal text-cream-dim">m/s</span>
                </div>
              </div>
              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div className="text-[9px] text-cream-dim uppercase">Yaw Rate</div>
                <div className="text-sm font-bold text-cream tabular-nums">
                  {velocity.yawRateDegS.toFixed(1)} <span className="text-[10px] font-normal text-cream-dim">°/s</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Actuator Telemetry & Joint Torques */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-cream-dim tracking-wider border-b border-cream/5 pb-1">
              <span className="flex items-center space-x-1">
                <Zap className="w-3 h-3 text-sage" />
                <span>Actuators & Torques (12 DOF)</span>
              </span>
              <span className="text-[9px] text-cream-dim">Load & Power in N·m / W</span>
            </div>

            {actuators.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {(['FL', 'FR', 'RL', 'RR'] as const).map((limb) => {
                  const limbActuators = actuators.filter((a) => a.limb === limb);
                  return (
                    <div key={limb} className="p-2 rounded bg-charcoal-deep/60 border border-cream/5 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-cream pb-1 border-b border-cream/5">
                        <span>Limb {limb}</span>
                        <span className="text-[9px] text-cream-dim">
                          P: {limbActuators.reduce((acc, a) => acc + a.powerWatts, 0).toFixed(1)} W
                        </span>
                      </div>
                      <div className="space-y-1">
                        {limbActuators.map((a) => {
                          const torqueAbs = Math.abs(a.torqueNm);
                          const torqueColor =
                            torqueAbs > 25
                              ? 'bg-brick'
                              : torqueAbs > 15
                              ? 'bg-amber-400'
                              : 'bg-sage';
                          const torquePercent = Math.min(100, (torqueAbs / 35) * 100);

                          return (
                            <div key={a.id} className="text-[9px] space-y-0.5">
                              <div className="flex items-center justify-between text-cream-dim">
                                <span className="capitalize">{a.joint}</span>
                                <span className="text-cream tabular-nums">
                                  {a.angleDeg.toFixed(0)}° · {a.torqueNm.toFixed(1)} N·m
                                </span>
                              </div>
                              <div className="w-full bg-charcoal h-1 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${torqueColor} transition-all duration-75`}
                                  style={{ width: `${torquePercent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 text-center text-cream-dim text-[10px] bg-charcoal-deep/30 rounded border border-cream/5">
                No active actuator frame received yet
              </div>
            )}
          </div>

          {/* Section 4: Safety Envelope & Margins */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-cream-dim tracking-wider border-b border-cream/5 pb-1">
              <span className="flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3 text-sage" />
                <span>Safety Envelope & Invariants</span>
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${
                  safety.tiltStatus === 'critical'
                    ? 'bg-brick/30 text-brick border border-brick/40'
                    : safety.tiltStatus === 'warning'
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                    : 'bg-sage/20 text-sage border border-sage/30'
                }`}
              >
                Tilt: {safety.tiltStatus}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5 space-y-1">
                <div className="flex items-center justify-between text-[9px] text-cream-dim">
                  <span>Tilt Deviation</span>
                  <span className="text-cream font-bold tabular-nums">{safety.tiltDeg.toFixed(1)}°</span>
                </div>
                <div className="w-full bg-charcoal h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      safety.tiltDeg > 25
                        ? 'bg-brick'
                        : safety.tiltDeg > 15
                        ? 'bg-amber-400'
                        : 'bg-sage'
                    }`}
                    style={{ width: `${Math.min(100, (safety.tiltDeg / 35) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5 space-y-1">
                <div className="flex items-center justify-between text-[9px] text-cream-dim">
                  <span>Stability Margin</span>
                  <span className="text-cream font-bold tabular-nums">{safety.stabilityMarginPct}%</span>
                </div>
                <div className="w-full bg-charcoal h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sage"
                    style={{ width: `${safety.stabilityMarginPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div className="text-[9px] text-cream-dim uppercase">Ground Contact</div>
                <div className="text-sm font-bold text-cream tabular-nums">
                  {safety.groundedFeetCount} / 4 <span className="text-[9px] font-normal text-cream-dim">feet</span>
                </div>
              </div>

              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div className="text-[9px] text-cream-dim uppercase">Edge Distance</div>
                <div className="text-sm font-bold text-cream tabular-nums">
                  {safety.edgeDistanceM.toFixed(1)} <span className="text-[9px] font-normal text-cream-dim">m</span>
                </div>
              </div>

              <div className="p-2 rounded bg-charcoal-deep/60 border border-cream/5">
                <div className="text-[9px] text-cream-dim uppercase">Collisions</div>
                <div className={`text-sm font-bold tabular-nums ${safety.collision ? 'text-brick' : 'text-cream'}`}>
                  {safety.collisionCount}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
