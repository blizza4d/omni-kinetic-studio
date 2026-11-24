/**
 * Photo Mode & Cinematic Auto-Director Camera (Pack L — F-012)
 *
 * Implements:
 * - Photo mode configuration with exposure, vignette, FOV, and aspect ratios
 * - Deterministic event-driven cinematic director cuts (chase, low-angle wheel, hop apex, top-down)
 */

export interface PhotoModeSettings {
  active: boolean;
  fov: number; // 25..90
  exposure: number; // 0.6..2.0
  contrast: number; // 0.8..1.5
  vignette: number; // 0.0..0.8
  grid: 'none' | 'thirds' | 'crosshair';
  renderScale: 1 | 2 | 4;
}

export const DEFAULT_PHOTO_SETTINGS: PhotoModeSettings = {
  active: false,
  fov: 48,
  exposure: 1.15,
  contrast: 1.05,
  vignette: 0.25,
  grid: 'none',
  renderScale: 2,
};

export type CinematicShotType = 'chase' | 'low_angle_stride' | 'hop_apex' | 'crater_overview';

export interface CinematicDirectorState {
  currentShot: CinematicShotType;
  shotTimeRemainingSec: number;
  targetFov: number;
  cameraOffset: [number, number, number];
}

export class CinematicDirector {
  private currentShot: CinematicShotType = 'chase';
  private shotTimer = 4.0;

  public update(
    dt: number,
    hopActive: boolean,
    speed: number,
    nearEdge: boolean
  ): CinematicDirectorState {
    this.shotTimer -= dt;

    // Event-driven camera shot transitions
    if (hopActive) {
      this.currentShot = 'hop_apex';
      this.shotTimer = 2.2;
    } else if (nearEdge && this.currentShot !== 'crater_overview') {
      this.currentShot = 'crater_overview';
      this.shotTimer = 3.5;
    } else if (this.shotTimer <= 0) {
      this.currentShot = speed > 1.2 ? 'low_angle_stride' : 'chase';
      this.shotTimer = 4.5;
    }

    let offset: [number, number, number] = [-2.6, 2.0, 2.6];
    let fov = 50;

    switch (this.currentShot) {
      case 'low_angle_stride':
        offset = [-1.4, 0.45, 1.2];
        fov = 42;
        break;
      case 'hop_apex':
        offset = [-3.2, 1.2, 3.0];
        fov = 58;
        break;
      case 'crater_overview':
        offset = [-4.5, 5.5, 4.5];
        fov = 64;
        break;
      case 'chase':
      default:
        offset = [-2.6, 2.0, 2.6];
        fov = 50;
        break;
    }

    return {
      currentShot: this.currentShot,
      shotTimeRemainingSec: Number(this.shotTimer.toFixed(2)),
      targetFov: fov,
      cameraOffset: offset,
    };
  }
}
