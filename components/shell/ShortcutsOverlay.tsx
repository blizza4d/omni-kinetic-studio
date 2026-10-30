'use client';

import React from 'react';
import { X, Keyboard, Command } from 'lucide-react';

interface ShortcutsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutsOverlay({ isOpen, onClose }: ShortcutsOverlayProps) {
  if (!isOpen) return null;

  const shortcutGroups = [
    {
      title: 'Studio & Navigation',
      items: [
        { key: 'Ctrl+K / Cmd+K', label: 'Command Palette / Task Prompt input' },
        { key: '?', label: 'Open this keyboard shortcuts cheat sheet' },
        { key: 'P', label: 'Toggle PerfProbe diagnostics panel' },
        { key: 'Q', label: 'Cycle active Quality Tier (Ultra -> Potato)' },
        { key: 'Ctrl+B', label: 'Toggle left Architect log panel' },
        { key: 'J', label: 'Launch 3-minute scripted Judge Mode tour' },
        { key: 'Esc', label: 'Close active modals / exit teleop' },
      ],
    },
    {
      title: 'Simulation & Replay',
      items: [
        { key: 'Space', label: 'Play / Pause simulation or replay' },
        { key: ',', label: 'Step 1 frame backward' },
        { key: '.', label: 'Step 1 frame forward' },
        { key: '[ / ]', label: 'Decrease / Increase playback speed (0.25x - 4x)' },
        { key: 'R', label: 'Reset simulation run' },
      ],
    },
    {
      title: 'Spatial 3D Viewport',
      items: [
        { key: '1', label: 'Chase Camera (follows robot with lead look-ahead)' },
        { key: '2', label: 'Top-down Orthographic Camera' },
        { key: '3', label: 'Side Profile Camera' },
        { key: '4', label: 'Free Orbit Camera (Mouse Drag / Scroll Zoom)' },
        { key: 'B', label: 'Toggle visual arena boundary rim' },
        { key: 'C', label: 'Toggle collider debug wireframe sphere' },
        { key: 'V', label: 'Toggle motion trails & goal beacons' },
      ],
    },
    {
      title: 'Review Flow & Teleop',
      items: [
        { key: 'A', label: 'Approve current Architect code artifact' },
        { key: 'E', label: 'Edit current artifact inline' },
        { key: 'X', label: 'Reject artifact with feedback reason' },
        { key: 'S', label: 'Toggle 11-stage Architect pipeline rail' },
        { key: 'T', label: 'Toggle CV Teleop mode (Webcam tracking)' },
        { key: '1 - 4', label: 'Select active limb (FL, FR, RL, RR) in keyboard teleop' },
        { key: 'WASD', label: 'Keyboard teleoperation driving' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="analog-glass-elevated max-w-2xl w-full p-6 text-cream shadow-2xl space-y-6 border border-cream/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-cream/10 pb-3">
          <div className="flex items-center space-x-3">
            <Keyboard className="w-5 h-5 text-sage" />
            <h2 className="font-mono text-sm uppercase tracking-wider font-bold">
              Keyboard Shortcuts & Controls
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-cream-muted hover:text-cream hover:bg-charcoal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto pr-2">
          {shortcutGroups.map((group, idx) => (
            <div key={idx} className="space-y-2">
              <h3 className="font-mono text-xs uppercase tracking-wider text-sage font-semibold">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded bg-charcoal-deep/60 border border-cream/5 text-xs font-mono"
                  >
                    <span className="text-cream-dim text-[11px] pr-2">{item.label}</span>
                    <kbd className="px-2 py-0.5 rounded bg-charcoal text-cream text-[11px] border border-cream/15 font-semibold whitespace-nowrap">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-cream/10 flex items-center justify-between text-xs font-mono text-cream-dim">
          <span>Linear-inspired workstation design</span>
          <span className="text-sage">[Esc] to close</span>
        </div>
      </div>
    </div>
  );
}
