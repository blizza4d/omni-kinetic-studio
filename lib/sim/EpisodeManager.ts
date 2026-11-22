/**
 * Authoritative Episode Lifecycle Manager (Phase E2)
 *
 * Enforces strict two-lifetime separation:
 * 1. APP-SCOPED (Single instance across whole browser session):
 *    - InputManager, ShortcutRegistry, WebGL Renderer, ThreeViewer, Camera Rig,
 *      Settings, LocalStorage, Console Log stream, TelemetryStore.
 * 2. EPISODE-SCOPED (Created fresh per episode, fully torn down at episode end):
 *    - SimClock, GaitController, ControlArbiter, CommandShaper, DeterministicRecorder,
 *      MissionRuntime, per-episode metrics, and AbortController.
 *
 * Guarantees that Episode N from (seed, config) is bit-identical to Episode 1,
 * eliminating all stale input latches, focus traps, or un-reset clock states.
 */

import { LocomotionCommand } from '../control/types';

export type EpisodePhase = 'idle' | 'countdown' | 'running' | 'paused' | 'ended' | 'resetting';

export interface EpisodeConfig {
  seed: number;
  scenarioId: string;
  episodeLength: number; // seconds
  gravity: number; // m/s^2 (e.g. 1.62 for Moon)
  missionId?: string | null;
  roughness?: number;
  craterCount?: number;
  rockCount?: number;
  startPos?: [number, number];
  startHeading?: number;
}

export interface Episode {
  readonly id: number;
  readonly config: EpisodeConfig;
  readonly signal: AbortSignal; // Aborted exactly once when episode is disposed
  step(fixedDt: number): void;
  getPhase(): EpisodePhase;
  setPhase(p: EpisodePhase): void;
  submitCommand(cmd: LocomotionCommand): void;
  dispose(): void; // Idempotent cleanup of all episode-scoped resources
}

export type EpisodeFactory = (config: EpisodeConfig, id: number) => Episode;
export type EpisodeListener = (episode: Episode | null) => void;

export class EpisodeManager {
  private current: Episode | null = null;
  private nextId = 1;
  private readonly listeners = new Set<EpisodeListener>();
  private transitioning = false;

  constructor(private readonly factory: EpisodeFactory) {}

  public get episode(): Episode | null {
    return this.current;
  }

  public getCurrentId(): number | null {
    return this.current ? this.current.id : null;
  }

  public subscribe(fn: EpisodeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Start a brand-new episode. Always disposes the previous one first.
   * Re-entrancy safe.
   */
  public start(config: EpisodeConfig): Episode {
    if (this.transitioning) {
      throw new Error('EpisodeManager: start() called during an active transition');
    }
    this.transitioning = true;
    try {
      const old = this.current;
      this.current = null;
      this.notify();
      old?.dispose();

      const ep = this.factory(config, this.nextId++);
      this.current = ep;
      ep.setPhase('running');
      this.notify();
      return ep;
    } finally {
      this.transitioning = false;
    }
  }

  /**
   * Restarts the current episode using identical config and seed.
   */
  public restart(): Episode {
    const cfg = this.current?.config;
    if (!cfg) {
      throw new Error('EpisodeManager: nothing to restart (no active episode config)');
    }
    return this.start(cfg);
  }

  /**
   * Transitions the current running episode to 'ended'.
   */
  public end(): void {
    const ep = this.current;
    if (!ep || ep.getPhase() === 'ended') return;
    ep.setPhase('ended');
    this.notify();
  }

  /**
   * Transitions the current running episode to 'paused' or resumes it.
   */
  public setPaused(paused: boolean): void {
    const ep = this.current;
    if (!ep) return;
    const current = ep.getPhase();
    if (paused && current === 'running') {
      ep.setPhase('paused');
      this.notify();
    } else if (!paused && current === 'paused') {
      ep.setPhase('running');
      this.notify();
    }
  }

  /**
   * Idempotently disposes any currently active episode.
   */
  public disposeAll(): void {
    const old = this.current;
    this.current = null;
    old?.dispose();
    this.notify();
  }

  private notify(): void {
    for (const l of this.listeners) {
      try {
        l(this.current);
      } catch (err) {
        console.error('EpisodeManager listener error:', err);
      }
    }
  }
}
