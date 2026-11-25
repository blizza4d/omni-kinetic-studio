/**
 * Live ROS 2 / Hardware-in-the-Loop (HIL) WebSocket Bridge (Phase 2)
 *
 * Bridges Omni-Kinetic Studio to real robotic hardware (ROS 2 rosbridge_suite
 * or custom ESP32 / Python WebSocket controllers):
 * - Outbound `geometry_msgs/Twist` JSON streaming at 10-30 Hz with immediate E-STOP preemption
 * - Inbound Telemetry (Pose / Odometry / IMU) driving Three.js Digital Twin mode
 * - Built-in Mock Loopback Mode for full end-to-end validation without external hardware
 */

export type BridgeConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'loopback' | 'error';

export type BridgeProtocolMode = 'rosbridge_v2' | 'raw_json';

export type BridgeCoordinateFrame = 'omnikinetic_yup' | 'ros_rep103';

export interface RosVector3 {
  x: number;
  y: number;
  z: number;
}

export interface RosQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface RosTwistMessage {
  linear: RosVector3;
  angular: RosVector3;
}

export interface RosBridgePublishEnvelope {
  op: 'publish';
  topic: string;
  type?: 'geometry_msgs/Twist';
  msg: RosTwistMessage;
}

export interface RosBridgeSubscribeEnvelope {
  op: 'subscribe';
  topic: string;
  type?: string;
}

export interface InboundHardwareTelemetry {
  x: number;
  y?: number;
  z: number;
  yaw: number;
  quat?: [number, number, number, number];
  vx?: number;
  vy?: number;
  vz?: number;
  imuAccel?: [number, number, number];
  imuGyro?: [number, number, number];
  batteryVoltage?: number;
  timestampMs: number;
}

export interface BridgeConfig {
  url: string;
  cmdVelTopic: string;
  odomTopic: string;
  rateHz: number; // 10..30 Hz
  protocol: BridgeProtocolMode;
  coordinateFrame: BridgeCoordinateFrame;
  digitalTwinEnabled: boolean;
}

export interface BridgeDiagnostics {
  status: BridgeConnectionStatus;
  txCount: number;
  rxCount: number;
  effectiveTxHz: number;
  lastTxJson: string;
  lastRxJson: string;
  lastError: string | null;
  lastTelemetry: InboundHardwareTelemetry | null;
  rttMs: number;
}

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  url: 'ws://localhost:9090',
  cmdVelTopic: '/cmd_vel',
  odomTopic: '/odom',
  rateHz: 20,
  protocol: 'rosbridge_v2',
  coordinateFrame: 'omnikinetic_yup',
  digitalTwinEnabled: false,
};

/**
 * Formats velocity command into standard ROS `geometry_msgs/Twist`.
 * Note: Positive linear.x is forward; positive angular.z is CCW yaw rotation.
 */
export function buildRosTwistPayload(
  vx: number,
  vy: number,
  yawRate: number,
  eStopActive: boolean,
  protocol: BridgeProtocolMode,
  topic = '/cmd_vel'
): { twist: RosTwistMessage; json: string } {
  const safeVx = eStopActive ? 0 : Number(vx.toFixed(4));
  const safeVy = eStopActive ? 0 : Number(vy.toFixed(4));
  const safeYaw = eStopActive ? 0 : Number(yawRate.toFixed(4));

  const twist: RosTwistMessage = {
    linear: { x: safeVx, y: safeVy, z: 0 },
    angular: { x: 0, y: 0, z: safeYaw },
  };

  if (protocol === 'rosbridge_v2') {
    const env: RosBridgePublishEnvelope = {
      op: 'publish',
      topic,
      type: 'geometry_msgs/Twist',
      msg: twist,
    };
    return { twist, json: JSON.stringify(env) };
  }

  return { twist, json: JSON.stringify(twist) };
}

/**
 * Parses incoming JSON telemetry from either raw telemetry dicts, rosbridge `/odom`, or loopback.
 */
