'use client';

import React, { useState } from 'react';
import {
  BrainCircuit,
  Sparkles,
  Play,
  CheckCircle2,
  AlertTriangle,
  Compass,
  Gauge,
  ChevronDown,
  ChevronUp,
  Cpu,
  RefreshCw,
  Send,
} from 'lucide-react';
import {
  NemotronTaskPlan,
  PLANNER_PRESETS,
  generateDeterministicPlan,
} from '@/lib/nebius/taskPlanner';

interface NemotronPlannerPanelProps {
  currentPose?: [number, number, number];
  onExecutePlan?: (plan: NemotronTaskPlan) => void;
  onClearPlan?: () => void;
  activePlan?: NemotronTaskPlan | null;
  isExecuting?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

export default function NemotronPlannerPanel({
  currentPose = [0, 0.44, 0],
  onExecutePlan,
  onClearPlan,
  activePlan = null,
  isExecuting = false,
  isCollapsed = false,
  onToggleCollapse,
  className = '',
}: NemotronPlannerPanelProps) {
  const [prompt, setPrompt] = useState(PLANNER_PRESETS[0]!.prompt);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<NemotronTaskPlan | null>(activePlan);

  const handleGeneratePlan = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, currentPose }),
      });
      if (!res.ok) throw new Error('Planner API request failed');
      const data: NemotronTaskPlan = await res.json();
      setPlan(data);
    } catch {
      // Deterministic client fallback if network or route error
      const fallback = generateDeterministicPlan(prompt, currentPose);
      setPlan(fallback);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = () => {
    if (plan && onExecutePlan) {
      onExecutePlan(plan);
    }
  };

  return (
    <div
      className={`analog-glass-elevated border border-cream/15 rounded-xl overflow-hidden shadow-2xl flex flex-col font-mono text-xs select-none transition-all duration-200 ${className}`}
      data-testid="nemotron-planner-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#1F1F1F] border-b border-cream/10">
        <div className="flex items-center space-x-2">
          <BrainCircuit className="w-4 h-4 text-sage" />
          <span className="font-bold tracking-wider text-cream uppercase text-[11px]">
            Nemotron Task Planner
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-sage/20 text-sage border border-sage/30 uppercase">
            Agentic AI
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {plan && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-charcoal text-cream-dim border border-cream/10 uppercase">
              {plan.source === 'nemotron_live' ? 'NVIDIA Nemotron' : 'Fixture'}
            </span>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded text-cream-dim hover:text-cream hover:bg-cream/10 transition-colors"
              title={isCollapsed ? 'Expand Planner' : 'Collapse Planner'}
            >
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3.5 space-y-4 overflow-y-auto max-h-[calc(100vh-280px)] custom-scrollbar">
          {/* Natural Language Prompt Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-cream-dim tracking-wider border-b border-cream/5 pb-1">
              <span>Natural Language Goal</span>
              <span className="text-[9px] text-cream-dim">Pose: [{currentPose[0].toFixed(1)}, {currentPose[2].toFixed(1)}]m</span>
            </div>

            <div className="space-y-1.5">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter robotics exploration or navigation task..."
                rows={2}
                className="w-full p-2 rounded bg-charcoal-deep border border-cream/15 text-cream text-[11px] focus:outline-none focus:border-sage resize-none custom-scrollbar"
              />

              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 custom-scrollbar">
                {PLANNER_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPrompt(p.prompt)}
                    className="px-2 py-0.5 rounded bg-charcoal hover:bg-cream/10 text-cream-dim hover:text-cream border border-cream/10 text-[9px] whitespace-nowrap transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <button
                onClick={handleGeneratePlan}
                disabled={loading}
                className="w-full py-2 px-3 rounded bg-sage/20 hover:bg-sage/30 border border-sage/40 hover:border-sage/70 text-cream font-bold uppercase tracking-wider text-[11px] flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-sage" />
                    <span>Reasoning Trajectory (Nemotron)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-sage" />
                    <span>Generate Structured Plan</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active Generated Plan Inspector */}
          {plan ? (
            <div className="space-y-3 p-3 rounded-lg bg-charcoal-deep/60 border border-cream/10">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-cream text-[11px] uppercase tracking-wider">
                    {plan.task_name}
                  </div>
                  <div className="text-[10px] text-cream-dim">{plan.summary}</div>
                </div>

                {isExecuting ? (
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[9px] px-2 py-0.5 rounded bg-sage/30 text-sage border border-sage/50 font-bold uppercase animate-pulse">
                      EXECUTING
                    </span>
                    {onClearPlan && (
                      <button
                        type="button"
                        onClick={onClearPlan}
                        className="py-0.5 px-2 rounded bg-brick/20 hover:bg-brick/35 text-brick border border-brick/40 font-bold text-[9px] uppercase"
                      >
                        Stop
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleExecute}
                    className="py-1 px-2.5 rounded bg-sage hover:bg-sage/90 text-charcoal-deep font-bold text-[10px] uppercase flex items-center space-x-1 transition-colors"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Execute Plan</span>
                  </button>
                )}
              </div>

              {/* Waypoints Table */}
              <div className="space-y-1">
                <div className="text-[9px] font-bold text-cream-dim uppercase">
                  Waypoints ({plan.waypoints.length})
                </div>
                <div className="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                  {plan.waypoints.map((w) => (
                    <div
                      key={w.id}
                      className="p-1.5 rounded bg-charcoal/80 border border-cream/5 flex items-center justify-between text-[10px]"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-4 h-4 rounded-full bg-sage/20 border border-sage/40 text-sage flex items-center justify-center text-[9px] font-bold">
                          {w.id}
                        </span>
                        <span className="text-cream tabular-nums">
                          [{w.position[0].toFixed(1)}, {w.position[1].toFixed(1)}, {w.position[2].toFixed(1)}]m
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-[9px]">
                        <span className="text-cream-dim">{w.target_speed.toFixed(2)} m/s</span>
                        {w.action && (
                          <span className="px-1.5 py-0.5 rounded bg-charcoal-deep text-cream-dim border border-cream/10 uppercase">
                            {w.action}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Safety Envelope Constraints */}
              <div className="p-2 rounded bg-charcoal/60 border border-cream/5 space-y-1">
                <div className="text-[9px] font-bold text-cream-dim uppercase">Safety Constraints</div>
                <div className="grid grid-cols-2 gap-2 text-[9px]">
                  <div className="flex justify-between text-cream-dim">
                    <span>Max Pitch / Roll:</span>
                    <span className="text-cream font-bold tabular-nums">
                      {plan.safety_constraints.max_pitch_deg}° / {plan.safety_constraints.max_roll_deg}°
                    </span>
                  </div>
                  <div className="flex justify-between text-cream-dim">
                    <span>Max Velocity:</span>
                    <span className="text-cream font-bold tabular-nums">
                      {plan.safety_constraints.max_linear_vel.toFixed(2)} m/s
                    </span>
                  </div>
                  <div className="flex justify-between text-cream-dim">
                    <span>Min Obstacle Clearance:</span>
                    <span className="text-cream font-bold tabular-nums">
                      {plan.safety_constraints.min_obstacle_clearance.toFixed(2)} m
                    </span>
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div className="text-[9px] text-cream-dim italic border-t border-cream/5 pt-1.5">
                <span className="font-bold not-italic text-cream-dim">Nemotron Reasoning: </span>
                {plan.reasoning}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-cream-dim text-[10px] bg-charcoal-deep/20 rounded border border-cream/5">
              Click &apos;Generate Structured Plan&apos; to query NVIDIA Nemotron for optimal waypoint routes and safety envelopes.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
