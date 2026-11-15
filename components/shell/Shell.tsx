'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  Camera,
  Cpu,
  Coins,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  SlidersHorizontal,
  Compass,
  Activity,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import ThreeViewer, { CameraPreset, QualityTier } from '@/components/viewer/ThreeViewer';
import TeleopOverlay from '@/components/teleop/TeleopOverlay';
import CommandPalette from '@/components/shell/CommandPalette';
import AnalogLogPane from '@/components/shell/AnalogLogPane';
import ShortcutsOverlay from '@/components/shell/ShortcutsOverlay';
import LayoutMenu from '@/components/shell/LayoutMenu';
import StageRail, { StageKey, StageState } from '@/components/shell/StageRail';
import TokenSpendPopover from '@/components/shell/TokenSpendPopover';
import ColdStartCard from '@/components/shell/ColdStartCard';
import RunSummaryCard from '@/components/shell/RunSummaryCard';
import DatasetPanel from '@/components/teleop/DatasetPanel';
import DeltaComparisonCard from '@/components/teleop/DeltaComparisonCard';
import FpsBadge from '@/components/shell/FpsBadge';
import PerfPanel from '@/components/shell/PerfPanel';
import GaitLab from '@/components/debug/GaitLab';
import { getBuildStamp } from '@/lib/build_stamp';
import {
  EnvironmentSpec,
  TelemetryFrame,
  TeleopCommand,
  ArchitectOutput,
  JobStatus,
  RunSummary,
} from '@/contracts';
import { generateDeterministicEnvironmentSpec } from '@/lib/nebius/prompts';
import { TelemetryStore, TelemetryStoreSnapshot } from '@/lib/telemetry/store';
import { PerfProbe } from '@/lib/perf/probe';
import { parseFeatureToggles } from '@/lib/perf/toggles';

interface LogItem {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'security' | 'architect' | 'error';
  text: string;
}

const INITIAL_STAGES: Record<string, StageState> = {
  interpret: { key: 'interpret', label: 'Intent Analysis', tier: 'ultra', status: 'idle' },
  draft: { key: 'draft', label: 'Spec Drafting', tier: 'ultra', status: 'idle' },
  compile: { key: 'compile', label: 'Spec Compiler', tier: 'compiler', status: 'idle' },
  terrain: { key: 'terrain', label: 'Terrain Synthesis', tier: 'engine', status: 'idle' },
  debris: { key: 'debris', label: 'Debris Field', tier: 'engine', status: 'idle' },
  robot: { key: 'robot', label: 'Robot Dynamics', tier: 'engine', status: 'idle' },
  reward: { key: 'reward', label: 'Reward Shaping', tier: 'ultra', status: 'idle' },
  safety: { key: 'safety', label: 'AST Safety Gate', tier: 'gate', status: 'idle' },
  sandbox: { key: 'sandbox', label: 'Reward Sandbox', tier: 'sandbox', status: 'idle' },
  datagen: { key: 'datagen', label: 'Datagen Scripts', tier: 'ultra', status: 'idle' },
  critique: { key: 'critique', label: 'Physics Audit', tier: 'super', status: 'idle' },
};

