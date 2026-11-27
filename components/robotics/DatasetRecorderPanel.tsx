'use client';

import React, { useState, useEffect } from 'react';
import {
  Database,
  Radio,
  Download,
  Trash2,
  Play,
  Square,
  XCircle,
  CheckCircle2,
  Layers,
  ChevronDown,
  ChevronUp,
  FileCode,
  FileSpreadsheet,
} from 'lucide-react';
import {
  globalEpisodeRecorder,
  DatasetControlSource,
  RecordedDemonstrationEpisode,
} from '@/lib/dataset/episodeRecorder';

interface DatasetRecorderPanelProps {
  currentSource: DatasetControlSource;
  gravityMps2?: number;
  terrainSeed?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onReplayEpisode?: (episode: RecordedDemonstrationEpisode) => void;
  className?: string;
}

export default function DatasetRecorderPanel({
  currentSource,
  gravityMps2 = 1.62,
  terrainSeed = 42,
  isCollapsed = false,
  onToggleCollapse,
  onReplayEpisode,
  className = '',
}: DatasetRecorderPanelProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [pendingSuccessTag, setPendingSuccessTag] = useState(true);
  const [frameCount, setFrameCount] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [episodes, setEpisodes] = useState<RecordedDemonstrationEpisode[]>(() => [...globalEpisodeRecorder.getEpisodes()]);
  const [selectedSource, setSelectedSource] = useState<DatasetControlSource>(currentSource);

  // Sync selected source when current source changes
  useEffect(() => {
    setSelectedSource(currentSource);
  }, [currentSource]);

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
    globalEpisodeRecorder.startRecording(selectedSource, gravityMps2, terrainSeed);
    setIsRecording(true);
    setFrameCount(0);
    setElapsedSec(0);
  };

  const handleStopAndSave = (success: boolean) => {
    globalEpisodeRecorder.stopAndSave(success);
    setIsRecording(false);
    setEpisodes([...globalEpisodeRecorder.getEpisodes()]);
  };

  const handleToggleEpisodeTag = (episodeId: string) => {
    globalEpisodeRecorder.toggleEpisodeSuccess(episodeId);
    setEpisodes([...globalEpisodeRecorder.getEpisodes()]);
  };

  const handleDiscard = () => {
    globalEpisodeRecorder.discard();
    setIsRecording(false);
    setFrameCount(0);
    setElapsedSec(0);
  };

  const handleExportJsonl = (episodeId?: string) => {
    const jsonl = globalEpisodeRecorder.exportLeRobotJsonl(episodeId);
    const blob = new Blob([jsonl], { type: 'application/x-ndjson;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lerobot_dataset_${episodeId || 'all'}_${Date.now()}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = (episodeId?: string) => {
    const csv = globalEpisodeRecorder.exportRoboticsCsv(episodeId);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `robotics_demonstrations_${episodeId || 'all'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    globalEpisodeRecorder.clearEpisodes();
    setEpisodes([]);
  };

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
                  {(['keyboard', 'gesture', 'nemotron'] as const).map((src) => (
                    <button
                      key={src}
                      onClick={() => setSelectedSource(src)}
                      className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold transition-colors ${
                        selectedSource === src
                          ? 'bg-sage text-charcoal-deep'
                          : 'bg-charcoal text-cream-dim hover:text-cream border border-cream/10'
                      }`}
                    >
                      {src}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleStart}
                  className="w-full py-2 px-3 rounded bg-sage/20 hover:bg-sage/30 border border-sage/40 hover:border-sage/70 text-cream font-bold uppercase tracking-wider text-[11px] flex items-center justify-center space-x-2 transition-all"
                >
                  <Play className="w-3.5 h-3.5 text-sage" />
                  <span>Start New Episode Recording</span>
                </button>
              </div>
            )}
          </div>

          {/* Export Action Bar */}
          {episodes.length > 0 && (
            <div className="p-3 rounded-lg bg-charcoal-deep/50 border border-cream/10 space-y-2">
              <div className="flex items-center justify-between text-[10px] text-cream-dim">
                <span>Dataset Export ({episodes.length} Episodes):</span>
                <button
                  onClick={handleClear}
                  className="text-brick hover:underline flex items-center space-x-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleExportJsonl()}
                  className="py-1.5 px-2 rounded bg-charcoal hover:bg-cream/10 text-cream border border-cream/15 text-[10px] font-bold uppercase flex items-center justify-center space-x-1.5 transition-colors"
                  title="Download in Hugging Face LeRobot / RLDS JSONL format"
                >
                  <FileCode className="w-3.5 h-3.5 text-sage" />
                  <span>LeRobot JSONL</span>
                </button>
                <button
                  onClick={() => handleExportCsv()}
                  className="py-1.5 px-2 rounded bg-charcoal hover:bg-cream/10 text-cream border border-cream/15 text-[10px] font-bold uppercase flex items-center justify-center space-x-1.5 transition-colors"
                  title="Download full multi-column robotics tabular CSV"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-sage" />
                  <span>Robotics CSV</span>
                </button>
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
                    className="p-2 rounded bg-charcoal-deep/70 border border-cream/5 flex items-center justify-between"
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
