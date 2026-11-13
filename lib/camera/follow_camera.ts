/**
 * Critically Damped Follow Camera with Velocity Look-Ahead & Terrain Clearance
 * 
 * Features:
 * - Delta-time-correct critically damped springs (Spring3)
 * - Velocity look-ahead leads forward motion smoothly
 * - Small dead-zone (< 2cm) filters standing micro-jitter
 * - Dynamic zoom out at higher velocities
 * - Terrain heightfield clearance prevents ground clipping
 * - Strict World Y-up horizon locking
 * - Zero per-frame allocations
 */

import { PerspectiveCamera, Vector3 } from 'three';
import { Spring3 } from '../anim/math/spring';
import { TerrainField } from '../world/terrain/field';

export interface CameraFollowOptions {
  posHalfLife?: number;   // seconds (nominal 0.18s)
  lookHalfLife?: number;  // seconds (nominal 0.12s)
  lookAheadSec?: number;  // seconds (nominal 0.25s)
  deadZoneRadius?: number;// meters (nominal 0.02m)
  minHeightAboveGround?: number; // meters (nominal 0.50m)
}

export class FollowCameraRig {
  private readonly posSpring: Spring3 = new Spring3(0, 1.6, 5.0);
  private readonly lookSpring: Spring3 = new Spring3(0, 0.4, 0);

  // Scratch vectors for zero allocation
  private readonly _targetPos = new Vector3();
  private readonly _targetLook = new Vector3();
  private readonly _lastStablePos = new Vector3();

  // Angular state for orbit/chase
  private currentYaw = 0;
  private currentPitch = 0.45;
  private currentDist = 5.0;

  constructor(private readonly opts: CameraFollowOptions = {}) {
    this.opts.posHalfLife = opts.posHalfLife ?? 0.18;
    this.opts.lookHalfLife = opts.lookHalfLife ?? 0.12;
    this.opts.lookAheadSec = opts.lookAheadSec ?? 0.25;
    this.opts.deadZoneRadius = opts.deadZoneRadius ?? 0.02;
    this.opts.minHeightAboveGround = opts.minHeightAboveGround ?? 0.50;
  }

  /**
   * Update follow camera smoothly using interpolated droid pose and frame delta.
   * 
   * @param camera Active Three.js perspective camera
   * @param droidPos Interpolated world position [x, y, z]
   * @param droidVel Linear velocity vector [vx, vy, vz]
   * @param preset 'chase' | 'orbit' | 'top' | 'side'
   * @param terrain Optional terrain field for ground clearance
   * @param dt Frame delta time in seconds
   * @param userOrbit User manual orbit controls { yaw, pitch, dist }
   */
  public update(
    camera: PerspectiveCamera,
    droidPos: [number, number, number],
    droidVel: [number, number, number],
    preset: 'chase' | 'orbit' | 'top' | 'side' = 'chase',
    terrain: TerrainField | null = null,
    dt = 1.0 / 60.0,
    userOrbit?: { yaw: number; pitch: number; dist: number }
  ): void {
    if (dt <= 0) return;

    // 1. Dead-zone filter for standing micro-tremor
    const distFromLast = Math.hypot(
      droidPos[0] - this._lastStablePos.x,
      droidPos[2] - this._lastStablePos.z
    );
    if (distFromLast > (this.opts.deadZoneRadius ?? 0.02)) {
      this._lastStablePos.set(droidPos[0], droidPos[1], droidPos[2]);
    }

    const stableX = this._lastStablePos.x;
    const stableY = droidPos[1];
    const stableZ = this._lastStablePos.z;

    // 2. Velocity Look-Ahead (lead motion by up to 0.25s)
    const forwardSpeed = Math.hypot(droidVel[0], droidVel[2]);
    const lookAheadSpan = Math.min(1.2, forwardSpeed * (this.opts.lookAheadSec ?? 0.25));
    const lookDirX = forwardSpeed > 0.05 ? droidVel[0] / forwardSpeed : 0;
    const lookDirZ = forwardSpeed > 0.05 ? droidVel[2] / forwardSpeed : 0;

    const goalLookX = stableX + lookDirX * lookAheadSpan;
    const goalLookY = stableY + 0.35;
    const goalLookZ = stableZ + lookDirZ * lookAheadSpan;

    // 3. Critically Damped Spring on Look-At Target
    const look = this.lookSpring.update(
      goalLookX,
      goalLookY,
      goalLookZ,
      this.opts.lookHalfLife ?? 0.12,
      dt,
      droidVel[0],
      droidVel[1],
      droidVel[2]
    );

    // 4. Target Camera Position Based on Preset
    if (preset === 'top') {
      this._targetPos.set(look.x, stableY + 8.5, look.z);
    } else if (preset === 'side') {
      this._targetPos.set(look.x, stableY + 1.2, look.z + 4.5);
    } else {
      // Chase / Orbit mode with dynamic speed-adaptive distance
      const targetDist = (userOrbit?.dist ?? 5.0) + Math.min(1.5, forwardSpeed * 0.4);
      const targetPitch = userOrbit?.pitch ?? 0.45;
      const targetYaw = userOrbit?.yaw ?? 0.0;

      // Smooth angular controls with halfLife
      const alphaRot = 1.0 - Math.exp((-Math.LN2 * dt) / 0.12);
      this.currentYaw += (targetYaw - this.currentYaw) * alphaRot;
      this.currentPitch += (targetPitch - this.currentPitch) * alphaRot;
      this.currentDist += (targetDist - this.currentDist) * alphaRot;

      const camX = look.x + Math.sin(this.currentYaw) * Math.cos(this.currentPitch) * this.currentDist;
      let rawCamY = look.y + Math.sin(this.currentPitch) * this.currentDist + 0.4;
      const camZ = look.z + Math.cos(this.currentYaw) * Math.cos(this.currentPitch) * this.currentDist;

      // 5. Terrain Clearance (never clip through ground/crater slopes)
      if (terrain) {
        const groundHeight = terrain.sampleHeight(camX, camZ);
        rawCamY = Math.max(groundHeight + (this.opts.minHeightAboveGround ?? 0.50), rawCamY);
      }

      this._targetPos.set(camX, rawCamY, camZ);
    }

    // 6. Critically Damped Spring on Camera Position
    const pos = this.posSpring.update(
      this._targetPos.x,
      this._targetPos.y,
      this._targetPos.z,
      this.opts.posHalfLife ?? 0.18,
      dt,
      droidVel[0],
      droidVel[1],
      droidVel[2]
    );

    // 7. Apply to Camera with World Y-up roll lock
    camera.up.set(0, 1, 0);
    camera.position.set(pos.x, pos.y, pos.z);
    camera.lookAt(look.x, look.y, look.z);
  }

  public reset(x = 0, y = 0.4, z = 0): void {
    this._lastStablePos.set(x, y, z);
    this.posSpring.set(x, y + 1.6, z + 5.0);
    this.lookSpring.set(x, y + 0.35, z);
    this.currentYaw = 0;
    this.currentPitch = 0.45;
    this.currentDist = 5.0;
  }
}
