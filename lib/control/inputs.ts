/**
 * Unified Multi-Modal Input Manager (Phase W3)
 *
 * Aggregates Keyboard, Gamepad API, Touch Virtual Joystick, Click-to-Move
 * Waypoints, Right-Button Pointer Drive, and OneEuro-filtered CV Teleop into a
 * single typed `LocomotionCommand` with zero per-frame allocations.
 *
 * Guarantees:
 * - Stuck-key prevention on `window.blur` and `document.visibilitychange`
 * - Ignores `event.repeat` for edge-triggered actions (hop, toggle, gait)
 * - Radial deadzone + response curve + per-axis inversion for Gamepad
 * - Gamepad disconnect detection + graceful keyboard fallback
 * - Charge-hop up to 0.6s with visible charge ratio [0..1]
 * - One-handed accessibility mode (auto-forward + A/D steering)
 */

import {
  ControlSource,
  GaitMode,
  LocomotionCommand,
  Waypoint,
  createNeutralCommand,
} from './types';
import { radialDeadzone } from './shape';
import { ShortcutRegistry, isTypingTarget, normalizeKeyCombo } from './shortcuts';
import {
  purePursuit,
  findPolylineLookahead,
  computeObstacleAvoidanceYaw,
  PursuitOut,
  ObstaclePoint,
} from './purePursuit';
import { OneEuroFilter } from '../filters/one_euro';

export interface InputSettings {
  sensitivity: number;       // 0.4..2.0
  gamepadDeadzone: number;   // 0.05..0.35
  gamepadCurve: number;      // 1.0..2.5 (default 1.5)
  invertYaw: boolean;
  invertCameraY: boolean;
  oneHandedMode: boolean;    // auto-forward with A/D steering
  pointerDriveEnabled: boolean;
  avoidRocks: boolean;
  hapticsEnabled: boolean;
}

export const DEFAULT_INPUT_SETTINGS: InputSettings = {
  sensitivity: 1.0,
  gamepadDeadzone: 0.15,
  gamepadCurve: 1.5,
  invertYaw: false,
  invertCameraY: false,
  oneHandedMode: false,
  pointerDriveEnabled: false,
  avoidRocks: true,
  hapticsEnabled: true,
};

export interface TouchInputState {
  moveX: number; // -1..1 strafe
  moveY: number; // -1..1 forward (up = +1)
  yawX: number;  // -1..1 turn
  sprint: boolean;
  crouch: boolean;
  hopHeld: boolean;
  stop: boolean;
  active: boolean;
}

export interface PointerDriveState {
  active: boolean;
  targetX: number;
  targetZ: number;
}

export interface InputVisualizerSnapshot {
  source: ControlSource;
  keysHeld: string[];
  moveX: number;
  moveY: number;
  yaw: number;
  sprint: boolean;
  hopCharging: boolean;
  hopCharge: number; // 0..1
  gamepadConnected: boolean;
  gamepadName: string | null;
  gamepadUnsupported: boolean;
  lastInputTimestampMs: number;
}

export class InputManager {
  public settings: InputSettings;
  private readonly registry: ShortcutRegistry;

  // Keyboard state
  private readonly pressedCodes = new Set<string>();
  private shiftHeld = false;
  private gaitOverride: GaitMode = 'auto';

  // Charge-hop state
  private hopHeld = false;
  private hopChargeSec = 0;
  private readonly maxHopChargeSec = 0.6;
  private pendingHopLaunch = false;
  private pendingHopCharge = 0;
  private pendingStop = false;

  // Gamepad state
  private gamepadConnected = false;
  private gamepadName: string | null = null;
  private gamepadUnsupported = false;
  private prevGamepadButtons: boolean[] = [];
  public gamepadCameraPitchDelta = 0;

  // Touch state
  public readonly touch: TouchInputState = {
    moveX: 0,
    moveY: 0,
    yawX: 0,
    sprint: false,
    crouch: false,
    hopHeld: false,
    stop: false,
    active: false,
  };
  private prevTouchHopHeld = false;

  // Pointer drive & Click-to-Move waypoints
  public readonly pointerDrive: PointerDriveState = {
    active: false,
    targetX: 0,
    targetZ: 0,
  };
  private waypoints: Waypoint[] = [];
  private waypointCounter = 1;

  // CV Teleop OneEuro filters
  private readonly cvVxFilter = new OneEuroFilter(1.2, 0.02);
  private readonly cvYawFilter = new OneEuroFilter(1.2, 0.02);
  private cvActive = false;
  private cvRawVx = 0;
  private cvRawYaw = 0;

