/**
 * World Bounds Verification & Reachability Engine
 */

export interface ArenaConfig {
  halfExtent: number;
  softMargin: number;
  hardMargin: number;
  floorCatchY: number;
}

export const DEFAULT_ARENA: ArenaConfig = {
  halfExtent: 18.0,
  softMargin: 2.0,
  hardMargin: 20.0,
  floorCatchY: -5.0,
};

export interface BoundaryCheckResult {
  state: 'inside' | 'soft' | 'hard' | 'out';
  distanceToEdge: number;
  isOutOfBounds: boolean;
  isFellThrough: boolean;
}

export function evaluateBoundary(
  x: number,
  y: number,
  z: number,
  arena: ArenaConfig = DEFAULT_ARENA
): BoundaryCheckResult {
  const distFromOrigin = Math.sqrt(x * x + z * z);
  const distanceToEdge = Math.max(0, arena.halfExtent - distFromOrigin);

  const isFellThrough = y < arena.floorCatchY;
  const isOutOfBounds = distFromOrigin > arena.hardMargin;

  let state: 'inside' | 'soft' | 'hard' | 'out' = 'inside';
  if (isOutOfBounds) {
    state = 'out';
  } else if (distFromOrigin > arena.halfExtent) {
    state = 'hard';
  } else if (distFromOrigin > arena.halfExtent - arena.softMargin) {
    state = 'soft';
  }

  return {
    state,
    distanceToEdge: Number(distanceToEdge.toFixed(2)),
    isOutOfBounds,
    isFellThrough,
  };
}

/**
 * Validates and clamps visual coordinates to arena + safety envelope
 */
export function sanitizeViewerPosition(
  pos: [number, number, number],
  arena: ArenaConfig = DEFAULT_ARENA
): { pos: [number, number, number]; clamped: boolean } {
  const [x, y, z] = pos;
  const maxEnvelope = arena.hardMargin + 3.0; // 23.0m absolute visual clamp

  const clampedX = Math.max(-maxEnvelope, Math.min(maxEnvelope, x));
  const clampedY = Math.max(arena.floorCatchY + 0.1, Math.min(25.0, y));
  const clampedZ = Math.max(-maxEnvelope, Math.min(maxEnvelope, z));

  const clamped = clampedX !== x || clampedY !== y || clampedZ !== z;
  return {
    pos: [clampedX, clampedY, clampedZ],
    clamped,
  };
}
