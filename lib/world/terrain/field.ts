import { TerrainFieldData, TerrainFieldHeader, TerrainStats } from '@/contracts/terrain';

export class TerrainField {
  public readonly data: TerrainFieldData;
  public readonly N: number = 257;
  public readonly spacing: number = 0.1875;
  public readonly extent: number = 48.0;
  public readonly halfExtent: number = 24.0;

  constructor(data: TerrainFieldData) {
    this.data = data;
    this.N = data.n;
    this.spacing = data.spacing;
    this.extent = data.extent;
    this.halfExtent = data.extent / 2.0;
  }

  /**
   * Samples exact elevation at world coordinates (x, z) using fixed a-d diagonal barycentric interpolation.
   * Matches the rendered Three.js mesh vertex for vertex and triangle for triangle.
   */
  public sampleHeight(x: number, z: number): number {
    const u = (x + this.halfExtent) / this.spacing;
    const v = (z + this.halfExtent) / this.spacing;

    const maxIdx = this.N - 1;
    const clampedU = Math.max(0, Math.min(maxIdx, u));
    const clampedV = Math.max(0, Math.min(maxIdx, v));

    const ix = Math.min(maxIdx - 1, Math.floor(clampedU));
    const iz = Math.min(maxIdx - 1, Math.floor(clampedV));

    const fx = clampedU - ix;
    const fz = clampedV - iz;

    const heights = this.data.heights;
    const N = this.N;

    // Corner heights in meters (Int16 mm / 1000)
    const ha = heights[iz * N + ix] / 1000.0;
    const hb = heights[iz * N + (ix + 1)] / 1000.0;
    const hc = heights[(iz + 1) * N + ix] / 1000.0;
    const hd = heights[(iz + 1) * N + (ix + 1)] / 1000.0;

    // a-d diagonal split:
    // If fx >= fz: Triangle 1 (a, b, d)
    // If fx <  fz: Triangle 2 (a, d, c)
    if (fx >= fz) {
      const wb = fx - fz;
      const wd = fz;
      const wa = 1.0 - fx;
      return wa * ha + wb * hb + wd * hd;
    } else {
      const wc = fz - fx;
      const wd = fx;
      const wa = 1.0 - fz;
      return wa * ha + wc * hc + wd * hd;
    }
  }

  /**
   * Calculates surface normal vector [nx, ny, nz] at world coordinates (x, z).
   */
  public sampleNormal(x: number, z: number): [number, number, number] {
    const u = (x + this.halfExtent) / this.spacing;
    const v = (z + this.halfExtent) / this.spacing;
    const maxIdx = this.N - 1;
    const clampedU = Math.max(0, Math.min(maxIdx, u));
    const clampedV = Math.max(0, Math.min(maxIdx, v));

    const ix = Math.min(maxIdx - 1, Math.floor(clampedU));
    const iz = Math.min(maxIdx - 1, Math.floor(clampedV));
    const fx = clampedU - ix;
    const fz = clampedV - iz;

    const heights = this.data.heights;
    const N = this.N;
    const ha = heights[iz * N + ix] / 1000.0;
    const hb = heights[iz * N + (ix + 1)] / 1000.0;
    const hc = heights[(iz + 1) * N + ix] / 1000.0;
    const hd = heights[(iz + 1) * N + (ix + 1)] / 1000.0;
    const s = this.spacing;

    let nx: number;
    let ny: number;
    let nz: number;

    if (fx >= fz) {
      // Triangle (a, b, d)
      // v1 = b - a = (s, hb - ha, 0)
      // v2 = d - a = (s, hd - ha, s)
      // cross(v1, v2) = ((hb - ha)*s - 0, 0 - s*s, s*(hd - ha) - s*(hb - ha)) ...
      // Standard plane normal:
      nx = -(hb - ha) / s;
      nz = -(hd - hb) / s;
      ny = 1.0;
    } else {
      // Triangle (a, d, c)
      // v1 = d - a = (s, hd - ha, s)
      // v2 = c - a = (0, hc - ha, s)
      nx = -(hd - hc) / s;
      nz = -(hc - ha) / s;
      ny = 1.0;
    }

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    return [nx / len, ny / len, nz / len];
  }

  /**
   * Calculates surface slope in degrees at world coordinates (x, z).
   */
  public sampleSlope(x: number, z: number): number {
    const [, ny] = this.sampleNormal(x, z);
    const clampedNy = Math.max(0.0, Math.min(1.0, ny));
    return Math.acos(clampedNy) * (180.0 / Math.PI);
  }

  /**
   * Checks whether coordinates lie inside the active playable arena.
   */
  public isInsideArena(x: number, z: number, halfExtent = 18.0): boolean {
    return Math.abs(x) <= halfExtent && Math.abs(z) <= halfExtent;
  }

  /**
   * Serializes TerrainField to a standalone ArrayBuffer containing 4-byte header length,
   * UTF-8 JSON header metadata, and raw Int16Array heights buffer.
   */
  public toBinaryBuffer(): ArrayBuffer {
    const header: TerrainFieldHeader = {
      schemaVersion: '1.0',
      seed: this.data.seed,
      recipeVersion: this.data.recipeVersion,
      attempt: this.data.attempt,
      n: 257,
      spacing: this.spacing,
      origin: 'center',
      extent: this.extent,
      triangulation: 'a-d',
      hash: this.data.hash,
      stats: this.data.stats,
      path: this.data.path,
      generatorVersion: this.data.generatorVersion,
    };

    const headerJson = JSON.stringify(header);
    const headerBytes = new TextEncoder().encode(headerJson);
    const headerLen = headerBytes.byteLength;
    const heightsBytes = this.data.heights.buffer;

    const totalLen = 4 + headerLen + heightsBytes.byteLength;
    const out = new Uint8Array(totalLen);
    const view = new DataView(out.buffer);

    view.setUint32(0, headerLen, true);
    out.set(headerBytes, 4);
    out.set(new Uint8Array(heightsBytes), 4 + headerLen);

    return out.buffer;
  }

  /**
   * Deserializes a binary ArrayBuffer back into a verified TerrainField instance.
   */
  public static fromBinaryBuffer(buffer: ArrayBuffer): TerrainField {
    const view = new DataView(buffer);
    const headerLen = view.getUint32(0, true);

    const headerBytes = new Uint8Array(buffer, 4, headerLen);
    const headerJson = new TextDecoder().decode(headerBytes);
    const header = JSON.parse(headerJson) as TerrainFieldHeader;

    const heightsOffset = 4 + headerLen;
    // Align to 2-byte boundary if needed
    const heightsBuffer = buffer.slice(heightsOffset);
    const heights = new Int16Array(heightsBuffer);

    return new TerrainField({
      ...header,
      heights,
    });
  }
}
