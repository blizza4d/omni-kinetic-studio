/**
 * Authoritative Single Terrain Service (v2)
 *
 * Single source of truth for height, surface normals, slopes, raycasting, and
 * live terrain brush editing across Three.js mesh, physics/gait, radar, and LiDAR.
 */

import { TerrainRecipe } from '@/contracts/terrain';
import { TerrainField } from './field';
import { generateCanonicalTerrain } from './generator';

export interface TerrainBrushResult {
  applied: boolean;
  version: number;
  reason?: string;
}

const fieldCache = new Map<string, TerrainField>();
const MAX_CACHE_ENTRIES = 16;

function makeCacheKey(seed: number, recipe?: Partial<TerrainRecipe>): string {
  const s = Number.isFinite(seed) ? Math.floor(seed) : 42;
  if (!recipe || Object.keys(recipe).length === 0) return `s:${s}`;
  return `s:${s}|${JSON.stringify(recipe)}`;
}

export function getCanonicalTerrainField(seed = 42, recipe?: Partial<TerrainRecipe>): TerrainField {
  const key = makeCacheKey(seed, recipe);
  let field = fieldCache.get(key);
  if (!field) {
    field = generateCanonicalTerrain(seed, recipe || {});
    if (fieldCache.size >= MAX_CACHE_ENTRIES) {
      const firstKey = fieldCache.keys().next().value;
      if (firstKey !== undefined) fieldCache.delete(firstKey);
    }
    fieldCache.set(key, field);
  }
  return field;
}

export class TerrainService {
  private field: TerrainField;
  private seed: number;
  private recipe: Partial<TerrainRecipe>;
  private version = 1;
  private listeners = new Set<(version: number) => void>();

  constructor(seed = 42, recipe: Partial<TerrainRecipe> = {}) {
    this.seed = seed;
    this.recipe = { ...recipe };
    // Clone height buffer so live brush edits never pollute the immutable cache
    this.field = this.cloneField(getCanonicalTerrainField(seed, recipe));
  }

  private cloneField(src: TerrainField): TerrainField {
    const heightsCopy = new Int16Array(src.data.heights);
    return new TerrainField({
      ...src.data,
      heights: heightsCopy,
    });
  }

  public regenerate(seed: number, recipe: Partial<TerrainRecipe> = {}): number {
    this.seed = seed;
    this.recipe = { ...recipe };
    this.field = this.cloneField(getCanonicalTerrainField(seed, recipe));
    this.version++;
    this.notify();
    return this.version;
  }

  public getSeed(): number {
    return this.seed;
  }

  public getRecipe(): Partial<TerrainRecipe> {
    return { ...this.recipe };
  }

  public getVersion(): number {
    return this.version;
  }

  public getField(): TerrainField {
    return this.field;
  }

  public heightAt(x: number, z: number): number {
    return this.field.sampleHeight(x, z);
  }

  public normalAt(x: number, z: number, out?: [number, number, number]): [number, number, number] {
    const n = this.field.sampleNormal(x, z);
    if (out) {
      out[0] = n[0];
      out[1] = n[1];
      out[2] = n[2];
      return out;
    }
    return n;
  }

  /** Surface slope in degrees at (x, z). */
  public slopeDegAt(x: number, z: number): number {
    return this.field.sampleSlope(x, z);
  }