export function parseInboundHardwareMessage(
  rawJson: string,
  frame: BridgeCoordinateFrame = 'omnikinetic_yup'
): InboundHardwareTelemetry | null {
  try {
    const parsed = JSON.parse(rawJson);
    const payload = parsed?.op === 'publish' && parsed?.msg ? parsed.msg : parsed;

    // 1. Standard ROS nav_msgs/Odometry schema (`pose.pose.position`, `pose.pose.orientation`)
    const rosPose = payload?.pose?.pose ?? payload?.pose;
    const posObj = rosPose?.position ?? payload?.position ?? rosPose;

    if (posObj && typeof posObj.x === 'number') {
      let x = Number(posObj.x);
      let y = typeof posObj.y === 'number' ? Number(posObj.y) : 0.44;
      let z = typeof posObj.z === 'number' ? Number(posObj.z) : 0;

      // ROS REP-103 (+X fwd, +Y left, +Z up) -> Omni-Kinetic (+X fwd, +Y up, +Z right)
      if (frame === 'ros_rep103') {
        const rx = x;
        const ry = y;
        const rz = z;
        x = rx;
        y = rz;
        z = -ry;
      }

      const orient = rosPose?.orientation;
      let yaw = typeof payload?.yaw === 'number' ? Number(payload.yaw) : 0;
      let quat: [number, number, number, number] | undefined = undefined;

      if (orient && typeof orient.x === 'number' && typeof orient.w === 'number') {
        if (frame === 'ros_rep103') {
          quat = [Number(orient.x), Number(orient.z), Number(-orient.y), Number(orient.w)];
        } else {
          quat = [Number(orient.x), Number(orient.y), Number(orient.z), Number(orient.w)];
        }
        yaw = Math.atan2(
          2 * (quat[3] * quat[1] + quat[0] * quat[2]),
          1 - 2 * (quat[1] * quat[1] + quat[2] * quat[2])
        );
      }

      const twLin = payload?.twist?.twist?.linear ?? payload?.twist?.linear;
      const vx = typeof twLin?.x === 'number' ? Number(twLin.x) : typeof payload?.vx === 'number' ? Number(payload.vx) : 0;
      const vz = typeof twLin?.y === 'number' ? Number(-twLin.y) : typeof payload?.vz === 'number' ? Number(payload.vz) : 0;

      return {
        x,
        y: frame === 'ros_rep103' ? y : typeof posObj.y === 'number' ? y : undefined,
        z,
        yaw,
        quat,
        vx,
        vy: 0,
        vz,
        imuAccel: Array.isArray(payload?.imu?.accel) ? payload.imu.accel : undefined,
        imuGyro: Array.isArray(payload?.imu?.gyro) ? payload.imu.gyro : undefined,
        batteryVoltage: typeof payload?.battery_v === 'number' ? payload.battery_v : undefined,
        timestampMs: Date.now(),
      };
    }

    return null;
  } catch {
    return null;
  }
}

export class HardwareBridgeClient {
  private config: BridgeConfig = { ...DEFAULT_BRIDGE_CONFIG };
  private ws: WebSocket | null = null;
  private status: BridgeConnectionStatus = 'disconnected';
  private lastError: string | null = null;

  private txCount = 0;
  private rxCount = 0;
  private lastTxJson = '';
  private lastRxJson = '';
  private lastTelemetry: InboundHardwareTelemetry | null = null;
  private lastTxMs = 0;
  private prevEStop = false;
  private rttMs = 0;

  // Mock loopback kinematics state
  private mockTimer: ReturnType<typeof setInterval> | null = null;
  private mockState = { x: 0, z: 0, yaw: 0, vx: 0, yawRate: 0, lastStepMs: 0 };

  private onTelemetryCb?: (t: InboundHardwareTelemetry) => void;
  private onDiagnosticsCb?: (d: BridgeDiagnostics) => void;

