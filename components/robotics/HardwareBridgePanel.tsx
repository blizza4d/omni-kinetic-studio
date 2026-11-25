'use client';

import React, { useState, useEffect } from 'react';
import {
  Cable,
  Radio,
  Power,
  ArrowUpRight,
  ArrowDownLeft,
  Cpu,
  ShieldAlert,
  PlayCircle,
} from 'lucide-react';
import {
  HardwareBridgeClient,
  BridgeConfig,
  BridgeDiagnostics,
  DEFAULT_BRIDGE_CONFIG,
  BridgeProtocolMode,
  BridgeCoordinateFrame,
} from '@/lib/bridge/rosBridge';

interface HardwareBridgePanelProps {
  bridgeClient: HardwareBridgeClient;
  digitalTwinEnabled: boolean;
  onToggleDigitalTwin: (enabled: boolean) => void;
  eStopActive: boolean;
  robotPose?: [number, number, number];
  robotYaw?: number;
  className?: string;
}

export default function HardwareBridgePanel({
  bridgeClient,
  digitalTwinEnabled,
  onToggleDigitalTwin,
  eStopActive,
  robotPose = [0, 0.44, 0],
  robotYaw = 0,
  className = '',
}: HardwareBridgePanelProps) {
  const [config, setConfig] = useState<BridgeConfig>(() => bridgeClient.getConfig() || DEFAULT_BRIDGE_CONFIG);
  const [diag, setDiag] = useState<BridgeDiagnostics>(() => bridgeClient.getDiagnostics());

  // Throttled 10 Hz diagnostics refresh so packet counters & JSON streams stay smooth without overhead
  useEffect(() => {
    const id = setInterval(() => {
      setDiag(bridgeClient.getDiagnostics());
    }, 100);
    return () => clearInterval(id);
  }, [bridgeClient]);

  const updateCfg = (patch: Partial<BridgeConfig>) => {
    bridgeClient.updateConfig(patch);
    setConfig(bridgeClient.getConfig());
    setDiag(bridgeClient.getDiagnostics());
  };

  const isConnectedOrLoopback = diag.status === 'connected' || diag.status === 'loopback';

  const statusBadge = (() => {
    switch (diag.status) {
      case 'connected':
        return 'bg-sage/25 text-sage border-sage/50';
      case 'loopback':
        return 'bg-amber-400/20 text-amber-300 border-amber-400/40';
      case 'connecting':
        return 'bg-sky-400/20 text-sky-300 border-sky-400/40 animate-pulse';
      case 'error':
        return 'bg-brick/25 text-brick border-brick/50';
      default:
        return 'bg-charcoal text-cream-dim border-cream/10';
    }
  })();

  return (
    <div
      className={`analog-glass-elevated border border-cream/15 rounded-xl overflow-hidden shadow-2xl flex flex-col font-mono text-xs select-none ${className}`}
      data-testid="hardware-bridge-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#1F1F1F] border-b border-cream/10">
        <div className="flex items-center space-x-2">
          <Cable className="w-4 h-4 text-sage" />
          <span className="font-bold tracking-wider text-cream uppercase text-[11px]">
            ROS 2 / HIL Hardware Bridge
          </span>
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-bold ${statusBadge}`}>
          {diag.status}
        </span>
      </div>

      <div className="p-3.5 space-y-3.5 overflow-y-auto flex-1 custom-scrollbar">
        {/* Connection Controls */}
        <div className="p-2.5 rounded-lg bg-charcoal-deep/70 border border-cream/10 space-y-2.5">
          <div className="space-y-1">
            <label className="text-[9px] font-bold uppercase text-cream-dim">
              WebSocket Endpoint (rosbridge / Custom HIL)
            </label>
            <input
              type="text"
              value={config.url}
              disabled={isConnectedOrLoopback}
              onChange={(e) => updateCfg({ url: e.target.value })}
              placeholder="ws://localhost:9090"
              className="w-full px-2 py-1.5 rounded bg-charcoal border border-cream/15 text-cream text-[11px] focus:outline-none focus:border-sage disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {isConnectedOrLoopback ? (
              <button
                type="button"
                onClick={() => {
                  bridgeClient.disconnect();
                  onToggleDigitalTwin(false);
                  setDiag(bridgeClient.getDiagnostics());
                }}
                className="col-span-2 py-1.5 px-3 rounded bg-brick/25 hover:bg-brick/35 border border-brick/50 text-cream font-bold uppercase text-[10px] flex items-center justify-center space-x-1.5"
              >
                <Power className="w-3.5 h-3.5 text-brick" />
                <span>Disconnect Bridge</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => bridgeClient.connect()}
                  className="py-1.5 px-2.5 rounded bg-sage/20 hover:bg-sage/30 border border-sage/45 text-cream font-bold uppercase text-[10px] flex items-center justify-center space-x-1.5"
                >
                  <Radio className="w-3.5 h-3.5 text-sage" />
                  <span>Connect WS</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    bridgeClient.startLoopback({ x: robotPose[0], z: robotPose[2], yaw: robotYaw });
                    setDiag(bridgeClient.getDiagnostics());
                  }}
                  className="py-1.5 px-2.5 rounded bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-200 font-bold uppercase text-[10px] flex items-center justify-center space-x-1.5"
                  title="Test full geometry_msgs/Twist & Digital Twin odometry pipeline without external ROS 2 hardware"
                >
                  <PlayCircle className="w-3.5 h-3.5 text-amber-300" />
                  <span>Mock Loopback</span>
                </button>
              </>
            )}
          </div>

          {diag.lastError && (
            <div className="p-2 rounded bg-brick/15 border border-brick/40 text-[9px] text-brick leading-snug">
              {diag.lastError}
            </div>
          )}
        </div>

        {/* Protocol, Topic & Frequency Settings */}
        <div className="p-2.5 rounded-lg bg-charcoal-deep/60 border border-cream/10 space-y-2.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-cream-dim uppercase font-bold">Protocol:</span>
            <div className="flex items-center space-x-1">
              {([
                { id: 'rosbridge_v2', label: 'rosbridge v2' },
                { id: 'raw_json', label: 'Raw Twist JSON' },
              ] as { id: BridgeProtocolMode; label: string }[]).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => updateCfg({ protocol: p.id })}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors ${
                    config.protocol === p.id
                      ? 'bg-sage text-charcoal-deep'
                      : 'bg-charcoal text-cream-dim border border-cream/10'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <span className="text-cream-dim uppercase font-bold">Inbound Frame:</span>
            <div className="flex items-center space-x-1">
              {([
                { id: 'omnikinetic_yup', label: 'Y-Up' },
                { id: 'ros_rep103', label: 'ROS REP-103' },
              ] as { id: BridgeCoordinateFrame; label: string }[]).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => updateCfg({ coordinateFrame: f.id })}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors ${
                    config.coordinateFrame === f.id
                      ? 'bg-sage text-charcoal-deep'
                      : 'bg-charcoal text-cream-dim border border-cream/10'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-cream-dim">Outbound /cmd_vel Stream Rate:</span>
              <span className="text-cream font-bold tabular-nums">{config.rateHz} Hz</span>
            </div>
            <input
              type="range"
              min="10"
              max="30"
              step="5"
              value={config.rateHz}
              onChange={(e) => updateCfg({ rateHz: parseInt(e.target.value, 10) })}
              className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
            />
          </div>

          {/* Digital Twin Inbound Mode Toggle */}
          <div className="pt-1 border-t border-cream/10 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold text-cream uppercase flex items-center space-x-1.5">
                <Cpu className="w-3 h-3 text-sage" />
                <span>Digital Twin Mode</span>
              </div>
              <div className="text-[9px] text-cream-dim">Drive 3D robot from inbound WS pose/IMU</div>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !digitalTwinEnabled;
                onToggleDigitalTwin(next);
                updateCfg({ digitalTwinEnabled: next });
              }}
              className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase border transition-colors ${
                digitalTwinEnabled
                  ? 'bg-sage text-charcoal-deep border-sage'
                  : 'bg-charcoal text-cream-dim border-cream/15 hover:text-cream'
              }`}
            >
              {digitalTwinEnabled ? 'ACTIVE' : 'OFF'}
            </button>
          </div>
        </div>

        {/* E-STOP Safety Notice */}
        {eStopActive && (
          <div className="p-2 rounded bg-brick/25 border border-brick/60 text-brick text-[10px] font-bold flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>E-STOP OVERRIDE: Zero Twist (0, 0, 0) latched on outbound stream.</span>
          </div>
        )}

        {/* Live Packet Counters & Tx/Rx JSON Stream Inspector */}
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="p-1.5 rounded bg-charcoal-deep/70 border border-cream/5">
              <div className="text-[8px] text-cream-dim uppercase flex items-center justify-center space-x-1">
                <ArrowUpRight className="w-2.5 h-2.5 text-sage" />
                <span>TX Frames</span>
              </div>
              <div className="text-xs font-bold text-cream tabular-nums">{diag.txCount}</div>
            </div>
            <div className="p-1.5 rounded bg-charcoal-deep/70 border border-cream/5">
              <div className="text-[8px] text-cream-dim uppercase flex items-center justify-center space-x-1">
                <ArrowDownLeft className="w-2.5 h-2.5 text-amber-300" />
                <span>RX Frames</span>
              </div>
              <div className="text-xs font-bold text-cream tabular-nums">{diag.rxCount}</div>
            </div>
            <div className="p-1.5 rounded bg-charcoal-deep/70 border border-cream/5">
              <div className="text-[8px] text-cream-dim uppercase">Rate / RTT</div>
              <div className="text-xs font-bold text-cream tabular-nums">
                {diag.effectiveTxHz} Hz{diag.rttMs > 0 ? ` · ${diag.rttMs}ms` : ''}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[9px] text-cream-dim uppercase font-bold">Outbound geometry_msgs/Twist:</div>
            <pre className="p-2 rounded bg-[#141414] border border-cream/10 text-[9px] text-sage overflow-x-auto max-h-20 custom-scrollbar">
              {diag.lastTxJson || '{"linear":{"x":0,"y":0,"z":0},"angular":{"x":0,"y":0,"z":0}}'}
            </pre>
          </div>

          <div className="space-y-1">
            <div className="text-[9px] text-cream-dim uppercase font-bold">Inbound Pose / IMU Payload:</div>
            <pre className="p-2 rounded bg-[#141414] border border-cream/10 text-[9px] text-cream-dim overflow-x-auto max-h-20 custom-scrollbar">
              {diag.lastRxJson || 'Awaiting /odom or telemetry stream...'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
