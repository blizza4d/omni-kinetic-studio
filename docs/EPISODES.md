# EPISODE LIFECYCLE & ARCHITECTURE SPECIFICATION (Phase E2 & E7)

## 1. Overview & Two Lifetimes

To prevent state leakage and ensure deterministic simulation runs across multiple episodes, Omni-Kinetic strictly enforces **two separate resource lifetimes**:

| Lifetime Tier | Scope & Durability | Owned Resources | Disposal Policy |
|---|---|---|---|
| **App-Scoped** | Singleton across entire browser session | `InputManager`, `ShortcutRegistry`, WebGL Renderer, Scene Root, Camera Rig, User Settings (`localStorage`), Console Log stream, Telemetry Store | Created once on page mount; disposed only on full page unload |
| **Episode-Scoped** | Ephemeral per simulation run | `SimClock`, `GaitController`, `ControlArbiter`, `CommandShaper`, `DeterministicRecorder`, `MissionRuntime`, per-episode metrics, `AbortController` signal | Created fresh on `EpisodeManager.start(config)`; disposed idempotently on episode end/restart |

---

## 2. EpisodeManager API Reference

Defined in `lib/sim/EpisodeManager.ts`:

```ts
export type EpisodePhase = 'idle' | 'countdown' | 'running' | 'paused' | 'ended' | 'resetting';

export interface EpisodeConfig {
  seed: number;
  scenarioId: string;
  episodeLength: number; // seconds
  gravity: number;       // m/s^2 (e.g. 1.62 for Moon)
  missionId?: string;
  roughness?: number;
  craterCount?: number;
  rockCount?: number;
  startPos?: [number, number];
  startHeading?: number;
}

export interface Episode {
  readonly id: number;
  readonly config: EpisodeConfig;
  readonly signal: AbortSignal;          // Aborted exactly once when episode is disposed
  step(fixedDt: number): void;
  getPhase(): EpisodePhase;
  setPhase(p: EpisodePhase): void;
  submitCommand(cmd: LocomotionCommand): void;
  dispose(): void;                       // Idempotent cleanup of episode-scoped resources
}
```

### Episode Lifecycle State Machine

Transitions:
- `idle -> running`
- `running <-> paused`
- `running -> ended`
- `ended -> resetting -> running`

---

## 3. Async Safety Guards (`ifCurrent`)

Defined in `lib/sim/guard.ts`:

```ts
export function ifCurrent<T extends unknown[]>(
  ep: { id: number },
  getCurrentId: () => number | null,
  fn: (...args: T) => void
): (...args: T) => void {
  return (...args: T) => {
    if (getCurrentId() !== ep.id) {
      // Discard late callback from a disposed or previous episode
      return;
    }
    fn(...args);
  };
}
```

### Usage Rules:
1. Every async callback from cloud runners, workers, or timers must be wrapped in `ifCurrent(ep, () => manager.getCurrentId(), callback)`.
2. Every per-episode async request must pass `episode.signal` to `fetch()` or `addEventListener()`.
3. When `episode.dispose()` is invoked, `episode.signal` is aborted, immediately cancelling all active fetch streams and background tasks.

---

## 4. Reset & Determinism Invariant

For any identical pair of `(seed, config)` and identical input sequence:
$$\text{StateChecksum}(\text{Episode}_1) \equiv \text{StateChecksum}(\text{Episode}_N)$$

Verified by `test/episode_lifecycle.test.ts` (Subtest E5.5).
