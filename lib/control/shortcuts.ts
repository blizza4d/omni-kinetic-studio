/**
 * Single Shortcut Registry (v2)
 *
 * Defines every keyboard binding across the studio with conflict detection,
 * typing-target suppression, user remapping, persistence, and automatic
 * documentation generation for the `?` Shortcuts Dialog and Controls Cheat Sheet.
 */

export type ShortcutContext = 'global' | 'driving' | 'editor' | 'playback';

export interface ShortcutBinding {
  id: string;
  label: string;
  description: string;
  category: 'Driving' | 'Camera' | 'Studio' | 'Simulation' | 'Editor';
  context: ShortcutContext;
  defaultKeys: string[]; // Canonical key combos: e.g. ['KeyW', 'ArrowUp'], ['Ctrl+KeyK']
  keys: string[];
  gamepad?: string;
  touch?: string;
  remappable: boolean;
}

export interface RemapResult {
  ok: boolean;
  conflictId?: string;
  conflictLabel?: string;
  reason?: string;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function normalizeKeyCombo(e: {
  code?: string;
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  // Preserve Shift only when combined with non-symbol keys or explicit combos
  if (e.shiftKey && e.key !== '?' && e.code !== 'ShiftLeft' && e.code !== 'ShiftRight') {
    parts.push('Shift');
  }
  if (e.key === '?') return '?';
  if (e.key === '/' && !e.ctrlKey && !e.altKey) return '/';
  const base = e.code || e.key || '';
  parts.push(base);
  return parts.join('+');
}

export function formatKeyLabel(combo: string): string {
  return combo
    .replace(/^Key([A-Z])$/, '$1')
    .replace(/\+Key([A-Z])$/, '+$1')
    .replace(/^Digit([0-9])$/, '$1')
    .replace(/\+Digit([0-9])$/, '+$1')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('Space', 'Space')
    .replace('Escape', 'Esc')
    .replace('ShiftLeft', 'Shift');
}

export const DEFAULT_SHORTCUTS: Omit<ShortcutBinding, 'keys'>[] = [
  // Driving
  {
    id: 'toggle_control',
    label: 'Take / Release Control',
    description: 'Switch between manual driving and autonomous Policy v1',
    category: 'Driving',
    context: 'global',
    defaultKeys: ['KeyT', 'Enter'],
    gamepad: 'Y',
    touch: 'Mode chip',
    remappable: true,
  },
  {
    id: 'move_forward',
    label: 'Move Forward',
    description: 'Drive droid forward (+X body axis)',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['KeyW', 'ArrowUp'],
    gamepad: 'Left Stick ↑',
    touch: 'Left Joystick ↑',
    remappable: true,
  },
  {
    id: 'move_backward',
    label: 'Move Backward',
    description: 'Reverse droid (-X body axis)',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['KeyS', 'ArrowDown'],
    gamepad: 'Left Stick ↓',
    touch: 'Left Joystick ↓',
    remappable: true,
  },
  {
    id: 'turn_left',
    label: 'Turn Left',
    description: 'Rotate yaw counter-clockwise',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['KeyA', 'ArrowLeft'],
    gamepad: 'Right Stick ←',
    touch: 'Right Pad ←',
    remappable: true,
  },
  {
    id: 'turn_right',
    label: 'Turn Right',
    description: 'Rotate yaw clockwise',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['KeyD', 'ArrowRight'],
    gamepad: 'Right Stick →',
    touch: 'Right Pad →',
    remappable: true,
  },
  {
    id: 'strafe_left',
    label: 'Strafe Left',
    description: 'Translate laterally left (-Z body axis)',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['KeyJ', 'Shift+KeyA'],
    gamepad: 'Left Stick ←',
    touch: 'Left Joystick ←',
    remappable: true,
  },
  {
    id: 'strafe_right',
    label: 'Strafe Right',
    description: 'Translate laterally right (+Z body axis)',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['KeyL', 'Shift+KeyD'],
    gamepad: 'Left Stick →',
    touch: 'Left Joystick →',
    remappable: true,
  },
  {
    id: 'sprint',
    label: 'Sprint / Bound',
    description: 'Hold to accelerate into bounding gait',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['ShiftLeft'],
    gamepad: 'RT',
    touch: 'Sprint button',
    remappable: true,
  },
  {
    id: 'hop',
    label: 'Charge & Hop',
    description: 'Hold up to 0.6s to charge crouch, release to launch low-gravity hop',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['Space'],
    gamepad: 'A',
    touch: 'Hop button',
    remappable: true,
  },
  {
    id: 'crouch',
    label: 'Crouch',
    description: 'Hold to lower chassis height smoothly',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['KeyC'],
    gamepad: 'X',
    touch: 'Crouch toggle',
    remappable: true,
  },
  {
    id: 'stand_tall',
    label: 'Stand Tall',
    description: 'Hold to raise chassis height smoothly',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['KeyV'],
    gamepad: 'D-Pad ↑',
    touch: 'Height slider',
    remappable: true,
  },
  {
    id: 'emergency_stop',
    label: 'Emergency Stop / Recover',
    description: 'Immediately brake to neutral stance or stand up from stumble',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['KeyX'],
    gamepad: 'B',
    touch: 'Stop button',
    remappable: true,
  },
  {
    id: 'gait_auto',
    label: 'Gait: Auto (Froude)',
    description: 'Automatic gravity-aware gait selection',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['Digit0'],
    gamepad: 'LB / RB',
    touch: 'Gait chip',
    remappable: true,
  },
  {
    id: 'gait_walk',
    label: 'Gait: Walk',
    description: 'Force 4-beat crawl/walk gait',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['Digit1'],
    gamepad: 'LB / RB',
    touch: 'Gait chip',
    remappable: true,
  },
  {
    id: 'gait_trot',
    label: 'Gait: Trot',
    description: 'Force diagonal-pair trot gait',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['Digit2'],
    gamepad: 'LB / RB',
    touch: 'Gait chip',
    remappable: true,
  },
  {
    id: 'gait_bound',
    label: 'Gait: Bound',
    description: 'Force front/hind lunar bounding gait',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['Digit3'],
    gamepad: 'LB / RB',
    touch: 'Gait chip',
    remappable: true,
  },
  {
    id: 'gait_pronk',
    label: 'Gait: Pronk',
    description: 'Force synchronized 4-leg pronk gait',
    category: 'Driving',
    context: 'driving',
    defaultKeys: ['Digit4'],
    gamepad: 'LB / RB',
    touch: 'Gait chip',
    remappable: true,
  },

  // Camera
  {
    id: 'camera_frame',
    label: 'Frame Droid',
    description: 'Reset camera offset smoothly onto droid',
    category: 'Camera',
    context: 'global',
    defaultKeys: ['KeyF'],
    gamepad: 'R3',
    touch: 'Double-tap HUD',
    remappable: true,
  },
  {
    id: 'camera_follow',
    label: 'Camera: Follow',
    description: 'Smooth spring-damped chase camera',
    category: 'Camera',
    context: 'global',
    defaultKeys: ['Alt+Digit1'],
    gamepad: 'D-Pad →',
    touch: 'Camera menu',
    remappable: true,
  },
  {
    id: 'camera_orbit',
    label: 'Camera: Orbit',
    description: 'Interactive orbital camera around droid',
    category: 'Camera',
    context: 'global',
    defaultKeys: ['Alt+Digit2'],
    gamepad: 'D-Pad →',
    touch: 'Drag / Pinch',
    remappable: true,
  },
  {
    id: 'camera_topdown',
    label: 'Camera: Top-Down',
    description: 'Overhead map view',
    category: 'Camera',
    context: 'global',
    defaultKeys: ['Alt+Digit3'],
    gamepad: 'D-Pad →',
    touch: 'Camera menu',
    remappable: true,
  },
  {
    id: 'camera_fpv',
    label: 'Camera: First-Person',
    description: 'Stabilized droid head-mounted camera',
    category: 'Camera',
    context: 'global',
    defaultKeys: ['Alt+Digit4'],
    gamepad: 'D-Pad →',
    touch: 'Camera menu',
    remappable: true,
  },
  {
    id: 'camera_freefly',
    label: 'Camera: Free-Fly',
    description: 'Unconstrained inspection camera',
    category: 'Camera',
    context: 'global',
    defaultKeys: ['Alt+Digit5'],
    gamepad: 'D-Pad →',
    touch: 'Camera menu',
    remappable: true,
  },

  // Studio (Preserved existing shortcuts — NEVER collide with Q, P, Ctrl+K, Ctrl+B, ?, /)
  {
    id: 'open_palette',
    label: 'Task Prompt / Palette',
    description: 'Open Nemotron task prompt and command palette',
    category: 'Studio',
    context: 'global',
    defaultKeys: ['Ctrl+KeyK'],
    remappable: false,
  },
  {
    id: 'toggle_panel',
    label: 'Toggle Side Panel',
    description: 'Collapse or expand left architect/console drawer',
    category: 'Studio',
    context: 'global',
    defaultKeys: ['Ctrl+KeyB'],
    remappable: false,
  },
  {
    id: 'toggle_perf',
    label: 'Toggle PerfProbe',
    description: 'Open performance & frame-time diagnostics panel',
    category: 'Studio',
    context: 'global',
    defaultKeys: ['KeyP'],
    remappable: true,
  },
  {
    id: 'cycle_quality',
    label: 'Cycle Quality Tier',
    description: 'Cycle rendering quality tier (low / medium / high / ultra)',
    category: 'Studio',
    context: 'global',
    defaultKeys: ['KeyQ'],
    remappable: true,
  },
  {
    id: 'toggle_hud_legend',
    label: 'Toggle Control Legend',
    description: 'Show or hide on-screen control legend HUD',
    category: 'Studio',
    context: 'global',
    defaultKeys: ['KeyH'],
    remappable: true,
  },
  {
    id: 'open_shortcuts',
    label: 'Shortcuts & Help',
    description: 'Open keyboard, gamepad, and touch shortcuts reference',
    category: 'Studio',
    context: 'global',
    defaultKeys: ['?'],
    remappable: false,
  },
  {
    id: 'focus_log_filter',
    label: 'Filter Console Logs',
    description: 'Focus the console log filter search box',
    category: 'Studio',
    context: 'global',
    defaultKeys: ['/'],
    remappable: false,
  },
  {
    id: 'capture_screenshot',
    label: 'Capture 2x Screenshot',
    description: 'Render crisp 2x resolution PNG snapshot',
    category: 'Studio',
    context: 'global',
    defaultKeys: ['F12'],
    remappable: true,
  },
  {
    id: 'pause_menu',
    label: 'Pause / Clear Waypoints',
    description: 'Toggle pause menu or cancel active waypoints',
    category: 'Simulation',
    context: 'global',
    defaultKeys: ['Escape'],
    gamepad: 'Start',
    touch: 'Pause button',
    remappable: false,
  },
  {
    id: 'toggle_editor',
    label: 'Scenario Editor',
    description: 'Toggle top-down scenario and waypoint editor',
    category: 'Editor',
    context: 'global',
    defaultKeys: ['KeyE'],
    remappable: true,
  },
];

export class ShortcutRegistry {
  private readonly bindings = new Map<string, ShortcutBinding>();
  private listeners = new Set<() => void>();

  constructor(initialOverrides?: Record<string, string[]>) {
    for (const def of DEFAULT_SHORTCUTS) {
      this.register({
        ...def,
        keys: initialOverrides?.[def.id] ? [...initialOverrides[def.id]] : [...def.defaultKeys],
      });
    }
  }

  public register(binding: ShortcutBinding): RemapResult {
    const conflict = this.findConflict(binding.id, binding.keys, binding.context);
    if (conflict) {
      return {
        ok: false,
        conflictId: conflict.id,
        conflictLabel: conflict.label,
        reason: `Key conflict with "${conflict.label}" (${conflict.id})`,
      };
    }
    this.bindings.set(binding.id, { ...binding, keys: [...binding.keys] });
    this.notify();
    return { ok: true };
  }

  public findConflict(
    excludeId: string,
    keys: string[],
    context: ShortcutContext
  ): ShortcutBinding | null {
    for (const [id, existing] of this.bindings.entries()) {
      if (id === excludeId) continue;
      // Global conflicts with everything; same context conflicts with itself
      const contextOverlaps =
        existing.context === 'global' || context === 'global' || existing.context === context;
      if (!contextOverlaps) continue;
      for (const k of keys) {
        if (existing.keys.includes(k)) {
          return existing;
        }
      }
    }
    return null;
  }

  public remap(id: string, newKeys: string[]): RemapResult {
    const existing = this.bindings.get(id);
    if (!existing) return { ok: false, reason: `Unknown shortcut id "${id}"` };
    if (!existing.remappable) {
      return { ok: false, reason: `"${existing.label}" is locked and cannot be remapped.` };
    }
    if (!newKeys || newKeys.length === 0) {
      return { ok: false, reason: 'At least one key binding is required.' };
    }
    const conflict = this.findConflict(id, newKeys, existing.context);
    if (conflict) {
      return {
        ok: false,
        conflictId: conflict.id,
        conflictLabel: conflict.label,
        reason: `Key "${formatKeyLabel(newKeys[0])}" is already bound to "${conflict.label}".`,
      };
    }
    existing.keys = [...newKeys];
    this.notify();
    return { ok: true };
  }

  public resetAll(): void {
    for (const binding of this.bindings.values()) {
      binding.keys = [...binding.defaultKeys];
    }
    this.notify();
  }

  public get(id: string): ShortcutBinding | undefined {
    return this.bindings.get(id);
  }

  public getAll(): ShortcutBinding[] {
    return Array.from(this.bindings.values());
  }

  public exportOverrides(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const b of this.bindings.values()) {
      if (b.keys.join(',') !== b.defaultKeys.join(',')) {
        out[b.id] = [...b.keys];
      }
    }
    return out;
  }

  public matches(id: string, combo: string): boolean {
    const b = this.bindings.get(id);
    if (!b) return false;
    return b.keys.includes(combo);
  }

  public isActionHeld(id: string, pressedCodes: ReadonlySet<string>, shiftHeld = false): boolean {
    const b = this.bindings.get(id);
    if (!b) return false;
    for (const combo of b.keys) {
      if (combo.startsWith('Shift+')) {
        const key = combo.slice(6);
        if (shiftHeld && pressedCodes.has(key)) return true;
      } else if (!combo.includes('+')) {
        if (pressedCodes.has(combo)) return true;
      }
    }
    return false;
  }

  /**
   * Validates zero conflicts across the entire registry.
   */
  public verifyNoConflicts(): { ok: boolean; conflicts: string[] } {
    const conflicts: string[] = [];
    for (const b of this.bindings.values()) {
      const c = this.findConflict(b.id, b.keys, b.context);
      if (c) {
        conflicts.push(`${b.id} conflicts with ${c.id}`);
      }
    }
    return { ok: conflicts.length === 0, conflicts };
  }

  /**
   * Generates Markdown controls cheat sheet directly from registry data.
   */
  public toMarkdownTable(): string {
    const lines = [
      '| Action | Keyboard | Gamepad | Touch | Notes |',
      '|--------|----------|---------|-------|-------|',
    ];
    for (const b of this.bindings.values()) {
      const kb = b.keys.map(formatKeyLabel).join(' / ');
      lines.push(`| ${b.label} | \`${kb}\` | ${b.gamepad || '—'} | ${b.touch || '—'} | ${b.description} |`);
    }
    return lines.join('\n');
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}

let globalRegistry: ShortcutRegistry | null = null;
export function getShortcutRegistry(): ShortcutRegistry {
  if (!globalRegistry) {
    globalRegistry = new ShortcutRegistry();
  }
  return globalRegistry;
}
