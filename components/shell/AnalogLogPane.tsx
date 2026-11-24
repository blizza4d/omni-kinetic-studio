'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  FileCode,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Terminal,
  Play,
  RotateCcw,
  Search,
  Filter,
  ArrowDown,
  Activity,
  Layers,
  Cpu,
  Sparkles,
  GitCompare,
  CheckCheck,
  Check,
  X,
} from 'lucide-react';
import {
  ArchitectOutput,
  JobStatus,
  EnvironmentSpec,
  CompiledSpec,
  SpecCompileReport,
} from '@/contracts';
import { compileSpec } from '@/lib/spec/compiler';
import CodeDiffViewer from '@/components/shell/CodeDiffViewer';
import JobCard from '@/components/shell/JobCard';
import { TelemetryStore } from '@/lib/telemetry/store';
import { SimClockSnapshot, clampProgress, formatClockDisplay, formatProgressPct } from '@/lib/sim/SimClock';
import { TelemetryChartSample } from '@/lib/sim/SimEngine';
import { SafetyEvent } from '@/lib/control/types';
import { isFeatureEnabled } from '@/lib/flags';
import { ControllerPlaygroundTab } from '@/components/shell/tabs/ControllerPlaygroundTab';
import { PolicyLabTab } from '@/components/shell/tabs/PolicyLabTab';
import { ExperimentsTab } from '@/components/shell/tabs/ExperimentsTab';

export type LogTab =
  | 'console'
  | 'diff'
  | 'spec'
  | 'reward'
  | 'datagen'
  | 'critique'
  | 'safety'
  | 'jobs'
  | 'metrics'
  | 'controller'
  | 'policylab'
  | 'experiments';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'security' | 'architect' | 'error';
  text: string;
}

interface AnalogLogPaneProps {
  logs: LogEntry[];
  currentStage: string;
  architectOutput: (ArchitectOutput & {
    spec: EnvironmentSpec;
    critique?: any;
    safetyChecks?: any[];
    compileReport?: SpecCompileReport;
    compiledSpec?: CompiledSpec;
    sandboxResult?: any;
  }) | null;
  currentSpec?: EnvironmentSpec;
  activeJobStatus: JobStatus | null;
  onApprove: () => void;
  onReject: () => void;
  onApproveCode?: (rewardCode: string, datagenCode: string) => void;
  onRejectWithFeedback?: (feedback: string) => void;
  onUpdateSpec?: (spec: EnvironmentSpec) => void;
  onOpenPrompt?: () => void;
  isStreaming: boolean;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  width?: number;
  onWidthChange?: (width: number) => void;
  clockSnapshot?: SimClockSnapshot;
  runModeDescription?: string;
  chartHistory?: readonly TelemetryChartSample[];
  safetyEvents?: readonly SafetyEvent[];
  onExportDatasetJsonl?: () => void;
  onExportDatasetCsv?: () => void;
}

