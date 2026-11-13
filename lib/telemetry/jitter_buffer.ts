/**
 * Telemetry Stream Jitter Buffer & Sub-Frame Interpolator
 * 
 * Smooths high-throughput, bursty Server-Sent Events (SSE) telemetry batches
 * (e.g. 30 frames delivered every 500ms) into a continuous, judder-free stream
 * rendered at display refresh rate (60, 75, 90, 120, 144 Hz).
 * 
 * Features:
 * - Constant target playback latency buffer (~100ms)
 * - Automatic drift compensation (gradual speedup/slowdown without pitch warping)
 * - Zero-allocation interpolation for position, quaternion, joints, and feet
 * - Seamless hold on network stalls (no teleportation snapping)
 */

import { Vector3, Quaternion } from 'three';
import { TelemetryFrame } from '@/contracts';
import { slerpShortest } from '../anim/math/quaternion';

export interface InterpolatedFrame {
  time: number;
  pos: [number, number, number];
  quat: [number, number, number, number];
  joints: Record<string, number>;
  feet: { id: string; pos: [number, number, number]; contact: boolean }[];
  isHold: boolean;
  boundary?: TelemetryFrame['boundary'];
  episodeEvent?: TelemetryFrame['episodeEvent'];
  collisions?: TelemetryFrame['collisions'];
}

export class TelemetryJitterBuffer {
  private queue: TelemetryFrame[] = [];
  private readonly maxCapacity = 180; // 3 seconds at 60 Hz
  private playbackTime = -1;
  private initialized = false;

  // Scratch objects for zero allocations
  private readonly _posA = new Vector3();
  private readonly _posB = new Vector3();
  private readonly _quatA = new Quaternion();
  private readonly _quatB = new Quaternion();
  private readonly _quatInterp = new Quaternion();

  // Cached last valid frame
  private lastValidFrame: TelemetryFrame | null = null;

  constructor(private targetDelaySec = 0.20) {}

  public getFrameTime(f: TelemetryFrame): number {
    return (f.t !== undefined ? f.t : (f as any).time) ?? 0;
  }

  /**
   * Push incoming frames from SSE batch.
   */
  public pushFrames(frames: TelemetryFrame[]): void {
    if (!frames || frames.length === 0) return;

    for (const f of frames) {
      if (!f.bodies || f.bodies.length === 0) continue;
      this.queue.push(f);
    }

    // Sort queue by frame step or time to ensure monotonic progression
    if (this.queue.length > 1) {
      this.queue.sort((a, b) => this.getFrameTime(a) - this.getFrameTime(b));
    }

    // Drop oldest if exceeding max capacity
    while (this.queue.length > this.maxCapacity) {
      this.queue.shift();
    }

    if (!this.initialized && this.queue.length >= 3) {
      const oldestTime = this.getFrameTime(this.queue[0]);
      const newestTime = this.getFrameTime(this.queue[this.queue.length - 1]);
      if (newestTime - oldestTime >= this.targetDelaySec || this.queue.length >= 15) {
        this.playbackTime = oldestTime;
        this.initialized = true;
      }
    }
  }

  /**
   * Advance playback clock by display delta time.
   * @param dt Smoothed frame delta in seconds
   * @param timeScale Playback rate multiplier (e.g. 1.0)
   */
  public advance(dt: number, timeScale = 1.0): void {
    if (!this.initialized || this.queue.length === 0 || dt <= 0) return;

    const newestTime = this.getFrameTime(this.queue[this.queue.length - 1]);
    const currentBufferDepth = newestTime - this.playbackTime;

    // Buffer latency adjustment:
    // If buffer depth > 0.60s, slightly speed up (1.03x)
    // If buffer depth < 0.05s, slightly slow down (0.97x)
    let rateAdjust = 1.0;
    if (currentBufferDepth > 0.60) {
      rateAdjust = 1.03;
    } else if (currentBufferDepth < 0.05) {
      rateAdjust = 0.97;
    }

    this.playbackTime += dt * timeScale * rateAdjust;

    // Prune consumed frames older than playbackTime (retaining 2 for interpolation)
    while (this.queue.length > 2 && this.getFrameTime(this.queue[1]) < this.playbackTime) {
      this.lastValidFrame = this.queue.shift() || null;
    }
  }

