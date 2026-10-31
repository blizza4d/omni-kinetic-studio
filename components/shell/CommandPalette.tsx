'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Sparkles, Play, ShieldAlert, Cpu, X } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitPrompt: (prompt: string) => void;
  onToggleSimMode: () => void;
  currentMode: 'cloud_nebius' | 'local_demo';
  onToggleTeleop: () => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onSubmitPrompt,
  onToggleSimMode,
  currentMode,
  onToggleTeleop,
}: CommandPaletteProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSubmitPrompt(input.trim());
      setInput('');
      onClose();
    }
  };

  const handlePreset = (preset: string) => {
    onSubmitPrompt(preset);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm">
      <div className="analog-panel-elevated w-full max-w-2xl rounded-lg border border-cream/20 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Input Bar */}
        <form onSubmit={handleSubmit} className="flex items-center px-4 py-3.5 border-b border-cream/10">
          <Terminal className="w-5 h-5 text-sage mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type embodied task prompt (e.g. 'Train quadruped to navigate low-gravity debris field')..."
            className="w-full bg-transparent text-sm font-mono text-cream placeholder-cream-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-cream-muted hover:text-cream ml-2 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </form>

        {/* Suggested Quick Task Prompts */}
        <div className="p-4 space-y-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-cream-muted">
            Suggested Physical AI Tasks
          </div>
          <div className="space-y-1.5">
            {[
              {
                title: 'Low-Gravity Debris Navigation (Hackathon Default)',
                prompt: 'Train a 12-DOF quadruped to navigate a low-gravity cratered debris field with obstacle avoidance',
                icon: Sparkles,
              },
              {
                title: 'High-Roughness Steep Incline Ascent',
                prompt: 'Quadruped high-friction slope climbing under Earth gravity with pitch stability reward',
                icon: Play,
              },
              {
                title: 'Dynamic Obstacle Perturbation & Contact Balancing',
                prompt: 'Quadruped trot gait with domain-randomized lateral gust forces and contact recovery',
                icon: Cpu,
              },
            ].map((item, idx) => (
              <button
                key={idx}
                onClick={() => handlePreset(item.prompt)}
                className="w-full flex items-center justify-between p-2.5 rounded bg-charcoal-deep/60 hover:bg-charcoal border border-cream/5 hover:border-sage/40 transition-colors text-left group"
              >
                <div className="flex items-center space-x-3">
                  <item.icon className="w-4 h-4 text-cream-muted group-hover:text-sage transition-colors" />
                  <div>
                    <div className="text-xs font-mono font-medium text-cream">{item.title}</div>
                    <div className="text-[11px] text-cream-muted line-clamp-1">{item.prompt}</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-cream-muted bg-charcoal px-2 py-0.5 rounded border border-cream/10">
                  Enter
                </span>
              </button>
            ))}
          </div>

          {/* Simulation Execution Engine Selector */}
          <div className="pt-2 border-t border-cream/10 space-y-2 text-xs font-mono">
            <div className="text-[10px] text-cream-dim uppercase tracking-wider flex items-center justify-between">
              <span>Simulation Execution Mode</span>
              <span className="text-sage">{currentMode === 'cloud_nebius' ? '[CLOUD: L40S]' : '[DEMO: LOCAL RUNNER]'}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (currentMode !== 'local_demo') onToggleSimMode();
                  onClose();
                }}
                className={`p-2 rounded border text-left flex items-center justify-between transition-colors ${
                  currentMode === 'local_demo'
                    ? 'bg-charcoal border-sage text-cream'
                    : 'bg-charcoal-deep/60 border-cream/10 text-cream-dim hover:text-cream hover:bg-charcoal'
                }`}
              >
                <div>
                  <div className="font-semibold text-[11px] text-cream">Demo Local Runner</div>
                  <div className="text-[9px] text-cream-dim">Deterministic pure kinematics, 0 cold start</div>
                </div>
                {currentMode === 'local_demo' && <span className="text-[9px] px-1 py-0.5 rounded bg-sage/20 text-sage">ACTIVE</span>}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (currentMode !== 'cloud_nebius') onToggleSimMode();
                  onClose();
                }}
                className={`p-2 rounded border text-left flex items-center justify-between transition-colors ${
                  currentMode === 'cloud_nebius'
                    ? 'bg-charcoal border-sage text-cream'
                    : 'bg-charcoal-deep/60 border-cream/10 text-cream-dim hover:text-cream hover:bg-charcoal'
                }`}
                title="Nebius Serverless L40S GPU container with S3 chunked relay"
              >
                <div>
                  <div className="font-semibold text-[11px] text-cream">Nebius Cloud L40S</div>
                  <div className="text-[9px] text-cream-dim">NVIDIA L40S GPU, S3 telemetry relay</div>
                </div>
                {currentMode === 'cloud_nebius' && <span className="text-[9px] px-1 py-0.5 rounded bg-sage/20 text-sage">ACTIVE</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
