/**
 * Control Arbiter & Smooth Handover (v2)
 *
 * Arbitrates between autonomous policy, manual inputs (keyboard, gamepad, touch,
 * pointer/click-to-move, CV teleop), replay, and debug scripts.
 *
 * Rules:
 * - `stop` ALWAYS wins immediately.
 * - `replay` and `script` take exclusive precedence when active.
 * - Manual sources override `policy` while manual mode is engaged.
 * - Handover blends velocity/yaw/height smoothly via a critically damped spring
 *   (half-life 0.15s) so velocity never discontinuities on control handoff.
 */

import {
  ControlSource,
  LocomotionCommand,
  ControlArbiterSnapshot,
  createNeutralCommand,
} from './types';
import { springDamper, SpringState } from '../anim/math/spring';

export function formatSourceLabel(source: ControlSource, policyName = 'POLICY v1'): string {
  switch (source) {
    case 'policy':
      return `AUTONOMOUS: ${policyName}`;
    case 'keyboard':
      return 'MANUAL: KEYBOARD';
    case 'gamepad':
      return 'MANUAL: GAMEPAD';
    case 'touch':
      return 'MANUAL: TOUCH';
    case 'pointer':
      return 'MANUAL: WAYPOINT / POINTER';
    case 'cv':
      return 'CV TELEOP';
    case 'replay':
      return 'REPLAY';
    case 'script':
      return 'SCRIPTED TEST';
  }
}

export class ControlArbiter {
  private activeSource: ControlSource = 'policy';
  private manualEngaged = false;
  private replayActive = false;
  private scriptActive = false;
  private emergencyStop = false;
  private idleReleaseSec: number | null = null; // null = never auto-release (explicit toggle)
  private lastManualInputTimeSec = 0;

  // Critically damped blend weight: 0 = policy, 1 = manual
  private readonly blendSpring: SpringState = { x: 0, v: 0 };
  private readonly handoverHalfLife = 0.15;

  public setIdleReleaseSeconds(seconds: number | null): void {
    this.idleReleaseSec = seconds !== null && seconds > 0 ? seconds : null;
  }

  public isManualEngaged(): boolean {
    return this.manualEngaged && !this.replayActive && !this.scriptActive;
  }

  public getActiveSource(): ControlSource {
    if (this.replayActive) return 'replay';
    if (this.scriptActive) return 'script';
    return this.manualEngaged ? this.activeSource : 'policy';
  }

  public setReplayActive(active: boolean): void {
    this.replayActive = active;
    if (active) {
      this.activeSource = 'replay';
      this.blendSpring.x = 1;
      this.blendSpring.v = 0;
    }
  }

  public setScriptActive(active: boolean): void {
    this.scriptActive = active;
    if (active) {
      this.activeSource = 'script';
      this.blendSpring.x = 1;
      this.blendSpring.v = 0;
    }
  }

  /**
   * Explicitly take manual control (e.g. pressing T or Enter, or moving stick/keys).
   */
  public takeManualControl(source: ControlSource = 'keyboard', nowSec = 0): void {
    if (source === 'policy' || source === 'replay' || source === 'script') return;
    this.manualEngaged = true;
    this.activeSource = source;
    this.emergencyStop = false;
    this.lastManualInputTimeSec = nowSec;
  }

  /**
   * Release control back to autonomous policy.
   */
  public releaseToPolicy(): void {
    this.manualEngaged = false;
    this.emergencyStop = false;
    this.activeSource = 'policy';
  }

  public toggleManualControl(source: ControlSource = 'keyboard', nowSec = 0): boolean {
    if (this.manualEngaged) {
      this.releaseToPolicy();
      return false;
    }
    this.takeManualControl(source, nowSec);
    return true;
  }

  public triggerEmergencyStop(): void {
    this.emergencyStop = true;
  }

  public clearEmergencyStop(): void {
    this.emergencyStop = false;
  }

  public reset(): void {
    this.manualEngaged = false;
    this.replayActive = false;
    this.scriptActive = false;
    this.emergencyStop = false;
    this.activeSource = 'policy';
    this.blendSpring.x = 0;
    this.blendSpring.v = 0;
    this.lastManualInputTimeSec = 0;
  }

