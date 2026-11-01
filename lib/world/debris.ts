/**
 * Deterministic debris boulder distribution, robot-relative sizing, and corridor routing.
 * Supports up to 2,000 instanced meshes partitioned into spatial chunks.
 */

export interface DebrisInstance {
  id: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: [number, number, number];
  geometryType: 0 | 1 | 2; // 0: Subdivided Displaced Boulder A, 1: Boulder B, 2: Boulder C (Zero pyramids)
  isSleeping: boolean;
  chunkId?: number;
}

export interface DebrisFieldOptions {
  spawnPos?: [number, number, number];
  goalPos?: [number, number, number];
  spawnClearRadius?: number;
  goalClearRadius?: number;
  minScale?: number;
  maxScale?: number;
  corridorWidth?: number;
}

export function generateDebrisField(
  count: number,
  bounds: [number, number],
  seed: number,
  getHeight: (x: number, z: number) => number,
  options: DebrisFieldOptions = {}
): DebrisInstance[] {
  const [width, length] = bounds;
  const halfW = (width * 0.88) / 2;
  const halfL = (length * 0.88) / 2;

  const spawn = options.spawnPos ?? [0, 0, 0];
  const goal = options.goalPos ?? [14.0, 0, -10.0];
  const spawnClear = options.spawnClearRadius ?? 2.5;
  const goalClear = options.goalClearRadius ?? 2.5;
  const minScale = options.minScale ?? 0.20;
  const maxScale = options.maxScale ?? 0.55; // Robot chassis is ~0.6m; keep boulders robot-relative
  const corridorWidth = options.corridorWidth ?? 1.4;

  const instances: DebrisInstance[] = [];

  let attempt = 0;
  const maxAttempts = count * 3;

  while (instances.length < count && attempt < maxAttempts) {
    const i = attempt++;
    // Deterministic pseudo-random distribution
    const r1 = Math.sin(i * 12.9898 + seed * 19.3) * 43758.5453;
    const r2 = Math.cos(i * 78.233 + seed * 37.1) * 43758.5453;
    const r3 = Math.sin(i * 45.123 + seed * 89.7) * 43758.5453;
    const r4 = Math.cos(i * 91.331 + seed * 14.5) * 43758.5453;

    const u = r1 - Math.floor(r1);
    const v = r2 - Math.floor(r2);
    const w = r3 - Math.floor(r3);
    const g = r4 - Math.floor(r4);

    const x = (u - 0.5) * 2 * halfW;
    const z = (v - 0.5) * 2 * halfL;

    // 1. Enforce clear zone around Spawn (radius 2.5m)
    const distFromSpawn = Math.hypot(x - spawn[0], z - spawn[2]);
    if (distFromSpawn < spawnClear) {
      continue;
    }

    // 2. Enforce clear zone around Goal (radius 2.5m)
    const distFromGoal = Math.hypot(x - goal[0], z - goal[2]);
    if (distFromGoal < goalClear) {
      continue;
    }

    // 3. Perimeter radial falloff: prevent boulder accumulation at the 17.6m perimeter
    const distArena = Math.max(Math.abs(x), Math.abs(z));
    if (distArena > 14.5) {
      const keepProb = 1.0 - ((distArena - 14.5) / 3.1) * 0.9;
      if (w > keepProb) {
        continue;
      }
    }

    // 3. Keep a guaranteed navigable corridor between Spawn and Goal
    const dx = goal[0] - spawn[0];
    const dz = goal[2] - spawn[2];
    const lineLen = Math.hypot(dx, dz);
    if (lineLen > 0) {
      // Perpendicular distance to the spawn-goal line segment
      const t = Math.max(0, Math.min(1, ((x - spawn[0]) * dx + (z - spawn[2]) * dz) / (lineLen * lineLen)));
      const projX = spawn[0] + t * dx;
      const projZ = spawn[2] + t * dz;
      const distToCorridor = Math.hypot(x - projX, z - projZ);

      // Exclude debris from the primary corridor path (1.2m radius) to guarantee reachability
      if (distToCorridor < 1.2) {
        continue;
      }
    }

    const groundY = getHeight(x, z);
    const scale = minScale + w * (maxScale - minScale);
    const geometryType = g < 0.35 ? 0 : g < 0.70 ? 1 : (2 as const);

    // Calculate 4x4 spatial chunk ID (0 to 15) for frustum culling
    const chunkX = Math.max(0, Math.min(3, Math.floor(((x + halfW) / (halfW * 2)) * 4)));
    const chunkZ = Math.max(0, Math.min(3, Math.floor(((z + halfL) / (halfL * 2)) * 4)));
    const chunkId = chunkZ * 4 + chunkX;

    instances.push({
      id: i,
      x,
      y: groundY + scale * 0.35,
      z,
      scale: Number(scale.toFixed(3)),
      rotation: [Number((u * Math.PI).toFixed(3)), Number((v * Math.PI).toFixed(3)), Number((w * Math.PI).toFixed(3))],
      geometryType,
      isSleeping: true,
      chunkId,
    });
  }

  return instances;
}

/**
 * Validates that an unobstructed navigable path exists between spawn and goal.
 */
export function checkNavigablePath(
  debris: DebrisInstance[],
  spawn: [number, number, number] = [0, 0, 0],
  goal: [number, number, number] = [14, 0, -10],
  robotRadius = 0.35
): boolean {
  const steps = 30;
  const dx = goal[0] - spawn[0];
  const dz = goal[2] - spawn[2];
  const len = Math.hypot(dx, dz);
  if (len === 0) return true;

  const nx = -dz / len;
  const nz = dx / len;

  for (let s = 1; s < steps; s++) {
    const fraction = s / steps;
    const px = spawn[0] + dx * fraction;
    const pz = spawn[2] + dz * fraction;

    const blockingCenter = debris.some((d) => Math.hypot(d.x - px, d.z - pz) < d.scale * 0.5 + robotRadius);
    if (!blockingCenter) continue;

    // Check lateral detours (+/- 1.2m perpendicular to corridor vector)
    const leftClear = !debris.some((d) => Math.hypot(d.x - (px + nx * 1.2), d.z - (pz + nz * 1.2)) < d.scale * 0.5 + robotRadius);
    const rightClear = !debris.some((d) => Math.hypot(d.x - (px - nx * 1.2), d.z - (pz - nz * 1.2)) < d.scale * 0.5 + robotRadius);

    if (!leftClear && !rightClear) {
      return false;
    }
  }

  return true;
}