  // Latency measurement
  private lastInputTimestampMs = 0;
  private lastActiveManualSource: ControlSource = 'keyboard';

  // Preallocated scratch objects (zero per-frame allocations)
  private readonly _stickLeft = { x: 0, y: 0 };
  private readonly _stickRight = { x: 0, y: 0 };
  private readonly _pursuitOut: PursuitOut = { vx: 0, yawRate: 0, reached: false, distToTarget: 0 };
  private readonly _lookaheadPt = { x: 0, z: 0 };

  // Callbacks for studio actions & toasts
  private onToast?: (msg: string, level?: 'info' | 'warn') => void;
  private onAction?: (actionId: string) => void;

  // Bound DOM listeners for clean unmount
  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private boundKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private boundBlur: (() => void) | null = null;
  private boundVisibility: (() => void) | null = null;
  private boundGamepadConnected: ((e: GamepadEvent) => void) | null = null;
  private boundGamepadDisconnected: ((e: GamepadEvent) => void) | null = null;

  constructor(
    registry: ShortcutRegistry,
    settings?: Partial<InputSettings>,
    callbacks?: {
      onToast?: (msg: string, level?: 'info' | 'warn') => void;
      onAction?: (actionId: string) => void;
    }
  ) {
    this.registry = registry;
    this.settings = { ...DEFAULT_INPUT_SETTINGS, ...(settings || {}) };
    this.onToast = callbacks?.onToast;
    this.onAction = callbacks?.onAction;
  }

  public attachWindowListeners(): () => void {
    if (typeof window === 'undefined') return () => {};

    this.boundKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    this.boundKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);
    this.boundBlur = () => this.releaseAllKeys();
    this.boundVisibility = () => {
      if (document.hidden) this.releaseAllKeys();
    };
    this.boundGamepadConnected = (e: GamepadEvent) => {
      this.gamepadConnected = true;
      this.gamepadName = e.gamepad.id;
      this.gamepadUnsupported = e.gamepad.mapping !== 'standard';
      this.onToast?.(
        this.gamepadUnsupported
          ? `Gamepad connected (${e.gamepad.id}) — non-standard mapping; remap in Settings.`
          : `Gamepad connected: ${e.gamepad.id}`,
        this.gamepadUnsupported ? 'warn' : 'info'
      );
    };
    this.boundGamepadDisconnected = () => {
      this.gamepadConnected = false;
      this.gamepadName = null;
      this.gamepadUnsupported = false;
      this.pendingStop = true;
      this.onToast?.('Gamepad disconnected — falling back to keyboard; stopping smoothly.', 'warn');
    };

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('blur', this.boundBlur);
    document.addEventListener('visibilitychange', this.boundVisibility);
    window.addEventListener('gamepadconnected', this.boundGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.boundGamepadDisconnected);