  /**
   * Resolves the winning command for the current fixed step into `out` (zero allocations).
   */
  public resolve(
    policyCmd: LocomotionCommand,
    manualCmd: LocomotionCommand,
    manualSource: ControlSource,
    hasActiveManualInput: boolean,
    nowSec: number,
    dt: number,
    out: LocomotionCommand = createNeutralCommand(),
    overrideCmd?: LocomotionCommand
  ): { source: ControlSource; cmd: LocomotionCommand } {
    // 1. Replay or scripted test takes direct precedence
    if (this.replayActive && overrideCmd) {
      out.vx = overrideCmd.vx;
      out.vy = overrideCmd.vy;
      out.yawRate = overrideCmd.yawRate;
      out.bodyHeight = overrideCmd.bodyHeight;
      out.gait = overrideCmd.gait;
      out.hop = overrideCmd.hop;
      out.hopCharge = overrideCmd.hopCharge;
      out.stop = overrideCmd.stop;
      return { source: 'replay', cmd: out };
    }

    if (this.scriptActive && overrideCmd) {
      out.vx = overrideCmd.vx;
      out.vy = overrideCmd.vy;
      out.yawRate = overrideCmd.yawRate;
      out.bodyHeight = overrideCmd.bodyHeight;
      out.gait = overrideCmd.gait;
      out.hop = overrideCmd.hop;
      out.hopCharge = overrideCmd.hopCharge;
      out.stop = overrideCmd.stop;
      return { source: 'script', cmd: out };
    }

    // 2. Manual source activation / idle timeout check
    if (hasActiveManualInput && manualSource !== 'policy') {
      if (!this.manualEngaged) {
        this.manualEngaged = true;
      }
      this.activeSource = manualSource;
      this.lastManualInputTimeSec = nowSec;
      if (manualCmd.stop) {
        this.emergencyStop = true;
      } else if (
        Math.abs(manualCmd.vx) > 0.05 ||
        Math.abs(manualCmd.vy) > 0.05 ||
        Math.abs(manualCmd.yawRate) > 0.05 ||
        manualCmd.hop
      ) {
        this.emergencyStop = false;
      }
    } else if (
      this.manualEngaged &&
      this.idleReleaseSec !== null &&
      nowSec - this.lastManualInputTimeSec > this.idleReleaseSec
    ) {
      this.manualEngaged = false;
      this.activeSource = 'policy';
    }

    // 3. Emergency stop ALWAYS wins
    if (this.emergencyStop || manualCmd.stop || policyCmd.stop) {
      out.vx = 0;
      out.vy = 0;
      out.yawRate = 0;
      out.bodyHeight = 0.5;
      out.gait = 'auto';
      out.hop = false;
      out.hopCharge = 0;
      out.stop = true;
      return { source: this.manualEngaged ? this.activeSource : 'policy', cmd: out };
    }

    // 4. Smooth critically-damped handover blend between policy (0) and manual (1)
    const targetWeight = this.manualEngaged ? 1.0 : 0.0;
    springDamper(this.blendSpring, targetWeight, 0, this.handoverHalfLife, dt);
    const w = Math.max(0, Math.min(1, this.blendSpring.x));

    out.vx = policyCmd.vx * (1 - w) + manualCmd.vx * w;
    out.vy = policyCmd.vy * (1 - w) + manualCmd.vy * w;
    out.yawRate = policyCmd.yawRate * (1 - w) + manualCmd.yawRate * w;
    out.bodyHeight = policyCmd.bodyHeight * (1 - w) + manualCmd.bodyHeight * w;
    out.gait = w >= 0.5 ? manualCmd.gait : policyCmd.gait;
    out.hop = w >= 0.5 ? manualCmd.hop : policyCmd.hop;
    out.hopCharge = w >= 0.5 ? manualCmd.hopCharge : policyCmd.hopCharge;
    out.stop = false;

    const winningSource: ControlSource = this.manualEngaged ? this.activeSource : 'policy';
    return { source: winningSource, cmd: out };
  }

  public snapshot(policyName = 'POLICY v1'): ControlArbiterSnapshot {
    const src = this.getActiveSource();
    return {
      activeSource: src,
      isManual: this.isManualEngaged(),
      modeLabel: formatSourceLabel(src, policyName),
      blendWeight: Math.max(0, Math.min(1, this.blendSpring.x)),
      emergencyStop: this.emergencyStop,
      lastManualTimeSec: this.lastManualInputTimeSec,
    };
  }
}
