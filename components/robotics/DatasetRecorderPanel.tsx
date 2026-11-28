'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Trash2,
  Play,
  Pause,
  Square,
  XCircle,
  ChevronDown,
  ChevronUp,
  FileCode,
  FileSpreadsheet,
  Sparkles,
  Scissors,
  Activity,
} from 'lucide-react';
import {
  globalEpisodeRecorder,
  DatasetControlSource,
  DomainRandomizationMeta,
  RecordedDemonstrationEpisode,
} from '@/lib/dataset/episodeRecorder';
import { globalImitationPolicy, ImitationPolicyStats } from '@/src/robotics/imitationPolicy';
import { TransientRoboticsStore, BcPolicyTelemetry } from '@/lib/telemetry/transientStore';

interface DatasetRecorderPanelProps {
  currentSource: DatasetControlSource;
  gravityMps2?: number;
  terrainSeed?: number;
  domainMeta?: DomainRandomizationMeta;
  isBcPolicyActive?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onReplayEpisode?: (episode: RecordedDemonstrationEpisode) => void;
  onTrainAndRunPolicy?: (stats: ImitationPolicyStats) => void;
  onScrubFrame?: (pos: [number, number, number], quat: [number, number, number, number]) => void;
  className?: string;
}

interface SvgSparklineProps {
  label: string;
  valuesA: readonly number[];
  valuesB?: readonly number[];
  colorA: string;
  colorB?: string;
  unit: string;
  playheadIdx: number;
  warnings?: readonly boolean[];
}

function buildPolylinePoints(values: readonly number[], minV: number, maxV: number, width: number, height: number): string {
  if (values.length === 0) return '';
  const span = Math.max(1e-4, maxV - minV);
  const pad = 3;
  const innerH = height - pad * 2;
  const pts: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const x = values.length > 1 ? (i / (values.length - 1)) * width : width / 2;
    const norm = (values[i]! - minV) / span;
    const y = pad + (1 - Math.max(0, Math.min(1, norm))) * innerH;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function SvgSparkline({
  label,
  valuesA,
  valuesB,
  colorA,
  colorB,
  unit,
  playheadIdx,
  warnings,
}: SvgSparklineProps) {
  const w = 240;
  const h = 32;
  const { minV, maxV } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < valuesA.length; i++) {
      if (valuesA[i]! < lo) lo = valuesA[i]!;
      if (valuesA[i]! > hi) hi = valuesA[i]!;
    }
    if (valuesB) {
      for (let i = 0; i < valuesB.length; i++) {
        if (valuesB[i]! < lo) lo = valuesB[i]!;
        if (valuesB[i]! > hi) hi = valuesB[i]!;
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { minV: 0, maxV: 1 };
    if (Math.abs(hi - lo) < 1e-3) return { minV: lo - 0.5, maxV: hi + 0.5 };
    return { minV: lo, maxV: hi };
  }, [valuesA, valuesB]);

  const pointsA = useMemo(() => buildPolylinePoints(valuesA, minV, maxV, w, h), [valuesA, minV, maxV]);
  const pointsB = useMemo(
    () => (valuesB ? buildPolylinePoints(valuesB, minV, maxV, w, h) : ''),
    [valuesB, minV, maxV]
  );

  const count = valuesA.length;
  const headX = count > 1 ? (playheadIdx / (count - 1)) * w : 0;
  const curA = valuesA[Math.min(playheadIdx, Math.max(0, count - 1))] ?? 0;
  const curB = valuesB?.[Math.min(playheadIdx, Math.max(0, count - 1))];

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-cream-dim uppercase">{label}</span>
        <span className="text-cream font-bold tabular-nums">
          {curA.toFixed(2)}
          {curB !== undefined ? ` / ${curB.toFixed(2)}` : ''} {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 bg-charcoal rounded border border-cream/10 overflow-visible">
        {warnings &&
          warnings.map((warn, i) => {
            if (!warn || count === 0) return null;
            const segW = Math.max(2, w / Math.max(1, count));
            const x = count > 1 ? (i / (count - 1)) * w - segW * 0.5 : 0;
            return <rect key={i} x={Math.max(0, x)} y={0} width={segW} height={h} fill="rgba(184, 59, 47, 0.35)" />;
          })}
        {pointsA && <polyline fill="none" stroke={colorA} strokeWidth="1.4" points={pointsA} />}
        {pointsB && colorB && <polyline fill="none" stroke={colorB} strokeWidth="1.2" strokeDasharray="3,2" points={pointsB} />}
        {count > 0 && (
          <line x1={headX} y1={0} x2={headX} y2={h} stroke="#FDFBF7" strokeWidth="1" strokeOpacity="0.85" />
        )}
      </svg>
    </div>
  );
}

