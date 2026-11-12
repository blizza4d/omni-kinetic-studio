/**
 * Performance Measurement Probe & Observability Harness
 * Records high-resolution frame times, rolling percentiles, long tasks, memory heaps, and draw calls.
 */

export interface FrameMetrics {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
  fps: number;
  isMeasuring: boolean;
  isWarmingUp: boolean;
  sampleCount: number;
}

export interface LongTaskRecord {
  duration: number;
  startTime: number;
  name: string;
}

export interface RendererInfoSnapshot {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

export class PerfProbe {
  private static instance: PerfProbe | null = null;

  // Rolling 10-second frame time ring buffer (600 frames @ 60 FPS)
  private readonly windowSize = 600;
  private readonly frameDeltas: number[] = [];
  private totalFramesObserved = 0;
  private lastTimestamp = 0;
  private warmUpFrames = 30; // Discard first 30 frames during asset loading/shader compilation

  // Long task observer
  private longTasks: LongTaskRecord[] = [];
  private observer: PerformanceObserver | null = null;

  // Subsystem timing accumulators
  private physicsTimes: number[] = [];
  private telemetryTimes: number[] = [];
  private radarTimes: number[] = [];

  // Renderer snapshot
  private rendererInfo: RendererInfoSnapshot = {
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
  };

  // Active quality tier
  private currentTier: 'ultra' | 'high' | 'medium' | 'low' | 'potato' = 'high';

  // GPU Hardware info
  private gpuRenderer = 'Detecting...';
  private gpuVendor = 'Detecting...';
  private isHardwareGpu = true;

  // React commit counter
  private reactCommitCount = 0;
  private lastCommitReset = 0;
  private commitsPerSecond = 0;

  private constructor() {
    this.initLongTaskObserver();
    this.lastCommitReset = typeof performance !== 'undefined' ? performance.now() : 0;
  }

  public static getInstance(): PerfProbe {
    if (!PerfProbe.instance) {
      PerfProbe.instance = new PerfProbe();
      if (typeof window !== 'undefined') {
        (window as any).__omnikinetic_perf_probe = PerfProbe.instance;
      }
    }
    return PerfProbe.instance;
  }

  private initLongTaskObserver() {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTasks.push({
            duration: entry.duration,
            startTime: entry.startTime,
            name: entry.name,
          });
          // Retain last 50 long tasks
          if (this.longTasks.length > 50) this.longTasks.shift();
        }
      });
      this.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // PerformanceObserver longtask may not be supported in some environments
    }
  }

  public recordFrame(now: number) {
    this.totalFramesObserved++;

    if (this.lastTimestamp > 0) {
      const delta = now - this.lastTimestamp;
      // Filter out tab backgrounding pauses (> 500ms)
      if (delta > 0 && delta < 500) {
        if (this.totalFramesObserved > this.warmUpFrames) {
          this.frameDeltas.push(delta);
          if (this.frameDeltas.length > this.windowSize) {
            this.frameDeltas.shift();
          }
        }
      }
    }
    this.lastTimestamp = now;

    // Evaluate React commits per second
    if (now - this.lastCommitReset >= 1000) {
      this.commitsPerSecond = this.reactCommitCount;
      this.reactCommitCount = 0;
      this.lastCommitReset = now;
    }
  }

  public recordReactCommit() {
    this.reactCommitCount++;
  }

  public recordSubsystemTime(subsystem: 'physics' | 'telemetry' | 'radar', ms: number) {
    if (subsystem === 'physics') {
      this.physicsTimes.push(ms);
      if (this.physicsTimes.length > 60) this.physicsTimes.shift();
    } else if (subsystem === 'telemetry') {
      this.telemetryTimes.push(ms);
      if (this.telemetryTimes.length > 60) this.telemetryTimes.shift();
    } else if (subsystem === 'radar') {
      this.radarTimes.push(ms);
      if (this.radarTimes.length > 60) this.radarTimes.shift();
    }
  }

  public updateRendererInfo(info: { render: { calls: number; triangles: number }; memory: { geometries: number; textures: number }; programs?: any[] | null }) {
    this.rendererInfo = {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0,
    };
  }

  public setGpuInfo(renderer: string, vendor: string) {
    this.gpuRenderer = renderer;
    this.gpuVendor = vendor;
    const lower = renderer.toLowerCase();
    this.isHardwareGpu = !lower.includes('swiftshader') && !lower.includes('llvmpipe') && !lower.includes('software');
  }

  public setTier(tier: 'ultra' | 'high' | 'medium' | 'low' | 'potato') {
    this.currentTier = tier;
  }

  public getTier(): 'ultra' | 'high' | 'medium' | 'low' | 'potato' {
    return this.currentTier;
  }

  public getMetrics(): FrameMetrics {
    const n = this.frameDeltas.length;
    if (n === 0) {
      return {
        p50: 0.0,
        p95: 0.0,
        p99: 0.0,
        mean: 0.0,
        max: 0.0,
        fps: 0,
        isMeasuring: false,
        isWarmingUp: this.totalFramesObserved <= this.warmUpFrames,
        sampleCount: 0,
      };
    }

    const sorted = [...this.frameDeltas].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(n * 0.50)];
    const p95 = sorted[Math.floor(n * 0.95)];
    const p99 = sorted[Math.floor(n * 0.99)];
    const mean = sorted.reduce((sum, v) => sum + v, 0) / n;
    const max = sorted[n - 1];
    const fps = Math.round(1000 / Math.max(1, p50));

    return {
      p50: Number(p50.toFixed(1)),
      p95: Number(p95.toFixed(1)),
      p99: Number(p99.toFixed(1)),
      mean: Number(mean.toFixed(1)),
      max: Number(max.toFixed(1)),
      fps,
      isMeasuring: true,
      isWarmingUp: n < 30,
      sampleCount: n,
    };
  }

  public getSnapshot() {
    const metrics = this.getMetrics();
    const meanPhysics = this.physicsTimes.length ? (this.physicsTimes.reduce((s, v) => s + v, 0) / this.physicsTimes.length).toFixed(2) : '0.00';
    const meanTelemetry = this.telemetryTimes.length ? (this.telemetryTimes.reduce((s, v) => s + v, 0) / this.telemetryTimes.length).toFixed(2) : '0.00';
    const meanRadar = this.radarTimes.length ? (this.radarTimes.reduce((s, v) => s + v, 0) / this.radarTimes.length).toFixed(2) : '0.00';

    const memory = typeof window !== 'undefined' && (performance as any).memory
      ? {
          usedMb: Math.round((performance as any).memory.usedJSHeapSize / (1024 * 1024)),
          totalMb: Math.round((performance as any).memory.totalJSHeapSize / (1024 * 1024)),
        }
      : null;

    return {
      ...metrics,
      tier: this.currentTier,
      longTaskCount: this.longTasks.length,
      longTasks: this.longTasks.slice(-5),
      rendererInfo: this.rendererInfo,
      gpu: {
        renderer: this.gpuRenderer,
        vendor: this.gpuVendor,
        isHardware: this.isHardwareGpu,
      },
      subsystemMs: {
        physics: Number(meanPhysics),
        telemetry: Number(meanTelemetry),
        radar: Number(meanRadar),
      },
      memory,
      commitsPerSecond: this.commitsPerSecond,
    };
  }

  /**
   * Deliberately inject artificial main-thread stall (Test Hook for P3.6.1)
   */
  public injectStall(ms: number) {
    const start = performance.now();
    while (performance.now() - start < ms) {
      // Busy wait to simulate synchronous JS stall
    }
  }

  public teardown() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}
