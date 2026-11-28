'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Sparkles,
  Gamepad2,
  Camera,
  Cpu,
  Coins,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Layers,
  AlertTriangle,
  RotateCcw,
  Volume2,
  VolumeX,
  Radio,
  Trophy,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { isFeatureEnabled } from '@/lib/flags';
import { globalAudioSynthesizer } from '@/lib/audio/synthesizer';
import { DroidWorkshopModal } from '@/components/shell/modals/DroidWorkshopModal';
import { CommsDelayModal } from '@/components/shell/modals/CommsDelayModal';
import { SimToRealModal } from '@/components/shell/modals/SimToRealModal';
import { DailyChallengeModal } from '@/components/shell/modals/DailyChallengeModal';
import { CommsPresetKey } from '@/lib/comms/delay';
import ThreeViewer, { QualityTier } from '@/components/viewer/ThreeViewer';
import CommandPalette from '@/components/shell/CommandPalette';
import AnalogLogPane from '@/components/shell/AnalogLogPane';
import ShortcutsOverlay from '@/components/shell/ShortcutsOverlay';
import LayoutMenu from '@/components/shell/LayoutMenu';
import StageRail, { StageState } from '@/components/shell/StageRail';
import TokenSpendPopover from '@/components/shell/TokenSpendPopover';
import ColdStartCard from '@/components/shell/ColdStartCard';
import RunSummaryCard from '@/components/shell/RunSummaryCard';
import FpsBadge from '@/components/shell/FpsBadge';
import PerfPanel from '@/components/shell/PerfPanel';
import ControlHUD, { SensorOverlayFlags } from '@/components/control/ControlHUD';
import RoboticsTelemetryPanel from '@/components/robotics/RoboticsTelemetryPanel';
import PhysicsDomainPanel from '@/components/robotics/PhysicsDomainPanel';
import NemotronPlannerPanel from '@/components/robotics/NemotronPlannerPanel';
import DatasetRecorderPanel from '@/components/robotics/DatasetRecorderPanel';
import BenchmarkPanel from '@/components/robotics/BenchmarkPanel';
import HardwareBridgePanel from '@/components/robotics/HardwareBridgePanel';
import { NemotronTaskPlan } from '@/lib/nebius/taskPlanner';
import { HardwareBridgeClient } from '@/lib/bridge/rosBridge';
import { RobotProfileId, getRobotProfile } from '@/lib/robotics/profiles';
import { BENCHMARK_SCENARIOS, BenchmarkScenarioId } from '@/lib/sim2real/benchmark';
import {
  MissionPickerModal,
  EpisodeResultsModal,
  ScenarioEditorDrawer,
  SettingsModal,
  PauseMenuModal,
  EditorToolMode,
} from '@/components/missions/MissionPanels';
import {
  captureCanvasScreenshot,
  CanvasClipRecorder,
  isClipRecordingSupported,
} from '@/components/viewer/CaptureTools';
import { getBuildStamp } from '@/lib/build_stamp';
import {
  EnvironmentSpec,
  TeleopCommand,
  ArchitectOutput,
  JobStatus,
  RunSummary,
  CompiledSpec,
  SpecCompileReport,
  DemonstrationStep,
} from '@/contracts';
import { TransientRoboticsStore } from '@/lib/telemetry/transientStore';
import { globalEpisodeRecorder, RecordedDemonstrationEpisode } from '@/lib/dataset/episodeRecorder';
import { globalImitationPolicy } from '@/src/robotics/imitationPolicy';
import { generateDeterministicEnvironmentSpec } from '@/lib/nebius/prompts';
import { TelemetryStore } from '@/lib/telemetry/store';
import { PerfProbe } from '@/lib/perf/probe';
import { SimEngine } from '@/lib/sim/SimEngine';
import { describeRunMode, RunMode } from '@/lib/sim/runMode';
import { getShortcutRegistry } from '@/lib/control/shortcuts';
import { GaitMode } from '@/lib/control/types';
import { BUILT_IN_MISSIONS, MissionProgressSnapshot } from '@/lib/missions/missions';
import {
  ScenarioConfig,
  ScenarioConfigSchema,
  encodeScenarioToHash,
  decodeScenarioFromHash,
} from '@/lib/scenario/sharing';
import {
  ReplayFile,
  validateReplayJson,
  exportDatasetJsonl,
  exportDatasetCsv,
} from '@/lib/replay/recorder';
import {
  StudioSettings,
  DEFAULT_STUDIO_SETTINGS,
  CameraMode,
  MissionBestScore,
  loadStudioSettings,
  saveStudioSettings,
  loadMissionScores,
  saveMissionBestScore,
  isCoachDismissed,
  setCoachDismissed,
  exportAllStudioData,
  deleteAllStudioData,
} from '@/lib/storage/settings';

// Lazy-load heavy optional panels to protect first-load JS budget (Phase W13.2)
const TeleopOverlay = dynamic(() => import('@/components/teleop/TeleopOverlay'), { ssr: false });
const DatasetPanel = dynamic(() => import('@/components/teleop/DatasetPanel'), { ssr: false });
const DeltaComparisonCard = dynamic(() => import('@/components/teleop/DeltaComparisonCard'), { ssr: false });
const GaitLab = dynamic(() => import('@/components/debug/GaitLab'), { ssr: false });

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

const SPEED_PRESETS = [0.25, 0.5, 1, 2, 4] as const;

