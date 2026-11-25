/**
 * Synthetic Perception Suite Store & Configurable LiDAR + PiP Sensor Models
 *
 * Designed for 60 FPS main viewport performance:
 * - Zero React state churn: writes scan arrays directly into singleton buffers
 * - Throttled canvas subscribers (15-20 Hz) for real-time LiDAR mini-radar rendering
 * - Exposes latest `lidar_ranges` for synchronized LeRobot/RLDS dataset recording
 */

export interface LidarConfig {
  enabled: boolean;
  rayCount: number; // 36, 48, 72
  fovDeg: number; // 90..360
  maxRangeM: number; // 5..30
  useThreeRaycaster: boolean;
}

export interface PipCameraConfig {
  enabled: boolean;
  depthMode: boolean;
  targetFps: number; // 15-20 FPS
}

export interface PerceptionSnapshot {
  timestampMs: number;
  rayCount: number;
  fovDeg: number;
  maxRangeM: number;
  ranges: number[];
  anglesRad: number[];
  isObstacle: boolean[];
  minObstacleDistM: number;
  minRangeDistM: number;
  raycastTimeMs: number;
  pipFps: number;
  depthMode: boolean;
}

export const DEFAULT_LIDAR_CONFIG: LidarConfig = {
  enabled: true,
  rayCount: 48,
  fovDeg: 210,
  maxRangeM: 15.0,
  useThreeRaycaster: true,
};

export const DEFAULT_PIP_CONFIG: PipCameraConfig = {
  enabled: true,
  depthMode: false,
  targetFps: 18,
};

export type PerceptionListener = (snap: PerceptionSnapshot) => void;

export class PerceptionStore {
  private static instance: PerceptionStore | null = null;

  private lidarConfig: LidarConfig = { ...DEFAULT_LIDAR_CONFIG };
  private pipConfig: PipCameraConfig = { ...DEFAULT_PIP_CONFIG };
  private latestSnapshot: PerceptionSnapshot = {
    timestampMs: 0,
    rayCount: DEFAULT_LIDAR_CONFIG.rayCount,
    fovDeg: DEFAULT_LIDAR_CONFIG.fovDeg,
    maxRangeM: DEFAULT_LIDAR_CONFIG.maxRangeM,
    ranges: new Array(DEFAULT_LIDAR_CONFIG.rayCount).fill(DEFAULT_LIDAR_CONFIG.maxRangeM),
    anglesRad: [],
    isObstacle: new Array(DEFAULT_LIDAR_CONFIG.rayCount).fill(false),
    minObstacleDistM: DEFAULT_LIDAR_CONFIG.maxRangeM,
    minRangeDistM: DEFAULT_LIDAR_CONFIG.maxRangeM,
    raycastTimeMs: 0,
    pipFps: 18,
    depthMode: false,
  };

  private listeners = new Set<PerceptionListener>();
  private configListeners = new Set<() => void>();

  private constructor() {}

  public static getInstance(): PerceptionStore {
    if (!PerceptionStore.instance) {
      PerceptionStore.instance = new PerceptionStore();
    }
    return PerceptionStore.instance;
  }

  public getLidarConfig(): LidarConfig {
    return { ...this.lidarConfig };
  }

  public setLidarConfig(patch: Partial<LidarConfig>): void {
    this.lidarConfig = {
      ...this.lidarConfig,
      ...patch,
      rayCount: Math.max(12, Math.min(96, Math.round(patch.rayCount ?? this.lidarConfig.rayCount))),
      fovDeg: Math.max(30, Math.min(360, patch.fovDeg ?? this.lidarConfig.fovDeg)),
      maxRangeM: Math.max(3, Math.min(35, patch.maxRangeM ?? this.lidarConfig.maxRangeM)),
    };
    this.notifyConfig();
  }

  public getPipConfig(): PipCameraConfig {
    return { ...this.pipConfig };
  }

  public setPipConfig(patch: Partial<PipCameraConfig>): void {
    this.pipConfig = {
      ...this.pipConfig,
      ...patch,
      targetFps: Math.max(5, Math.min(30, patch.targetFps ?? this.pipConfig.targetFps)),
    };
    this.latestSnapshot.depthMode = this.pipConfig.depthMode;
    this.notifyConfig();
  }

  public updateScan(snap: PerceptionSnapshot): void {
    this.latestSnapshot = snap;
    for (const cb of this.listeners) {
      cb(snap);
    }
  }

  public getLatestScan(): PerceptionSnapshot {
    return this.latestSnapshot;
  }

  public getLatestLidarRanges(): number[] {
    return this.latestSnapshot.ranges;
  }

  public subscribeScan(cb: PerceptionListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public subscribeConfig(cb: () => void): () => void {
    this.configListeners.add(cb);
    return () => {
      this.configListeners.delete(cb);
    };
  }

  private notifyConfig(): void {
    for (const cb of this.configListeners) {
      cb();
    }
  }
}