export default function DatasetRecorderPanel({
  currentSource,
  gravityMps2 = 1.62,
  terrainSeed = 42,
  domainMeta,
  isBcPolicyActive = false,
  isCollapsed = false,
  onToggleCollapse,
  onReplayEpisode,
  onTrainAndRunPolicy,
  onScrubFrame,
  className = '',
}: DatasetRecorderPanelProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [pendingSuccessTag, setPendingSuccessTag] = useState(true);
  const [frameCount, setFrameCount] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [episodes, setEpisodes] = useState<RecordedDemonstrationEpisode[]>(() => [...globalEpisodeRecorder.getEpisodes()]);
  const [selectedSource, setSelectedSource] = useState<DatasetControlSource>(currentSource);

  // Scrubber & Timeline Audit state
  const [inspectEpId, setInspectEpId] = useState<string | null>(null);
  const [scrubIdx, setScrubIdx] = useState(0);
  const [isScrubPlaying, setIsScrubPlaying] = useState(false);
  const [scrubSpeed, setScrubSpeed] = useState<0.5 | 1 | 2>(1);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // Behavior Cloning policy telemetry state (18 Hz throttled subscription)
  const [bcTelemetry, setBcTelemetry] = useState<BcPolicyTelemetry>(
    () => TransientRoboticsStore.getInstance().getState().bcPolicy
  );
  const [policyStatusMsg, setPolicyStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    const store = TransientRoboticsStore.getInstance();
    return store.subscribeThrottled((s) => {
      setBcTelemetry(s.bcPolicy);
    }, 18);
  }, []);

  // Sync selected source when current source changes
  useEffect(() => {
    setSelectedSource(currentSource);
  }, [currentSource]);

  const inspectedEpisode = useMemo(
    () => episodes.find((e) => e.meta.id === inspectEpId) ?? null,
    [episodes, inspectEpId]
  );

  // Timeline scrubber playback loop
  useEffect(() => {
    if (!isScrubPlaying || !inspectedEpisode || inspectedEpisode.frames.length === 0) return;
    const hz = Math.max(10, Math.min(60, inspectedEpisode.meta.effectiveHz || 30));
    const stepMs = Math.max(16, Math.round(1000 / hz / scrubSpeed));
    const timer = setInterval(() => {
      setScrubIdx((prev) => {
        const next = prev + 1;
        if (next >= inspectedEpisode.frames.length) {
          setIsScrubPlaying(false);
          return prev;
        }
        return next;
      });
    }, stepMs);
    return () => clearInterval(timer);
  }, [isScrubPlaying, inspectedEpisode, scrubSpeed]);

  // Sync 3D viewport pose when scrubbing
  useEffect(() => {
    if (!inspectedEpisode || inspectedEpisode.frames.length === 0 || !onScrubFrame) return;
    const safeIdx = Math.max(0, Math.min(inspectedEpisode.frames.length - 1, scrubIdx));
    const frame = inspectedEpisode.frames[safeIdx];
    if (frame) {
      onScrubFrame(frame.observation.pose, frame.observation.orientation_quat);
    }
  }, [inspectedEpisode, scrubIdx, onScrubFrame]);

  // Periodic ticker during recording
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isRecording) {
      timer = setInterval(() => {
        setFrameCount(globalEpisodeRecorder.getActiveFrameCount());
        setElapsedSec(Number(globalEpisodeRecorder.getElapsedTimeSec().toFixed(1)));
      }, 100);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording]);

  const handleStart = () => {
    globalEpisodeRecorder.startRecording(selectedSource, gravityMps2, terrainSeed, undefined, domainMeta);
    setIsRecording(true);
    setFrameCount(0);
    setElapsedSec(0);
  };

  const handleStopAndSave = (success: boolean) => {
    const ep = globalEpisodeRecorder.stopAndSave(success);
    setIsRecording(false);
    setEpisodes([...globalEpisodeRecorder.getEpisodes()]);
    if (ep) {
      setInspectEpId(ep.meta.id);
      setScrubIdx(0);
      setTrimStart(0);
      setTrimEnd(Math.max(0, ep.frames.length - 1));
    }
  };

  const handleToggleEpisodeTag = (episodeId: string) => {
    globalEpisodeRecorder.toggleEpisodeSuccess(episodeId);
    setEpisodes([...globalEpisodeRecorder.getEpisodes()]);
  };

  const handleDeleteEpisode = (episodeId: string) => {
    globalEpisodeRecorder.deleteEpisode(episodeId);
    if (inspectEpId === episodeId) {
      setInspectEpId(null);
      setIsScrubPlaying(false);
    }
    setEpisodes([...globalEpisodeRecorder.getEpisodes()]);
  };

  const handleInspectEpisode = (ep: RecordedDemonstrationEpisode) => {
    setInspectEpId(ep.meta.id);
    setIsScrubPlaying(false);
    setScrubIdx(0);
    setTrimStart(0);
    setTrimEnd(Math.max(0, ep.frames.length - 1));
  };

  const handleApplyTrim = () => {
    if (!inspectedEpisode) return;
    const trimmed = globalEpisodeRecorder.trimEpisode(inspectedEpisode.meta.id, trimStart, trimEnd);
    if (trimmed) {
      setEpisodes([...globalEpisodeRecorder.getEpisodes()]);
      setScrubIdx(0);
      setTrimStart(0);
      setTrimEnd(Math.max(0, trimmed.frames.length - 1));
      setIsScrubPlaying(false);
    }
  };

  const handleTrainAndRunPolicy = () => {
    const stats = globalImitationPolicy.fit(globalEpisodeRecorder.getEpisodes(), 5);
    TransientRoboticsStore.getInstance().writeBcPolicyMetrics({
      active: stats.trained,
      trained: stats.trained,
      confidence: 0,
      nearestDist: 0,
      inferenceTimeMs: 0,
      demoCount: stats.episodeCount,
      sampleCount: stats.sampleCount,
    });
    if (!stats.trained) {
      setPolicyStatusMsg('Tag at least 1 recorded episode as Success first.');
      return;
    }
    setPolicyStatusMsg(`Trained k-NN BC on ${stats.episodeCount} demo(s) (${stats.sampleCount} frames).`);
    onTrainAndRunPolicy?.(stats);
  };

  const handleDiscard = () => {
    globalEpisodeRecorder.discard();
    setIsRecording(false);
    setFrameCount(0);
    setElapsedSec(0);
  };

  const downloadText = (text: string, filename: string, mime: string) => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJsonl = (episodeId?: string, successOnly = false) => {
    const jsonl = globalEpisodeRecorder.exportLeRobotJsonl(episodeId, successOnly);
    const suffix = successOnly ? 'success_only' : episodeId || 'all';
    downloadText(jsonl, `lerobot_dataset_${suffix}_${Date.now()}.jsonl`, 'application/x-ndjson;charset=utf-8;');
  };

  const handleExportCsv = (episodeId?: string, successOnly = false) => {
    const csv = globalEpisodeRecorder.exportRoboticsCsv(episodeId, successOnly);
    const suffix = successOnly ? 'success_only' : episodeId || 'all';
    downloadText(csv, `robotics_demonstrations_${suffix}_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
  };

  const handleClear = () => {
    globalEpisodeRecorder.clearEpisodes();
    setInspectEpId(null);
    setIsScrubPlaying(false);
    setEpisodes([]);
  };

  const successCount = episodes.filter((e) => e.meta.success).length;
  const sparkData = useMemo(() => {
    if (!inspectedEpisode) return null;
    const frames = inspectedEpisode.frames;
    return {
      linVel: frames.map((f) => Math.hypot(f.observation.linear_vel[0], f.observation.linear_vel[2])),
      pitch: frames.map((f) => f.observation.pitch),
      roll: frames.map((f) => f.observation.roll),
      slip: frames.map((f) => f.wheelSlip ?? 0),
      throttle: frames.map((f) => f.action.throttle),
      steering: frames.map((f) => f.action.steering),
      warnings: frames.map(
        (f) => Boolean(f.tiltWarning) || Math.abs(f.observation.pitch) > 30 || Math.abs(f.observation.roll) > 30
      ),
    };
  }, [inspectedEpisode]);

  return (
    <div
      className={`analog-glass-elevated border border-cream/15 rounded-xl overflow-hidden shadow-2xl flex flex-col font-mono text-xs select-none transition-all duration-200 ${className}`}
      data-testid="dataset-recorder-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#1F1F1F] border-b border-cream/10">
        <div className="flex items-center space-x-2">
          <Database className="w-4 h-4 text-sage" />
          <span className="font-bold tracking-wider text-cream uppercase text-[11px]">
            Imitation Learning Dataset
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-sage/20 text-sage border border-sage/30 uppercase">
            LeRobot / RLDS
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-cream-dim">{episodes.length} Episodes</span>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded text-cream-dim hover:text-cream hover:bg-cream/10 transition-colors"
              title={isCollapsed ? 'Expand Recorder' : 'Collapse Recorder'}
            >
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3.5 space-y-4 overflow-y-auto max-h-[calc(100vh-280px)] custom-scrollbar">
          {/* Recording Controls */}
          <div className="p-3 rounded-lg bg-charcoal-deep/70 border border-cream/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-cream uppercase tracking-wider">
                Demonstration Stream
              </span>
              <span
                className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                  isRecording
                    ? 'bg-brick/30 text-brick border border-brick/40 animate-pulse'
                    : 'bg-charcoal text-cream-dim border border-cream/10'
                }`}
              >
                {isRecording ? 'RECORDING LIVE' : 'STANDBY'}
              </span>
            </div>

            {isRecording ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-charcoal/80 border border-cream/5">
                    <div className="text-[9px] text-cream-dim uppercase">Frames</div>
                    <div className="text-sm font-bold text-cream tabular-nums">{frameCount}</div>
                  </div>
                  <div className="p-2 rounded bg-charcoal/80 border border-cream/5">
                    <div className="text-[9px] text-cream-dim uppercase">Elapsed</div>
                    <div className="text-sm font-bold text-cream tabular-nums">{elapsedSec}s</div>
                  </div>
                  <div className="p-2 rounded bg-charcoal/80 border border-cream/5">
                    <div className="text-[9px] text-cream-dim uppercase">Est. Rate</div>
                    <div className="text-sm font-bold text-cream tabular-nums">
                      {elapsedSec > 0 ? (frameCount / elapsedSec).toFixed(0) : '60'} Hz
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPendingSuccessTag((prev) => !prev)}
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase border transition-colors ${
                      pendingSuccessTag
                        ? 'bg-sage/20 text-sage border-sage/40'
                        : 'bg-brick/20 text-brick border-brick/40'
                    }`}
                  >
                    Tag: {pendingSuccessTag ? 'Success' : 'Fail'}
                  </button>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => handleStopAndSave(pendingSuccessTag)}
                      className="py-1 px-2.5 rounded bg-cream/15 hover:bg-cream/25 text-cream border border-cream/30 font-bold text-[10px] uppercase flex items-center space-x-1 transition-colors"
                    >
                      <Square className="w-3 h-3" />
                      <span>Stop</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscard}
                      className="py-1 px-2 rounded bg-brick/20 hover:bg-brick/30 text-brick border border-brick/40 font-bold text-[10px] uppercase flex items-center space-x-1 transition-colors"
                    >
                      <XCircle className="w-3 h-3" />
                      <span>Discard</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
            <div className="space-y-2.5">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] text-cream-dim">Source:</span>
                {(['keyboard', 'gesture', 'nemotron', 'bc_policy'] as const).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setSelectedSource(src)}
                    className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold transition-colors ${
                      selectedSource === src
                        ? 'bg-sage text-charcoal-deep'
                        : 'bg-charcoal text-cream-dim hover:text-cream border border-cream/10'
                    }`}
                  >
                    {src === 'bc_policy' ? 'BC' : src}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleStart}
                className="w-full py-2 px-3 rounded bg-sage/20 hover:bg-sage/30 border border-sage/40 hover:border-sage/70 text-cream font-bold uppercase tracking-wider text-[11px] flex items-center justify-center space-x-2 transition-all"
              >
                <Play className="w-3.5 h-3.5 text-sage" />
                <span>Start New Episode Recording</span>
              </button>
            </div>
            )}
          </div>

          {/* In-Browser Behavior Cloning (k-NN Imitation Policy) */}
          <div className="p-3 rounded-lg bg-charcoal-deep/70 border border-cream/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-cream uppercase tracking-wider flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-sage" />
                <span>In-Browser Policy (k-NN BC)</span>
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border ${
                  isBcPolicyActive
                    ? 'bg-sage/25 text-sage border-sage/50 animate-pulse'
                    : bcTelemetry.trained
                    ? 'bg-charcoal text-cream border-cream/20'
                    : 'bg-charcoal text-cream-dim border-cream/10'
                }`}
              >
                {isBcPolicyActive ? 'RUNNING' : bcTelemetry.trained ? 'TRAINED' : 'UNTRAINED'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleTrainAndRunPolicy}
              className="w-full py-1.5 px-3 rounded bg-sage hover:bg-sage/90 text-charcoal-deep font-bold uppercase tracking-wider text-[10px] flex items-center justify-center space-x-1.5 transition-colors"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Train &amp; Run Policy ({successCount} Success Demos)</span>
            </button>

            {policyStatusMsg && (
              <div className="text-[9px] text-sage">{policyStatusMsg}</div>
            )}

            {(bcTelemetry.trained || isBcPolicyActive) && (
              <div className="grid grid-cols-4 gap-1.5 text-center pt-1">
                <div className="p-1.5 rounded bg-charcoal border border-cream/5">
                  <div className="text-[8px] text-cream-dim uppercase">Confidence</div>
                  <div className="text-[11px] font-bold text-sage tabular-nums">
                    {(bcTelemetry.confidence * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="p-1.5 rounded bg-charcoal border border-cream/5">
                  <div className="text-[8px] text-cream-dim uppercase">NN Dist</div>
                  <div className="text-[11px] font-bold text-cream tabular-nums">
                    {bcTelemetry.nearestDist.toFixed(2)}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-charcoal border border-cream/5">
                  <div className="text-[8px] text-cream-dim uppercase">Infer</div>
                  <div className="text-[11px] font-bold text-cream tabular-nums">
                    {bcTelemetry.inferenceTimeMs.toFixed(2)}ms
                  </div>
                </div>
                <div className="p-1.5 rounded bg-charcoal border border-cream/5">
                  <div className="text-[8px] text-cream-dim uppercase">Demos</div>
                  <div className="text-[11px] font-bold text-cream tabular-nums">
                    {bcTelemetry.demoCount}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Export Action Bar */}
          {episodes.length > 0 && (
            <div className="p-3 rounded-lg bg-charcoal-deep/50 border border-cream/10 space-y-2">
              <div className="flex items-center justify-between text-[10px] text-cream-dim">
                <span>Dataset Export ({episodes.length} Total · {successCount} Success):</span>
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-brick hover:underline flex items-center space-x-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleExportJsonl()}
                  className="py-1.5 px-2 rounded bg-charcoal hover:bg-cream/10 text-cream border border-cream/15 text-[9px] font-bold uppercase flex items-center justify-center space-x-1 transition-colors"
                >
                  <FileCode className="w-3 h-3 text-sage" />
                  <span>All JSONL</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportCsv()}
                  className="py-1.5 px-2 rounded bg-charcoal hover:bg-cream/10 text-cream border border-cream/15 text-[9px] font-bold uppercase flex items-center justify-center space-x-1 transition-colors"
                >
                  <FileSpreadsheet className="w-3 h-3 text-sage" />
                  <span>All CSV</span>
                </button>
                <button
                  type="button"
                  disabled={successCount === 0}
                  onClick={() => handleExportJsonl(undefined, true)}
                  className="py-1.5 px-2 rounded bg-sage/15 hover:bg-sage/25 disabled:opacity-40 text-sage border border-sage/30 text-[9px] font-bold uppercase flex items-center justify-center space-x-1 transition-colors"
                >
                  <FileCode className="w-3 h-3" />
                  <span>Success JSONL</span>
                </button>
                <button
                  type="button"
                  disabled={successCount === 0}
                  onClick={() => handleExportCsv(undefined, true)}
                  className="py-1.5 px-2 rounded bg-sage/15 hover:bg-sage/25 disabled:opacity-40 text-sage border border-sage/30 text-[9px] font-bold uppercase flex items-center justify-center space-x-1 transition-colors"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  <span>Success CSV</span>
                </button>
              </div>
            </div>
          )}

          {/* Timeline Scrubber & Synchronized SVG Sparklines */}
          {inspectedEpisode && sparkData && (
            <div className="p-3 rounded-lg bg-charcoal-deep/85 border border-sage/40 space-y-2.5">
              <div className="flex items-center justify-between border-b border-cream/10 pb-1.5">
                <div className="flex items-center space-x-1.5">
                  <Activity className="w-3.5 h-3.5 text-sage" />
                  <span className="text-[10px] font-bold text-cream uppercase truncate max-w-[160px]">
                    {inspectedEpisode.meta.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInspectEpId(null);
                    setIsScrubPlaying(false);
                  }}
                  className="text-[9px] text-cream-dim hover:text-cream uppercase"
                >
                  Close
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsScrubPlaying((p) => !p)}
                  className="p-1.5 rounded bg-sage/20 hover:bg-sage/30 text-sage border border-sage/40"
                  title={isScrubPlaying ? 'Pause Scrubber' : 'Play Episode Scrubber'}
                >
                  {isScrubPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, inspectedEpisode.frames.length - 1)}
                  value={Math.min(scrubIdx, Math.max(0, inspectedEpisode.frames.length - 1))}
                  onChange={(e) => {
                    setIsScrubPlaying(false);
                    setScrubIdx(parseInt(e.target.value, 10) || 0);
                  }}
                  className="flex-1 accent-sage h-1 bg-charcoal rounded cursor-pointer"
                />
                <div className="flex items-center space-x-0.5 border border-cream/10 rounded p-0.5 bg-charcoal">
                  {([0.5, 1, 2] as const).map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setScrubSpeed(spd)}
                      className={`px-1 py-0.5 rounded text-[8px] font-bold ${
                        scrubSpeed === spd ? 'bg-sage text-charcoal-deep' : 'text-cream-dim'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-[9px] text-cream-dim">
                <span>
                  Frame {scrubIdx + 1} / {inspectedEpisode.frames.length}
                </span>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => setTrimStart(Math.min(scrubIdx, trimEnd))}
                    className="px-1.5 py-0.5 rounded bg-charcoal hover:bg-cream/10 border border-cream/15 text-[8px] uppercase"
                  >
                    In:{trimStart}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrimEnd(Math.max(scrubIdx, trimStart))}
                    className="px-1.5 py-0.5 rounded bg-charcoal hover:bg-cream/10 border border-cream/15 text-[8px] uppercase"
                  >
                    Out:{trimEnd}
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyTrim}
                    className="px-1.5 py-0.5 rounded bg-sage/20 hover:bg-sage/30 text-sage border border-sage/40 text-[8px] font-bold uppercase flex items-center space-x-0.5"
                    title="Trim episode to [In..Out] range"
                  >
                    <Scissors className="w-2.5 h-2.5" />
                    <span>Trim</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <SvgSparkline
                  label="Linear Vel"
                  valuesA={sparkData.linVel}
                  colorA="#8ea48c"
                  unit="m/s"
                  playheadIdx={scrubIdx}
                  warnings={sparkData.warnings}
                />
                <SvgSparkline
                  label="Pitch / Roll"
                  valuesA={sparkData.pitch}
                  valuesB={sparkData.roll}
                  colorA="#f59e0b"
                  colorB="#38bdf8"
                  unit="deg"
                  playheadIdx={scrubIdx}
                  warnings={sparkData.warnings}
                />
                <SvgSparkline
                  label="Wheel Slip"
                  valuesA={sparkData.slip}
                  colorA="#e07a5f"
                  unit="m/s"
                  playheadIdx={scrubIdx}
                  warnings={sparkData.warnings}
                />
                <SvgSparkline
                  label="Throttle / Steering"
                  valuesA={sparkData.throttle}
                  valuesB={sparkData.steering}
                  colorA="#6B705C"
                  colorB="#a78bfa"
                  unit="cmd"
                  playheadIdx={scrubIdx}
                  warnings={sparkData.warnings}
                />
              </div>
            </div>
          )}

          {/* Episode List */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase text-cream-dim tracking-wider border-b border-cream/5 pb-1">
              Recorded Episodes ({episodes.length})
            </div>

            {episodes.length === 0 ? (
              <div className="p-4 text-center text-cream-dim text-[10px] bg-charcoal-deep/20 rounded border border-cream/5">
                No demonstration episodes recorded yet. Press Start Recording while driving to collect imitation data.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                {episodes.map((ep, idx) => (
                  <div
                    key={ep.meta.id}
                    className={`p-2 rounded bg-charcoal-deep/70 border flex items-center justify-between ${
                      inspectEpId === ep.meta.id ? 'border-sage/60' : 'border-cream/5'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-cream text-[10px]">
                          EP #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleEpisodeTag(ep.meta.id)}
                          title="Toggle Tag: Success / Fail"
                          className={`text-[8px] px-1 rounded uppercase font-bold border transition-colors ${
                            ep.meta.success
                              ? 'bg-sage/20 text-sage border-sage/40 hover:bg-sage/30'
                              : 'bg-brick/20 text-brick border-brick/40 hover:bg-brick/30'
                          }`}
                        >
                          {ep.meta.success ? 'Success' : 'Fail'}
                        </button>
                        <span className="text-[8px] text-cream-dim uppercase">
                          {ep.meta.controlSource}
                        </span>
                      </div>
                      <div className="text-[9px] text-cream-dim">
                        {ep.meta.frameCount} frames · {ep.meta.durationSec}s · {ep.meta.effectiveHz} Hz
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => handleInspectEpisode(ep)}
                        className={`p-1 rounded hover:bg-cream/10 ${
                          inspectEpId === ep.meta.id ? 'text-sage' : 'text-cream-dim hover:text-cream'
                        }`}
                        title="Inspect Timeline & Sparklines"
                      >
                        <Activity className="w-3 h-3" />
                      </button>
                      {onReplayEpisode && (
                        <button
                          type="button"
                          onClick={() => onReplayEpisode(ep)}
                          className="p-1 rounded hover:bg-sage/20 text-sage hover:text-cream"
                          title="Replay this recorded demonstration in SimEngine"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleExportJsonl(ep.meta.id)}
                        className="p-1 rounded hover:bg-cream/10 text-cream-dim hover:text-cream"
                        title="Export this episode as LeRobot JSONL"
                      >
                        <FileCode className="w-3 h-3 text-sage" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportCsv(ep.meta.id)}
                        className="p-1 rounded hover:bg-cream/10 text-cream-dim hover:text-cream"
                        title="Export this episode as CSV"
                      >
                        <FileSpreadsheet className="w-3 h-3 text-sage" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEpisode(ep.meta.id)}
                        className="p-1 rounded hover:bg-brick/20 text-cream-dim hover:text-brick"
                        title="Delete this episode"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