  constructor(options?: {
    onTelemetry?: (t: InboundHardwareTelemetry) => void;
    onDiagnostics?: (d: BridgeDiagnostics) => void;
  }) {
    this.onTelemetryCb = options?.onTelemetry;
    this.onDiagnosticsCb = options?.onDiagnostics;
  }

  public getConfig(): BridgeConfig {
    return { ...this.config };
  }

  public updateConfig(patch: Partial<BridgeConfig>): void {
    this.config = {
      ...this.config,
      ...patch,
      rateHz: Math.max(10, Math.min(30, Math.round(patch.rateHz ?? this.config.rateHz))),
    };
    this.emitDiagnostics();
  }

  public getDiagnostics(): BridgeDiagnostics {
    return {
      status: this.status,
      txCount: this.txCount,
      rxCount: this.rxCount,
      effectiveTxHz: this.status === 'connected' || this.status === 'loopback' ? this.config.rateHz : 0,
      lastTxJson: this.lastTxJson,
      lastRxJson: this.lastRxJson,
      lastError: this.lastError,
      lastTelemetry: this.lastTelemetry,
      rttMs: this.rttMs,
    };
  }

  public connect(): void {
    this.disconnect();
    this.lastError = null;

    if (typeof WebSocket === 'undefined') {
      this.status = 'error';
      this.lastError = 'WebSocket API unavailable in this environment.';
      this.emitDiagnostics();
      return;
    }

    this.status = 'connecting';
    this.emitDiagnostics();

    try {
      const socket = new WebSocket(this.config.url);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.status = 'connected';
        this.lastError = null;
        if (this.config.protocol === 'rosbridge_v2') {
          const sub: RosBridgeSubscribeEnvelope = {
            op: 'subscribe',
            topic: this.config.odomTopic,
          };
          socket.send(JSON.stringify(sub));
        }
        this.emitDiagnostics();
      };

      socket.onmessage = (evt) => {
        if (this.ws !== socket) return;
        const raw = typeof evt.data === 'string' ? evt.data : '';
        this.handleInbound(raw);
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        this.status = 'error';
        this.lastError = `WebSocket connection failed (${this.config.url}). Verify rosbridge_suite or use Mock Loopback.`;
        this.emitDiagnostics();
      };

      socket.onclose = () => {
        if (this.ws !== socket) return;
        if (this.status !== 'error') {
          this.status = 'disconnected';
        }
        this.ws = null;
        this.emitDiagnostics();
      };
    } catch (err: any) {
      this.status = 'error';
      this.lastError = err?.message || 'Failed to construct WebSocket client.';
      this.emitDiagnostics();
    }
  }

  public startLoopback(initialPose?: { x: number; z: number; yaw: number }): void {
    this.disconnect();
    this.status = 'loopback';
    this.lastError = null;
    this.rttMs = 12;
    this.mockState = {
      x: initialPose?.x ?? 0,
      z: initialPose?.z ?? 0,
      yaw: initialPose?.yaw ?? 0,
      vx: 0,
      yawRate: 0,
      lastStepMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };

    // Emit loopback inbound odometry at configured rate
    const periodMs = Math.max(33, Math.round(1000 / this.config.rateHz));
    this.mockTimer = setInterval(() => {
      if (this.status !== 'loopback') return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dt = Math.min(0.1, Math.max(0.005, (now - this.mockState.lastStepMs) / 1000));
      this.mockState.lastStepMs = now;

      this.mockState.yaw += this.mockState.yawRate * dt;
      this.mockState.x += Math.cos(this.mockState.yaw) * this.mockState.vx * dt;
      this.mockState.z += -Math.sin(this.mockState.yaw) * this.mockState.vx * dt;

      const simPacket =
        this.config.protocol === 'rosbridge_v2'
          ? JSON.stringify({
              op: 'publish',
              topic: this.config.odomTopic,
              msg: {
                pose: {
                  pose: {
                    position: {
                      x: Number(this.mockState.x.toFixed(3)),
                      y: this.config.coordinateFrame === 'ros_rep103' ? Number((-this.mockState.z).toFixed(3)) : 0.44,
                      z: this.config.coordinateFrame === 'ros_rep103' ? 0.44 : Number(this.mockState.z.toFixed(3)),
                    },
                    orientation: {
                      x: 0,
                      y: this.config.coordinateFrame === 'ros_rep103' ? 0 : Number(Math.sin(this.mockState.yaw * 0.5).toFixed(4)),
                      z: this.config.coordinateFrame === 'ros_rep103' ? Number(Math.sin(this.mockState.yaw * 0.5).toFixed(4)) : 0,
                      w: Number(Math.cos(this.mockState.yaw * 0.5).toFixed(4)),
                    },
                  },
                },
                yaw: Number(this.mockState.yaw.toFixed(3)),
                vx: Number(this.mockState.vx.toFixed(3)),
                imu: { accel: [0.02, -1.62, 0.01], gyro: [0, 0, Number(this.mockState.yawRate.toFixed(3))] },
                battery_v: 24.1,
              },
            })
          : JSON.stringify({
              pose: {
                x: Number(this.mockState.x.toFixed(3)),
                z: Number(this.mockState.z.toFixed(3)),
              },
              yaw: Number(this.mockState.yaw.toFixed(3)),
              vx: Number(this.mockState.vx.toFixed(3)),
              imu: { accel: [0.02, -1.62, 0.01], gyro: [0, 0, Number(this.mockState.yawRate.toFixed(3))] },
              battery_v: 24.1,
            });

      this.handleInbound(simPacket);
    }, periodMs);

    this.emitDiagnostics();
  }

  public disconnect(): void {
    if (this.mockTimer !== null) {
      clearInterval(this.mockTimer);
      this.mockTimer = null;
    }
    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      try {
        sock.close();
      } catch {
        // Ignore already-closed WebSocket
      }
    }
    this.status = 'disconnected';
    this.emitDiagnostics();
  }

  /**
   * Streams outbound geometry_msgs/Twist at configured Hz, bypassing throttle on E-STOP trigger.
   */
  public sendCommand(vx: number, vy: number, yawRate: number, eStopActive: boolean, nowMs = performance.now()): void {
    if (this.status !== 'connected' && this.status !== 'loopback') return;

    const eStopRising = eStopActive && !this.prevEStop;
    this.prevEStop = eStopActive;

    const intervalMs = 1000 / Math.max(10, Math.min(30, this.config.rateHz));
    if (!eStopRising && nowMs - this.lastTxMs < intervalMs) {
      return;
    }
    this.lastTxMs = nowMs;

    const { twist, json } = buildRosTwistPayload(
      vx,
      vy,
      yawRate,
      eStopActive,
      this.config.protocol,
      this.config.cmdVelTopic
    );

    this.txCount++;
    this.lastTxJson = json;

    if (this.status === 'loopback') {
      // Simulate loopback actuation with immediate E-STOP clamp
      this.mockState.vx = eStopActive ? 0 : twist.linear.x;
      this.mockState.yawRate = eStopActive ? 0 : twist.angular.z;
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(json);
      } catch (err: any) {
        this.lastError = err?.message || 'WebSocket send error';
      }
    }
  }

  public handleInbound(rawJson: string): InboundHardwareTelemetry | null {
    this.rxCount++;
    this.lastRxJson = rawJson;
    const parsed = parseInboundHardwareMessage(rawJson, this.config.coordinateFrame);
    if (parsed) {
      this.lastTelemetry = parsed;
      this.onTelemetryCb?.(parsed);
    }
    return parsed;
  }

  private emitDiagnostics(): void {
    this.onDiagnosticsCb?.(this.getDiagnostics());
  }

  public dispose(): void {
    this.disconnect();
  }
}
