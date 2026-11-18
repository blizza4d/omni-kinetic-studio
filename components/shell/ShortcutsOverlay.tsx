'use client';

import React, { useEffect, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { getShortcutRegistry, formatKeyLabel, ShortcutBinding } from '@/lib/control/shortcuts';

interface ShortcutsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutsOverlay({ isOpen, onClose }: ShortcutsOverlayProps) {
  const [bindings, setBindings] = useState<ShortcutBinding[]>(() => getShortcutRegistry().getAll());

  useEffect(() => {
    if (!isOpen) return;
    const reg = getShortcutRegistry();
    setBindings(reg.getAll());
    return reg.subscribe(() => setBindings(reg.getAll()));
  }, [isOpen]);

  if (!isOpen) return null;

  const categories: ShortcutBinding['category'][] = ['Driving', 'Camera', 'Studio', 'Simulation', 'Editor'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard, Gamepad, and Touch Shortcuts"
    >
      <div
        className="w-full max-w-3xl max-h-[82vh] flex flex-col bg-charcoal-deep border border-cream/20 rounded-2xl shadow-2xl overflow-hidden font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline">
          <div className="flex items-center space-x-2">
            <Keyboard className="w-4 h-4 text-sage" />
            <h2 className="text-sm font-bold text-cream">Controls & Shortcuts Reference (Generated from Registry)</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Shortcuts"
            className="text-cream-dim hover:text-cream"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {categories.map((cat) => {
            const items = bindings.filter((b) => b.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-sage border-b border-hairline pb-1">
                  {cat}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {items.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-charcoal/60 border border-hairline"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] text-cream font-semibold truncate">{b.label}</div>
                        <div className="text-[9px] text-cream-dim truncate">{b.description}</div>
                      </div>
                      <div className="flex items-center space-x-1 shrink-0">
                        {b.keys.map((k) => (
                          <kbd
                            key={k}
                            className="px-1.5 py-0.5 rounded bg-charcoal-deep border border-cream/20 text-[10px] text-cream font-bold"
                          >
                            {formatKeyLabel(k)}
                          </kbd>
                        ))}
                        {b.gamepad && (
                          <span className="px-1 py-0.5 rounded bg-sage/20 text-sage text-[9px]" title="Gamepad">
                            {b.gamepad}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-hairline flex items-center justify-between text-[10px] text-cream-dim">
          <span>All remappable keys can be customized in Settings → Controls.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded bg-sage text-cream font-bold"
          >
            Close [Esc]
          </button>
        </div>
      </div>
    </div>
  );
}