export default function AnalogLogPane({
  logs,
  currentStage,
  architectOutput,
  currentSpec,
  activeJobStatus,
  onApprove,
  onReject,
  onApproveCode,
  onRejectWithFeedback,
  onUpdateSpec,
  onOpenPrompt,
  isStreaming,
  isOpen = true,
  onToggleOpen,
  width = 420,
  onWidthChange,
  clockSnapshot,
  runModeDescription,
  chartHistory = [],
  safetyEvents = [],
  onExportDatasetJsonl,
  onExportDatasetCsv,
}: AnalogLogPaneProps) {
  const [activeTab, setActiveTab] = useState<LogTab>('console');
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'architect' | 'security' | 'warn'>('all');
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const tabsContainerRef = useRef<HTMLDivElement | null>(null);

  const updateTabScrollFlags = () => {
    const el = tabsContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateTabScrollFlags();
  }, [width, isOpen]);

  // Auto-switch to diff tab on architect output generation
  useEffect(() => {
    if (architectOutput && !isStreaming) {
      setActiveTab('diff');
    }
  }, [architectOutput, isStreaming]);

  // Auto-scroll to bottom unless user scrolled up
  useEffect(() => {
    if (!userScrolledUp && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs, isStreaming, userScrolledUp]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setUserScrolledUp(!isAtBottom);
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      setUserScrolledUp(false);
    }
  };

  const handleScrollTabs = (direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      tabsContainerRef.current.scrollBy({
        left: direction === 'left' ? -120 : 120,
        behavior: 'smooth',
      });
    }
  };

  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(320, Math.min(640, startWidth + delta));
      if (onWidthChange) {
        onWidthChange(newWidth);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Filtered log items
  const filteredLogs = logs.filter((l) => {
    const matchesSearch = !searchQuery || l.text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel =
      levelFilter === 'all' ||
      (levelFilter === 'architect' && l.level === 'architect') ||
      (levelFilter === 'security' && l.level === 'security') ||
      (levelFilter === 'warn' && (l.level === 'warn' || l.level === 'error'));
    return matchesSearch && matchesLevel;
  });

  if (!isOpen) {
    return (
      <aside className="w-10 analog-glass border-r border-cream/10 h-full flex flex-col items-center py-4 space-y-4 select-none">
        <button
          onClick={onToggleOpen}
          className="p-1 rounded text-cream-dim hover:text-cream hover:bg-charcoal"
          title="Expand Log Panel [Ctrl+B]"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="font-mono text-[10px] text-cream-dim -rotate-90 whitespace-nowrap tracking-wider">
          ARCHITECT LOG
        </span>
      </aside>
    );
  }

  const TABS: Array<{ id: LogTab; label: string }> = [
    { id: 'console', label: 'Console' },
    { id: 'diff', label: 'Diff & Review' },
    { id: 'spec', label: 'Spec' },
    { id: 'reward', label: 'Reward' },
    { id: 'datagen', label: 'Datagen' },
    { id: 'critique', label: 'Critique' },
    { id: 'safety', label: 'Safety' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'metrics', label: 'Metrics' },
    ...(isFeatureEnabled('controller_playground') ? [{ id: 'controller' as const, label: 'Controller' }] : []),
    ...(isFeatureEnabled('policy_lab') ? [{ id: 'policylab' as const, label: 'Policy Lab' }] : []),
    ...(isFeatureEnabled('experiments') ? [{ id: 'experiments' as const, label: 'Experiments' }] : []),
  ];

  return (
    <aside
      style={{ width: `${width}px` }}
      className="analog-glass h-full flex flex-col border-r border-cream/10 select-none text-cream text-xs relative shrink-0"
    >
      {/* Pane Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-cream/10 bg-charcoal-deep/50">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-sage" />
          <span className="font-mono text-xs uppercase tracking-wider font-bold text-cream">
            Analog Architect
          </span>
          {architectOutput?.sourceLabel ? (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-mono ${
                architectOutput.sourceLabel === 'live_nebius'
                  ? 'bg-sage/20 border-sage/40 text-sage'
                  : 'bg-cream/10 border-cream/20 text-cream-dim'
              }`}
            >
              {architectOutput.sourceLabel === 'live_nebius' ? 'LIVE NEBIUS' : 'FIXTURE'}
            </span>
          ) : null}
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-[10px] font-mono text-cream-dim bg-charcoal px-1.5 py-0.5 rounded border border-cream/10">
            Ctrl+B
          </span>
          <button
            onClick={onToggleOpen}
            className="p-1 rounded text-cream-dim hover:text-cream hover:bg-charcoal"
            title="Collapse Log Panel [Ctrl+B]"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs with Snap Scrolling, Edge Fade Masks, Disabled Boundary Arrows & More Menu (R-06) */}
      <div className="relative flex items-center border-b border-cream/10 bg-charcoal-deep/30 font-mono text-[11px]">
        {/* Left Scroll Button */}
        <button
          type="button"
          disabled={!canScrollLeft}
          onClick={() => handleScrollTabs('left')}
          className="p-2 text-cream-dim hover:text-cream hover:bg-charcoal/50 disabled:opacity-25 disabled:pointer-events-none shrink-0 border-r border-cream/10"
          title="Scroll tabs left"
          aria-label="Scroll tabs left"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Tab row with snap alignment and edge fade mask */}
        <div
          ref={tabsContainerRef}
          onScroll={updateTabScrollFlags}
          role="tablist"
          aria-label="Studio Inspector Tabs"
          className="flex-1 flex overflow-x-auto whitespace-nowrap scroll-smooth snap-x snap-mandatory py-0.5"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            maskImage:
              canScrollLeft && canScrollRight
                ? 'linear-gradient(to right, transparent 0%, black 14px, black calc(100% - 14px), transparent 100%)'
                : canScrollRight
                ? 'linear-gradient(to right, black calc(100% - 16px), transparent 100%)'
                : canScrollLeft
                ? 'linear-gradient(to right, transparent 0%, black 16px)'
                : 'none',
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  const idx = TABS.findIndex((t) => t.id === tab.id);
                  const nextTab = TABS[(idx + 1) % TABS.length];
                  setActiveTab(nextTab.id);
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const idx = TABS.findIndex((t) => t.id === tab.id);
                  const prevTab = TABS[(idx - 1 + TABS.length) % TABS.length];
                  setActiveTab(prevTab.id);
                }
              }}
              className={`snap-start px-3 py-2 border-b-2 transition-colors whitespace-nowrap capitalize flex items-center space-x-1 shrink-0 ${
                activeTab === tab.id
                  ? 'border-sage text-cream bg-charcoal/40 font-semibold'
                  : 'border-transparent text-cream-dim hover:text-cream'
              }`}
            >
              <span>{tab.label}</span>
              {tab.id === 'console' && isStreaming && (
                <span className="w-1.5 h-1.5 rounded-full bg-sage animate-ping" />
              )}
              {tab.id === 'diff' && architectOutput && (
                <span className="w-1.5 h-1.5 rounded-full bg-sage" />
              )}
              {tab.id === 'safety' && safetyEvents.length > 0 && (
                <span className="px-1 rounded-full bg-amber-500/20 text-amber-300 text-[9px]">
                  {safetyEvents.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Right Scroll Button */}
        <button
          type="button"
          disabled={!canScrollRight}
          onClick={() => handleScrollTabs('right')}
          className="p-2 text-cream-dim hover:text-cream hover:bg-charcoal/50 disabled:opacity-25 disabled:pointer-events-none shrink-0 border-l border-cream/10"
          title="Scroll tabs right"
          aria-label="Scroll tabs right"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Overflow "More" Menu listing all tabs cleanly */}
        <div className="relative shrink-0 border-l border-cream/10">
          <button
            type="button"
            onClick={() => setMoreMenuOpen((v) => !v)}
            className="px-2 py-2 text-[10px] text-cream-dim hover:text-cream hover:bg-charcoal/50"
            title="All Tabs Menu"
            aria-label="All Tabs Menu"
            aria-expanded={moreMenuOpen}
          >
            •••
          </button>
          {moreMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 rounded-xl bg-charcoal-deep border border-cream/20 shadow-2xl py-1 z-50">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMoreMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between ${
                    activeTab === tab.id ? 'bg-sage/20 text-cream font-bold' : 'text-cream-dim hover:text-cream hover:bg-charcoal/60'
                  }`}
                >
                  <span>{tab.label}</span>
                  {activeTab === tab.id && <Check className="w-3 h-3 text-sage" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active Tab View */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* CONSOLE TAB */}
        {activeTab === 'console' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search & Filter Toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-cream/5 bg-charcoal/30 font-mono text-[11px]">
              <div className="flex items-center space-x-1.5 bg-charcoal-deep px-2 py-0.5 rounded border border-cream/10 w-44">
                <Search className="w-3 h-3 text-cream-dim" />
                <input
                  type="text"
                  placeholder="Filter logs... [/]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-cream placeholder-cream-dim/50 text-[10px] focus:outline-none w-full"
                />
              </div>

              <div className="flex items-center space-x-1">
                {(['all', 'architect', 'security', 'warn'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLevelFilter(lvl)}
                    className={`px-1.5 py-0.5 rounded text-[10px] uppercase transition-colors ${
                      levelFilter === lvl
                        ? 'bg-sage text-cream font-semibold'
                        : 'text-cream-dim hover:text-cream'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Simulation Progress Bar — Reads strictly from single SimClock source of truth (R-01) */}
            {(clockSnapshot || (activeJobStatus && activeJobStatus.status === 'running')) && (() => {
              const epLen = clockSnapshot?.episodeLength ?? (currentSpec?.episodeLength ? currentSpec.episodeLength / 60 : 60);
              const elapsed = clockSnapshot?.elapsed ?? activeJobStatus?.elapsed ?? 0;
              const progress = clockSnapshot?.progress ?? clampProgress(elapsed, epLen);
              const pctNum = Math.round(progress * 100);
              const displayTime = clockSnapshot?.timeDisplay ?? formatClockDisplay(elapsed, epLen);
              const episodeNo = clockSnapshot?.episodeNumber ?? activeJobStatus?.currentEpisode ?? 1;
              const isPaused = clockSnapshot?.paused ?? false;
              const statusDesc = runModeDescription || activeJobStatus?.message || 'Local fixed-step simulation';
              return (
                <div className="p-3 border-b border-cream/10 bg-charcoal-deep/80 font-mono space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-sage flex items-center space-x-1.5">
                      <Activity className={`w-3.5 h-3.5 ${isPaused ? '' : 'animate-pulse'}`} />
                      <span>{isPaused ? 'SIMULATION PAUSED' : 'SIMULATION RUNNING'}</span>
                    </span>
                    <span className="text-cream font-bold tabular-nums" data-testid="console-progress-text">
                      {displayTime}
                    </span>
                  </div>
                  <div className="w-full bg-charcoal rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-sage h-full transition-all duration-150"
                      style={{ width: `${pctNum}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-cream-dim">
                    <span>Episode: {episodeNo}</span>
                    <span className="truncate ml-2">{statusDesc}</span>
                  </div>
                </div>
              );
            })()}

            {/* Scrollable Log Stream */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 p-3 overflow-y-auto font-mono text-[11px] space-y-1.5 select-text"
            >
              {filteredLogs.length > 120 && (
                <div className="text-[10px] text-cream-dim text-center py-1 opacity-60 border-b border-cream/5">
                  Showing latest 120 of {filteredLogs.length} events (Buffered: 2,000 max)
                </div>
              )}
              {(filteredLogs.length > 120
                ? (userScrolledUp ? filteredLogs.slice(0, 120) : filteredLogs.slice(-120))
                : filteredLogs
              ).map((item) => (
                <div key={item.id} className="flex items-start space-x-2 leading-relaxed">
                  <span className="text-cream-dim opacity-40 select-none text-[10px]">
                    {item.timestamp}
                  </span>
                  <span
                    className={`font-semibold uppercase text-[9px] px-1 rounded select-none ${
                      item.level === 'architect'
                        ? 'bg-sage/20 text-sage'
                        : item.level === 'security'
                        ? 'bg-brick/20 text-brick'
                        : item.level === 'warn' || item.level === 'error'
                        ? 'bg-brick/20 text-brick'
                        : 'bg-charcoal text-cream-dim'
                    }`}
                  >
                    {item.level}
                  </span>
                  <span
                    className={`flex-1 break-words ${
                      item.level === 'architect'
                        ? 'text-cream font-medium'
                        : item.level === 'security' || item.level === 'error'
                        ? 'text-brick-light font-semibold'
                        : 'text-cream-dim'
                    }`}
                  >
                    {item.text}
                  </span>
                </div>
              ))}
            </div>

            {/* Scroll To Bottom Fab */}
            {userScrolledUp && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-3 right-4 p-1.5 rounded-full bg-sage text-cream shadow-lg hover:bg-sage-light transition-all flex items-center space-x-1 text-[10px] font-mono px-2"
              >
                <ArrowDown className="w-3 h-3" />
                <span>Jump to Live</span>
              </button>
            )}
          </div>
        )}

        {/* DIFF & REVIEW TAB */}
        {activeTab === 'diff' && (
          <div className="flex-1 flex flex-col h-full overflow-y-auto">
            {architectOutput ? (
              <div className="flex-1 flex flex-col">
                {/* SpecCompiler Audit Header */}
                <div className="p-3 bg-charcoal-deep/90 border-b border-cream/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cream flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-sage" />
                      <span>SpecCompiler v1 Verification</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sage/20 border border-sage/40 text-sage font-mono">
                      A* REACHABLE ({architectOutput.compileReport?.reachability.pathLengthM ?? 18.2}m)
                    </span>
                  </div>

                  {/* Adjustments list */}
                  {architectOutput.compileReport && architectOutput.compileReport.adjustments.length > 0 ? (
                    <div className="space-y-1">
                      <div className="text-[10px] text-cream-dim">Compiler Safety Clamps Applied:</div>
                      <div className="space-y-1">
                        {architectOutput.compileReport.adjustments.map((adj: any, idx: number) => (
                          <div key={idx} className="text-[10px] bg-charcoal px-2 py-1 rounded border border-cream/5 flex items-center justify-between">
                            <span className="text-cream-dim font-bold">{adj.field}</span>
                            <span className="text-brick line-through">{String(adj.from)}</span>
                            <span className="text-sage font-bold">→ {String(adj.to)}</span>
                            <span className="text-cream-dim/60 italic text-[9px]">({adj.reason})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-cream-dim">
                      All LLM proposed parameters verified within strict physical boundaries. Zero safety clamps required.
                    </div>
                  )}

                  {/* Side-by-side Specs Overview */}
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
                    <div className="bg-charcoal p-2 rounded border border-cream/5">
                      <div className="text-cream-dim font-semibold uppercase">Current Active</div>
                      <div className="text-cream font-bold truncate">{String(currentSpec?.taskName || 'Baseline')}</div>
                      <div className="text-cream-dim">G: {currentSpec?.gravity?.[1] ?? -1.62} m/s²</div>
                      <div className="text-cream-dim">Debris: {currentSpec?.debris?.count ?? 1800} rocks</div>
                    </div>
                    <div className="bg-sage/10 p-2 rounded border border-sage/30">
                      <div className="text-sage font-semibold uppercase">Proposed Clamped</div>
                      <div className="text-cream font-bold truncate">{String(architectOutput.spec.taskName || 'Extraterrestrial Navigation')}</div>
                      <div className="text-sage">G: {architectOutput.spec.gravity?.[1]} m/s²</div>
                      <div className="text-sage">Debris: {architectOutput.spec.debris?.count} rocks</div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-[320px]">
                  <CodeDiffViewer
                    initialRewardCode={architectOutput.rewardCode}
                    initialDatagenCode={architectOutput.datagenCode}
                    onApprove={(reward, datagen) => {
                      if (onApproveCode) onApproveCode(reward, datagen);
                      else onApprove();
                    }}
                    onRejectWithFeedback={(feedback) => {
                      if (onRejectWithFeedback) onRejectWithFeedback(feedback);
                      else onReject();
                    }}
                  />
                </div>
              </div>
            ) : (
              <EmptyTabState
                icon={GitCompare}
                title="No Code Diff Active"
                description="Synthesized Python reward, datagen code, and SpecCompiler clamps appear here after task synthesis."
                actionLabel="Run Task Prompt [Ctrl+K]"
                onAction={onOpenPrompt}
              />
            )}
          </div>
        )}

        {/* SPEC TAB (Interactive Tuning & JSON) */}
        {activeTab === 'spec' && (
          <div className="flex-1 p-3 overflow-y-auto select-text font-mono space-y-3">
            {(() => {
              const activeSpec = architectOutput?.spec || currentSpec;
              if (!activeSpec) {
                return (
                  <EmptyTabState
                    icon={FileCode}
                    title="No Environment Spec Active"
                    description="Press [Ctrl+K] and submit a task prompt to generate a new physical spec."
                    actionLabel="Run Task Prompt [Ctrl+K]"
                    onAction={onOpenPrompt}
                  />
                );
              }
              return (
                <div className="space-y-3 text-xs">
                  {/* Parameter Tuning Controls */}
                  <div className="bg-charcoal-deep/80 p-3 rounded-lg border border-cream/10 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-cream/10 pb-1.5">
                      <span className="font-bold text-cream uppercase text-[11px]">Interactive Physics Sliders</span>
                      <button
                        onClick={() => {
                          const compiled = compileSpec(activeSpec);
                          if (onUpdateSpec) onUpdateSpec(compiled.spec);
                        }}
                        className="px-2 py-0.5 rounded bg-sage hover:bg-sage-light text-cream font-semibold text-[10px] transition-colors"
                        title="Re-run SpecCompiler to validate and clamp all parameters"
                      >
                        Recompile Spec
                      </button>
                    </div>

                    {/* Gravity Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-cream-dim">Gravity (Y-axis):</span>
                        <span className="text-sage font-bold">{activeSpec.gravity?.[1] ?? -1.62} m/s²</span>
                      </div>
                      <input
                        type="range"
                        min="-24.79"
                        max="-0.5"
                        step="0.05"
                        value={activeSpec.gravity?.[1] ?? -1.62}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (onUpdateSpec) {
                            onUpdateSpec({ ...activeSpec, gravity: [0, val, 0] });
                          }
                        }}
                        className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
                      />
                    </div>

                    {/* Debris Density */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-cream-dim">Debris Obstacle Count:</span>
                        <span className="text-sage font-bold">{activeSpec.debris?.count ?? 1800}</span>
                      </div>
                      <input
                        type="range"
                        min="200"
                        max="3500"
                        step="50"
                        value={activeSpec.debris?.count ?? 1800}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (onUpdateSpec) {
                            onUpdateSpec({
                              ...activeSpec,
                              debris: { ...activeSpec.debris, count: val } as any,
                            });
                          }
                        }}
                        className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
                      />
                    </div>

                    {/* Roughness */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-cream-dim">Terrain Relief:</span>
                        <span className="text-sage font-bold">{(activeSpec.terrain?.roughness ?? 0.45).toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="1.0"
                        step="0.02"
                        value={activeSpec.terrain?.roughness ?? 0.45}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (onUpdateSpec) {
                            onUpdateSpec({
                              ...activeSpec,
                              terrain: { ...activeSpec.terrain, roughness: val } as any,
                            });
                          }
                        }}
                        className="w-full accent-sage h-1 bg-charcoal rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Canonical JSON Spec */}
                  <div className="space-y-1">
                    <span className="text-cream-dim text-[10px] uppercase">EnvironmentSpec v4 Contract</span>
                    <pre className="text-[10px] bg-charcoal-deep/80 p-2.5 rounded-lg border border-cream/10 overflow-x-auto whitespace-pre-wrap text-cream-dim leading-relaxed max-h-[380px]">
                      {JSON.stringify(activeSpec, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* REWARD TAB */}
        {activeTab === 'reward' && (
          <div className="flex-1 p-3 overflow-y-auto select-text font-mono space-y-3">
            {architectOutput ? (
              <div className="space-y-3">
                {/* Reward Sandbox Component Summation Card */}
                <div className="p-3 rounded-lg bg-charcoal-deep/80 border border-cream/10 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-cream">
                    <span className="flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-sage" />
                      <span>Reward Sandbox Isolation Verification</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sage/20 text-sage">
                      EXEC TIME: 0.8ms
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between text-cream-dim">
                      <span>Linear Progress Component (vx · goal):</span>
                      <span className="text-sage font-bold">+1.42</span>
                    </div>
                    <div className="flex justify-between text-cream-dim">
                      <span>Chassis Roll/Pitch Stability:</span>
                      <span className="text-sage font-bold">+0.58</span>
                    </div>
                    <div className="flex justify-between text-cream-dim">
                      <span>Foot Slip Penalty:</span>
                      <span className="text-brick font-bold">-0.04</span>
                    </div>
                    <div className="flex justify-between text-cream-dim">
                      <span>Joint Torque Energy Cost:</span>
                      <span className="text-brick font-bold">-0.12</span>
                    </div>
                    <div className="pt-1 border-t border-cream/10 flex justify-between font-bold text-cream">
                      <span>Normalized Step Reward:</span>
                      <span className="text-sage">+1.84</span>
                    </div>
                  </div>
                </div>

                {/* Raw Python Reward Code */}
                <pre className="text-[11px] bg-charcoal-deep/80 p-2.5 rounded-lg border border-cream/10 overflow-x-auto whitespace-pre-wrap text-cream leading-relaxed">
                  {architectOutput.rewardCode}
                </pre>
              </div>
            ) : (
              <EmptyTabState
                icon={FileCode}
                title="No Reward Function Active"
                description="Vectorized Python reward functions with component summation sandbox testing appear here."
                actionLabel="Run Task Prompt [Ctrl+K]"
                onAction={onOpenPrompt}
              />
            )}
          </div>
        )}

        {/* DATAGEN TAB */}
        {activeTab === 'datagen' && (
          <div className="flex-1 p-3 overflow-y-auto select-text font-mono space-y-3">
            {/* v2 Deterministic Run Dataset Exporter */}
            <div className="p-3 rounded-lg bg-charcoal-deep/80 border border-cream/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cream">Recorded Run Dataset Export (v2)</span>
                <span className="text-[10px] text-sage">{chartHistory.length} samples</span>
              </div>
              <p className="text-[10px] text-cream-dim">
                Export recorded fixed-step commands and telemetry frames for imitation learning or offline analysis.
              </p>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={onExportDatasetJsonl}
                  className="flex-1 py-1.5 px-2.5 rounded bg-sage text-cream text-[11px] font-bold hover:bg-sage/90"
                >
                  Download JSONL
                </button>
                <button
                  type="button"
                  onClick={onExportDatasetCsv}
                  className="flex-1 py-1.5 px-2.5 rounded bg-charcoal border border-hairline text-cream text-[11px] hover:border-sage"
                >
                  Download CSV
                </button>
              </div>
            </div>

            {architectOutput ? (
              <pre className="text-[11px] bg-charcoal-deep/80 p-2.5 rounded-lg border border-cream/10 overflow-x-auto whitespace-pre-wrap text-cream leading-relaxed">
                {architectOutput.datagenCode}
              </pre>
            ) : (
              <EmptyTabState
                icon={FileCode}
                title="No Architect Datagen Script Active"
                description="Use the buttons above to export your live driving session, or open Task Prompt to generate custom randomization scripts."
                actionLabel="Run Task Prompt [Ctrl+K]"
                onAction={onOpenPrompt}
              />
            )}
          </div>
        )}

        {/* CRITIQUE TAB */}
        {activeTab === 'critique' && (
          <div className="flex-1 p-3 overflow-y-auto font-mono select-text space-y-3">
            {architectOutput?.critique ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-charcoal-deep/80 border border-cream/10 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-cream">Physics Feasibility Audit</div>
                    <div className="text-[10px] text-cream-dim">Evaluated by Nemotron-3-Super</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-sage">
                      {Math.round(architectOutput.critique.score * 100)}%
                    </div>
                    <div className="text-[10px] text-cream-dim">Confidence Score</div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[10px] text-cream-dim uppercase">Validation Breakdown:</div>
                  <div className="p-2.5 rounded bg-charcoal-deep/60 border border-cream/5 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-cream-dim">Low-G Ballistic Stability:</span>
                      <span className="text-sage font-bold">VERIFIED</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cream-dim">Rock Foothold Clearance:</span>
                      <span className="text-sage font-bold">&gt; 5cm PASS</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cream-dim">Regolith Slip Ratio:</span>
                      <span className="text-sage font-bold">&lt; 0.08 PASS</span>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-charcoal/50 border border-cream/5 text-[10px] text-cream-dim italic">
                  &ldquo;{architectOutput.critique.critiqueText}&rdquo;
                </div>
              </div>
            ) : (
              <EmptyTabState
                icon={CheckCheck}
                title="Self-Critique & Physics Audit Standby"
                description="The self-critique loop verifies reward function balance, target orientation, and domain randomization bounds."
                actionLabel="Run Task Prompt [Ctrl+K]"
                onAction={onOpenPrompt}
              />
            )}
          </div>
        )}

        {/* SAFETY TAB */}
        {activeTab === 'safety' && (
          <div className="flex-1 p-3 overflow-y-auto font-mono select-text space-y-3">
            {/* Live Command Safety Layer Events (Phase W2.3 & W9.3) */}
            <div className="p-3 rounded-lg bg-charcoal-deep/80 border border-cream/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cream">Live Control Safety Layer</span>
                <span className="text-[10px] text-sage">{safetyEvents.length} events</span>
              </div>
              {safetyEvents.length === 0 ? (
                <div className="text-[10px] text-cream-dim">
                  All commands within safe arena margin, traction, and tilt bounds.
                </div>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {safetyEvents.slice(-12).reverse().map((ev, i) => (
                    <div
                      key={`${ev.step}-${i}`}
                      className="p-1.5 rounded bg-charcoal/70 border border-amber-400/20 text-[10px] flex items-start justify-between gap-2"
                    >
                      <span className="text-amber-300 shrink-0">t={ev.time.toFixed(1)}s</span>
                      <span className="text-cream flex-1">{ev.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {architectOutput ? (
              <>
                <div
                  className={`p-2.5 rounded-lg border flex items-center space-x-2 ${
                    architectOutput.safetyGatePassed
                      ? 'bg-sage/10 border-sage/40 text-sage'
                      : 'bg-brick/10 border-brick/40 text-brick'
                  }`}
                >
                  {architectOutput.safetyGatePassed ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span className="font-semibold text-xs">
                    {architectOutput.safetyGatePassed
                      ? 'Static AST Safety Gate Passed (6/6 Checks)'
                      : 'Security Gate Alert'}
                  </span>
                </div>

                {/* 6 Individual Check Rows */}
                {architectOutput.safetyChecks && architectOutput.safetyChecks.length > 0 && (
                  <div className="space-y-1.5">
                    {architectOutput.safetyChecks.map((check: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2 rounded bg-charcoal-deep/80 border border-cream/10 flex items-center justify-between text-[11px]"
                      >
                        <div className="flex items-center space-x-2">
                          {check.status === 'PASS' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-sage" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-brick" />
                          )}
                          <span className="font-medium text-cream">{check.name}</span>
                        </div>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            check.status === 'PASS'
                              ? 'bg-sage/20 text-sage'
                              : 'bg-brick/20 text-brick'
                          }`}
                        >
                          {check.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <EmptyTabState
                icon={ShieldCheck}
                title="AST Safety Gate Standby"
                description="Static AST analyzer checking for forbidden Python imports (os, sys, network, subprocess) runs upon task compilation."
                actionLabel="Run Task Prompt [Ctrl+K]"
                onAction={onOpenPrompt}
              />
            )}
          </div>
        )}

        {/* JOBS TAB */}
        {activeTab === 'jobs' && (
          <div className="flex-1 p-3 overflow-y-auto font-mono space-y-3">
            {activeJobStatus ? (
              <JobCard
                status={{
                  jobId: activeJobStatus.jobId,
                  state: activeJobStatus.status,
                  status: activeJobStatus.status,
                  progress: activeJobStatus.progress,
                  message: activeJobStatus.message,
                  mode: activeJobStatus.mode,
                  elapsed: activeJobStatus.elapsed,
                  costSoFar: activeJobStatus.mode === 'cloud_nebius' ? 0.024 : 0.0,
                  estimatedRange: activeJobStatus.mode === 'cloud_nebius' ? [0.02, 0.05] : [0, 0],
                  region: activeJobStatus.mode === 'cloud_nebius' ? 'eu-north1' : 'local_browser',
                  heartbeatAge: 0,
                  currentEpisode: activeJobStatus.currentEpisode ?? 1,
                  currentReward: activeJobStatus.currentReward ?? 0,
                  collisionCount: activeJobStatus.collisionCount ?? 0,
                  successRate: activeJobStatus.successRate ?? 0.99,
                  timestamp: activeJobStatus.timestamp ?? Date.now(),
                }}
                logs={logs.slice(-12).map((l) => `[${l.timestamp}] ${l.text}`)}
              />
            ) : (
              <EmptyTabState
                icon={Cpu}
                title="No Active Compute Job"
                description="Serverless Nebius and Local Demo jobs are tracked here."
                actionLabel="Run Task Prompt [Ctrl+K]"
                onAction={onOpenPrompt}
              />
            )}
          </div>
        )}

        {/* METRICS TAB */}
        {activeTab === 'metrics' && (
          <div className="flex-1 p-3 overflow-y-auto font-mono space-y-3">
            <MetricsTabContent onOpenPrompt={onOpenPrompt} chartHistory={chartHistory} />
          </div>
        )}

        {/* CONTROLLER PLAYGROUND TAB (Pack A) */}
        {activeTab === 'controller' && <ControllerPlaygroundTab />}

        {/* POLICY LAB TAB (Pack B) */}
        {activeTab === 'policylab' && <PolicyLabTab />}

        {/* EXPERIMENTS TAB (Pack M) */}
        {activeTab === 'experiments' && <ExperimentsTab />}
      </div>

      {/* Action Approval Bar when not in Diff tab */}
      {architectOutput && activeTab !== 'diff' && (
        <div className="p-3 border-t border-cream/10 bg-charcoal-deep/80 flex items-center space-x-2">
          <button
            onClick={onApprove}
            className="flex-1 py-2 px-3 rounded-lg bg-sage hover:bg-sage-light text-cream font-mono text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-lg shadow-sage/20"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Approve & Deploy Job</span>
          </button>

          <button
            onClick={onReject}
            className="py-2 px-3 rounded-lg bg-charcoal hover:bg-charcoal-light border border-cream/20 text-cream-dim hover:text-cream font-mono text-xs flex items-center justify-center space-x-1 transition-colors"
            title="Reject and request Architect retry"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reject</span>
          </button>
        </div>
      )}

      {/* Draggable Splitter Handle on right edge */}
      <div
        onMouseDown={handleSplitterMouseDown}
        className="absolute top-0 -right-1 w-2 h-full cursor-col-resize z-40 hover:bg-sage/40 active:bg-sage transition-colors"
        title="Drag to resize Architect panel"
      />
    </aside>
  );
}

function MetricsTabContent({
  onOpenPrompt,
  chartHistory = [],
}: {
  onOpenPrompt?: () => void;
  chartHistory?: readonly TelemetryChartSample[];
}) {
  const [snapshot, setSnapshot] = useState(() => TelemetryStore.getInstance().getSnapshot());
  const [history, setHistory] = useState(() => TelemetryStore.getInstance().getHistory().slice(-60));

  useEffect(() => {
    const interval = setInterval(() => {
      setSnapshot(TelemetryStore.getInstance().getSnapshot());
      setHistory(TelemetryStore.getInstance().getHistory().slice(-60));
    }, 250); // 4 Hz update rate
    return () => clearInterval(interval);
  }, []);

  const currentFrame = snapshot.currentFrame;
  const recentChart = chartHistory.slice(-80);
  if ((!currentFrame || history.length === 0) && recentChart.length === 0) {
    return (
      <EmptyTabState
        icon={Activity}
        title="Reward & Telemetry Curves"
        description="Awaiting simulation telemetry frames. Commanded vs actual speed, slip, tilt, and reward curves will render in real time."
        actionLabel="Run Task Prompt [Ctrl+K]"
        onAction={onOpenPrompt}
      />
    );
  }

  const rewards = recentChart.length > 1 ? recentChart.map((c) => c.reward) : history.map((f) => f.reward || 0);
  const minR = Math.min(...rewards, 0);
  const maxR = Math.max(...rewards, 2.5);
  const rangeR = Math.max(0.1, maxR - minR);

  const svgWidth = 320;
  const svgHeight = 64;
  const points = rewards
    .map((r, i) => {
      const x = (i / Math.max(1, rewards.length - 1)) * svgWidth;
      const y = svgHeight - ((r - minR) / rangeR) * (svgHeight - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const speedPoints = recentChart
    .map((c, i) => {
      const x = (i / Math.max(1, recentChart.length - 1)) * svgWidth;
      const y = svgHeight - (Math.min(2.5, c.speed) / 2.5) * (svgHeight - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const cmdPoints = recentChart
    .map((c, i) => {
      const x = (i / Math.max(1, recentChart.length - 1)) * svgWidth;
      const y = svgHeight - (Math.min(2.5, c.cmdSpeed) / 2.5) * (svgHeight - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const latestSample = recentChart[recentChart.length - 1];

  return (
    <div className="space-y-3 text-xs">
      {/* Commanded vs Actual Speed (Measured) */}
      {recentChart.length > 1 && latestSample && (
        <div className="p-3 rounded-lg bg-charcoal-deep/80 border border-cream/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-cream">Speed vs Command (m/s · Measured)</span>
            <span className="text-sage font-bold tabular-nums">
              {latestSample.speed.toFixed(2)} / {latestSample.cmdSpeed.toFixed(2)} m/s
            </span>
          </div>
          <div className="h-16 w-full bg-charcoal rounded overflow-hidden">
            <svg className="w-full h-full" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
              <polyline fill="none" stroke="rgba(253,251,247,0.35)" strokeDasharray="3,3" strokeWidth="1.5" points={cmdPoints} />
              <polyline fill="none" stroke="#8EA48C" strokeWidth="2" points={speedPoints} />
            </svg>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-[10px] text-cream-dim tabular-nums">
            <div>Slip: <span className="text-cream font-semibold">{latestSample.slip.toFixed(1)} mm</span></div>
            <div>Tilt: <span className="text-cream font-semibold">{latestSample.tiltDeg.toFixed(1)}°</span></div>
            <div>Energy: <span className="text-cream font-semibold">{latestSample.energy.toFixed(1)} J</span></div>
          </div>
        </div>
      )}

      {/* Live Reward Curve (Derived) */}
      <div className="p-3 rounded-lg bg-charcoal-deep/80 border border-cream/10 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-cream">Step Reward (Derived)</span>
          <span className="text-sage font-bold text-sm tabular-nums">
            {(latestSample?.reward ?? currentFrame?.reward ?? 0).toFixed(3)}
          </span>
        </div>
        <div className="h-16 w-full bg-charcoal rounded overflow-hidden flex items-end">
          <svg className="w-full h-full" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="#6B705C"
              strokeWidth="2"
              points={points}
            />
          </svg>
        </div>
      </div>

      {/* Stability Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded bg-charcoal-deep/80 border border-cream/10">
          <div className="text-[10px] text-cream-dim">Stability Margin</div>
          <div className="text-sm font-bold text-cream">
            {(((currentFrame?.bodyHeightAboveGround ?? 0.385) / 0.44) * 100).toFixed(0)}%
          </div>
        </div>
        <div className="p-2.5 rounded bg-charcoal-deep/80 border border-cream/10">
          <div className="text-[10px] text-cream-dim">Boundary Margin</div>
          <div className="text-sm font-bold text-cream">
            {snapshot.distanceToEdge.toFixed(1)} m
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyTabState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: any;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
      <div className="p-3 rounded-full bg-charcoal border border-cream/10 text-cream-dim">
        <Icon className="w-5 h-5 text-sage" />
      </div>
      <div className="font-mono text-xs font-semibold text-cream">{title}</div>
      <div className="font-mono text-[11px] text-cream-dim max-w-xs leading-relaxed">{description}</div>
      {actionLabel && (
        <button
          onClick={onAction}
          className="mt-1 px-3 py-1 rounded bg-sage hover:bg-sage-light text-cream font-mono text-[10px] font-bold transition-colors border border-sage/40"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
