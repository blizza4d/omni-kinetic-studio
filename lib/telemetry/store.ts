import { TelemetryFrame, TelemetryBatch, TelemetryFrameSchema } from '@/contracts';

export interface TelemetryStoreSnapshot {
  currentFrame: TelemetryFrame | null;
  frameCount: number;
  historyLength: number;
  boundaryState: 'inside' | 'soft' | 'hard' | 'out';
  distanceToEdge: number;
  invalidFrameCount: number;
  boundaryEventCount: number;
  lastEpisodeEvent: string | null;
}

export type StoreSubscriber = (snapshot: TelemetryStoreSnapshot) => void;

export class TelemetryStore {
  private static instance: TelemetryStore | null = null;

  // Maximum historical frames in preallocated ring buffer (6,000 frames = 100s @ 60 FPS)
  private readonly capacity = 6000;
  private readonly history: TelemetryFrame[] = [];
  private head = 0;

  private latestFrame: TelemetryFrame | null = null;
  private frameCount = 0;
  private invalidFrameCount = 0;
  private boundaryEventCount = 0;
  private lastEpisodeEvent: string | null = null;

  // Subscribers for throttled UI reads (e.g. 10 Hz)
  private subscribers = new Set<StoreSubscriber>();
  private notifyScheduled = false;

  private constructor() {}

  public static getInstance(): TelemetryStore {
    if (!TelemetryStore.instance) {
      TelemetryStore.instance = new TelemetryStore();
      if (typeof window !== 'undefined') {
        (window as any).__omnikinetic_telemetry_store = TelemetryStore.instance;
      }
    }
    return TelemetryStore.instance;
  }

  /**
   * Ingest new frame directly into store without React re-render.
   */
  public ingestFrame(frame: TelemetryFrame) {
    this.ingestFrameInternal(frame);
    this.scheduleNotify();
  }

  /**
   * Batch ingestion for high-throughput network batches with a single debounced notification.
   */
  public ingestBatch(frames: TelemetryFrame[]) {
    for (const f of frames) {
      this.ingestFrameInternal(f);
    }
    this.scheduleNotify();
  }

  private ingestFrameInternal(frame: TelemetryFrame) {
    // 1. Telemetry validation at ingestion boundary
    if (!frame.bodies || frame.bodies.length === 0) {
      this.invalidFrameCount++;
      return;
    }

    const torso = frame.bodies.find((b) => b.id === 'torso') || frame.bodies[0];
    const [x, y, z] = torso.pos;

    // Check for NaN or corrupt transforms
    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      this.invalidFrameCount++;
      return;
    }

    // 2. Boundary calculation (arena halfExtent = 18m, softMargin = 2m, hardMargin = 20m)
    const distFromOrigin = Math.sqrt(x * x + z * z);
    const distanceToEdge = Math.max(0, 18.0 - distFromOrigin);

    let boundaryState: 'inside' | 'soft' | 'hard' | 'out' = 'inside';
    if (distFromOrigin > 20.0) {
      boundaryState = 'out';
    } else if (distFromOrigin > 18.0) {
      boundaryState = 'hard';
    } else if (distFromOrigin > 16.0) {
      boundaryState = 'soft';
    }

    frame.boundary = {
      state: boundaryState,
      distanceToEdge: Number(distanceToEdge.toFixed(2)),
    };

    if (boundaryState === 'soft' || boundaryState === 'hard' || boundaryState === 'out') {
      this.boundaryEventCount++;
    }

    if (frame.episodeEvent) {
      this.lastEpisodeEvent = frame.episodeEvent;
    }

    // 3. Store in circular ring buffer
    this.latestFrame = frame;
    this.frameCount++;

    if (this.history.length < this.capacity) {
      this.history.push(frame);
    } else {
      this.history[this.head] = frame;
      this.head = (this.head + 1) % this.capacity;
    }
  }

  public getLatestFrame(): TelemetryFrame | null {
    return this.latestFrame;
  }

  public getFrameAtIndex(index: number): TelemetryFrame | null {
    if (index < 0 || index >= this.history.length) return null;
    return this.history[index];
  }

  public getHistory(): readonly TelemetryFrame[] {
    return this.history;
  }

  public getSnapshot(): TelemetryStoreSnapshot {
    return {
      currentFrame: this.latestFrame,
      frameCount: this.frameCount,
      historyLength: this.history.length,
      boundaryState: this.latestFrame?.boundary?.state ?? 'inside',
      distanceToEdge: this.latestFrame?.boundary?.distanceToEdge ?? 18.0,
      invalidFrameCount: this.invalidFrameCount,
      boundaryEventCount: this.boundaryEventCount,
      lastEpisodeEvent: this.lastEpisodeEvent,
    };
  }

  public subscribe(cb: StoreSubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  public clear() {
    this.history.length = 0;
    this.head = 0;
    this.latestFrame = null;
    this.frameCount = 0;
    this.invalidFrameCount = 0;
    this.boundaryEventCount = 0;
    this.lastEpisodeEvent = null;
    this.scheduleNotify();
  }

  private scheduleNotify() {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;

    // Throttle subscriber notifications to ~10 Hz (every 100ms)
    setTimeout(() => {
      this.notifyScheduled = false;
      const snap = this.getSnapshot();
      for (const cb of this.subscribers) {
        cb(snap);
      }
    }, 100);
  }
}
