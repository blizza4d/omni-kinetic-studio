'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SlidersHorizontal, Eye, EyeOff, Radio, Compass, Activity, ShieldAlert, Cpu } from 'lucide-react';

interface LayoutSettings {
  showLogPanel: boolean;
  showRadar: boolean;
  showOverlays: boolean;
  showColliderDebug: boolean;
  showDustParticles: boolean;
  adaptiveQuality: boolean;
}

interface LayoutMenuProps {
  settings: LayoutSettings;
  onUpdateSettings: (newSettings: Partial<LayoutSettings>) => void;
  onOpenShortcuts: () => void;
  onOpenStatus: () => void;
}

export default function LayoutMenu({
  settings,
  onUpdateSettings,
  onOpenShortcuts,
  onOpenStatus,
}: LayoutMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('mousedown', handleOutsideClick);
    }
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const toggleItem = (key: keyof LayoutSettings) => {
    onUpdateSettings({ [key]: !settings[key] });
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Viewport Layout & Visual Overlays Menu"
        aria-label="Layout & Visual Settings"
        className="px-2.5 py-1 rounded bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream font-mono text-xs flex items-center space-x-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-sage"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-sage" />
        <span>Layout</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-9 z-50 w-64 analog-glass-elevated p-3 text-cream font-mono text-xs shadow-2xl border border-cream/20 space-y-3 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-cream/10 pb-2">
            <span className="uppercase text-[11px] font-bold text-sage">Viewport Layout</span>
            <span className="text-[10px] text-cream-dim">Analog AI</span>
          </div>

          <div className="space-y-1.5">
            <button
              onClick={() => toggleItem('showLogPanel')}
              className="w-full flex items-center justify-between p-1.5 rounded hover:bg-charcoal text-left"
            >
              <span>Architect Log [Ctrl+B]</span>
              {settings.showLogPanel ? (
                <Eye className="w-3.5 h-3.5 text-sage" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-cream-dim" />
              )}
            </button>

            <button
              onClick={() => toggleItem('showRadar')}
              className="w-full flex items-center justify-between p-1.5 rounded hover:bg-charcoal text-left"
            >
              <span>Terrain Radar</span>
              {settings.showRadar ? (
                <Compass className="w-3.5 h-3.5 text-sage" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-cream-dim" />
              )}
            </button>

            <button
              onClick={() => toggleItem('showOverlays')}
              className="w-full flex items-center justify-between p-1.5 rounded hover:bg-charcoal text-left"
            >
              <span>Motion Trails & Goal [V]</span>
              {settings.showOverlays ? (
                <Radio className="w-3.5 h-3.5 text-sage" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-cream-dim" />
              )}
            </button>

            <button
              onClick={() => toggleItem('showColliderDebug')}
              className="w-full flex items-center justify-between p-1.5 rounded hover:bg-charcoal text-left"
            >
              <span>Collider Wireframe [C]</span>
              {settings.showColliderDebug ? (
                <ShieldAlert className="w-3.5 h-3.5 text-brick" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-cream-dim" />
              )}
            </button>

            <button
              onClick={() => toggleItem('showDustParticles')}
              className="w-full flex items-center justify-between p-1.5 rounded hover:bg-charcoal text-left"
            >
              <span>Atmospheric Dust</span>
              {settings.showDustParticles ? (
                <Activity className="w-3.5 h-3.5 text-sage" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-cream-dim" />
              )}
            </button>

            <button
              onClick={() => toggleItem('adaptiveQuality')}
              className="w-full flex items-center justify-between p-1.5 rounded hover:bg-charcoal text-left"
            >
              <span>Adaptive Quality (60 FPS)</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${settings.adaptiveQuality ? 'bg-sage/20 text-sage' : 'bg-charcoal text-cream-dim'}`}>
                {settings.adaptiveQuality ? 'AUTO' : 'MAX'}
              </span>
            </button>
          </div>

          <div className="pt-2 border-t border-cream/10 space-y-1">
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenShortcuts();
              }}
              className="w-full text-left p-1.5 rounded hover:bg-charcoal text-[11px] text-cream-dim hover:text-cream flex items-center justify-between"
            >
              <span>Shortcuts Cheat Sheet</span>
              <kbd className="px-1.5 py-0.5 bg-charcoal rounded border border-cream/15 text-[10px] text-cream">?</kbd>
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                onOpenStatus();
              }}
              className="w-full text-left p-1.5 rounded hover:bg-charcoal text-[11px] text-cream-dim hover:text-cream flex items-center justify-between"
            >
              <span>System Health & Status</span>
              <Cpu className="w-3 h-3 text-sage" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