export default function Shell() {
  const registry = getShortcutRegistry();

  // Persistent settings & mission best scores
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_STUDIO_SETTINGS);
  const [bestScores, setBestScores] = useState<Record<string, MissionBestScore>>({});
  const [showCoachMarks, setShowCoachMarks] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [showDebugLatency, setShowDebugLatency] = useState(false);

  // Environment & run-mode state (ONE RunMode model)
  const [envSpec, setEnvSpec] = useState<EnvironmentSpec>(() =>
    generateDeterministicEnvironmentSpec('quadruped, low-gravity debris field')
  );
  const [runMode, setRunMode] = useState<RunMode>('local-simulation');
  const [qualityTier, setQualityTier] = useState<QualityTier>('high');
  const [cameraMode, setCameraMode] = useState<CameraMode>('follow');
  const [frameTrigger, setFrameTrigger] = useState(0);
  const [terrainVersion, setTerrainVersion] = useState(1);
  const [sensors, setSensors] = useState<SensorOverlayFlags>({
    lidar: false,
    velocity: false,
    contacts: false,
    stability: false,
    path: false,
  });

  // Modals & drawers
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isTeleopOpen, setIsTeleopOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isTokenSpendOpen, setIsTokenSpendOpen] = useState(false);
  const [isPerfPanelOpen, setIsPerfPanelOpen] = useState(false);
  const [isMissionsOpen, setIsMissionsOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPauseMenuOpen, setIsPauseMenuOpen] = useState(false);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [showGaitLab, setShowGaitLab] = useState(false);
  const [isNewAnimation, setIsNewAnimation] = useState(true);

  // Shared link confirmation banner (#s=)
  const [pendingSharedScenario, setPendingSharedScenario] = useState<ScenarioConfig | null>(null);

  // Scenario editor tool & terrain undo/redo stacks (bounded to 20 snapshots)
  const [editorTool, setEditorTool] = useState<EditorToolMode>('none');
  const undoStackRef = useRef<Int16Array[]>([]);
  const redoStackRef = useRef<Int16Array[]>([]);
  const [undoDepth, setUndoDepth] = useState({ undo: 0, redo: 0 });

  // Capture tools (2x PNG & WebM clip)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipRecorderRef = useRef<CanvasClipRecorder | null>(null);
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const [clipSupported, setClipSupported] = useState(false);

  // Last completed replay + results
  const lastReplayRef = useRef<ReplayFile | null>(null);
  const [lastMissionResult, setLastMissionResult] = useState<MissionProgressSnapshot | null>(null);

  // Layout settings
  const [layoutSettings, setLayoutSettings] = useState({
    showLogPanel: true,
    showRadar: true,
    showOverlays: true,
    showColliderDebug: false,
    showDustParticles: true,
    adaptiveQuality: true,
  });
  const [logPaneWidth, setLogPaneWidth] = useState<number>(400);
  const [leftWorkbenchTab, setLeftWorkbenchTab] = useState<'telemetry' | 'physics' | 'architect'>('telemetry');
  const [showRightSidebar, setShowRightSidebar] = useState<boolean>(true);
  const [rightWorkbenchTab, setRightWorkbenchTab] = useState<'planner' | 'benchmark' | 'bridge' | 'dataset'>('planner');
  const [activePlan, setActivePlan] = useState<NemotronTaskPlan | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<RobotProfileId>('quadruped_scout');
  const [digitalTwinEnabled, setDigitalTwinEnabled] = useState<boolean>(false);
  const [rightSidebarWidth] = useState<number>(380);

  // Toast alert (accessible aria-live)
  const [toast, setToast] = useState<{ text: string; level: 'info' | 'warn' } | null>(null);
  const showToast = useCallback((text: string, level: 'info' | 'warn' = 'info') => {
    setToast({ text, level });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  // Console logs
  const [logs, setLogs] = useState<LogItem[]>(() => {
    const stamp = getBuildStamp();
    return [
      {
        id: 'init-1',
        timestamp: '00:00:00',
        level: 'info',
        text: `Omni-Kinetic Sim-to-Real Studio initialized [${stamp.iterationTag} • sha:${stamp.sha} (${stamp.branch}) • ${stamp.buildType}].`,
      },
      {
        id: 'init-2',
        timestamp: '00:00:01',
        level: 'info',
        text: 'Press [T] to take manual control (WASD / Space hop / Click waypoint), [Ctrl+K] for prompt, [?] for shortcuts.',
      },
    ];
  });
  const addLog = useCallback((text: string, level: LogItem['level'] = 'info') => {
    const ts = new Date().toTimeString().split(' ')[0];
    setLogs((prev) => [...prev.slice(-199), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: ts, level, text }]);
  }, []);

  // Architect & legacy panel state
  const [currentStage, setCurrentStage] = useState('');
  const [stages, setStages] = useState<Record<string, StageState>>(INITIAL_STAGES);
  const [activeStageKey, setActiveStageKey] = useState<string | null>(null);
  const [architectOutput, setArchitectOutput] = useState<
    (ArchitectOutput & {
      spec: EnvironmentSpec;
      critique?: Record<string, unknown>;
      safetyChecks?: Array<Record<string, unknown>>;
      compileReport?: SpecCompileReport;
      compiledSpec?: CompiledSpec;
      sandboxResult?: Record<string, unknown>;
    }) | null
  >(null);
  const [isStreamingArchitect, setIsStreamingArchitect] = useState(false);
  const [iteration, setIteration] = useState(1);
  const [isDatasetPanelOpen, setIsDatasetPanelOpen] = useState(false);
  const [isDeltaComparisonOpen, setIsDeltaComparisonOpen] = useState(false);
  const [collectedEpisodes, setCollectedEpisodes] = useState<DemonstrationStep[][]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [showRunSummary, setShowRunSummary] = useState(false);
  const [tokenSpend, setTokenSpend] = useState({ promptTokens: 0, completionTokens: 0, costUsd: 0.0 });
  const [collisionAlert, setCollisionAlert] = useState(false);

  // Expansion Packs UI state (Packs C, D, E, I, K)
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isWorkshopOpen, setIsWorkshopOpen] = useState(false);
  const [isCommsDelayOpen, setIsCommsDelayOpen] = useState(false);
  const [commsPreset, setCommsPreset] = useState<CommsPresetKey>('off');
  const [isSimToRealOpen, setIsSimToRealOpen] = useState(false);
  const [isDailyChallengeOpen, setIsDailyChallengeOpen] = useState(false);

  // Action handler ref so SimEngine InputManager invokes live React callbacks
  const actionHandlerRef = useRef<(actionId: string) => void>(() => {});

  // Create ONE authoritative SimEngine instance (fixed-step deterministic simulation on canonical TerrainService)
  const engineRef = useRef<SimEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new SimEngine(registry, {
      onToast: (msg, lvl) => showToast(msg, lvl),
      onAction: (actId) => actionHandlerRef.current(actId),
      onFrame: (frame) => {
        TelemetryStore.getInstance().ingestFrame(frame);
      },
      onEpisodeComplete: (missionSnap, replay) => {
        lastReplayRef.current = replay;
        setLastMissionResult(missionSnap);
        if (missionSnap.score.succeeded) {
          const { scores, result } = saveMissionBestScore({
            missionId: missionSnap.missionId,
            bestScore: missionSnap.score.total,
            medal: missionSnap.score.medal,
            bestTimeSec: missionSnap.score.elapsedSec,
            assistsUsed: missionSnap.score.assistsUsed.length > 0,
          });
          setBestScores(scores);
          if (!result.ok && result.quotaExceeded) {
            showToast(result.error || 'Storage quota exceeded.', 'warn');
          }
        }
        setIsResultsOpen(true);
      },
    });
  }
  const engine = engineRef.current;

  // ROS 2 / HIL WebSocket Bridge singleton ref (zero React overhead)
  const bridgeClientRef = useRef<HardwareBridgeClient | null>(null);
  if (!bridgeClientRef.current) {
    bridgeClientRef.current = new HardwareBridgeClient({
      onTelemetry: (tel) => {
        engineRef.current?.applyDigitalTwinTelemetry(tel);
      },
    });
  }
  const bridgeClient = bridgeClientRef.current;

  // Stream outbound geometry_msgs/Twist at bridge's configured rate (respecting E-STOP immediately)
  useEffect(() => {
    const id = setInterval(() => {
      const cmd = engine.getLastShapedCommand();
      const eStop = engine.getArbiterSnapshot().emergencyStop;
      bridgeClient.sendCommand(cmd.vx, cmd.vy, cmd.yawRate, eStop, performance.now());
    }, 33);
    return () => {
      clearInterval(id);
      bridgeClient.dispose();
    };
  }, [engine, bridgeClient]);

  // Throttled UI sync tick (~10 Hz driven by ThreeViewer onUiSync — zero per-frame React state!)
  const [, setUiTick] = useState(0);
  const handleUiSync = useCallback(() => {
    setUiTick((t) => (t + 1) & 0x3fffffff);
  }, []);

  const restoreViewportFocus = useCallback(() => {
    if (typeof document === 'undefined') return;
    const vp = document.getElementById('viewport-container');
    if (vp) {
      vp.focus({ preventScroll: true });
    }
  }, []);

  // Load persisted settings, mission scores, coach state, URL params, and #s= share hash on mount
  useEffect(() => {
    const loaded = loadStudioSettings();
    setSettings(loaded);
    setQualityTier(loaded.display.qualityTier);
    setCameraMode(loaded.camera.defaultMode);
    setBestScores(loadMissionScores());
    setShowCoachMarks(!isCoachDismissed());
    setClipSupported(isClipRecordingSupported());
    clipRecorderRef.current = new CanvasClipRecorder();

    // Apply persisted key remappings
    for (const [id, keys] of Object.entries(loaded.controls.keyOverrides || {})) {
      registry.remap(id, keys);
    }

    // Coarse pointer detection for touch virtual joystick
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia?.('(pointer: coarse)');
      if (mq) setIsCoarsePointer(mq.matches);

      try {
        const savedW = localStorage.getItem('omni_log_width');
        if (savedW) setLogPaneWidth(Math.max(320, Math.min(640, Number(savedW))));
      } catch {}

      const params = new URLSearchParams(window.location.search);
      if (params.get('debug') === '1') setShowDebugLatency(true);
      const seedParam = params.get('seed');
      if (seedParam) {
        const parsedSeed = parseInt(seedParam, 10);
        if (Number.isFinite(parsedSeed) && parsedSeed > 0) {
          engine.applyScenario({ seed: parsedSeed }, true);
          setTerrainVersion(engine.terrain.getVersion());
        }
      }
      if (params.get('paused') === '1') {
        engine.clock.setPaused(true);
      }

      // Check shareable scenario hash (#s=...)
      if (window.location.hash.includes('s=')) {
        const decoded = decodeScenarioFromHash(window.location.hash);
        if (decoded.ok && decoded.config) {
          setPendingSharedScenario(decoded.config);
        } else if (decoded.error) {
          showToast(decoded.error, 'warn');
        }
      }
    }

    // Attach single unified window input listener (handles keyboard, blur, visibilitychange, gamepad)
    const detachInputs = engine.inputs.attachWindowListeners();

    return () => {
      detachInputs();
      clipRecorderRef.current?.dispose();
    };
  }, [engine, registry, showToast]);

  // Sync live settings into SimEngine immediately whenever changed
  useEffect(() => {
    engine.inputs.settings.sensitivity = settings.controls.sensitivity;
    engine.inputs.settings.gamepadDeadzone = settings.controls.gamepadDeadzone;
    engine.inputs.settings.gamepadCurve = settings.controls.gamepadCurve;
    engine.inputs.settings.invertYaw = settings.controls.invertYaw;
    engine.inputs.settings.invertCameraY = settings.controls.invertCameraY;
    engine.inputs.settings.oneHandedMode = settings.controls.oneHandedMode;
    engine.inputs.settings.pointerDriveEnabled = settings.controls.pointerDriveEnabled;
    engine.inputs.settings.avoidRocks = settings.controls.avoidRocks;
    engine.inputs.settings.hapticsEnabled = settings.controls.hapticsEnabled;

    engine.shaper.params.realism = settings.simulation.realism;
    engine.shaper.params.speedLimiter = settings.simulation.speedLimiter;
    engine.shaper.params.brakeAssist = settings.simulation.brakeAssist;
    engine.clock.setEndBehavior(settings.simulation.endBehavior);

    if (settings.controls.oneHandedMode) engine.missionRuntime.registerAssist('one-handed');
    if (settings.simulation.speedLimiter < 0.99) engine.missionRuntime.registerAssist('speed-limiter');
    if (settings.simulation.noFalls) engine.missionRuntime.registerAssist('no-falls');
  }, [engine, settings]);

  // Auto-pause on blur when enabled in settings
  useEffect(() => {
    if (!settings.simulation.autoPauseOnBlur) return;
    const onBlur = () => {
      engine.clock.setPaused(true);
      handleUiSync();
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [engine, settings.simulation.autoPauseOnBlur, handleUiSync]);

  const updateSettings = useCallback(
    (next: StudioSettings) => {
      setSettings(next);
      setQualityTier(next.display.qualityTier);
      const res = saveStudioSettings(next);
      if (!res.ok && res.quotaExceeded) {
        showToast(res.error || 'Storage quota exceeded.', 'warn');
      }
    },
    [showToast]
  );

  // Capture Screenshot [F12]
  const handleScreenshot = useCallback(async () => {
    if (!canvasRef.current) {
      showToast('Viewport canvas not ready yet.', 'warn');
      return;
    }
    const res = await captureCanvasScreenshot(canvasRef.current);
    if (res.ok) {
      showToast(
        `Saved ${res.width}×${res.height} PNG${res.copiedToClipboard ? ' & copied to clipboard' : ''}.`,
        'info'
      );
    } else {
      showToast(res.error || 'Screenshot capture failed.', 'warn');
    }
  }, [showToast]);

  // Wire global studio actions triggered by ShortcutRegistry / InputManager
  actionHandlerRef.current = (actionId: string) => {
    switch (actionId) {
      case 'toggle_control': {
        const nowManual = engine.arbiter.toggleManualControl('keyboard', engine.clock.getElapsed());
        showToast(
          nowManual ? 'Manual control engaged — drive with WASD, Space to hop!' : 'Released control to Policy v1.',
          'info'
        );
        addLog(
          nowManual ? 'Control handoff: MANUAL: KEYBOARD engaged.' : 'Control handoff: AUTONOMOUS: POLICY v1 resumed.',
          'info'
        );
        handleUiSync();
        break;
      }
      case 'emergency_stop': {
        const snap = engine.arbiter.snapshot();
        if (snap.emergencyStop) {
          engine.arbiter.clearEmergencyStop();
          showToast('E-STOP released — actuators re-armed.', 'info');
        } else {
          engine.arbiter.triggerEmergencyStop();
          bridgeClient.sendCommand(0, 0, 0, true, performance.now() + 1000);
          showToast('EMERGENCY STOP ENGAGED: Actuators halted via Spacebar override.', 'warn');
        }
        handleUiSync();
        break;
      }
      case 'open_palette':
        setIsPaletteOpen((p) => !p);
        break;
      case 'toggle_panel':
        setLayoutSettings((s) => ({ ...s, showLogPanel: !s.showLogPanel }));
        break;
      case 'toggle_perf':
        setIsPerfPanelOpen((p) => !p);
        break;
      case 'cycle_quality':
        setQualityTier((prev) => {
          const tiers: QualityTier[] = ['low', 'medium', 'high', 'ultra'];
          const next = tiers[(tiers.indexOf(prev) + 1) % tiers.length];
          PerfProbe.getInstance().setTier(next);
          TransientRoboticsStore.getInstance().setPerformanceTier(
            next === 'high' || next === 'ultra' ? 'high' : next === 'medium' ? 'balanced' : 'low'
          );
          showToast(`Quality tier: ${next.toUpperCase()}`, 'info');
          return next;
        });
        break;
      case 'toggle_hud_legend':
        updateSettings({
          ...settings,
          display: { ...settings.display, showKeyLegend: !settings.display.showKeyLegend },
        });
        break;
      case 'open_shortcuts':
        setIsShortcutsOpen((p) => !p);
        break;
      case 'focus_log_filter': {
        const input = document.querySelector('input[placeholder*="Filter logs"]') as HTMLInputElement | null;
        input?.focus();
        break;
      }
      case 'capture_screenshot':
        void handleScreenshot();
        break;
      case 'restart_episode':
        setIsResultsOpen(false);
        setIsPauseMenuOpen(false);
        engine.resetEpisode(false);
        restoreViewportFocus();
        handleUiSync();
        showToast('Episode restarted [R]', 'info');
        break;
      case 'toggle_editor':
        setIsEditorOpen((p) => {
          const next = !p;
          if (next) setCameraMode('topdown');
          return next;
        });
        break;
      case 'pause_menu':
        setIsPauseMenuOpen((prev) => {
          const next = !prev;
          engine.clock.setPaused(next);
          return next;
        });
        handleUiSync();
        break;
      case 'camera_frame':
        setFrameTrigger((n) => n + 1);
        break;
      case 'camera_follow':
        setCameraMode('follow');
        break;
      case 'camera_orbit':
        setCameraMode('orbit');
        break;
      case 'camera_topdown':
        setCameraMode('topdown');
        break;
      case 'camera_fpv':
        setCameraMode('fpv');
        break;
      case 'camera_freefly':
        setCameraMode('freefly');
        break;
      case 'camera_cycle':
        setCameraMode((prev) => {
          const order: CameraMode[] = ['follow', 'orbit', 'topdown', 'fpv', 'freefly'];
          return order[(order.indexOf(prev) + 1) % order.length];
        });
        break;
    }
  };

  // Terrain Click Handler: Click-to-Move Waypoint OR Scenario Editor Brush/Boulder
  const handleTerrainClick = useCallback(
    (x: number, z: number, shiftKey: boolean, altKey: boolean) => {
      if (editorTool === 'brush_raise' || editorTool === 'brush_lower') {
        const snap = engine.terrain.snapshotHeights();
        undoStackRef.current = [...undoStackRef.current.slice(-19), snap];
        redoStackRef.current = [];
        setUndoDepth({ undo: undoStackRef.current.length, redo: 0 });

        const delta = editorTool === 'brush_raise' ? 0.35 : -0.35;
        const res = engine.terrain.applyBrush(x, z, 2.6, delta);
        if (res.applied) {
          engine.rebuildDebris();
          setTerrainVersion(res.version);
          showToast(`${editorTool === 'brush_raise' ? 'Raised' : 'Lowered'} lunar terrain at (${x.toFixed(1)}, ${z.toFixed(1)}).`, 'info');
        } else {
          showToast(res.reason || 'Terrain edit rejected.', 'warn');
        }
        return;
      }

      if (editorTool === 'boulder') {
        const cur = engine.getScenario();
        const nextObs = [
          ...cur.customObstacles,
          { id: `obs_${Date.now()}`, x: Number(x.toFixed(2)), z: Number(z.toFixed(2)), radius: 0.55, kind: 'boulder' as const },
        ];
        engine.applyScenario({ customObstacles: nextObs }, false);
        setTerrainVersion((v) => v + 1);
        showToast(`Placed obstacle at (${x.toFixed(1)}m, ${z.toFixed(1)}m).`, 'info');
        return;
      }

      // Default: Click-to-Move Waypoint Driving
      if (altKey) {
        engine.inputs.removeLastWaypoint();
        showToast('Removed last waypoint.', 'info');
        handleUiSync();
        return;
      }

      const curPos = engine.gait.getSnapshot();
      const check = engine.terrain.checkSegmentTraversability(curPos.posX, curPos.posZ, x, z, 28);
      engine.inputs.addWaypoint(x, z, shiftKey, check.reachable, check.maxSlopeDeg);
      engine.arbiter.takeManualControl('pointer', engine.clock.getElapsed());
      showToast(
        check.reachable
          ? `Waypoint set at (${x.toFixed(1)}m, ${z.toFixed(1)}m)${shiftKey ? ' (appended)' : ''}.`
          : `Steep slope warning (${check.maxSlopeDeg}°) along route to waypoint!`,
        check.reachable ? 'info' : 'warn'
      );
      handleUiSync();
    },
    [editorTool, engine, showToast, handleUiSync]
  );

  // Undo / Redo Terrain Brush
  const handleUndoTerrain = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    redoStackRef.current.push(engine.terrain.snapshotHeights());
    engine.terrain.restoreHeights(prev);
    engine.rebuildDebris();
    setTerrainVersion(engine.terrain.getVersion());
    setUndoDepth({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
  }, [engine]);

  const handleRedoTerrain = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(engine.terrain.snapshotHeights());
    engine.terrain.restoreHeights(next);
    engine.rebuildDebris();
    setTerrainVersion(engine.terrain.getVersion());
    setUndoDepth({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
  }, [engine]);

  // Share Scenario Link (#s=...)
  const handleShareScenario = useCallback(() => {
    const res = encodeScenarioToHash(engine.getScenario());
    if (!res.ok || !res.hash) {
      showToast(res.error || 'Could not encode scenario link.', 'warn');
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}${res.hash}`;
    window.history.replaceState(null, '', res.hash);
    navigator.clipboard?.writeText(url).catch(() => {});
    showToast(`Shareable scenario URL copied (${res.hash.length} bytes)!`, 'info');
  }, [engine, showToast]);

  // Export Deterministic Replay (.omni.json)
  const handleExportReplay = useCallback(() => {
    const replay = lastReplayRef.current || engine.recorder.exportReplay();
    const blob = new Blob([JSON.stringify(replay, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omni-kinetic-run-${replay.seed}-${replay.finalChecksum}.omni.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported deterministic replay (checksum ${replay.finalChecksum}).`, 'info');
  }, [engine, showToast]);

  // Import Replay (.omni.json)
  const handleImportReplay = useCallback(
    (rawText: string) => {
      const res = validateReplayJson(rawText);
      if (!res.ok || !res.replay) {
        showToast(res.error || 'Invalid replay file.', 'warn');
        return;
      }
      lastReplayRef.current = res.replay;
      engine.setGhostReplay(res.replay);
      engine.startReplay(res.replay);
      setTerrainVersion(engine.terrain.getVersion());
      showToast(`Playing verified replay (${res.replay.totalSteps} steps, checksum ${res.replay.finalChecksum}).`, 'info');
      handleUiSync();
    },
    [engine, showToast, handleUiSync]
  );

  // Export Dataset JSONL / CSV (Phase W9.3)
  const handleExportDataset = useCallback(
    (fmt: 'jsonl' | 'csv') => {
      const replay = engine.recorder.exportReplay();
      const text = fmt === 'jsonl' ? exportDatasetJsonl(replay) : exportDatasetCsv(replay);
      const blob = new Blob([text], { type: fmt === 'jsonl' ? 'application/x-ndjson' : 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `omni-kinetic-dataset-${replay.seed}.${fmt}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Exported ${replay.totalSteps} steps as ${fmt.toUpperCase()}.`, 'info');
    },
    [engine, showToast]
  );

  // Structure-Borne Vacuum Audio Synthesizer Toggle (Pack K)
  const toggleAudio = useCallback(() => {
    globalAudioSynthesizer.initialize();
    const next = !isAudioMuted;
    setIsAudioMuted(next);
    globalAudioSynthesizer.setMuted(next);
    showToast(next ? 'Vacuum structure-borne audio muted.' : 'Structure-borne audio enabled (WebAudio synthesis).', 'info');
  }, [isAudioMuted, showToast]);

  // Clip Recording Toggle
  const handleToggleClipRecord = useCallback(() => {
    const rec = clipRecorderRef.current;
    if (!rec || !canvasRef.current) return;
    if (rec.isRecording()) {
      rec.stop();
      setIsRecordingClip(false);
      showToast('WebM clip saved.', 'info');
    } else {
      const res = rec.start(canvasRef.current, {
        fps: 30,
        maxDurationSec: 30,
        onAutoStop: () => {
          setIsRecordingClip(false);
          showToast('30s WebM clip saved automatically.', 'info');
        },
      });
      if (res.ok) {
        setIsRecordingClip(true);
        showToast('Recording 30fps WebM clip (max 30s)...', 'info');
      } else {
        showToast(res.error || 'Clip recording failed.', 'warn');
      }
    }
  }, [showToast]);

  // Architect Prompt Stream (preserved from v1)
  const handlePromptSubmit = async (prompt: string) => {
    setIsStreamingArchitect(true);
    addLog(`[USER PROMPT] "${prompt}"`, 'info');
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
                [data.stage]: { ...prev[data.stage], status: data.status, durationMs: data.durationMs },
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
              addLog(`Architect complete. Task: "${data.payload.spec.taskName}".`, 'architect');
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Architect stream error: ${msg}`, 'error');
    } finally {
      setIsStreamingArchitect(false);
    }
  };

  const handleApproveJob = useCallback(() => {
    if (architectOutput) {
      const approvedSpec = architectOutput.spec;
      setEnvSpec(approvedSpec);
      engine.applyScenario(
        {
          name: approvedSpec.taskName,
          gravity: Math.abs(approvedSpec.gravity?.[1] ?? 1.62),
          seed: approvedSpec.terrain?.seed ?? 42,
          rockCount: approvedSpec.debris?.count ?? 1400,
        },
        true
      );
      setTerrainVersion(engine.terrain.getVersion());
      engine.resetEpisode(true);
      addLog(`[SPEC APPROVED] Activated "${approvedSpec.taskName}" on local deterministic engine.`, 'architect');
    }
  }, [architectOutput, engine, addLog]);

  const handleRejectJob = useCallback(() => {
    setArchitectOutput(null);
    addLog('Specification rejected.', 'warn');
  }, [addLog]);

  const handleExecutePlan = useCallback((plan: NemotronTaskPlan) => {
    setActivePlan(plan);
    const waypoints = plan.waypoints.map((w) => ({
      id: `wp_${w.id}`,
      x: typeof w.x === 'number' ? w.x : w.position[0],
      z: typeof w.z === 'number' ? w.z : w.position[2],
      targetSpeed: w.target_speed,
      tolerance: w.arrival_tolerance,
    }));
    engine.inputs.clearWaypoints();
    engine.setAutonomousPlan(waypoints, {
      maxSpeed: plan.safety_constraints.max_speed ?? plan.safety_constraints.max_linear_vel,
      maxTiltDeg: plan.safety_constraints.max_tilt_deg ?? plan.safety_constraints.max_pitch_deg,
    });
    engine.arbiter.releaseToPolicy();
    showToast(`Executing Nemotron Plan: ${plan.task_name} (${waypoints.length} waypoints)`, 'info');
    handleUiSync();
  }, [engine, showToast, handleUiSync]);

  const handleReplayEpisode = useCallback((ep: RecordedDemonstrationEpisode) => {
    if (!ep.frames || ep.frames.length === 0) {
      showToast('Recorded episode contains no trajectory frames.', 'warn');
      return;
    }
    const waypoints: Array<{ id: string; x: number; z: number; targetSpeed?: number; tolerance?: number }> = [];
    let lastX = ep.frames[0]!.observation.pose[0];
    let lastZ = ep.frames[0]!.observation.pose[2];
    for (let i = 0; i < ep.frames.length; i++) {
      const f = ep.frames[i]!;
      const [fx, , fz] = f.observation.pose;
      const dist = Math.hypot(fx - lastX, fz - lastZ);
      if (i === ep.frames.length - 1 || dist >= 0.45) {
        const speed = Math.max(0.35, Math.min(1.5, Math.abs(f.action.throttle ?? f.action.linear_vel_cmd[0]) || 0.75));
        waypoints.push({
          id: `replay_wp_${i}`,
          x: fx,
          z: fz,
          targetSpeed: speed,
          tolerance: 0.4,
        });
        lastX = fx;
        lastZ = fz;
      }
    }
    if (waypoints.length === 0) {
      const f0 = ep.frames[0]!;
      waypoints.push({
        id: 'replay_wp_0',
        x: f0.observation.pose[0],
        z: f0.observation.pose[2],
        targetSpeed: 0.6,
        tolerance: 0.4,
      });
    }
    engine.resetEpisode(true);
    engine.inputs.clearWaypoints();
    engine.setAutonomousPlan(waypoints);
    engine.arbiter.releaseToPolicy();
    showToast(`Replaying ${ep.meta.name} (${waypoints.length} waypoints)`, 'info');
    handleUiSync();
  }, [engine, showToast, handleUiSync]);

  const handleClearPlan = useCallback(() => {
    setActivePlan(null);
    engine.inputs.clearWaypoints();
    engine.clearAutonomousPlan();
    showToast('Autonomous plan cleared.', 'info');
    handleUiSync();
  }, [engine, showToast, handleUiSync]);

  const handleProfileChange = useCallback((id: RobotProfileId) => {
    const prof = engine.setRobotProfile(id);
    setActiveProfileId(id);
    showToast(`Switched Hardware Profile: ${prof.name} (${prof.massKg}kg, ${prof.maxTorqueNm}N·m)`, 'info');
    addLog(`Robot profile updated -> ${prof.name} [${prof.locomotionType}, maxTorque=${prof.maxTorqueNm}N*m]`, 'info');
    handleUiSync();
  }, [engine, showToast, addLog, handleUiSync]);

  const handleStageBenchmarkScenario = useCallback((scenarioId: BenchmarkScenarioId) => {
    const spec = BENCHMARK_SCENARIOS[scenarioId];
    engine.applyScenario(
      {
        name: spec.name,
        seed: spec.baseSeed,
        gravity: spec.gravityRange[0],
        roughness: spec.roughness,
        craterCount: spec.craterCount,
        rockCount: spec.rockCount,
        startPos: spec.startPos,
        startHeading: spec.startHeading,
        episodeLength: spec.timeLimitSec,
      },
      true
    );
    engine.applyDomainPhysics({ frictionCoeff: (spec.frictionRange[0] + spec.frictionRange[1]) * 0.5 });
    setTerrainVersion(engine.terrain.getVersion());
    engine.resetEpisode(true);
    engine.setAutonomousPlan(spec.waypoints);
    engine.arbiter.releaseToPolicy();
    showToast(`Staged Benchmark Scenario: ${spec.name}`, 'info');
    handleUiSync();
  }, [engine, showToast, handleUiSync]);

  // Read unified snapshots for current render
  const clockSnap = engine.getClockSnapshot();
  const arbiterSnap = engine.getArbiterSnapshot();
  const missionSnap = engine.getMissionSnapshot();
  const activeMission = engine.missionRuntime.getMission();
  const scenario = engine.getScenario();
  const runModeDesc = describeRunMode(runMode);
  const inputViz = engine.getInputVisualizer();
  const chartHistory = engine.getChartHistory();
  const latestChart = chartHistory[chartHistory.length - 1];
  const showTouch =
    settings.controls.showTouchControls === 'always' ||
    (settings.controls.showTouchControls === 'auto' && isCoarsePointer);

  const handleLogWidthChange = (newWidth: number) => {
    setLogPaneWidth(newWidth);
    try { localStorage.setItem('omni_log_width', String(newWidth)); } catch {}
  };

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden flex flex-col bg-charcoal text-cream ${
        settings.accessibility.highContrast ? 'contrast-125' : ''
      } ${settings.accessibility.largeText ? 'text-[15px]' : ''} ${
        collisionAlert && !settings.accessibility.reducedMotion ? 'animate-brick-impact' : ''
      }`}
    >
      {/* Top Workstation Header (Single-Row Flex Layout, Zero Overlap Lock-In) */}
      <header className="analog-glass z-30 h-12 flex items-center justify-between px-3 md:px-4 border-b border-cream/10 select-none m-2 mb-0 whitespace-nowrap flex-nowrap min-w-0 overflow-hidden gap-2">
        {/* Left: Branding & Active Scenario */}
        <div className="flex items-center gap-2 min-w-0 flex-1 max-w-[42%]">
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-sm bg-sage" />
            <h1 className="font-mono text-xs uppercase tracking-wider font-bold text-cream">
              Omni-Kinetic
            </h1>
          </div>
          <span className="text-cream-dim/30 shrink-0">/</span>
          <span
            className="text-xs font-mono text-cream-dim truncate min-w-0 max-w-[180px] lg:max-w-xs shrink"
            title={scenario.name}
          >
            {scenario.name}
          </span>
          <div
            className={`hidden lg:flex items-center space-x-1.5 px-2 py-0.5 rounded border text-[11px] font-mono shrink-0 ${
              arbiterSnap.isManual
                ? 'bg-sage/20 border-sage text-cream font-bold'
                : 'bg-charcoal border-cream/10 text-cream-dim'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${arbiterSnap.isManual ? 'bg-sage animate-pulse' : 'bg-cream-dim'}`} />
            <span>{arbiterSnap.isManual ? arbiterSnap.modeLabel : `Policy v${iteration}`}</span>
          </div>
          {collectedEpisodes.length > 0 && (
            <button
              type="button"
              onClick={() => setIsDatasetPanelOpen(true)}
              className="px-2 py-0.5 rounded bg-sage/20 border border-sage/40 text-sage hover:bg-sage/30 text-xs font-mono flex items-center space-x-1 shrink-0"
            >
              <Layers className="w-3 h-3" />
              <span>Dataset ({collectedEpisodes.length})</span>
            </button>
          )}
        </div>

        {/* Center: E-STOP, Mode Selector, Task Prompt, and CV Cam */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Prominent E-STOP Button */}
          <button
            type="button"
            onClick={() => actionHandlerRef.current('emergency_stop')}
            title="Emergency Stop: Halt all actuators immediately [Spacebar]"
            className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider transition-all border ${
              arbiterSnap.emergencyStop
                ? 'bg-brick border-brick text-cream animate-pulse shadow-lg shadow-brick/40'
                : 'bg-brick/20 hover:bg-brick/30 border-brick/40 text-cream hover:border-brick/70'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-brick" />
            <span>{arbiterSnap.emergencyStop ? 'E-STOP ENGAGED' : 'E-STOP'}</span>
            <kbd className="bg-charcoal-deep px-1.5 py-0.5 rounded text-[10px] text-cream-dim border border-cream/10">
              SPACE
            </kbd>
          </button>

          {/* Robotics Mode Switcher */}
          <div className="hidden md:flex items-center space-x-1 border border-cream/15 rounded bg-charcoal p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => {
                engine.setBehaviorCloningEnabled(false);
                if (!arbiterSnap.isManual || arbiterSnap.activeSource !== 'keyboard') {
                  engine.arbiter.takeManualControl('keyboard', engine.clock.getElapsed());
                  handleUiSync();
                }
              }}
              title="Drive robot with WASD keyboard controls [T]"
              className={`px-2 py-0.5 rounded font-bold uppercase transition-colors ${
                arbiterSnap.isManual && arbiterSnap.activeSource === 'keyboard'
                  ? 'bg-sage text-charcoal-deep shadow-sm'
                  : 'text-cream-dim hover:text-cream'
              }`}
            >
              Manual <span className="hidden lg:inline">(WASD)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                engine.setBehaviorCloningEnabled(false);
                setIsTeleopOpen(true);
                engine.arbiter.takeManualControl('cv', engine.clock.getElapsed());
                handleUiSync();
              }}
              title="Teleoperate robot using MediaPipe vision hand gestures"
              className={`px-2 py-0.5 rounded font-bold uppercase transition-colors ${
                arbiterSnap.activeSource === 'cv'
                  ? 'bg-sage text-charcoal-deep shadow-sm'
                  : 'text-cream-dim hover:text-cream'
              }`}
            >
              Gesture <span className="hidden xl:inline">(MediaPipe)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                engine.setBehaviorCloningEnabled(false);
                engine.arbiter.releaseToPolicy();
                handleUiSync();
              }}
              title="Autonomous navigation using NVIDIA Nemotron trajectory waypoints"
              className={`px-2 py-0.5 rounded font-bold uppercase transition-colors ${
                !arbiterSnap.isManual && !engine.isBehaviorCloningEnabled()
                  ? 'bg-sage text-charcoal-deep shadow-sm'
                  : 'text-cream-dim hover:text-cream'
              }`}
            >
              Autonomous <span className="hidden xl:inline">(Nemotron)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!globalImitationPolicy.isTrained()) {
                  globalImitationPolicy.fit(globalEpisodeRecorder.getEpisodes(), 5);
                }
                if (!globalImitationPolicy.isTrained()) {
                  showToast('Record & tag at least 1 Success episode in Dataset tab to run Policy (BC).', 'warn');
                  return;
                }
                engine.setBehaviorCloningEnabled(true);
                engine.arbiter.releaseToPolicy();
                showToast(
                  `Engaged Policy (BC) trained on ${globalImitationPolicy.getStats().episodeCount} demo(s).`,
                  'info'
                );
                handleUiSync();
              }}
              title="Closed-loop In-Browser Behavior Cloning Imitation Policy"
              className={`px-2 py-0.5 rounded font-bold uppercase transition-colors ${
                !arbiterSnap.isManual && engine.isBehaviorCloningEnabled()
                  ? 'bg-sage text-charcoal-deep shadow-sm'
                  : 'text-cream-dim hover:text-cream'
              }`}
            >
              Policy <span className="hidden xl:inline">(BC)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            title="Open Task Prompt [Ctrl+K]"
            className="flex items-center space-x-1.5 bg-charcoal hover:bg-charcoal-light border border-cream/15 px-2.5 py-1 rounded text-xs font-mono text-cream transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-sage" />
            <span className="hidden sm:inline">Prompt</span>
            <kbd className="bg-charcoal-deep px-1.5 py-0.5 rounded text-[10px] text-cream-dim border border-cream/10">
              Ctrl+K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setIsTeleopOpen((p) => !p)}
            title="Webcam CV Hand Teleoperation"
            aria-label="Toggle CV Webcam Teleop"
            className={`p-1.5 rounded border text-xs font-mono transition-colors ${
              isTeleopOpen
                ? 'bg-brick border-brick text-cream'
                : 'bg-charcoal hover:bg-charcoal-light border-cream/15 text-cream-dim hover:text-cream'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
          </button>

          {/* Pack Expansion Chips */}
          {isFeatureEnabled('droid_workshop') && (
            <button
              type="button"
              onClick={() => setIsWorkshopOpen(true)}
              title="Droid Workshop & Morphology [Pack C]"
              className="hidden lg:flex items-center space-x-1 px-2 py-1 rounded bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream-dim hover:text-cream text-xs font-mono"
            >
              <Wrench className="w-3.5 h-3.5 text-sage" />
              <span>Workshop</span>
            </button>
          )}

          {isFeatureEnabled('comms_delay') && (
            <button
              type="button"
              onClick={() => setIsCommsDelayOpen(true)}
              title="Earth-Moon Comms Delay [Pack E]"
              className={`hidden lg:flex items-center space-x-1 px-2 py-1 rounded border text-xs font-mono ${
                commsPreset !== 'off'
                  ? 'bg-sage/20 border-sage text-sage font-bold'
                  : 'bg-charcoal hover:bg-charcoal-light border-cream/15 text-cream-dim hover:text-cream'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Comms{commsPreset !== 'off' ? ' (Lag)' : ''}</span>
            </button>
          )}

          {isFeatureEnabled('sim_to_real') && (
            <button
              type="button"
              onClick={() => setIsSimToRealOpen(true)}
              title="Sim-to-Real Toolkit & Evaluator [Pack D]"
              className="hidden xl:flex items-center space-x-1 px-2 py-1 rounded bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream-dim hover:text-cream text-xs font-mono"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-sage" />
              <span>Sim2Real</span>
            </button>
          )}

          {isFeatureEnabled('daily_challenge') && (
            <button
              type="button"
              onClick={() => setIsDailyChallengeOpen(true)}
              title="Daily Challenge & Achievements [Pack I]"
              className="hidden xl:flex items-center space-x-1 px-2 py-1 rounded bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream-dim hover:text-cream text-xs font-mono"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Daily</span>
            </button>
          )}

          {isFeatureEnabled('audio') && (
            <button
              type="button"
              onClick={toggleAudio}
              title={isAudioMuted ? 'Unmute Structure-Borne Audio [Pack K]' : 'Mute Audio'}
              aria-label={isAudioMuted ? 'Unmute Audio' : 'Mute Audio'}
              className={`p-1.5 rounded border text-xs font-mono transition-colors ${
                !isAudioMuted
                  ? 'bg-sage/20 border-sage text-sage font-bold'
                  : 'bg-charcoal hover:bg-charcoal-light border-cream/15 text-cream-dim hover:text-cream'
              }`}
            >
              {!isAudioMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Right: Unified Run-Mode Chip, Honest FPS, Token Meter, Shortcuts, Layout */}
        <div className="flex items-center gap-1.5 text-xs font-mono shrink-0">
          <button
            type="button"
            onClick={() =>
              setRunMode((m) =>
                m === 'local-simulation' ? 'cloud-stream' : m === 'cloud-stream' ? 'demo-fixtures' : 'local-simulation'
              )
            }
            title={runModeDesc.tooltip}
            className={`px-2 py-0.5 rounded border flex items-center space-x-1.5 transition-colors text-[11px] ${
              runMode === 'cloud-stream'
                ? 'bg-sage/20 border-sage/50 text-sage'
                : runMode === 'demo-fixtures'
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                : 'bg-cream/10 border-cream/20 text-cream'
            }`}
          >
            <Cpu className="w-3 h-3" />
            <span className="hidden xl:inline">{runModeDesc.badgeLabel}</span>
            <span className="xl:hidden">{runModeDesc.shortLabel}</span>
          </button>

          <FpsBadge tier={qualityTier} onTogglePanel={() => setIsPerfPanelOpen((p) => !p)} />

          {/* Performance Tier Toggle */}
          <div className="hidden sm:flex items-center space-x-1 border border-cream/15 rounded bg-charcoal p-0.5 text-[10px]">
            {(['high', 'medium', 'low'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setQualityTier(t);
                  PerfProbe.getInstance().setTier(t);
                  TransientRoboticsStore.getInstance().setPerformanceTier(
                    t === 'high' ? 'high' : t === 'medium' ? 'balanced' : 'low'
                  );
                  showToast(`Tier: ${t === 'medium' ? 'BALANCED' : t.toUpperCase()}`, 'info');
                }}
                className={`px-1.5 py-0.5 rounded font-bold uppercase transition-colors ${
                  qualityTier === t ? 'bg-sage text-charcoal-deep' : 'text-cream-dim hover:text-cream'
                }`}
              >
                {t === 'medium' ? 'BALANCED' : t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Workbench Sidebar Toggles */}
          <button
            type="button"
            onClick={() => setLayoutSettings((s) => ({ ...s, showLogPanel: !s.showLogPanel }))}
            title="Toggle Left Workbench (Telemetry & Physics)"
            className={`px-2 py-0.5 rounded border text-[11px] font-mono transition-colors ${
              layoutSettings.showLogPanel
                ? 'bg-sage/20 border-sage text-sage font-bold'
                : 'bg-charcoal hover:bg-charcoal-light border-cream/15 text-cream-dim hover:text-cream'
            }`}
          >
            Left WB
          </button>
          <button
            type="button"
            onClick={() => setShowRightSidebar((p) => !p)}
            title="Toggle Right Workbench (Planner & Dataset)"
            className={`hidden lg:block px-2 py-0.5 rounded border text-[11px] font-mono transition-colors ${
              showRightSidebar
                ? 'bg-sage/20 border-sage text-sage font-bold'
                : 'bg-charcoal hover:bg-charcoal-light border-cream/15 text-cream-dim hover:text-cream'
            }`}
          >
            Right WB
          </button>

          <button
            type="button"
            onClick={() => setIsTokenSpendOpen(true)}
            title="Inspect token & cost accounting"
            className="hidden md:flex items-center space-x-1.5 bg-charcoal hover:bg-charcoal-light px-2 py-0.5 rounded border border-cream/10 text-cream-dim hover:text-cream text-[11px]"
          >
            <Coins className="w-3 h-3 text-sage" />
            <span>
              {tokenSpend.promptTokens + tokenSpend.completionTokens === 0
                ? '0 tok · $0.0000'
                : `${(tokenSpend.promptTokens + tokenSpend.completionTokens).toLocaleString()} tok · $${tokenSpend.costUsd.toFixed(4)}`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsShortcutsOpen(true)}
            title="Controls & Shortcuts [?]"
            className="p-1 rounded bg-charcoal hover:bg-charcoal-light border border-cream/10 text-cream-dim hover:text-cream text-[11px] font-mono px-2"
          >
            ?
          </button>

          <LayoutMenu
            settings={layoutSettings}
            onUpdateSettings={(newS) => setLayoutSettings((s) => ({ ...s, ...newS }))}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            onOpenStatus={() => window.open('/status', '_blank')}
          />
        </div>
      </header>

      {/* Stage Rail when Architect is active */}
      {(isStreamingArchitect || architectOutput) && (
        <div className="mx-2 mt-1">
          <StageRail stages={stages} activeStage={activeStageKey} />
        </div>
      )}

      {/* Shared Scenario Confirmation Banner (#s=...) */}
      {pendingSharedScenario && (
        <div className="mx-2 mt-1.5 px-4 py-2 rounded-xl bg-sage/20 border border-sage flex items-center justify-between font-mono text-xs">
          <span>
            Shared scenario detected: <strong>{pendingSharedScenario.name}</strong> (seed {pendingSharedScenario.seed}, g={pendingSharedScenario.gravity} m/s²). Apply it?
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                engine.applyScenario(pendingSharedScenario, true);
                setTerrainVersion(engine.terrain.getVersion());
                engine.resetEpisode(true);
                setPendingSharedScenario(null);
                showToast(`Loaded shared scenario "${pendingSharedScenario.name}".`, 'info');
              }}
              className="px-3 py-1 rounded bg-sage text-cream font-bold"
            >
              Apply Scenario
            </button>
            <button
              type="button"
              onClick={() => setPendingSharedScenario(null)}
              className="px-2.5 py-1 rounded bg-charcoal border border-hairline text-cream-dim"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Studio Split Viewport */}
      <div className="relative flex-1 flex overflow-hidden p-2 pt-1 gap-2">
        {/* Left Resizable Robotics & Analysis Workbench Pane */}
        {layoutSettings.showLogPanel && (
          <aside
            style={{ width: `${logPaneWidth}px` }}
            className="flex flex-col shrink-0 gap-1.5 overflow-hidden transition-all duration-150 h-full"
          >
            {/* Left Workbench Tab Selector */}
            <div className="flex items-center space-x-1 p-1 bg-charcoal-deep rounded-lg border border-cream/10 text-[10px] font-mono shrink-0">
              <button
                type="button"
                onClick={() => setLeftWorkbenchTab('telemetry')}
                className={`flex-1 py-1 px-1.5 rounded font-bold uppercase transition-colors text-center ${
                  leftWorkbenchTab === 'telemetry'
                    ? 'bg-sage text-charcoal-deep shadow-sm'
                    : 'text-cream-dim hover:text-cream'
                }`}
              >
                Telemetry
              </button>
              <button
                type="button"
                onClick={() => setLeftWorkbenchTab('physics')}
                className={`flex-1 py-1 px-1.5 rounded font-bold uppercase transition-colors text-center ${
                  leftWorkbenchTab === 'physics'
                    ? 'bg-sage text-charcoal-deep shadow-sm'
                    : 'text-cream-dim hover:text-cream'
                }`}
              >
                Physics
              </button>
              <button
                type="button"
                onClick={() => setLeftWorkbenchTab('architect')}
                className={`flex-1 py-1 px-1.5 rounded font-bold uppercase transition-colors text-center ${
                  leftWorkbenchTab === 'architect'
                    ? 'bg-sage text-charcoal-deep shadow-sm'
                    : 'text-cream-dim hover:text-cream'
                }`}
              >
                Architect
              </button>
            </div>

            {leftWorkbenchTab === 'telemetry' ? (
              <RoboticsTelemetryPanel
                telemetryStore={TelemetryStore.getInstance()}
                onEmergencyStop={() => actionHandlerRef.current('emergency_stop')}
                onClearEmergencyStop={() => {
                  engine.arbiter.clearEmergencyStop();
                  handleUiSync();
                }}
                eStopActive={arbiterSnap.emergencyStop}
                controlLatencyMs={engine.getLastInputLatencyMs()}
                webglFps={PerfProbe.getInstance().getMetrics().fps || 60}
                robotProfile={getRobotProfile(activeProfileId)}
                gravityMps2={scenario.gravity}
                onProfileChange={handleProfileChange}
                className="flex-1"
              />
            ) : leftWorkbenchTab === 'physics' ? (
              <PhysicsDomainPanel
                engine={engine}
                onDomainChange={(d) => {
                  engine.applyDomainPhysics(d);
                  handleUiSync();
                }}
                className="flex-1"
              />
            ) : (
              <AnalogLogPane
                logs={logs}
                currentStage={currentStage}
                architectOutput={architectOutput}
                currentSpec={envSpec}
                activeJobStatus={jobStatus}
                clockSnapshot={clockSnap}
                runModeDescription={`${runModeDesc.consolePrefix} · ${arbiterSnap.modeLabel}`}
                chartHistory={chartHistory}
                safetyEvents={engine.getSafetyEvents()}
                onExportDatasetJsonl={() => handleExportDataset('jsonl')}
                onExportDatasetCsv={() => handleExportDataset('csv')}
                onApprove={handleApproveJob}
                onReject={handleRejectJob}
                onUpdateSpec={(spec) => setEnvSpec(spec)}
                onOpenPrompt={() => setIsPaletteOpen(true)}
                isStreaming={isStreamingArchitect}
                isOpen={true}
                onToggleOpen={() => setLayoutSettings((s) => ({ ...s, showLogPanel: false }))}
                width={logPaneWidth}
                onWidthChange={handleLogWidthChange}
              />
            )}
          </aside>
        )}

        {/* Center 3D Spatial Viewport */}
        <main className="relative flex-1 h-full rounded-xl overflow-hidden border border-cream/10 shadow-2xl">
          <ThreeViewer
            engine={engine}
            envSpec={envSpec}
            cameraMode={cameraMode}
            qualityTier={qualityTier}
            fov={settings.camera.fov}
            sunElevationDeg={scenario.sunElevationDeg}
            sunAzimuthDeg={scenario.sunAzimuthDeg}
            showColliderDebug={layoutSettings.showColliderDebug}
            showOverlays={layoutSettings.showOverlays}
            showRadar={layoutSettings.showRadar}
            radarSize={settings.display.radarSize}
            onRadarSizeChange={(sz) => updateSettings({ ...settings, display: { ...settings.display, radarSize: sz } })}
            showDustParticles={layoutSettings.showDustParticles}
            showGhostComparison={engine.hasGhost() || iteration >= 2}
            showContours={settings.display.showContours}
            showTrail={settings.display.showTrail}
            pipEnabled={settings.camera.pipEnabled}
            sensors={sensors}
            cameraShakeEnabled={settings.camera.shakeEnabled}
            autoRecenterOrbit={settings.camera.autoRecenterOrbit}
            reducedMotion={settings.accessibility.reducedMotion}
            colorblindSafe={settings.display.colorblindSafe}
            editorTool={editorTool}
            terrainVersion={terrainVersion}
            frameTrigger={frameTrigger}
            missionMarkers={activeMission.markers}
            completedMarkerIds={missionSnap.completedIds}
            waypoints={engine.inputs.getWaypoints()}
            onTerrainClick={handleTerrainClick}
            onPointerDriveUpdate={(active, x, z) => {
              engine.inputs.pointerDrive.active = active;
              engine.inputs.pointerDrive.targetX = x;
              engine.inputs.pointerDrive.targetZ = z;
            }}
            onCanvasReady={(c) => { canvasRef.current = c; }}
            onUiSync={handleUiSync}
            onBoundaryWarning={(st, dist) => showToast(`Arena ${st} edge (${dist.toFixed(1)}m) — safety layer active.`, 'warn')}
            onToggleSensor={(k) => setSensors((prev) => ({ ...prev, [k]: !prev[k] }))}
            onTogglePip={() =>
              updateSettings({ ...settings, camera: { ...settings.camera, pipEnabled: !settings.camera.pipEnabled } })
            }
          />

          {/* Top-Center Hardware Profile / Digital Twin Mode Indicator */}
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2">
            <div className="analog-glass px-3 py-1 text-[10px] font-mono text-cream flex items-center space-x-2 border border-cream/15 shadow-lg">
              <span className="text-cream-dim uppercase">Platform:</span>
              <span className="font-bold text-sage">{getRobotProfile(activeProfileId).shortLabel}</span>
              {digitalTwinEnabled && (
                <span className="px-1.5 py-0.5 rounded bg-amber-400/20 border border-amber-400/40 text-amber-300 font-bold uppercase animate-pulse">
                  HIL Digital Twin
                </span>
              )}
              {engine.getAutonomousPlanState().active && (
                <span className="px-1.5 py-0.5 rounded bg-sage/20 border border-sage/40 text-sage font-bold uppercase">
                  Nemotron Auto ({engine.getAutonomousPlanState().currentIndex + 1}/{engine.getAutonomousPlanState().totalWaypoints})
                </span>
              )}
            </div>
          </div>

          {/* Accessible Rate-Limited Toast Banner */}
          {toast && (
            <div
              role="status"
              aria-live="polite"
              className={`pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-full backdrop-blur-md border font-mono text-[11px] shadow-2xl flex items-center space-x-2 ${
                toast.level === 'warn'
                  ? 'bg-brick/25 border-brick/60 text-cream'
                  : 'bg-charcoal-deep/90 border-sage/60 text-cream'
              }`}
            >
              {toast.level === 'warn' && <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />}
              <span>{toast.text}</span>
            </div>
          )}

          {/* Interactive Control HUD + Touch Dual Virtual Joystick + Coach Marks */}
          {settings.display.showControlHud && (
            <ControlHUD
              arbiter={arbiterSnap}
              speed={latestChart?.speed ?? 0}
              cmdSpeed={latestChart?.cmdSpeed ?? 0}
              gaitPattern={engine.gait.getSnapshot().phase.pattern}
              gaitOverride={engine.inputs.getGaitOverride()}
              froudeNumber={engine.gait.getParams().froudeNumber}
              gravity={scenario.gravity}
              energyJoules={latestChart?.energy ?? 0}
              inputLatencyMs={engine.getLastInputLatencyMs()}
              showDebugLatency={showDebugLatency}
              cameraMode={cameraMode}
              pipEnabled={settings.camera.pipEnabled}
              sensors={sensors}
              showLegend={settings.display.showKeyLegend}
              showVisualizer={settings.display.showInputVisualizer}
              showTouchControls={showTouch}
              showCoachMarks={showCoachMarks}
              isReplay={engine.isReplayActive()}
              isRecordingClip={isRecordingClip}
              clipSupported={clipSupported}
              visualizer={inputViz}
              touchState={engine.inputs.touch}
              onToggleManual={() => actionHandlerRef.current('toggle_control')}
              onEmergencyStop={() => actionHandlerRef.current('emergency_stop')}
              onGaitOverride={(g: GaitMode) => { engine.inputs.setGaitOverride(g); handleUiSync(); }}
              onCameraMode={(m) => setCameraMode(m)}
              onFrameCamera={() => actionHandlerRef.current('camera_frame')}
              onTogglePip={() =>
                updateSettings({ ...settings, camera: { ...settings.camera, pipEnabled: !settings.camera.pipEnabled } })
              }
              onToggleSensor={(k) => setSensors((prev) => ({ ...prev, [k]: !prev[k] }))}
              onToggleLegend={() => actionHandlerRef.current('toggle_hud_legend')}
              onDismissCoach={(dontShow) => {
                setShowCoachMarks(false);
                if (dontShow) setCoachDismissed(true);
              }}
              onOpenMissions={() => setIsMissionsOpen(true)}
              onOpenEditor={() => setIsEditorOpen((p) => !p)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onScreenshot={() => void handleScreenshot()}
              onToggleClipRecord={handleToggleClipRecord}
              onShareScenario={handleShareScenario}
              onTakeOverReplay={() => {
                engine.takeOverFromReplay();
                showToast('Took manual control from replay branch!', 'info');
                handleUiSync();
              }}
            />
          )}

          {/* Bottom Unified Playback & Scrubber Bar (Reads strictly from single SimClock — R-01 fixed!) */}
          <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 analog-glass-elevated px-3.5 py-1.5 flex items-center space-x-3 font-mono text-xs z-20 max-w-[96%] overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                engine.clock.togglePaused();
                handleUiSync();
              }}
              className="p-1 rounded bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream"
              title="Play / Pause Simulation"
              aria-label={clockSnap.paused ? 'Resume Simulation' : 'Pause Simulation'}
            >
              {clockSnap.paused ? <Play className="w-3.5 h-3.5 text-sage" /> : <Pause className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                engine.clock.setPaused(true);
                engine.seekToStep(Math.max(0, clockSnap.step - 6));
                handleUiSync();
              }}
              className="p-1 rounded hover:bg-charcoal text-cream-dim hover:text-cream"
              title="Step Backward (-0.1s)"
              aria-label="Step Backward"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                engine.clock.setPaused(true);
                engine.executeFixedStep(clockSnap.step, engine.clock.fixedDt);
                engine.clock.seekToStep(clockSnap.step + 1);
                handleUiSync();
              }}
              className="p-1 rounded hover:bg-charcoal text-cream-dim hover:text-cream"
              title="Step Forward (+1 tick)"
              aria-label="Step Forward"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                engine.resetEpisode(false);
                handleUiSync();
              }}
              className="p-1 rounded hover:bg-charcoal text-cream-dim hover:text-cream"
              title="Restart Episode"
              aria-label="Restart Episode"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Unified SimClock Progress Scrubber */}
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-cream tabular-nums whitespace-nowrap" data-testid="bottom-progress-text">
                {clockSnap.timeDisplay}
              </span>
              <input
                type="range"
                aria-label="Episode timeline scrubber"
                min={0}
                max={Math.round(clockSnap.episodeLength * 60)}
                value={clockSnap.step}
                onChange={(e) => {
                  const targetStep = parseInt(e.target.value, 10);
                  engine.clock.setPaused(true);
                  engine.seekToStep(targetStep);
                  handleUiSync();
                }}
                className="w-28 accent-sage cursor-pointer"
              />
            </div>

            {/* Segmented Speed Selector (0.25x .. 4x) */}
            <div className="flex items-center bg-charcoal rounded p-0.5 border border-cream/10 text-[9px]">
              {SPEED_PRESETS.map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => {
                    engine.clock.setSpeedMultiplier(spd);
                    handleUiSync();
                  }}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    Math.abs(clockSnap.speedMultiplier - spd) < 0.01
                      ? 'bg-sage text-cream font-bold'
                      : 'text-cream-dim hover:text-cream'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>

            {/* Screenshot Capture Button (Task 9) */}
            <button
              type="button"
              onClick={() => void handleScreenshot()}
              className="p-1 rounded hover:bg-charcoal text-cream-dim hover:text-cream ml-0.5 border border-cream/10"
              title="Capture Screenshot (F12)"
              aria-label="Capture Screenshot"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
        </main>

        {/* Right Robotics Workbench Panel (Nemotron Planner, Benchmark Suite, HIL Bridge, Dataset) */}
        {showRightSidebar && (
          <aside
            style={{ width: `${rightSidebarWidth}px` }}
            className="hidden lg:flex flex-col shrink-0 gap-1.5 overflow-hidden transition-all duration-150 h-full"
          >
            {/* Right Tab Switch Header */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-charcoal-deep rounded-lg border border-cream/10 text-[9px] font-mono shrink-0">
              {([
                { id: 'planner', label: 'Planner' },
                { id: 'benchmark', label: 'Benchmark' },
                { id: 'bridge', label: 'HIL Bridge' },
                { id: 'dataset', label: 'Dataset' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRightWorkbenchTab(tab.id)}
                  className={`py-1 px-1 rounded font-bold uppercase transition-colors text-center truncate ${
                    rightWorkbenchTab === tab.id
                      ? 'bg-sage text-charcoal-deep shadow-sm'
                      : 'text-cream-dim hover:text-cream'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {rightWorkbenchTab === 'planner' ? (
              <NemotronPlannerPanel
                currentPose={
                  TelemetryStore.getInstance().getLatestFrame()?.bodies?.[0]?.pos ?? [0, 0.44, 0]
                }
                onExecutePlan={handleExecutePlan}
                onClearPlan={handleClearPlan}
                activePlan={activePlan}
                isExecuting={engine.getAutonomousPlanState().active || engine.inputs.getWaypoints().length > 0}
                className="flex-1"
              />
            ) : rightWorkbenchTab === 'benchmark' ? (
              <BenchmarkPanel
                profileId={activeProfileId}
                activePlan={activePlan}
                onPreviewScenario={handleStageBenchmarkScenario}
                className="flex-1"
              />
            ) : rightWorkbenchTab === 'bridge' ? (
              <HardwareBridgePanel
                bridgeClient={bridgeClient}
                digitalTwinEnabled={digitalTwinEnabled}
                onToggleDigitalTwin={(en) => {
                  setDigitalTwinEnabled(en);
                  engine.setDigitalTwinEnabled(en);
                  showToast(
                    en ? 'Digital Twin Mode ACTIVE — 3D robot driven by inbound WebSocket pose' : 'Digital Twin Mode OFF — local physics active',
                    'info'
                  );
                }}
                eStopActive={arbiterSnap.emergencyStop}
                robotPose={TelemetryStore.getInstance().getLatestFrame()?.bodies?.[0]?.pos ?? [0, 0.44, 0]}
                robotYaw={0}
                className="flex-1"
              />
            ) : (
              <DatasetRecorderPanel
                currentSource={
                  arbiterSnap.activeSource === 'cv'
                    ? 'gesture'
                    : arbiterSnap.activeSource === 'keyboard'
                    ? 'keyboard'
                    : engine.isBehaviorCloningEnabled()
                    ? 'bc_policy'
                    : arbiterSnap.activeSource === 'pointer' || engine.getAutonomousPlanState().active
                    ? 'nemotron'
                    : 'keyboard'
                }
                gravityMps2={scenario.gravity}
                terrainSeed={scenario.seed}
                domainMeta={engine.getDomainPhysics()}
                isBcPolicyActive={!arbiterSnap.isManual && engine.isBehaviorCloningEnabled()}
                onReplayEpisode={handleReplayEpisode}
                onTrainAndRunPolicy={(stats) => {
                  if (!stats.trained) {
                    showToast('Tag at least 1 recorded episode as Success first.', 'warn');
                    return;
                  }
                  engine.setBehaviorCloningEnabled(true);
                  engine.arbiter.releaseToPolicy();
                  showToast(
                    `Policy (BC) active — ${stats.episodeCount} demo(s), ${stats.sampleCount} samples`,
                    'info'
                  );
                  handleUiSync();
                }}
                onScrubFrame={(pos, quat) => {
                  engine.previewDemonstrationPose(pos, quat);
                }}
                className="flex-1"
              />
            )}
          </aside>
        )}
      </div>

      {/* v2 Interactive Modals & Drawers */}
      <MissionPickerModal
        isOpen={isMissionsOpen}
        activeMissionId={scenario.missionId}
        bestScores={bestScores}
        onSelectMission={(id) => {
          const m = engine.loadMission(id);
          if (m) {
            setTerrainVersion(engine.terrain.getVersion());
            showToast(`Mission loaded: ${m.title} — ${m.coachTip}`, 'info');
            handleUiSync();
          }
        }}
        onClose={() => setIsMissionsOpen(false)}
      />

      <EpisodeResultsModal
        isOpen={isResultsOpen}
        progress={lastMissionResult || missionSnap}
        speedHistory={chartHistory.map((c) => c.speed)}
        onReplay={() => {
          setIsResultsOpen(false);
          const rep = lastReplayRef.current || engine.recorder.exportReplay();
          engine.setGhostReplay(rep);
          engine.startReplay(rep);
          restoreViewportFocus();
          handleUiSync();
        }}
        onRetry={() => {
          setIsResultsOpen(false);
          engine.resetEpisode(true);
          restoreViewportFocus();
          handleUiSync();
        }}
        onNextMission={() => {
          setIsResultsOpen(false);
          const idx = BUILT_IN_MISSIONS.findIndex((m) => m.id === activeMission.id);
          const nextM = BUILT_IN_MISSIONS[(idx + 1) % BUILT_IN_MISSIONS.length];
          engine.loadMission(nextM.id);
          setTerrainVersion(engine.terrain.getVersion());
          restoreViewportFocus();
          handleUiSync();
        }}
        onExportReplay={handleExportReplay}
        onShareScenario={handleShareScenario}
        onClose={() => {
          setIsResultsOpen(false);
          restoreViewportFocus();
        }}
      />

      <ScenarioEditorDrawer
        isOpen={isEditorOpen}
        scenario={scenario}
        editorTool={editorTool}
        canUndo={undoDepth.undo > 0}
        canRedo={undoDepth.redo > 0}
        onToolChange={(t) => setEditorTool(t)}
        onUpdateScenario={(patch, regen) => {
          engine.applyScenario(patch, Boolean(regen));
          if (regen || patch.rockCount !== undefined) {
            setTerrainVersion(engine.terrain.getVersion() + 1);
          }
          handleUiSync();
        }}
        onRegenerate={() => {
          engine.terrain.regenerate(scenario.seed, {
            fbmAmplitude: Math.max(0.2, scenario.roughness * 0.9),
            primaryCratersMax: Math.max(2, scenario.craterCount),
          });
          engine.rebuildDebris();
          setTerrainVersion(engine.terrain.getVersion());
          engine.resetEpisode(false);
          showToast(`Regenerated deterministic lunar terrain (seed ${scenario.seed}).`, 'info');
        }}
        onUndo={handleUndoTerrain}
        onRedo={handleRedoTerrain}
        onShareLink={handleShareScenario}
        onExportJson={() => {
          const blob = new Blob([JSON.stringify(engine.getScenario(), null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `scenario-${scenario.seed}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
        onImportJson={(txt) => {
          try {
            const parsed = ScenarioConfigSchema.parse(JSON.parse(txt));
            engine.applyScenario(parsed, true);
            setTerrainVersion(engine.terrain.getVersion());
            engine.resetEpisode(true);
            showToast(`Imported scenario "${parsed.name}".`, 'info');
          } catch {
            showToast('Invalid scenario JSON file.', 'warn');
          }
        }}
        onImportReplay={handleImportReplay}
        onClose={() => {
          setIsEditorOpen(false);
          setEditorTool('none');
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        registry={registry}
        onChange={updateSettings}
        onResetDefaults={() => {
          registry.resetAll();
          updateSettings(DEFAULT_STUDIO_SETTINGS);
          showToast('All settings & key bindings reset to defaults.', 'info');
        }}
        onExportAllData={() => {
          const blob = new Blob([exportAllStudioData()], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `omni-kinetic-backup-${Date.now()}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
        onDeleteAllData={() => {
          deleteAllStudioData();
          registry.resetAll();
          setSettings(DEFAULT_STUDIO_SETTINGS);
          setBestScores({});
          showToast('Deleted all locally stored studio data.', 'warn');
        }}
        onClose={() => setIsSettingsOpen(false)}
      />

      <PauseMenuModal
        isOpen={isPauseMenuOpen}
        onResume={() => {
          setIsPauseMenuOpen(false);
          engine.arbiter.clearEmergencyStop();
          engine.inputs.clearEmergencyStop();
          engine.clock.setPaused(false);
          restoreViewportFocus();
          handleUiSync();
        }}
        onRestart={() => {
          setIsPauseMenuOpen(false);
          engine.resetEpisode(true);
          restoreViewportFocus();
          handleUiSync();
        }}
        onOpenMissions={() => setIsMissionsOpen(true)}
        onReplayLast={() => {
          const rep = engine.recorder.exportReplay();
          engine.setGhostReplay(rep);
          engine.startReplay(rep);
          handleUiSync();
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onQuitToResults={() => {
          lastReplayRef.current = engine.recorder.exportReplay();
          setLastMissionResult(engine.getMissionSnapshot());
          setIsResultsOpen(true);
        }}
      />

      {/* Existing Preserved Modals */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onSubmitPrompt={(p) => { void handlePromptSubmit(p); }}
        onToggleSimMode={() => setRunMode((m) => (m === 'cloud-stream' ? 'local-simulation' : 'cloud-stream'))}
        currentMode={runMode === 'cloud-stream' ? 'cloud_nebius' : 'local_demo'}
        onToggleTeleop={() => actionHandlerRef.current('toggle_control')}
        onToggleAnimation={() => setIsNewAnimation((p) => !p)}
        isNewAnimation={isNewAnimation}
        onOpenGaitLab={() => setShowGaitLab(true)}
      />

      {jobStatus && jobStatus.status === 'cold_start' && (
        <ColdStartCard status={jobStatus} onSwitchToLocal={() => setRunMode('local-simulation')} />
      )}

      {showRunSummary && runSummary && (
        <RunSummaryCard
          summary={runSummary}
          envSpec={envSpec}
          historyFrames={[...TelemetryStore.getInstance().getHistory()]}
          onClose={() => setShowRunSummary(false)}
          onReplay={() => {
            setShowRunSummary(false);
            engine.resetEpisode(false);
          }}
        />
      )}

      <PerfPanel
        isOpen={isPerfPanelOpen}
        onClose={() => setIsPerfPanelOpen(false)}
        onTierChange={(t) => setQualityTier(t)}
      />

      <ShortcutsOverlay isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />

      <TokenSpendPopover isOpen={isTokenSpendOpen} onClose={() => setIsTokenSpendOpen(false)} />

      {/* CV Hand Teleop wired directly into InputManager OneEuro pipeline (Phase W3.6) */}
      {isTeleopOpen && (
        <TeleopOverlay
          isOpen={isTeleopOpen}
          onClose={() => {
            engine.inputs.setCVTeleopCommand(false, 0, 0);
            setIsTeleopOpen(false);
          }}
          onCommand={(cmd: TeleopCommand) => {
            if (typeof cmd.vx === 'number' && typeof cmd.yawRate === 'number') {
              const active = !cmd.failsafeActive || Math.abs(cmd.vx) > 0.005 || Math.abs(cmd.yawRate) > 0.005;
              engine.inputs.setCVTeleopCommand(active, cmd.vx, cmd.yawRate);
            } else if (cmd.targetPosition) {
              const vx = Math.max(-0.8, Math.min(1.6, cmd.targetPosition[0] * 4.0));
              const yawRate = Math.max(-1.8, Math.min(1.8, -cmd.targetPosition[2] * 3.5));
              engine.inputs.setCVTeleopCommand(true, vx, yawRate);
            }
          }}
          onSaveEpisode={(ep) => setCollectedEpisodes((prev) => [...prev, ep])}
          currentFrame={TelemetryStore.getInstance().getSnapshot().currentFrame}
        />
      )}

      {isDatasetPanelOpen && (
        <DatasetPanel
          isOpen={isDatasetPanelOpen}
          onClose={() => setIsDatasetPanelOpen(false)}
          episodes={collectedEpisodes}
          onTrainWithCorrections={() => {
            setIteration(2);
            setIsDeltaComparisonOpen(true);
            setIsDatasetPanelOpen(false);
          }}
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
          onToggleAnimation={() => setIsNewAnimation((p) => !p)}
          gravity={scenario.gravity}
          speed={clockSnap.speedMultiplier}
          onSpeedChange={(spd) => { engine.clock.setSpeedMultiplier(spd); handleUiSync(); }}
          onClose={() => setShowGaitLab(false)}
        />
      )}

      {/* Pack Expansion Modals */}
      <DroidWorkshopModal
        isOpen={isWorkshopOpen}
        onClose={() => setIsWorkshopOpen(false)}
        onSelectMorphology={(presetKey, spec) => {
          showToast(`Applied ${spec.name} morphology preset.`, 'info');
        }}
      />

      <CommsDelayModal
        isOpen={isCommsDelayOpen}
        activePreset={commsPreset}
        onClose={() => setIsCommsDelayOpen(false)}
        onSelectPreset={(presetKey, customSec) => {
          setCommsPreset(presetKey);
          showToast(`Comms delay set to ${presetKey.toUpperCase()}${customSec ? ` (${customSec}s)` : ''}.`, 'info');
        }}
      />

      <SimToRealModal
        isOpen={isSimToRealOpen}
        onClose={() => setIsSimToRealOpen(false)}
        onApplyConfig={(cfg) => {
          showToast(`Domain randomization applied: latency=${cfg.motorLatencyMs.max}ms, noise=${cfg.rangeNoiseStd.max}m.`, 'info');
        }}
      />

      <DailyChallengeModal
        isOpen={isDailyChallengeOpen}
        onClose={() => setIsDailyChallengeOpen(false)}
        onStartChallenge={(ch) => {
          engine.applyScenario({ seed: ch.seed, gravity: ch.gravity }, true);
          setTerrainVersion(engine.terrain.getVersion());
          engine.resetEpisode(true);
          showToast(`Launched Daily Challenge: "${ch.title}" (Seed #${ch.seed})`, 'info');
        }}
      />
    </div>
  );
}
