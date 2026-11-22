'use client';

import React, { useState } from 'react';
import {
  Trophy,
  X,
  Play,
  RotateCcw,
  Share2,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Compass,
  Sun,
  Mountain,
  Undo2,
  Redo2,
  Trash2,
  Copy,
  Keyboard,
} from 'lucide-react';
import {
  BUILT_IN_MISSIONS,
  MissionDefinition,
  MissionProgressSnapshot,
} from '@/lib/missions/missions';
import {
  ScenarioConfig,
  GRAVITY_PRESETS,
  LUNAR_TIME_PRESETS,
} from '@/lib/scenario/sharing';
import {
  StudioSettings,
  MissionBestScore,
  DEFAULT_STUDIO_SETTINGS,
  RadarSize,
  CameraMode,
  QualityTierSetting,
} from '@/lib/storage/settings';
import { ShortcutRegistry, formatKeyLabel, normalizeKeyCombo } from '@/lib/control/shortcuts';
import { EpisodeEndBehavior } from '@/lib/sim/SimClock';

// ============================================================================
// 1. TOP-CENTER COMPACT MISSION OBJECTIVES HUD
// ============================================================================
export function MissionObjectiveHUD({
  mission,
  progress,
  onOpenPicker,
}: {
  mission: MissionDefinition;
  progress: MissionProgressSnapshot;
  onOpenPicker: () => void;
}) {
  const arrowDeg =
    progress.bearingToNextRad !== null ? Math.round((-progress.bearingToNextRad * 180) / Math.PI) : 0;

  return (
    <button
      type="button"
      onClick={onOpenPicker}
      className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-3 px-3.5 py-1.5 rounded-full bg-charcoal-deep/90 backdrop-blur-md border border-hairline hover:border-sage font-mono text-[11px] shadow-xl transition-colors"
      title="Click to switch missions"
    >
      <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span className="font-bold text-cream">{mission.title}</span>
      <span className="text-sage font-semibold tabular-nums">
        {progress.completedCount}/{progress.totalCount}
      </span>
      {progress.nextMarker && progress.distanceToNextM !== null && (
        <span className="flex items-center space-x-1.5 text-cream-dim border-l border-hairline pl-2.5 tabular-nums">
          <span
            className="inline-block text-sage font-bold transition-transform duration-100"
            style={{ transform: `rotate(${arrowDeg}deg)` }}
            aria-hidden="true"
          >
            ↑
          </span>
          <span className="text-cream">{progress.nextMarker.label}</span>
          <span>{progress.distanceToNextM.toFixed(1)}m</span>
        </span>
      )}
    </button>
  );
}