    return () => {
      if (this.boundKeyDown) window.removeEventListener('keydown', this.boundKeyDown);
      if (this.boundKeyUp) window.removeEventListener('keyup', this.boundKeyUp);
      if (this.boundBlur) window.removeEventListener('blur', this.boundBlur);
      if (this.boundVisibility) document.removeEventListener('visibilitychange', this.boundVisibility);
      if (this.boundGamepadConnected) window.removeEventListener('gamepadconnected', this.boundGamepadConnected);
      if (this.boundGamepadDisconnected) window.removeEventListener('gamepaddisconnected', this.boundGamepadDisconnected);
    };
  }

  public releaseAllKeys(): void {
    this.pressedCodes.clear();
    this.shiftHeld = false;
    this.hopHeld = false;
    this.hopChargeSec = 0;
    this.pointerDrive.active = false;
    this.touch.active = false;
    this.touch.moveX = 0;
    this.touch.moveY = 0;
    this.touch.yawX = 0;
    this.touch.hopHeld = false;
  }

  public handleKeyDown(e: {
    code: string;
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    repeat?: boolean;
    target?: EventTarget | null;
    preventDefault?: () => void;
  }): void {
    const combo = normalizeKeyCombo(e);

    // Always allow Ctrl+K / Ctrl+B / Esc even in inputs
    if (this.registry.matches('open_palette', combo)) {
      e.preventDefault?.();
      this.onAction?.('open_palette');
      return;
    }
    if (this.registry.matches('toggle_panel', combo)) {
      e.preventDefault?.();
      this.onAction?.('toggle_panel');
      return;
    }
    if (e.code === 'Escape') {
      if (this.waypoints.length > 0) {
        this.clearWaypoints();
        this.onToast?.('Waypoints cleared.', 'info');
      }
      this.onAction?.('pause_menu');
      return;
    }

    // Suppress all other shortcuts while typing in text inputs
    if (isTypingTarget(e.target ?? null)) return;

    this.lastInputTimestampMs = typeof performance !== 'undefined' ? performance.now() : 0;

    // Edge-triggered global actions (ignore auto-repeat)
    if (!e.repeat) {
      const globalActions = [
        'toggle_control',
        'toggle_perf',
        'cycle_quality',
        'toggle_hud_legend',
        'open_shortcuts',
        'focus_log_filter',
        'capture_screenshot',
        'toggle_editor',
        'camera_frame',
        'camera_follow',
        'camera_orbit',
        'camera_topdown',
        'camera_fpv',
        'camera_freefly',
      ];
      for (const actId of globalActions) {
        if (this.registry.matches(actId, combo)) {
          e.preventDefault?.();
          this.onAction?.(actId);
          return;
        }
      }

      // Gait overrides (0..4)
      if (this.registry.matches('gait_auto', combo)) { this.gaitOverride = 'auto'; return; }
      if (this.registry.matches('gait_walk', combo)) { this.gaitOverride = 'walk'; return; }
      if (this.registry.matches('gait_trot', combo)) { this.gaitOverride = 'trot'; return; }
      if (this.registry.matches('gait_bound', combo)) { this.gaitOverride = 'bound'; return; }
      if (this.registry.matches('gait_pronk', combo)) { this.gaitOverride = 'pronk'; return; }

      // Emergency stop / recover
      if (this.registry.matches('emergency_stop', combo)) {
        this.pendingStop = true;
        this.clearWaypoints();
        this.onAction?.('emergency_stop');
        return;
      }

      // Charge hop start
      if (this.registry.matches('hop', combo)) {
        e.preventDefault?.();
        this.hopHeld = true;
        this.hopChargeSec = 0;
        this.lastActiveManualSource = 'keyboard';
        return;
      }
    }

    // Track continuous movement keys
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.shiftHeld = true;
    }
    this.pressedCodes.add(e.code);

    // Prevent browser scrolling on arrow keys / space when driving
    if (
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'Space'
    ) {
      e.preventDefault?.();
    }
  }

  public handleKeyUp(e: { code: string; key?: string }): void {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.shiftHeld = false;
    }
    this.pressedCodes.delete(e.code);

    if (this.registry.matches('hop', e.code) && this.hopHeld) {
      this.hopHeld = false;
      this.pendingHopLaunch = true;
      this.pendingHopCharge = Math.max(0.15, Math.min(1.0, this.hopChargeSec / this.maxHopChargeSec));
      this.hopChargeSec = 0;
    }
  }

  public setGaitOverride(gait: GaitMode): void {
    this.gaitOverride = gait;
  }

  public getGaitOverride(): GaitMode {
    return this.gaitOverride;
  }

  public setWaypoints(wps: Waypoint[]): void {
    this.waypoints = [...wps];
  }

  public getWaypoints(): readonly Waypoint[] {
    return this.waypoints;
  }

  public addWaypoint(x: number, z: number, append: boolean, reachable = true, maxSlopeDeg = 0): Waypoint {
    const wp: Waypoint = {
      id: `wp_${this.waypointCounter++}`,
      x,
      z,
      label: `WP ${this.waypoints.length + (append ? 1 : 0) || 1}`,
      reachable,
      maxSlopeDeg,
    };
    if (append) {
      this.waypoints.push(wp);
    } else {
      this.waypoints = [wp];
    }
    this.lastActiveManualSource = 'pointer';
    this.lastInputTimestampMs = typeof performance !== 'undefined' ? performance.now() : 0;
    return wp;
  }

  public removeLastWaypoint(): void {
    this.waypoints.pop();
  }

  public clearWaypoints(): void {
    this.waypoints = [];
  }

  public setCVTeleopCommand(active: boolean, vx: number, yawRate: number): void {
    this.cvActive = active;
    this.cvRawVx = Number.isFinite(vx) ? vx : 0;
    this.cvRawYaw = Number.isFinite(yawRate) ? yawRate : 0;
    if (!active) {
      this.cvVxFilter.reset();
      this.cvYawFilter.reset();
    } else {
      this.lastActiveManualSource = 'cv';
      this.lastInputTimestampMs = typeof performance !== 'undefined' ? performance.now() : 0;
    }
  }

  public triggerHaptics(strong = 0.35, weak = 0.2, durationMs = 90): void {
    if (!this.settings.hapticsEnabled || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    try {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        const actuator = pad && (pad as any).vibrationActuator;
        if (actuator && typeof actuator.playEffect === 'function') {
          actuator.playEffect('dual-rumble', {
            startDelay: 0,
            duration: durationMs,
            weakMagnitude: weak,
            strongMagnitude: strong,
          }).catch(() => {});
          break;
        }
      }
    } catch {
      // ignore unsupported haptics
    }
  }

  /**
   * Poll all input sources once per fixed step and populate `out` (zero heap allocations).
   */
  public poll(
    robotX: number,
    robotZ: number,
    robotHeading: number,
    obstacles: readonly ObstaclePoint[],
    dt: number,
    out: LocomotionCommand = createNeutralCommand()
  ): { source: ControlSource; hasActiveInput: boolean; cmd: LocomotionCommand } {
    out.vx = 0;
    out.vy = 0;
    out.yawRate = 0;
    out.bodyHeight = 0.5;
    out.gait = this.gaitOverride;
    out.hop = false;
    out.hopCharge = 0;
    out.stop = false;
    this.gamepadCameraPitchDelta = 0;

    let hasActiveInput = false;
    let source: ControlSource = this.lastActiveManualSource;

    // 1. Hop charge accumulation (keyboard or touch)
    if (this.hopHeld || this.touch.hopHeld) {
      this.hopChargeSec = Math.min(this.maxHopChargeSec, this.hopChargeSec + dt);
      // Visible crouch compression scaled by charge
      out.bodyHeight = 0.5 - 0.32 * (this.hopChargeSec / this.maxHopChargeSec);
      hasActiveInput = true;
    }
    if (this.prevTouchHopHeld && !this.touch.hopHeld) {
      this.pendingHopLaunch = true;
      this.pendingHopCharge = Math.max(0.2, Math.min(1.0, this.hopChargeSec / this.maxHopChargeSec));
      this.hopChargeSec = 0;
    }
    this.prevTouchHopHeld = this.touch.hopHeld;

    // 2. Keyboard input
    const fwd = this.registry.isActionHeld('move_forward', this.pressedCodes, this.shiftHeld) ? 1 : 0;
    const bwd = this.registry.isActionHeld('move_backward', this.pressedCodes, this.shiftHeld) ? 1 : 0;
    const turnL = this.registry.isActionHeld('turn_left', this.pressedCodes, this.shiftHeld) ? 1 : 0;
    const turnR = this.registry.isActionHeld('turn_right', this.pressedCodes, this.shiftHeld) ? 1 : 0;
    const strafeL = this.registry.isActionHeld('strafe_left', this.pressedCodes, this.shiftHeld) ? 1 : 0;
    const strafeR = this.registry.isActionHeld('strafe_right', this.pressedCodes, this.shiftHeld) ? 1 : 0;
    const crouchHeld = this.registry.isActionHeld('crouch', this.pressedCodes, this.shiftHeld);
    const standHeld = this.registry.isActionHeld('stand_tall', this.pressedCodes, this.shiftHeld);
    const sprintHeld = this.shiftHeld || this.touch.sprint;

    const kbAny =
      fwd > 0 || bwd > 0 || turnL > 0 || turnR > 0 || strafeL > 0 || strafeR > 0 || crouchHeld || standHeld;

    if (kbAny) {
      hasActiveInput = true;
      source = 'keyboard';
      this.lastActiveManualSource = 'keyboard';
      // Manual keyboard input cancels waypoint autopilot
      if (this.waypoints.length > 0 && (fwd || bwd || turnL || turnR || strafeL || strafeR)) {
        this.waypoints.length = 0;
      }

      const maxFwd = sprintHeld ? 2.1 : 1.25;
      const moveAxis = fwd - bwd;
      // Avoid double-triggering turn when Shift+A / Shift+D is strafe
      const effectiveTurnL = strafeL ? 0 : turnL;
      const effectiveTurnR = strafeR ? 0 : turnR;
      const turnAxis = (effectiveTurnL - effectiveTurnR) * (this.settings.invertYaw ? -1 : 1);
      const strafeAxis = strafeR - strafeL;

      if (this.settings.oneHandedMode && moveAxis === 0 && turnAxis !== 0) {
        out.vx = 0.95 * this.settings.sensitivity;
      } else {
        out.vx = (moveAxis >= 0 ? moveAxis * maxFwd : moveAxis * 0.85) * this.settings.sensitivity;
      }
      out.vy = strafeAxis * 0.75 * this.settings.sensitivity;
      out.yawRate = turnAxis * 1.85 * this.settings.sensitivity;
      if (sprintHeld && out.gait === 'auto' && out.vx > 1.4) {
        out.gait = 'bound';
      }
      if (crouchHeld && !this.hopHeld) out.bodyHeight = 0.15;
      if (standHeld && !this.hopHeld) out.bodyHeight = 0.92;
    }

    // 3. Gamepad API polling (polled once per step in the single loop)
    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      const pads = navigator.getGamepads();
      let pad: Gamepad | null = null;
      for (let i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i]!.connected) {
          pad = pads[i];
          break;
        }
      }
      if (pad) {
        this.gamepadConnected = true;
        this.gamepadName = pad.id;
        this.gamepadUnsupported = pad.mapping !== 'standard';

        const lx = pad.axes[0] ?? 0;
        const ly = -(pad.axes[1] ?? 0); // Up = +1
        const rx = pad.axes[2] ?? 0;
        const ry = pad.axes[3] ?? 0;

        radialDeadzone(lx, ly, this.settings.gamepadDeadzone, this._stickLeft);
        radialDeadzone(rx, ry, this.settings.gamepadDeadzone, this._stickRight);

        const curve = Math.max(1.0, Math.min(2.5, this.settings.gamepadCurve));
        const applyCurve = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), curve);

        const gFwd = applyCurve(this._stickLeft.y);
        const gStrafe = applyCurve(this._stickLeft.x);
        const gYaw = -applyCurve(this._stickRight.x) * (this.settings.invertYaw ? -1 : 1);
        const gCamPitch = applyCurve(this._stickRight.y) * (this.settings.invertCameraY ? -1 : 1);
        this.gamepadCameraPitchDelta = gCamPitch;

        const btn = (idx: number) => Boolean(pad!.buttons[idx]?.pressed);
        const btnEdge = (idx: number) => btn(idx) && !this.prevGamepadButtons[idx];
        const rtVal = pad.buttons[7]?.value ?? 0;

        if (btnEdge(0)) { // A = hop
          this.pendingHopLaunch = true;
          this.pendingHopCharge = 0.65;
        }
        if (btnEdge(1)) this.pendingStop = true; // B = stop
        if (btnEdge(3)) this.onAction?.('toggle_control'); // Y = toggle autonomous
        if (btnEdge(4) || btnEdge(5)) { // LB / RB cycle gait
          const order: GaitMode[] = ['auto', 'walk', 'trot', 'bound', 'pronk'];
          const idx = order.indexOf(this.gaitOverride);
          this.gaitOverride = order[(idx + (btnEdge(5) ? 1 : order.length - 1)) % order.length];
        }
        if (btnEdge(9)) this.onAction?.('pause_menu'); // Start
        if (btnEdge(15)) this.onAction?.('camera_cycle'); // D-pad right

        for (let b = 0; b < pad.buttons.length; b++) {
          this.prevGamepadButtons[b] = Boolean(pad.buttons[b]?.pressed);
        }

        const padMoved =
          Math.abs(gFwd) > 0.01 ||
          Math.abs(gStrafe) > 0.01 ||
          Math.abs(gYaw) > 0.01 ||
          btn(2);

        if (padMoved) {
          hasActiveInput = true;
          source = 'gamepad';
          this.lastActiveManualSource = 'gamepad';
          this.lastInputTimestampMs = typeof performance !== 'undefined' ? performance.now() : 0;
          const speedScale = rtVal > 0.3 ? 2.1 : 1.3;
          out.vx = (gFwd >= 0 ? gFwd * speedScale : gFwd * 0.9) * this.settings.sensitivity;
          out.vy = gStrafe * 0.8 * this.settings.sensitivity;
          out.yawRate = gYaw * 2.0 * this.settings.sensitivity;
          if (btn(2)) out.bodyHeight = 0.18; // X = crouch
        }
      }
    }

    // 4. Touch virtual joystick
    if (this.touch.active || this.touch.stop) {
      hasActiveInput = true;
      source = 'touch';
      this.lastActiveManualSource = 'touch';
      this.lastInputTimestampMs = typeof performance !== 'undefined' ? performance.now() : 0;
      const maxFwd = this.touch.sprint ? 2.1 : 1.3;
      out.vx = (this.touch.moveY >= 0 ? this.touch.moveY * maxFwd : this.touch.moveY * 0.85) * this.settings.sensitivity;
      out.vy = this.touch.moveX * 0.75 * this.settings.sensitivity;
      out.yawRate = -this.touch.yawX * 1.9 * this.settings.sensitivity * (this.settings.invertYaw ? -1 : 1);
      if (this.touch.crouch && !this.touch.hopHeld) out.bodyHeight = 0.18;
      if (this.touch.stop) this.pendingStop = true;
    }

    // 5. Pointer drive (hold right button to steer toward cursor ground hit)
    if (!hasActiveInput && this.settings.pointerDriveEnabled && this.pointerDrive.active) {
      hasActiveInput = true;
      source = 'pointer';
      this.lastActiveManualSource = 'pointer';
      purePursuit(
        robotX,
        robotZ,
        robotHeading,
        this.pointerDrive.targetX,
        this.pointerDrive.targetZ,
        1.45,
        1.1,
        0.45,
        this._pursuitOut
      );
      out.vx = this._pursuitOut.vx;
      out.yawRate = this._pursuitOut.yawRate;
    }

    // 6. Click-to-Move Waypoint Queue (Pure Pursuit + optional obstacle avoidance)
    if (!hasActiveInput && this.waypoints.length > 0) {
      const firstWp = this.waypoints[0];
      const distFirst = Math.hypot(firstWp.x - robotX, firstWp.z - robotZ);
      if (distFirst < 0.55) {
        this.waypoints.shift();
      }
      if (this.waypoints.length > 0) {
        hasActiveInput = true;
        source = 'pointer';
        this.lastActiveManualSource = 'pointer';
        findPolylineLookahead(robotX, robotZ, this.waypoints, 1.25, this._lookaheadPt);
        purePursuit(
          robotX,
          robotZ,
          robotHeading,
          this._lookaheadPt.x,
          this._lookaheadPt.z,
          1.35,
          1.25,
          0.45,
          this._pursuitOut
        );
        const avoidYaw = this.settings.avoidRocks
          ? computeObstacleAvoidanceYaw(robotX, robotZ, robotHeading, obstacles)
          : 0;
        out.vx = this._pursuitOut.vx;
        out.yawRate = Math.max(-2.2, Math.min(2.2, this._pursuitOut.yawRate + avoidYaw));
      }
    }

    // 7. CV Teleop (OneEuro filtered)
    if (!hasActiveInput && this.cvActive) {
      hasActiveInput = true;
      source = 'cv';
      this.lastActiveManualSource = 'cv';
      const tsSec = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
      out.vx = this.cvVxFilter.filter(this.cvRawVx, tsSec) * this.settings.sensitivity;
      out.yawRate = this.cvYawFilter.filter(this.cvRawYaw, tsSec) * this.settings.sensitivity;
    }

    // 8. Consume edge-triggered hop and emergency stop
    if (this.pendingHopLaunch) {
      out.hop = true;
      out.hopCharge = this.pendingHopCharge;
      this.pendingHopLaunch = false;
      this.pendingHopCharge = 0;
      hasActiveInput = true;
    }
    if (this.pendingStop) {
      out.stop = true;
      this.pendingStop = false;
      hasActiveInput = true;
    }

    return { source, hasActiveInput, cmd: out };
  }

  public getVisualizerSnapshot(): InputVisualizerSnapshot {
    return {
      source: this.lastActiveManualSource,
      keysHeld: Array.from(this.pressedCodes),
      moveX: this.touch.active ? this.touch.moveX : this._stickLeft.x,
      moveY: this.touch.active ? this.touch.moveY : this._stickLeft.y,
      yaw: this.touch.active ? this.touch.yawX : this._stickRight.x,
      sprint: this.shiftHeld || this.touch.sprint,
      hopCharging: this.hopHeld || this.touch.hopHeld,
      hopCharge: Math.max(0, Math.min(1, this.hopChargeSec / this.maxHopChargeSec)),
      gamepadConnected: this.gamepadConnected,
      gamepadName: this.gamepadName,
      gamepadUnsupported: this.gamepadUnsupported,
      lastInputTimestampMs: this.lastInputTimestampMs,
    };
  }
}