  /**
   * Apply a smooth Gaussian raise/lower brush to the heightfield.
   * Rejects edits that would produce NaN or exceed safe height bounds [-4.5m, +6.0m].
   */
  public applyBrush(cx: number, cz: number, radius: number, deltaMeters: number): TerrainBrushResult {
    if (!Number.isFinite(cx) || !Number.isFinite(cz) || !Number.isFinite(radius) || !Number.isFinite(deltaMeters)) {
      return { applied: false, version: this.version, reason: 'Invalid non-finite brush parameters.' };
    }
    if (radius <= 0.1 || radius > 12.0 || Math.abs(deltaMeters) > 2.5) {
      return { applied: false, version: this.version, reason: 'Brush radius or delta exceeds safe limits.' };
    }

    const N = this.field.N;
    const spacing = this.field.spacing;
    const halfExtent = this.field.halfExtent;
    const heights = this.field.data.heights;

    const minIx = Math.max(0, Math.floor((cx - radius + halfExtent) / spacing));
    const maxIx = Math.min(N - 1, Math.ceil((cx + radius + halfExtent) / spacing));
    const minIz = Math.max(0, Math.floor((cz - radius + halfExtent) / spacing));
    const maxIz = Math.min(N - 1, Math.ceil((cz + radius + halfExtent) / spacing));

    const rSq = radius * radius;
    const deltaMm = deltaMeters * 1000.0;

    for (let iz = minIz; iz <= maxIz; iz++) {
      const wz = iz * spacing - halfExtent;
      const dz = wz - cz;
      for (let ix = minIx; ix <= maxIx; ix++) {
        const wx = ix * spacing - halfExtent;
        const dx = wx - cx;
        const distSq = dx * dx + dz * dz;
        if (distSq >= rSq) continue;
        const falloff = Math.cos((Math.sqrt(distSq) / radius) * (Math.PI * 0.5));
        const weight = falloff * falloff;
        const idx = iz * N + ix;
        const nextMm = Math.round(heights[idx] + deltaMm * weight);
        heights[idx] = Math.max(-4500, Math.min(6000, nextMm));
      }
    }

    this.version++;
    this.notify();
    return { applied: true, version: this.version };
  }

  /**
   * Snapshot heights for Undo/Redo in Scenario Editor.
   */
  public snapshotHeights(): Int16Array {
    return new Int16Array(this.field.data.heights);
  }

  public restoreHeights(snapshot: Int16Array): boolean {
    if (snapshot.length !== this.field.data.heights.length) return false;
    this.field.data.heights.set(snapshot);
    this.version++;
    this.notify();
    return true;
  }

  /**
   * Check straight-line segment reachability against a maximum traversable slope (deg).
   */
  public checkSegmentTraversability(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    maxSlopeDeg = 28.0,
    samples = 16
  ): { reachable: boolean; maxSlopeDeg: number; steepestPoint: [number, number] } {
    let worstSlope = 0;
    let worstPt: [number, number] = [x0, z0];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const s = this.slopeDegAt(x, z);
      if (s > worstSlope) {
        worstSlope = s;
        worstPt = [x, z];
      }
    }
    return {
      reachable: worstSlope <= maxSlopeDeg,
      maxSlopeDeg: Number(worstSlope.toFixed(1)),
      steepestPoint: worstPt,
    };
  }

  /**
   * Raymarch against heightfield for LiDAR range scans and click-to-move terrain picking.
   */
  public raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist = 25.0,
    stepSize = 0.25
  ): { hit: boolean; dist: number; point: [number, number, number] } {
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return { hit: false, dist: maxDist, point: [ox, oy, oz] };
    const ndx = dx / len;
    const ndy = dy / len;
    const ndz = dz / len;

    let prevT = 0;
    for (let t = stepSize; t <= maxDist; t += stepSize) {
      const px = ox + ndx * t;
      const py = oy + ndy * t;
      const pz = oz + ndz * t;
      if (Math.abs(px) > this.field.halfExtent || Math.abs(pz) > this.field.halfExtent) {
        return { hit: false, dist: t, point: [px, py, pz] };
      }
      const groundH = this.heightAt(px, pz);
      if (py <= groundH) {
        // Binary refine intersection
        let lo = prevT;
        let hi = t;
        for (let iter = 0; iter < 5; iter++) {
          const mid = (lo + hi) * 0.5;
          const mx = ox + ndx * mid;
          const my = oy + ndy * mid;
          const mz = oz + ndz * mid;
          if (my <= this.heightAt(mx, mz)) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        const hx = ox + ndx * hi;
        const hz = oz + ndz * hi;
        const hy = this.heightAt(hx, hz);
        return { hit: true, dist: hi, point: [hx, hy, hz] };
      }
      prevT = t;
    }

    return {
      hit: false,
      dist: maxDist,
      point: [ox + ndx * maxDist, oy + ndy * maxDist, oz + ndz * maxDist],
    };
  }

  public subscribe(listener: (version: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.version);
  }
}