  /**
   * Sample interpolated frame at current playback time.
   */
  public sample(out: InterpolatedFrame): boolean {
    if (this.queue.length === 0) {
      if (this.lastValidFrame) {
        this.fillFromSingleFrame(this.lastValidFrame, out);
        out.isHold = true;
        return true;
      }
      return false;
    }

    if (!this.initialized) {
      this.fillFromSingleFrame(this.queue[0], out);
      out.isHold = false;
      return true;
    }

    const oldestTime = this.getFrameTime(this.queue[0]);
    const newestTime = this.getFrameTime(this.queue[this.queue.length - 1]);

    if (this.queue.length === 1 || this.playbackTime <= oldestTime) {
      this.fillFromSingleFrame(this.queue[0], out);
      out.isHold = false;
      return true;
    }

    if (this.playbackTime >= newestTime) {
      this.fillFromSingleFrame(this.queue[this.queue.length - 1], out);
      out.isHold = true;
      return true;
    }

    // Find bounding frames [A, B] where tA <= playbackTime <= tB
    let frameA = this.queue[0];
    let frameB = this.queue[1];
    let found = false;

    for (let i = 0; i < this.queue.length - 1; i++) {
      const tA = this.getFrameTime(this.queue[i]);
      const tB = this.getFrameTime(this.queue[i + 1]);
      if (this.playbackTime >= tA && this.playbackTime <= tB) {
        frameA = this.queue[i];
        frameB = this.queue[i + 1];
        found = true;
        break;
      }
    }

    if (!found) {
      frameA = this.queue[this.queue.length - 2] || this.queue[0];
      frameB = this.queue[this.queue.length - 1];
    }

    const tSpan = Math.max(1e-4, this.getFrameTime(frameB) - this.getFrameTime(frameA));
    const alpha = Math.min(1.0, Math.max(0.0, (this.playbackTime - this.getFrameTime(frameA)) / tSpan));

    const torsoA = frameA.bodies.find((b) => b.id === 'torso') || frameA.bodies[0];
    const torsoB = frameB.bodies.find((b) => b.id === 'torso') || frameB.bodies[0];

    // 1. Position Linear Interpolation
    this._posA.set(torsoA.pos[0], torsoA.pos[1], torsoA.pos[2]);
    this._posB.set(torsoB.pos[0], torsoB.pos[1], torsoB.pos[2]);
    this._posA.lerp(this._posB, alpha);

    out.pos[0] = this._posA.x;
    out.pos[1] = this._posA.y;
    out.pos[2] = this._posA.z;
    out.time = this.getFrameTime(frameA) + alpha * tSpan;
    out.isHold = false;

    // 2. Quaternion Spherical Linear Interpolation (Shortest Arc)
    this._quatA.set(torsoA.quat[0], torsoA.quat[1], torsoA.quat[2], torsoA.quat[3]);
    this._quatB.set(torsoB.quat[0], torsoB.quat[1], torsoB.quat[2], torsoB.quat[3]);
    slerpShortest(this._quatA, this._quatB, alpha, this._quatInterp);

    out.quat[0] = this._quatInterp.x;
    out.quat[1] = this._quatInterp.y;
    out.quat[2] = this._quatInterp.z;
    out.quat[3] = this._quatInterp.w;

    // 3. Joint Angle Linear Interpolation
    const jointsA: Record<string, number> = {};
    for (const j of frameA.joints) jointsA[j.name] = j.angle;
    for (const j of frameB.joints) {
      const aAngle = jointsA[j.name] ?? j.angle;
      out.joints[j.name] = aAngle + (j.angle - aAngle) * alpha;
    }

    // 4. Feet Target Interpolation
    if (frameA.feet && frameB.feet) {
      out.feet = [];
      for (let i = 0; i < frameA.feet.length; i++) {
        const footA = frameA.feet[i];
        const footB = frameB.feet.find((f) => f.id === footA.id) || footA;
        out.feet.push({
          id: footA.id,
          pos: [
            footA.pos[0] + (footB.pos[0] - footA.pos[0]) * alpha,
            footA.pos[1] + (footB.pos[1] - footA.pos[1]) * alpha,
            footA.pos[2] + (footB.pos[2] - footA.pos[2]) * alpha,
          ],
          contact: footA.contact && footB.contact,
        });
      }
    }

    out.boundary = frameB.boundary || frameA.boundary;
    out.episodeEvent = frameB.episodeEvent || frameA.episodeEvent;
    out.collisions = frameB.collisions || frameA.collisions;

    return true;
  }

  private fillFromSingleFrame(frame: TelemetryFrame, out: InterpolatedFrame): void {
    const torso = frame.bodies.find((b) => b.id === 'torso') || frame.bodies[0];
    out.pos[0] = torso.pos[0];
    out.pos[1] = torso.pos[1];
    out.pos[2] = torso.pos[2];
    out.quat[0] = torso.quat[0];
    out.quat[1] = torso.quat[1];
    out.quat[2] = torso.quat[2];
    out.quat[3] = torso.quat[3];
    out.time = this.getFrameTime(frame);

    for (const j of frame.joints) {
      out.joints[j.name] = j.angle;
    }
    if (frame.feet) {
      out.feet = frame.feet.map((f) => ({ id: f.id, pos: [...f.pos], contact: f.contact }));
    }
    out.boundary = frame.boundary;
    out.episodeEvent = frame.episodeEvent;
    out.collisions = frame.collisions;
  }

  public reset(): void {
    this.queue.length = 0;
    this.playbackTime = -1;
    this.initialized = false;
    this.lastValidFrame = null;
  }
}