// ============================================================================
// 2. MISSION PICKER DIALOG (6 PLAYABLE MISSIONS)
// ============================================================================
export function MissionPickerModal({
  isOpen,
  activeMissionId,
  bestScores,
  onSelectMission,
  onClose,
}: {
  isOpen: boolean;
  activeMissionId: string | null;
  bestScores: Record<string, MissionBestScore>;
  onSelectMission: (missionId: string) => void;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Mission Picker"
    >
      <div className="w-full max-w-3xl bg-charcoal-deep border border-cream/15 rounded-2xl shadow-2xl overflow-hidden font-mono">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline">
          <div className="flex items-center space-x-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-cream">Lunar Missions & Challenges (v2)</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Mission Picker" className="text-cream-dim hover:text-cream">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
          {BUILT_IN_MISSIONS.map((m) => {
            const best = bestScores[m.id];
            const isCurrent = m.id === activeMissionId;
            return (
              <div
                key={m.id}
                className={`p-3.5 rounded-xl border transition-colors flex flex-col justify-between space-y-2.5 ${
                  isCurrent
                    ? 'bg-sage/15 border-sage'
                    : 'bg-charcoal/70 border-hairline hover:border-cream/30'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cream">{m.title}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                        m.difficulty === 'Beginner'
                          ? 'bg-sage/25 text-sage'
                          : m.difficulty === 'Intermediate'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-brick/25 text-brick'
                      }`}
                    >
                      {m.difficulty}
                    </span>
                  </div>
                  <p className="text-[11px] text-cream-dim leading-relaxed">{m.subtitle}</p>
                  <div className="flex flex-wrap gap-2 text-[10px] text-cream-dim pt-1">
                    <span>Par: {m.parTimeSec}s</span>
                    <span>Limit: {m.timeLimitSec}s</span>
                    <span>Objectives: {m.markers.length}</span>
                    {m.noCollisions && <span className="text-amber-300">0 Collisions</span>}
                    {m.maxTiltDeg && <span className="text-amber-300">Tilt &lt; {m.maxTiltDeg}°</span>}
                    {m.energyBudgetJ && <span className="text-amber-300">≤ {m.energyBudgetJ} J</span>}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-hairline">
                  <div className="text-[10px]">
                    {best ? (
                      <span className="text-amber-300 font-bold uppercase">
                        Best: {best.bestScore} ({best.medal})
                      </span>
                    ) : (
                      <span className="text-cream-dim">Gold ≥ {m.medals.gold}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectMission(m.id);
                      onClose();
                    }}
                    className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-sage text-cream text-[11px] font-bold hover:bg-sage/90"
                  >
                    <Play className="w-3 h-3" />
                    <span>{isCurrent ? 'Restart' : 'Launch'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. EPISODE / MISSION RESULTS CARD (END-OF-EPISODE BEHAVIOR)
// ============================================================================
export function EpisodeResultsModal({
  isOpen,
  progress,
  speedHistory,
  onReplay,
  onRetry,
  onNextMission,
  onExportReplay,
  onShareScenario,
  onClose,
}: {
  isOpen: boolean;
  progress: MissionProgressSnapshot | null;
  speedHistory: readonly number[];
  onReplay: () => void;
  onRetry: () => void;
  onNextMission: () => void;
  onExportReplay: () => void;
  onShareScenario: () => void;
  onClose: () => void;
}) {
  if (!isOpen || !progress) return null;
  const s = progress.score;

  // Build SVG sparkline path from speedHistory
  const sparkW = 280;
  const sparkH = 44;
  const maxSpd = Math.max(1.5, ...speedHistory);
  const sparkPath =
    speedHistory.length > 1
      ? speedHistory
          .map((v, i) => {
            const x = (i / (speedHistory.length - 1)) * sparkW;
            const y = sparkH - (v / maxSpd) * (sparkH - 6) - 3;
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ')
      : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Episode Results"
    >
      <div className="w-full max-w-lg bg-charcoal-deep border border-cream/20 rounded-2xl shadow-2xl overflow-hidden font-mono">
        <div className="px-5 py-4 border-b border-hairline flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            {s.succeeded ? (
              <CheckCircle2 className="w-5 h-5 text-sage" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            )}
            <div>
              <div className="text-sm font-bold text-cream">
                {s.succeeded ? 'Episode Complete' : 'Episode Ended'} — {progress.missionTitle}
              </div>
              <div className="text-[10px] text-cream-dim">
                {s.failedReason || `${s.completedObjectives}/${s.totalObjectives} objectives completed in ${s.elapsedSec.toFixed(1)}s`}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Results" className="text-cream-dim hover:text-cream">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Score & Medal Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-charcoal border border-hairline">
            <div>
              <div className="text-[10px] text-cream-dim uppercase">Deterministic Score</div>
              <div className="text-2xl font-bold text-cream tabular-nums">{s.total}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-cream-dim uppercase">Medal</div>
              <div
                className={`text-sm font-bold uppercase ${
                  s.medal === 'gold'
                    ? 'text-amber-300'
                    : s.medal === 'silver'
                    ? 'text-slate-200'
                    : s.medal === 'bronze'
                    ? 'text-orange-400'
                    : 'text-cream-dim'
                }`}
              >
                {s.medal === 'none' ? 'Unranked' : `${s.medal} medal`}
              </div>
            </div>
          </div>

          {/* Transparent Breakdown */}
          <div className="grid grid-cols-2 gap-2 text-[11px] tabular-nums">
            <div className="flex justify-between px-2.5 py-1.5 rounded bg-charcoal/60">
              <span className="text-cream-dim">Objectives</span>
              <span className="text-cream font-semibold">+{s.objectiveBonus}</span>
            </div>
            <div className="flex justify-between px-2.5 py-1.5 rounded bg-charcoal/60">
              <span className="text-cream-dim">Time Bonus</span>
              <span className="text-cream font-semibold">+{s.timeBonus}</span>
            </div>
            <div className="flex justify-between px-2.5 py-1.5 rounded bg-charcoal/60">
              <span className="text-cream-dim">Efficiency</span>
              <span className="text-cream font-semibold">+{s.efficiencyBonus}</span>
            </div>
            <div className="flex justify-between px-2.5 py-1.5 rounded bg-charcoal/60">
              <span className="text-cream-dim">Smoothness</span>
              <span className="text-cream font-semibold">+{s.smoothnessBonus}</span>
            </div>
            <div className="flex justify-between px-2.5 py-1.5 rounded bg-charcoal/60">
              <span className="text-cream-dim">No-Assist Bonus</span>
              <span className="text-sage font-semibold">+{s.noAssistBonus}</span>
            </div>
            <div className="flex justify-between px-2.5 py-1.5 rounded bg-charcoal/60">
              <span className="text-cream-dim">Penalties ({s.collisions} col)</span>
              <span className="text-brick font-semibold">-{s.penalties}</span>
            </div>
          </div>

          {/* Speed Sparkline */}
          {sparkPath && (
            <div className="p-2.5 rounded-xl bg-charcoal/60 border border-hairline">
              <div className="flex justify-between text-[9px] text-cream-dim mb-1">
                <span>Speed Profile (m/s)</span>
                <span>
                  Dist {s.distanceMeters.toFixed(1)}m · Energy {s.energyJoules.toFixed(1)}J · Max Tilt {s.maxTiltDeg}°
                </span>
              </div>
              <svg width="100%" viewBox={`0 0 ${sparkW} ${sparkH}`} className="overflow-visible">
                <path d={sparkPath} fill="none" stroke="#8EA48C" strokeWidth="1.8" />
              </svg>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-hairline">
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => { onReplay(); onClose(); }}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-200 hover:bg-amber-500/30 text-[11px] font-bold"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Replay</span>
              </button>
              <button
                type="button"
                onClick={onExportReplay}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-charcoal border border-hairline text-cream hover:border-sage text-[11px]"
                title="Save deterministic .omni.json replay file"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save Run</span>
              </button>
              <button
                type="button"
                onClick={onShareScenario}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-charcoal border border-hairline text-cream hover:border-sage text-[11px]"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1.5 rounded-lg bg-charcoal border border-hairline text-cream-dim hover:text-cream text-[11px]"
                title="Dismiss dialog and continue watching current scene"
              >
                Keep Watching
              </button>
              <button
                type="button"
                onClick={() => { onRetry(); onClose(); }}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-charcoal border border-hairline text-cream hover:border-cream/40 text-[11px]"
                title="Restart episode [R]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart [R]</span>
              </button>
              <button
                type="button"
                onClick={() => { onNextMission(); onClose(); }}
                className="px-3.5 py-1.5 rounded-lg bg-sage text-cream font-bold hover:bg-sage/90 text-[11px]"
              >
                Next Mission
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. SCENARIO & ENVIRONMENT EDITOR DRAWER (PHASE W8)
// ============================================================================
export type EditorToolMode = 'none' | 'waypoint' | 'boulder' | 'brush_raise' | 'brush_lower';

export function ScenarioEditorDrawer({
  isOpen,
  scenario,
  editorTool,
  canUndo,
  canRedo,
  onToolChange,
  onUpdateScenario,
  onRegenerate,
  onUndo,
  onRedo,
  onShareLink,
  onExportJson,
  onImportJson,
  onImportReplay,
  onClose,
}: {
  isOpen: boolean;
  scenario: ScenarioConfig;
  editorTool: EditorToolMode;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: EditorToolMode) => void;
  onUpdateScenario: (patch: Partial<ScenarioConfig>, regen?: boolean) => void;
  onRegenerate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onShareLink: () => void;
  onExportJson: () => void;
  onImportJson: (text: string) => void;
  onImportReplay: (text: string) => void;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>, isReplay: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result || '');
      if (isReplay) onImportReplay(txt);
      else onImportJson(txt);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div
      className="pointer-events-auto fixed top-14 right-4 z-40 w-80 max-h-[82vh] overflow-y-auto bg-charcoal-deep/95 backdrop-blur-md border border-cream/20 rounded-2xl shadow-2xl font-mono text-[11px]"
      role="dialog"
      aria-label="Scenario and Environment Editor"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline sticky top-0 bg-charcoal-deep z-10">
        <div className="flex items-center space-x-2">
          <Mountain className="w-4 h-4 text-sage" />
          <span className="font-bold text-cream">Scenario & Environment</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Editor" className="text-cream-dim hover:text-cream">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Live Gravity Presets & Slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] text-cream-dim uppercase">
            <span>Live Gravity</span>
            <span className="text-cream font-bold tabular-nums">
              {scenario.gravity.toFixed(2)} m/s² ({(scenario.gravity / 9.81).toFixed(2)} g)
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {GRAVITY_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onUpdateScenario({ gravity: p.gravity }, false)}
                className={`py-1 rounded border text-[10px] font-semibold ${
                  Math.abs(scenario.gravity - p.gravity) < 0.05
                    ? 'bg-sage text-cream border-sage'
                    : 'bg-charcoal border-hairline text-cream-dim hover:text-cream'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0.5}
            max={15}
            step={0.05}
            value={scenario.gravity}
            onChange={(e) => onUpdateScenario({ gravity: parseFloat(e.target.value) }, false)}
            className="w-full accent-sage"
          />
        </div>

        {/* Seed & Terrain Regeneration */}
        <div className="space-y-1.5 border-t border-hairline pt-3">
          <div className="flex items-center justify-between text-[10px] text-cream-dim uppercase">
            <span>Terrain Seed</span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(String(scenario.seed))}
                title="Copy seed"
                className="text-cream-dim hover:text-cream"
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onUpdateScenario({ seed: ((scenario.seed * 1103515245 + 12345) >>> 16) % 99999 + 1 }, true)}
                className="px-1.5 py-0.5 rounded bg-charcoal border border-hairline text-cream text-[9px]"
              >
                Next Seed
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              value={scenario.seed}
              onChange={(e) => onUpdateScenario({ seed: Math.max(1, parseInt(e.target.value, 10) || 42) }, false)}
              className="flex-1 px-2 py-1 rounded bg-charcoal border border-hairline text-cream"
            />
            <button
              type="button"
              onClick={onRegenerate}
              className="px-2.5 py-1 rounded bg-sage text-cream font-bold text-[10px]"
            >
              Regenerate
            </button>
          </div>
        </div>

        {/* Rock Density & Episode Length */}
        <div className="space-y-2 border-t border-hairline pt-3">
          <div>
            <div className="flex justify-between text-[10px] text-cream-dim">
              <span>Boulder Density</span>
              <span className="text-cream">{scenario.rockCount} rocks</span>
            </div>
            <input
              type="range"
              min={0}
              max={2000}
              step={100}
              value={scenario.rockCount}
              onChange={(e) => onUpdateScenario({ rockCount: parseInt(e.target.value, 10) }, false)}
              className="w-full accent-sage"
            />
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-cream-dim">
              <span>Episode Length</span>
              <span className="text-cream">{scenario.episodeLength}s</span>
            </div>
            <input
              type="range"
              min={15}
              max={180}
              step={5}
              value={scenario.episodeLength}
              onChange={(e) => onUpdateScenario({ episodeLength: parseInt(e.target.value, 10) }, false)}
              className="w-full accent-sage"
            />
          </div>
        </div>

        {/* Sun Angle & Time-of-Lunar-Day */}
        <div className="space-y-1.5 border-t border-hairline pt-3">
          <div className="flex items-center space-x-1.5 text-[10px] text-cream-dim uppercase">
            <Sun className="w-3 h-3 text-amber-300" />
            <span>Sun Elevation {scenario.sunElevationDeg}° · Azimuth {scenario.sunAzimuthDeg}°</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {LUNAR_TIME_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  onUpdateScenario(
                    { sunElevationDeg: p.sunElevationDeg, sunAzimuthDeg: p.sunAzimuthDeg },
                    false
                  )
                }
                className="py-1 rounded bg-charcoal border border-hairline hover:border-sage text-[10px] text-cream-dim hover:text-cream"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Click Tools + Terrain Brush + Undo/Redo */}
        <div className="space-y-2 border-t border-hairline pt-3">
          <div className="flex items-center justify-between text-[10px] text-cream-dim uppercase">
            <span>Viewport Edit Tool</span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                disabled={!canUndo}
                onClick={onUndo}
                title="Undo terrain edit [Ctrl+Z]"
                className="p-1 rounded bg-charcoal border border-hairline disabled:opacity-30 text-cream"
              >
                <Undo2 className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={onRedo}
                title="Redo terrain edit [Ctrl+Shift+Z]"
                className="p-1 rounded bg-charcoal border border-hairline disabled:opacity-30 text-cream"
              >
                <Redo2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['none', 'Drive / Waypoint'],
                ['boulder', 'Place Boulder'],
                ['brush_raise', 'Raise Terrain'],
                ['brush_lower', 'Lower Terrain'],
              ] as [EditorToolMode, string][]
            ).map(([tool, label]) => (
              <button
                key={tool}
                type="button"
                onClick={() => onToolChange(tool)}
                className={`py-1.5 px-2 rounded border text-[10px] font-semibold ${
                  editorTool === tool
                    ? 'bg-sage text-cream border-sage'
                    : 'bg-charcoal border-hairline text-cream-dim hover:text-cream'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Share, Export & Import */}
        <div className="space-y-1.5 border-t border-hairline pt-3">
          <button
            type="button"
            onClick={onShareLink}
            className="w-full py-1.5 rounded-lg bg-sage text-cream font-bold flex items-center justify-center space-x-1.5"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Copy Shareable Scenario Link (#s=)</span>
          </button>
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={onExportJson}
              className="py-1.5 rounded bg-charcoal border border-hairline text-cream flex items-center justify-center space-x-1"
            >
              <Download className="w-3 h-3" />
              <span>Export</span>
            </button>
            <label className="py-1.5 rounded bg-charcoal border border-hairline text-cream flex items-center justify-center space-x-1 cursor-pointer">
              <Upload className="w-3 h-3" />
              <span>Scenario</span>
              <input type="file" accept=".json" className="hidden" onChange={(e) => handleFileImport(e, false)} />
            </label>
            <label className="py-1.5 rounded bg-charcoal border border-hairline text-amber-200 flex items-center justify-center space-x-1 cursor-pointer">
              <Play className="w-3 h-3" />
              <span>Replay</span>
              <input type="file" accept=".json,.omni.json" className="hidden" onChange={(e) => handleFileImport(e, true)} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 5. SETTINGS & KEY REMAPPING MODAL (PHASE W11)
// ============================================================================
export function SettingsModal({
  isOpen,
  settings,
  registry,
  onChange,
  onResetDefaults,
  onExportAllData,
  onDeleteAllData,
  onClose,
}: {
  isOpen: boolean;
  settings: StudioSettings;
  registry: ShortcutRegistry;
  onChange: (next: StudioSettings) => void;
  onResetDefaults: () => void;
  onExportAllData: () => void;
  onDeleteAllData: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'controls' | 'camera' | 'display' | 'simulation' | 'accessibility'>('controls');
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [remapError, setRemapError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCaptureKey = (e: React.KeyboardEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') {
      setCapturingId(null);
      setRemapError(null);
      return;
    }
    const combo = normalizeKeyCombo(e.nativeEvent);
    const res = registry.remap(id, [combo]);
    if (!res.ok) {
      setRemapError(res.reason || 'Key conflict detected.');
    } else {
      setRemapError(null);
      setCapturingId(null);
      onChange({
        ...settings,
        controls: {
          ...settings.controls,
          keyOverrides: registry.exportOverrides(),
        },
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Studio Settings"
    >
      <div className="w-full max-w-2xl bg-charcoal-deep border border-cream/20 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-sage" />
            <h2 className="font-bold text-cream">Studio Settings & Key Remapping</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Settings" className="text-cream-dim hover:text-cream">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex border-b border-hairline px-4 pt-2 space-x-1 overflow-x-auto">
          {(['controls', 'camera', 'display', 'simulation', 'accessibility'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-t-lg text-[11px] uppercase font-semibold border-b-2 ${
                tab === t
                  ? 'border-sage text-cream bg-charcoal/50'
                  : 'border-transparent text-cream-dim hover:text-cream'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Panel Body */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
          {tab === 'controls' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] text-cream-dim">Sensitivity ({settings.controls.sensitivity.toFixed(2)}x)</span>
                  <input
                    type="range"
                    min={0.4}
                    max={2.0}
                    step={0.05}
                    value={settings.controls.sensitivity}
                    onChange={(e) =>
                      onChange({ ...settings, controls: { ...settings.controls, sensitivity: parseFloat(e.target.value) } })
                    }
                    className="w-full accent-sage"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-cream-dim">Gamepad Deadzone ({settings.controls.gamepadDeadzone.toFixed(2)})</span>
                  <input
                    type="range"
                    min={0.05}
                    max={0.35}
                    step={0.01}
                    value={settings.controls.gamepadDeadzone}
                    onChange={(e) =>
                      onChange({ ...settings, controls: { ...settings.controls, gamepadDeadzone: parseFloat(e.target.value) } })
                    }
                    className="w-full accent-sage"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {(
                  [
                    ['oneHandedMode', 'One-Handed Mode (Auto-Forward + A/D)'],
                    ['invertYaw', 'Invert Yaw Turning'],
                    ['pointerDriveEnabled', 'Right-Click Hold Pointer Drive'],
                    ['avoidRocks', 'Waypoint Boulder Avoidance'],
                    ['hapticsEnabled', 'Gamepad Landing Haptics'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center space-x-2 p-2 rounded bg-charcoal/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(settings.controls[k])}
                      onChange={(e) =>
                        onChange({ ...settings, controls: { ...settings.controls, [k]: e.target.checked } })
                      }
                      className="accent-sage"
                    />
                    <span className="text-cream">{label}</span>
                  </label>
                ))}
              </div>

              {/* Remappable Bindings List */}
              <div className="space-y-1.5 border-t border-hairline pt-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center space-x-1.5 text-[10px] text-cream-dim uppercase font-bold">
                    <Keyboard className="w-3.5 h-3.5" />
                    <span>Key Bindings (Click to Remap)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      registry.resetAll();
                      setRemapError(null);
                      onChange({ ...settings, controls: { ...settings.controls, keyOverrides: {} } });
                    }}
                    className="text-[10px] text-sage hover:underline"
                  >
                    Reset Bindings
                  </button>
                </div>
                {remapError && (
                  <div className="p-2 rounded bg-brick/20 border border-brick text-cream text-[10px]">
                    {remapError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
                  {registry.getAll().filter((b) => b.remappable).map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setCapturingId(b.id);
                        setRemapError(null);
                      }}
                      onKeyDown={(e) => capturingId === b.id && handleCaptureKey(e, b.id)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-[10px] ${
                        capturingId === b.id
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-charcoal/60 border-hairline text-cream hover:border-sage'
                      }`}
                    >
                      <span className="truncate">{b.label}</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-charcoal-deep text-sage border border-hairline">
                        {capturingId === b.id ? 'Press key...' : b.keys.map(formatKeyLabel).join('/')}
                      </kbd>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'camera' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-cream">Default Camera Mode</span>
                <select
                  value={settings.camera.defaultMode}
                  onChange={(e) =>
                    onChange({ ...settings, camera: { ...settings.camera, defaultMode: e.target.value as CameraMode } })
                  }
                  className="px-2 py-1 rounded bg-charcoal border border-hairline text-cream"
                >
                  <option value="follow">Follow</option>
                  <option value="orbit">Orbit</option>
                  <option value="topdown">Top-Down</option>
                  <option value="fpv">First-Person</option>
                  <option value="freefly">Free-Fly</option>
                </select>
              </div>
              <label className="block space-y-1">
                <span className="text-cream-dim">Field of View ({settings.camera.fov}°)</span>
                <input
                  type="range"
                  min={40}
                  max={90}
                  value={settings.camera.fov}
                  onChange={(e) =>
                    onChange({ ...settings, camera: { ...settings.camera, fov: parseInt(e.target.value, 10) } })
                  }
                  className="w-full accent-sage"
                />
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.camera.shakeEnabled}
                  onChange={(e) =>
                    onChange({ ...settings, camera: { ...settings.camera, shakeEnabled: e.target.checked } })
                  }
                  className="accent-sage"
                />
                <span className="text-cream">Landing Impact Camera Shake (off in reduced motion)</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.camera.autoRecenterOrbit}
                  onChange={(e) =>
                    onChange({ ...settings, camera: { ...settings.camera, autoRecenterOrbit: e.target.checked } })
                  }
                  className="accent-sage"
                />
                <span className="text-cream">Auto-Recenter Orbit Offset After 3s Idle</span>
              </label>
            </div>
          )}

          {tab === 'display' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-cream">Quality Tier</span>
                <select
                  value={settings.display.qualityTier}
                  onChange={(e) =>
                    onChange({ ...settings, display: { ...settings.display, qualityTier: e.target.value as QualityTierSetting } })
                  }
                  className="px-2 py-1 rounded bg-charcoal border border-hairline text-cream"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="ultra">Ultra</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-cream">Radar Size</span>
                <select
                  value={settings.display.radarSize}
                  onChange={(e) =>
                    onChange({ ...settings, display: { ...settings.display, radarSize: e.target.value as RadarSize } })
                  }
                  className="px-2 py-1 rounded bg-charcoal border border-hairline text-cream"
                >
                  <option value="small">Small (148px)</option>
                  <option value="medium">Medium (208px)</option>
                  <option value="large">Large (268px)</option>
                </select>
              </div>
              {(
                [
                  ['showContours', 'Terrain Elevation Contour Lines'],
                  ['showTrail', 'Subtle Fading Path Trail'],
                  ['showInputVisualizer', 'Show Live Key / Stick Visualizer in HUD'],
                  ['colorblindSafe', 'Colorblind-Safe Marker Palette'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.display[k])}
                    onChange={(e) =>
                      onChange({ ...settings, display: { ...settings.display, [k]: e.target.checked } })
                    }
                    className="accent-sage"
                  />
                  <span className="text-cream">{label}</span>
                </label>
              ))}
            </div>
          )}

          {tab === 'simulation' && (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-cream-dim">Traction Realism ({Math.round(settings.simulation.realism * 100)}% — Arcade to Lunar)</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.simulation.realism}
                  onChange={(e) =>
                    onChange({ ...settings, simulation: { ...settings.simulation, realism: parseFloat(e.target.value) } })
                  }
                  className="w-full accent-sage"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-cream-dim">Speed Limiter Assist ({Math.round(settings.simulation.speedLimiter * 100)}%)</span>
                <input
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.05}
                  value={settings.simulation.speedLimiter}
                  onChange={(e) =>
                    onChange({ ...settings, simulation: { ...settings.simulation, speedLimiter: parseFloat(e.target.value) } })
                  }
                  className="w-full accent-sage"
                />
              </label>
              <div className="flex items-center justify-between">
                <span className="text-cream">Episode End Behavior</span>
                <select
                  value={settings.simulation.endBehavior}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      simulation: { ...settings.simulation, endBehavior: e.target.value as EpisodeEndBehavior },
                    })
                  }
                  className="px-2 py-1 rounded bg-charcoal border border-hairline text-cream"
                >
                  <option value="stop">Stop & Show Results</option>
                  <option value="loop">Loop Episode</option>
                  <option value="auto-restart">Auto-Restart Next Episode</option>
                </select>
              </div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.simulation.brakeAssist}
                  onChange={(e) =>
                    onChange({ ...settings, simulation: { ...settings.simulation, brakeAssist: e.target.checked } })
                  }
                  className="accent-sage"
                />
                <span className="text-cream">Arena Edge Brake Assist</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.simulation.autoPauseOnBlur}
                  onChange={(e) =>
                    onChange({ ...settings, simulation: { ...settings.simulation, autoPauseOnBlur: e.target.checked } })
                  }
                  className="accent-sage"
                />
                <span className="text-cream">Auto-Pause When Window Loses Focus</span>
              </label>
            </div>
          )}

          {tab === 'accessibility' && (
            <div className="space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.accessibility.reducedMotion}
                  onChange={(e) =>
                    onChange({ ...settings, accessibility: { ...settings.accessibility, reducedMotion: e.target.checked } })
                  }
                  className="accent-sage"
                />
                <span className="text-cream">Reduced Motion (disables shake, dust bursts, transitions)</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.accessibility.highContrast}
                  onChange={(e) =>
                    onChange({ ...settings, accessibility: { ...settings.accessibility, highContrast: e.target.checked } })
                  }
                  className="accent-sage"
                />
                <span className="text-cream">High-Contrast Focus & HUD Borders</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.controls.showTouchControls === 'always'}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      controls: { ...settings.controls, showTouchControls: e.target.checked ? 'always' : 'auto' },
                    })
                  }
                  className="accent-sage"
                />
                <span className="text-cream">Always Show On-Screen Virtual Joystick</span>
              </label>
              <div className="p-2.5 rounded-xl bg-charcoal/70 border border-hairline text-[10px] text-cream-dim">
                Privacy Notice: All settings, best scores, and replays stay strictly in your browser&apos;s local storage. CV webcam teleop runs locally in a Web Worker and never uploads video frames.
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={onExportAllData}
                  className="px-3 py-1.5 rounded bg-charcoal border border-hairline text-cream flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export All Data</span>
                </button>
                <button
                  type="button"
                  onClick={onDeleteAllData}
                  className="px-3 py-1.5 rounded bg-brick/20 border border-brick/50 text-cream flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5 text-brick" />
                  <span>Delete All Local Data</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-hairline flex items-center justify-between">
          <button
            type="button"
            onClick={onResetDefaults}
            className="text-[11px] text-cream-dim hover:text-cream"
          >
            Reset All to Defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-sage text-cream font-bold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 6. PAUSE MENU MODAL (ESC)
// ============================================================================
export function PauseMenuModal({
  isOpen,
  onResume,
  onRestart,
  onOpenMissions,
  onReplayLast,
  onOpenSettings,
  onOpenShortcuts,
  onQuitToResults,
}: {
  isOpen: boolean;
  onResume: () => void;
  onRestart: () => void;
  onOpenMissions: () => void;
  onReplayLast: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onQuitToResults: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Simulation Paused"
    >
      <div className="w-full max-w-xs bg-charcoal-deep border border-cream/20 rounded-2xl p-5 shadow-2xl font-mono space-y-2.5">
        <div className="text-center pb-2 border-b border-hairline">
          <Compass className="w-5 h-5 text-sage mx-auto mb-1" />
          <div className="text-sm font-bold text-cream">Simulation Paused</div>
        </div>
        <button type="button" onClick={onResume} className="w-full py-2 rounded-lg bg-sage text-cream font-bold text-xs">
          Resume [Esc]
        </button>
        <button type="button" onClick={() => { onRestart(); onResume(); }} className="w-full py-2 rounded-lg bg-charcoal border border-hairline text-cream text-xs hover:border-sage">
          Restart Episode
        </button>
        <button type="button" onClick={() => { onResume(); onOpenMissions(); }} className="w-full py-2 rounded-lg bg-charcoal border border-hairline text-cream text-xs hover:border-sage">
          Missions (6)
        </button>
        <button type="button" onClick={() => { onReplayLast(); onResume(); }} className="w-full py-2 rounded-lg bg-charcoal border border-hairline text-amber-200 text-xs hover:border-amber-400">
          Replay Current Run
        </button>
        <button type="button" onClick={() => { onResume(); onOpenSettings(); }} className="w-full py-2 rounded-lg bg-charcoal border border-hairline text-cream text-xs hover:border-sage">
          Settings & Remapping
        </button>
        <button type="button" onClick={() => { onResume(); onOpenShortcuts(); }} className="w-full py-2 rounded-lg bg-charcoal border border-hairline text-cream text-xs hover:border-sage">
          Controls Cheat Sheet [?]
        </button>
        <button type="button" onClick={() => { onResume(); onQuitToResults(); }} className="w-full py-2 rounded-lg bg-brick/20 border border-brick/40 text-cream text-xs hover:bg-brick/30">
          End & View Results
        </button>
      </div>
    </div>
  );
}