export default function Shell() {
  // Application State
  const [envSpec, setEnvSpec] = useState<EnvironmentSpec>(() =>
    generateDeterministicEnvironmentSpec('quadruped, low-gravity debris field')
  );
  const [teleopCommand, setTeleopCommand] = useState<TeleopCommand | null>(null);
  const [simMode, setSimMode] = useState<'cloud_nebius' | 'local_demo'>('local_demo');
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [playbackIndex, setPlaybackIndex] = useState(0);

  // Quality & Diagnostics State
  const [qualityTier, setQualityTier] = useState<QualityTier>('high');
  const [isPerfPanelOpen, setIsPerfPanelOpen] = useState(false);
  const [boundaryToast, setBoundaryToast] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  // Throttled Telemetry Store snapshot for HUD chips (<= 10 Hz)
  const [storeSnapshot, setStoreSnapshot] = useState<TelemetryStoreSnapshot>(() =>
    TelemetryStore.getInstance().getSnapshot()
  );

  // Layout & Overlays Settings
  const [layoutSettings, setLayoutSettings] = useState({
    showLogPanel: true,
    showRadar: true,
    showOverlays: true,
    showColliderDebug: false,
    showDustParticles: true,
    adaptiveQuality: true,
  });

  // Persistent Left Panel Width (Clamped 320px to 640px)
  const [logPaneWidth, setLogPaneWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('omni_log_width');
        if (saved) return Math.max(320, Math.min(640, Number(saved)));
      } catch {}
    }
    return 420;
  });

  const handleLogWidthChange = (newWidth: number) => {
    setLogPaneWidth(newWidth);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('omni_log_width', String(newWidth));
      } catch {}
    }
  };

  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('chase');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isTeleopOpen, setIsTeleopOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isTokenSpendOpen, setIsTokenSpendOpen] = useState(false);
  const [isNewAnimation, setIsNewAnimation] = useState(true);
  const [showGaitLab, setShowGaitLab] = useState(false);

  // Architect Stream State
  const [logs, setLogs] = useState<LogItem[]>([
    {
      id: '1',
      timestamp: '00:00:00',
      level: 'info',
      text: `Omni-Kinetic Sim-to-Real Studio initialized [${getBuildStamp().iterationTag} • sha:${getBuildStamp().sha} (${getBuildStamp().branch}) • ${getBuildStamp().buildType}].`,
    },
    {
      id: '2',
      timestamp: '00:00:01',
      level: 'info',
      text: 'Press [Ctrl+K] for prompt, [P] for PerfProbe, [Q] to cycle quality tiers, [?] for shortcuts.',
    },
  ]);
  const [currentStage, setCurrentStage] = useState('');
  const [stages, setStages] = useState<Record<string, StageState>>(INITIAL_STAGES);
  const [activeStageKey, setActiveStageKey] = useState<string | null>(null);
  const [architectOutput, setArchitectOutput] = useState<
    (ArchitectOutput & { critique?: any; safetyChecks?: any[]; compileReport?: any; compiledSpec?: any; sandboxResult?: any }) | null
  >(null);
  const [isStreamingArchitect, setIsStreamingArchitect] = useState(false);
  const [isStageRailVisible, setIsStageRailVisible] = useState(true);

  // Job Telemetry Stream State
  const [iteration, setIteration] = useState(1);
  const [isDatasetPanelOpen, setIsDatasetPanelOpen] = useState(false);
  const [isDeltaComparisonOpen, setIsDeltaComparisonOpen] = useState(false);
  const [collectedEpisodes, setCollectedEpisodes] = useState<any[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [showRunSummary, setShowRunSummary] = useState(false);
  const [tokenSpend, setTokenSpend] = useState({ promptTokens: 0, completionTokens: 0, costUsd: 0.0000 });
  const [collisionAlert, setCollisionAlert] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const lastReportedEpisodeEvent = useRef<string | null>(null);

  const addLog = useCallback((text: string, level: LogItem['level'] = 'info') => {
    const d = new Date();
    const ts = d.toTimeString().split(' ')[0];
    setLogs((prev) => [...prev.slice(-199), { id: Math.random().toString(36).substring(2, 9), timestamp: ts, level, text }]);
  }, []);

  // Poll TelemetryStore at <= 10 Hz for HUD chips
  useEffect(() => {
    const interval = setInterval(() => {
      const snap = TelemetryStore.getInstance().getSnapshot();
      setStoreSnapshot(snap);
      if (snap.currentFrame && isPlaying) {
        setPlaybackIndex(snap.historyLength - 1);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Handle Feature Toggles
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tierParam = params.get('tier')?.toUpperCase();
      if (tierParam === 'ULTRA' || tierParam === 'HIGH' || tierParam === 'MED' || tierParam === 'LOW') {
        setQualityTier(tierParam as QualityTier);
      }
    }
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA' ||
          (document.activeElement as HTMLElement).isContentEditable)
      ) {
        if (e.key === 'Escape') {
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      // Ctrl + K: Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
      // Ctrl + B: Toggle Left Panel
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setLayoutSettings((s) => ({ ...s, showLogPanel: !s.showLogPanel }));
      }
      // P: Toggle PerfPanel
      if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsPerfPanelOpen((prev) => !prev);
      }
      // Q: Cycle Quality Tier
      if (e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setQualityTier((prev) => {
          const tiers: QualityTier[] = ['ultra', 'high', 'medium', 'low', 'potato'];
          const nextIdx = (tiers.indexOf(prev) + 1) % tiers.length;
          const nextTier = tiers[nextIdx];
          PerfProbe.getInstance().setTier(nextTier);
          return nextTier;
        });
      }
      // B: Toggle Boundary Rim Overlay
      if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setLayoutSettings((s) => ({ ...s, showOverlays: !s.showOverlays }));
      }
      // ?: Shortcuts Modal
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      }
      // T: CV Teleoperation
      if (e.key.toLowerCase() === 't' && !e.shiftKey) {
        e.preventDefault();
        setIsTeleopOpen((prev) => !prev);
      }
      // 1-4: Camera Presets
      if (e.key === '1') setCameraPreset('chase');
      if (e.key === '2') setCameraPreset('top');
      if (e.key === '3') setCameraPreset('side');
      if (e.key === '4') setCameraPreset('free');

      // Space: Play/Pause Replay
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
      // Comma/Period: Single Step Backward/Forward
      if (e.key === ',') {
        setIsPlaying(false);
        setPlaybackIndex((prev) => Math.max(0, prev - 1));
      }
      if (e.key === '.') {
        setIsPlaying(false);
        const history = TelemetryStore.getInstance().getHistory();
        setPlaybackIndex((prev) => Math.min(history.length - 1, prev + 1));
      }
      // Bracket keys: Playback speed
      if (e.key === '[') setPlaybackSpeed((s) => Math.max(0.25, s - 0.25));
      if (e.key === ']') setPlaybackSpeed((s) => Math.min(4.0, s + 0.25));

      // Hotkey: A to approve job when diff is ready
      if (e.key.toLowerCase() === 'a' && architectOutput && !isPaletteOpen) {
        e.preventDefault();
        handleApproveJobRef.current();
      }
      // Hotkey: X to reject
      if (e.key.toLowerCase() === 'x' && architectOutput && !isPaletteOpen) {
        e.preventDefault();
        handleRejectJobRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [architectOutput, isPaletteOpen]);

  // Connect Telemetry Stream
  const connectTelemetryStream = useCallback(
    (mode: 'cloud_nebius' | 'local_demo', iter = 1, overrideSpec?: EnvironmentSpec) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const activeSpec = overrideSpec || envSpec;
      const specQuery = `&spec=${encodeURIComponent(JSON.stringify(activeSpec))}`;
      const es = new EventSource(`/api/jobs/stream?mode=${mode}&duration=120&iteration=${iter}${specQuery}`);
      eventSourceRef.current = es;

      es.addEventListener('status', (e) => {
        const status: JobStatus = JSON.parse(e.data);
        setJobStatus(status);
        if (status.status === 'succeeded') {
          addLog(`[SIM SUCCEEDED] ${status.message}`, 'architect');
          const summary: RunSummary = {
            success: true,
            distanceCovered: Number(((status.elapsed || 60) * 0.95).toFixed(2)),
            meanReward: Number((status.currentReward || 1.82).toFixed(2)),
            collisionCount: status.collisionCount || 0,
            boundaryEvents: TelemetryStore.getInstance().getSnapshot().boundaryEventCount,
            energyConsumed: Number(((status.elapsed || 60) * 0.72).toFixed(1)),
            durationSeconds: status.elapsed || 60,
            tokens: {
              ultra: tokenSpend.promptTokens,
              super: 950,
              nano: 480,
              total: tokenSpend.promptTokens + tokenSpend.completionTokens,
            },
            costUsd: tokenSpend.costUsd,
            mode: status.mode,
            sourceLabels: status.mode === 'cloud_nebius'
              ? ['nebius_serverless_jobs', 'nvidia_l40s_gpu', 'headless_pybullet']
              : ['deterministic_physics', 'heightfield_grounded', 'local_runner'],
          };
          setRunSummary(summary);
          setShowRunSummary(true);
        }
      });

      // Stream frames directly into imperative TelemetryStore outside React
      es.addEventListener('telemetry', (e) => {
        const batch = JSON.parse(e.data);
        if (batch.frames && batch.frames.length > 0) {
          TelemetryStore.getInstance().ingestBatch(batch.frames);
        }
      });

      es.onerror = () => {
        es.close();
      };
    },
    [envSpec, addLog, tokenSpend]
  );

  useEffect(() => {
    connectTelemetryStream(simMode, iteration);
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [simMode, iteration, connectTelemetryStream]);

  // Submit Prompt to Architect Stream
  const handlePromptSubmit = async (prompt: string) => {
    setIsStreamingArchitect(true);
    addLog(`[USER PROMPT] "${prompt}"`, 'info');

    // Reset stages
    setStages(INITIAL_STAGES);

    try {
      const res = await fetch('/api/architect/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!res.body) throw new Error('No stream body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.substring(6));
            if (data.type === 'stage') {
              setCurrentStage(data.stage);
              setActiveStageKey(data.stage);
              setStages((prev) => ({
                ...prev,
                [data.stage]: {
                  ...prev[data.stage],
                  status: data.status,
                  durationMs: data.durationMs,
                },
              }));
              addLog(`[STAGE: ${data.stage.toUpperCase()}] ${data.label} (${data.status})`, 'architect');
            } else if (data.type === 'token_update') {
              setTokenSpend((prev) => ({
                promptTokens: prev.promptTokens + (data.promptDelta || 0),
                completionTokens: prev.completionTokens + (data.completionDelta || 0),
                costUsd: prev.costUsd + (data.costDeltaUsd || 0),
              }));
            } else if (data.type === 'complete') {
              setArchitectOutput(data.payload);
              addLog(
                `Architect complete. Task: "${data.payload.spec.taskName}" (${data.payload.spec.gravity[1]}m/s², ${data.payload.spec.debris?.count || 1800} boulders). Source: ${data.payload.sourceLabel}.`,
                'architect'
              );
            }
          } catch {}
        }
      }
    } catch (err: any) {
      addLog(`Architect stream error: ${err.message}`, 'error');
    } finally {
      setIsStreamingArchitect(false);
    }
  };

  const handleApproveJobRef = useRef<() => void>(() => {});
  const handleRejectJobRef = useRef<() => void>(() => {});

  const handleApproveJob = useCallback(() => {
    if (architectOutput) {
      const approvedSpec = architectOutput.spec;
      setEnvSpec(approvedSpec);
      addLog(`[SPEC APPROVED] Activated "${approvedSpec.taskName}" (G=${approvedSpec.gravity?.[1]}m/s², Debris=${approvedSpec.debris?.count || 1800}). Simulation reinitialized.`, 'architect');
      connectTelemetryStream(simMode, 1, approvedSpec);
    } else {
      addLog('Architecture specification and reward scripts approved by user.', 'architect');
      connectTelemetryStream(simMode);
    }
  }, [architectOutput, addLog, connectTelemetryStream, simMode]);

  const handleApproveCode = (rewardCode: string, datagenCode: string) => {
    if (architectOutput) {
      const approvedSpec = architectOutput.spec;
      setEnvSpec(approvedSpec);
      setArchitectOutput({ ...architectOutput, rewardCode, datagenCode });
      addLog(`[SPEC & CODE APPROVED] Activated "${approvedSpec.taskName}" with modified Python reward code. Re-initializing simulation...`, 'architect');
      connectTelemetryStream(simMode, 1, approvedSpec);
    } else {
      addLog('Updated reward & datagen scripts approved. Re-initializing simulation...', 'architect');
      connectTelemetryStream(simMode);
    }
  };

  const handleRejectJob = useCallback(() => {
    setArchitectOutput(null);
    addLog('Specification rejected. Requesting Architect retry...', 'warn');
  }, [addLog]);

  handleApproveJobRef.current = handleApproveJob;
  handleRejectJobRef.current = handleRejectJob;

  const handleRejectWithFeedback = (feedback: string) => {
    addLog(`[RETRY REQUESTED] Developer feedback: "${feedback}"`, 'warn');
    handlePromptSubmit(`${envSpec.taskName}. Focus on feedback: ${feedback}`);
  };

  const handleCollision = () => {
    setCollisionAlert(true);
    setTimeout(() => setCollisionAlert(false), 350);
  };

  const handleOpenDatasetPanel = (episodes: any[]) => {
    setCollectedEpisodes(episodes);
    setIsDatasetPanelOpen(true);
  };

  const handleTrainWithCorrections = (selectedIds: string[]) => {
    setIteration(2);
    setIsDeltaComparisonOpen(true);
    addLog(
      `Ingested ${selectedIds.length} human demonstration episodes. Retraining policy for Iteration 2... [SIMULATED IMPROVEMENT (DEMO)]`,
      'architect'
    );
    connectTelemetryStream(simMode, 2);
  };

  const currentFrame = isPlaying
    ? storeSnapshot.currentFrame
    : TelemetryStore.getInstance().getFrameAtIndex(playbackIndex);

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden flex flex-col bg-charcoal text-cream transition-all duration-200 ${
        collisionAlert ? 'animate-brick-impact' : ''
      }`}
    >
      {/* Top Workstation Header (Strict Single-Row Flex Layout with min-width: 0 and gap >= 6px) */}
      <header className="analog-glass z-30 h-12 flex items-center justify-between px-3 md:px-4 border-b border-cream/10 select-none m-2 mb-0 whitespace-nowrap flex-nowrap min-w-0 overflow-hidden">
        {/* Left: Branding & Task Context */}
        <div className="flex items-center gap-2 min-w-0 flex-1 max-w-[45%]">
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-sm bg-sage" />
            <h1 className="font-mono text-xs uppercase tracking-wider font-bold text-cream">
              Omni-Kinetic
            </h1>
          </div>
          <span className="text-cream-dim/30 shrink-0">/</span>
          <span
            className="text-xs font-mono text-cream-dim truncate min-w-0 max-w-[180px] lg:max-w-xs shrink"
            title={envSpec.taskName}
          >
            {envSpec.taskName}
          </span>
          <div className="hidden lg:flex items-center space-x-1.5 px-2 py-0.5 rounded bg-charcoal border border-cream/10 text-xs font-mono shrink-0">
            <span className={`w-2 h-2 rounded-full ${iteration >= 2 ? 'bg-sage animate-pulse' : 'bg-cream-dim'}`} />
            <span>{iteration >= 2 ? 'Policy v2' : 'Policy v1'}</span>
          </div>
          {collectedEpisodes.length > 0 && (
            <button
              onClick={() => setIsDatasetPanelOpen(true)}
              className="px-2 py-0.5 rounded bg-sage/20 border border-sage/40 text-sage hover:bg-sage/30 text-xs font-mono flex items-center space-x-1 transition-colors shrink-0"
            >
              <Layers className="w-3 h-3" />
              <span>Dataset ({collectedEpisodes.length})</span>
            </button>
          )}
        </div>

        {/* Center: Command Palette Trigger & Teleop Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsPaletteOpen(true)}
            title="Open Task Prompt [Ctrl+K]"
            className="flex items-center space-x-1.5 bg-charcoal hover:bg-charcoal-light border border-cream/15 px-2.5 py-1 rounded text-xs font-mono text-cream transition-colors focus-visible:ring-2 focus-visible:ring-sage"
          >
            <Sparkles className="w-3.5 h-3.5 text-sage" />
            <span className="hidden sm:inline">Task Prompt</span>
            <kbd className="bg-charcoal-deep px-1.5 py-0.5 rounded text-[10px] text-cream-dim border border-cream/10">
              Ctrl+K
            </kbd>
          </button>

          <button
            onClick={() => setIsTeleopOpen((prev) => !prev)}
            title="Client-side webcam teleoperation (T)"
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors border ${
              isTeleopOpen
                ? 'bg-brick border-brick text-cream shadow-lg shadow-brick/30'
                : 'bg-charcoal hover:bg-charcoal-light border-cream/15 text-cream-dim hover:text-cream'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-sage" />
            <span className="hidden sm:inline">Teleop</span>
            <kbd className="bg-charcoal-deep px-1.5 py-0.5 rounded text-[10px] border border-cream/10">
              T
            </kbd>
          </button>
        </div>

        {/* Right: Mode Badge, Honest FPS & Token Meter */}
        <div className="flex items-center gap-2 text-xs font-mono shrink-0">
          {/* Mode Switcher */}
          <button
            onClick={() => setSimMode(simMode === 'cloud_nebius' ? 'local_demo' : 'cloud_nebius')}
            title="Click to toggle simulation execution provider"
            className={`px-2 py-0.5 rounded border flex items-center space-x-1.5 transition-colors text-[11px] ${
              simMode === 'cloud_nebius'
                ? 'bg-sage/20 border-sage/50 text-sage'
                : 'bg-cream/10 border-cream/20 text-cream'
            }`}
          >
            <Cpu className="w-3 h-3" />
            <span className="hidden xl:inline">{simMode === 'cloud_nebius' ? 'CLOUD STREAM: NEBIUS' : 'LOCAL SIMULATION'}</span>
            <span className="xl:hidden">{simMode === 'cloud_nebius' ? 'CLOUD' : 'LOCAL'}</span>
          </button>

          {/* Honest FPS Readout Badge */}
          <FpsBadge
            tier={qualityTier}
            onTogglePanel={() => setIsPerfPanelOpen((prev) => !prev)}
          />

          {/* Token Meter with Dollar Cost */}
          <button
            onClick={() => setIsTokenSpendOpen(true)}
            title="Click to inspect detailed token & cost accounting per tier"
            className="flex items-center space-x-1.5 bg-charcoal hover:bg-charcoal-light px-2 py-0.5 rounded border border-cream/10 text-cream-dim hover:text-cream cursor-pointer transition-colors text-[11px]"
          >
            <Coins className="w-3 h-3 text-sage" />
            <span>
              {tokenSpend.promptTokens + tokenSpend.completionTokens === 0
                ? '0 tok · $0.0000'
                : `${(tokenSpend.promptTokens + tokenSpend.completionTokens).toLocaleString()} tok · $${tokenSpend.costUsd.toFixed(4)}`}
            </span>
          </button>

          {/* Quick Shortcuts Trigger */}
          <button
            onClick={() => setIsShortcutsOpen(true)}
            title="Keyboard Shortcuts [?]"
            className="p-1 rounded bg-charcoal hover:bg-charcoal-light border border-cream/10 text-cream-dim hover:text-cream text-[11px] font-mono px-2 transition-colors"
          >
            ?
          </button>

          {/* Layout & Settings Menu */}
          <LayoutMenu
            settings={layoutSettings}
            onUpdateSettings={(newS) => setLayoutSettings((s) => ({ ...s, ...newS }))}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            onOpenStatus={() => window.open('/status', '_blank')}
          />
        </div>
      </header>

      {/* Stage Rail: 11-Stage Architectural Pipeline */}
      {isStageRailVisible && (isStreamingArchitect || architectOutput) && (
        <div className="mx-2 mt-1">
          <StageRail stages={stages} activeStage={activeStageKey} />
        </div>
      )}

      {/* Main Studio Viewport */}
      <div className="relative flex-1 flex overflow-hidden p-2 pt-1 gap-2">
        {/* Left Analog Log & Code Diff Pane (Resizable, persistent width) */}
        <AnalogLogPane
          logs={logs}
          currentStage={currentStage}
          architectOutput={architectOutput}
          currentSpec={envSpec}
          activeJobStatus={jobStatus}
          onApprove={handleApproveJob}
          onReject={handleRejectJob}
          onApproveCode={handleApproveCode}
          onRejectWithFeedback={handleRejectWithFeedback}
          onUpdateSpec={(spec) => {
            setEnvSpec(spec);
            if (architectOutput) {
              setArchitectOutput({ ...architectOutput, spec });
            }
          }}
          onOpenPrompt={() => setIsPaletteOpen(true)}
          isStreaming={isStreamingArchitect}
          isOpen={layoutSettings.showLogPanel}
          onToggleOpen={() => setLayoutSettings((s) => ({ ...s, showLogPanel: !s.showLogPanel }))}
          width={logPaneWidth}
          onWidthChange={handleLogWidthChange}
        />

        {/* Center 3D Three.js Spatial Visualizer */}
        <main className="relative flex-1 h-full rounded-xl overflow-hidden border border-cream/10 shadow-2xl">
          <ThreeViewer
            envSpec={envSpec}
            currentFrame={currentFrame}
            teleopCommand={isTeleopOpen ? teleopCommand : null}
            cameraPreset={cameraPreset}
            qualityTier={qualityTier}
            showColliderDebug={layoutSettings.showColliderDebug}
            showOverlays={layoutSettings.showOverlays}
            showRadar={layoutSettings.showRadar}
            showDustParticles={layoutSettings.showDustParticles}
            showGhostComparison={iteration >= 2 || isDeltaComparisonOpen}
            adaptiveQuality={layoutSettings.adaptiveQuality}
            isNewAnimation={isNewAnimation}
            onCollisionDetected={handleCollision}
          />

          {/* Boundary Reset Toast Alert */}
          {boundaryToast.visible && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 analog-glass-elevated px-4 py-2 text-xs font-mono text-brick border border-brick/40 shadow-2xl flex items-center space-x-2 animate-bounce">
              <AlertTriangle className="w-4 h-4 text-brick" />
              <span className="font-bold">{boundaryToast.message}</span>
            </div>
          )}

          {/* Bottom Replay Scrubber Dock */}
          <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 analog-glass-elevated px-4 py-1.5 flex items-center space-x-4 font-mono text-xs z-20">
            {/* Play/Pause */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1 rounded bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream"
              title="Play/Pause [Space]"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-sage" />}
            </button>

            {/* Step Back/Forward */}
            <button
              onClick={() => {
                setIsPlaying(false);
                setPlaybackIndex((prev) => Math.max(0, prev - 1));
              }}
              className="p-1 rounded hover:bg-charcoal text-cream-dim hover:text-cream"
              title="Step Backward [,]"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                const history = TelemetryStore.getInstance().getHistory();
                setPlaybackIndex((prev) => Math.min(history.length - 1, prev + 1));
              }}
              className="p-1 rounded hover:bg-charcoal text-cream-dim hover:text-cream"
              title="Step Forward [.]"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Scrubber Bar with Explicit Duration & Percentage */}
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-cream-dim">
                t={(currentFrame?.t || 0).toFixed(1)}s / {(envSpec.episodeLength / 60).toFixed(1)}s ({Math.min(100, Math.round(((currentFrame?.t || 0) / (envSpec.episodeLength / 60)) * 100))}%)
              </span>
              <div className="w-36 bg-charcoal-deep rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-sage h-full transition-all"
                  style={{
                    width: `${Math.min(100, ((currentFrame?.t || 0) / (envSpec.episodeLength / 60)) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Speed Selector */}
            <span className="text-[10px] text-cream-dim bg-charcoal px-1.5 py-0.5 rounded border border-cream/10">
              {playbackSpeed}x
            </span>

            {/* Live Arena Status indicator */}
            <div className="border-l border-cream/10 pl-3 flex items-center space-x-1.5 text-[10px]">
              <span className="w-2 h-2 rounded-full bg-sage" />
              <span className="text-cream-dim">Edge:</span>
              <span className="font-bold text-cream">{storeSnapshot.distanceToEdge}m</span>
            </div>
          </div>
        </main>
      </div>

      {/* Floating Modals & Diagnostic Overlays */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onSubmitPrompt={(p) => { void handlePromptSubmit(p); }}
        onToggleSimMode={() => setSimMode(simMode === 'cloud_nebius' ? 'local_demo' : 'cloud_nebius')}
        currentMode={simMode}
        onToggleTeleop={() => setIsTeleopOpen((p) => !p)}
        onToggleAnimation={() => setIsNewAnimation((p) => !p)}
        isNewAnimation={isNewAnimation}
        onOpenGaitLab={() => setShowGaitLab(true)}
      />

      {jobStatus && jobStatus.status === 'cold_start' && (
        <ColdStartCard
          status={jobStatus}
          onSwitchToLocal={() => {
            setSimMode('local_demo');
            connectTelemetryStream('local_demo');
          }}
        />
      )}

      {showRunSummary && runSummary && (
        <RunSummaryCard
          summary={runSummary}
          envSpec={envSpec}
          historyFrames={[...TelemetryStore.getInstance().getHistory()]}
          onClose={() => setShowRunSummary(false)}
          onReplay={() => {
            setShowRunSummary(false);
            setPlaybackIndex(0);
            setIsPlaying(true);
          }}
        />
      )}

      <PerfPanel
        isOpen={isPerfPanelOpen}
        onClose={() => setIsPerfPanelOpen(false)}
        onTierChange={(t) => setQualityTier(t)}
      />

      <ShortcutsOverlay
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <TokenSpendPopover
        isOpen={isTokenSpendOpen}
        onClose={() => setIsTokenSpendOpen(false)}
      />

      {isTeleopOpen && (
        <TeleopOverlay
          isOpen={isTeleopOpen}
          onClose={() => setIsTeleopOpen(false)}
          onCommand={(cmd) => setTeleopCommand(cmd)}
          onSaveEpisode={(ep) => setCollectedEpisodes((prev) => [...prev, ep])}
          currentFrame={currentFrame}
        />
      )}

      {isDatasetPanelOpen && (
        <DatasetPanel
          isOpen={isDatasetPanelOpen}
          onClose={() => setIsDatasetPanelOpen(false)}
          episodes={collectedEpisodes}
          onTrainWithCorrections={handleTrainWithCorrections}
        />
      )}

      {isDeltaComparisonOpen && (
        <DeltaComparisonCard
          isOpen={isDeltaComparisonOpen}
          onClose={() => setIsDeltaComparisonOpen(false)}
          episodeCount={collectedEpisodes.length}
          iteration={iteration}
        />
      )}

      {showGaitLab && (
        <GaitLab
          isOpen={showGaitLab}
          isNewAnimation={isNewAnimation}
          onToggleAnimation={() => setIsNewAnimation((prev) => !prev)}
          gravity={Math.abs(envSpec.gravity?.[1] ?? 1.62)}
          speed={playbackSpeed}
          onSpeedChange={setPlaybackSpeed}
          onClose={() => setShowGaitLab(false)}
        />
      )}
    </div>
  );
}
