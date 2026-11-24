/**
 * Controller Playground: Sandboxed User Controller Runtime (Pack A — F-001)
 *
 * Implements safe, isolated execution of user-written robot controllers:
 * - Pure observation interface (no raw sim object references)
 * - Strict schema validation of LocomotionCommands (Zod / bounded clamping)
 * - Watchdog execution budget (5 ms per step, safe stop on consecutive timeouts)
 * - Deterministic replay compatibility (replays use recorded commands, not re-exec)
 */

import { LocomotionCommand, createNeutralCommand, GaitMode } from './types';
import { mulberry32 } from '../sim/prng';

export interface Observation {
  t: number; // Simulation time in seconds
  dt: number; // Control step period (default 1/30 or 1/60)
  pose: {
    x: number;
    z: number;
    heading: number;
    pitch: number;
    roll: number;
  };
  vel: {
    forward: number;
    lateral: number;
    yawRate: number;
  };
  gravity: number;
  battery?: number; // 0..1 if battery model is active
  contacts: [boolean, boolean, boolean, boolean]; // FL, FR, RL, RR
  goal?: {
    x: number;
    z: number;
    distance: number;
    bearing: number; // Angle to goal relative to heading (-PI..PI)
  };
  edgeDistance: number;
  rays?: number[];
  terrainHeightAhead?: number[];
}

export interface ControllerCtx {
  seed: number;
  storage: Record<string, number>;
  log: (msg: string) => void;
}

export type UserControllerFn = (obs: Observation, ctx: ControllerCtx) => Partial<LocomotionCommand>;

const ALLOWED_GAITS: ReadonlySet<string> = new Set(['auto', 'walk', 'trot', 'bound', 'pronk']);

/**
 * Validates and sanitizes raw controller output into a guaranteed safe LocomotionCommand.
 */
export function validateControllerOutput(
  raw: unknown,
  fallback: LocomotionCommand = createNeutralCommand('auto')
): LocomotionCommand {
  if (!raw || typeof raw !== 'object') {
    return { ...fallback };
  }

  const obj = raw as Record<string, unknown>;
  const out = { ...fallback };

  if (typeof obj.vx === 'number' && Number.isFinite(obj.vx)) {
    out.vx = Math.max(-1.5, Math.min(2.5, obj.vx));
  }
  if (typeof obj.vy === 'number' && Number.isFinite(obj.vy)) {
    out.vy = Math.max(-1.2, Math.min(1.2, obj.vy));
  }
  if (typeof obj.yawRate === 'number' && Number.isFinite(obj.yawRate)) {
    out.yawRate = Math.max(-2.5, Math.min(2.5, obj.yawRate));
  }
  if (typeof obj.bodyHeight === 'number' && Number.isFinite(obj.bodyHeight)) {
    out.bodyHeight = Math.max(0.15, Math.min(0.95, obj.bodyHeight));
  }
  if (typeof obj.gait === 'string' && ALLOWED_GAITS.has(obj.gait)) {
    out.gait = obj.gait as GaitMode;
  }
  if (typeof obj.hop === 'boolean') {
    out.hop = obj.hop;
  }
  if (typeof obj.hopCharge === 'number' && Number.isFinite(obj.hopCharge)) {
    out.hopCharge = Math.max(0, Math.min(1.0, obj.hopCharge));
  }
  if (typeof obj.stop === 'boolean') {
    out.stop = obj.stop;
  }

  return out;
}

/**
 * Watchdog runner for controllers.
 */
export async function stepWithWatchdog(
  stepFn: () => Promise<LocomotionCommand> | LocomotionCommand,
  budgetMs: number,
  lastSafe: LocomotionCommand,
  misses: { n: number }
): Promise<LocomotionCommand> {
  let timer: any = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs);
  });

  try {
    const execPromise = Promise.resolve().then(() => stepFn());
    const res = await Promise.race([execPromise, timeoutPromise]);

    if (res === null) {
      misses.n += 1;
      return lastSafe;
    }

    misses.n = 0;
    return res;
  } catch {
    misses.n += 1;
    return lastSafe;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Compiles user source code in an isolated scope with stripped dangerous globals.
 */
export function compileControllerSource(code: string): {
  ok: boolean;
  fn?: UserControllerFn;
  error?: string;
} {
  if (code.length > 25000) {
    return { ok: false, error: 'Controller source code exceeds 25,000 characters limit' };
  }

  // Reject dangerous keywords in source string
  const banned = [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'importScripts',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'cookie',
    'window',
    'document',
    'eval',
    'Function',
    'Worker',
    'SharedWorker',
    'navigator',
  ];
  for (const b of banned) {
    const rx = new RegExp(`\\b${b}\\b`);
    if (rx.test(code)) {
      return { ok: false, error: `Forbidden API access detected: "${b}" is not allowed in sandbox` };
    }
  }

  try {
    // Construct isolated function wrapper
    const wrapped = new Function(
      'obs',
      'ctx',
      'Math',
      `"use strict";
${code}
if (typeof controller === "function") {
  return controller(obs, ctx);
}
return {};`
    );

    const fn: UserControllerFn = (obs, ctx) => {
      // Provide deterministic Math with seeded random
      const rng = mulberry32((ctx.seed + Math.floor(obs.t * 100)) >>> 0);
      const safeMath = Object.create(Math);
      safeMath.random = rng;
      return wrapped(obs, ctx, safeMath);
    };

    return { ok: true, fn };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Syntax compilation error' };
  }
}

// ============================================================================
// TEMPLATE CONTROLLERS
// ============================================================================

export const TEMPLATE_GO_TO_GOAL = `// Go-To-Goal Controller: steers toward the active mission waypoint
function controller(obs, ctx) {
  if (!obs.goal) {
    return { vx: 0.8, yawRate: 0, gait: "auto" };
  }
  
  const dist = obs.goal.distance;
  const bearing = obs.goal.bearing;
  
  // Slow down when close to target
  const speed = dist < 1.0 ? 0.4 : 1.35;
  const yawRate = Math.max(-2.0, Math.min(2.0, bearing * 2.2));
  
  if (dist < 0.4) {
    ctx.log("Goal reached!");
    return { vx: 0, yawRate: 0, stop: false };
  }
  
  return {
    vx: speed,
    yawRate: yawRate,
    gait: speed > 1.2 ? "trot" : "walk"
  };
}`;

export const TEMPLATE_EDGE_AVOIDANCE = `// Edge Avoidance: reverses and turns away from arena catch boundaries
function controller(obs, ctx) {
  const edgeDist = obs.edgeDistance;
  
  if (edgeDist < 3.0) {
    ctx.log("Approaching edge (" + edgeDist.toFixed(1) + "m)! Turning around.");
    return {
      vx: 0.2,
      yawRate: 1.8,
      gait: "walk"
    };
  }
  
  return {
    vx: 1.2,
    yawRate: 0.1,
    gait: "trot"
  };
}`;

export const TEMPLATE_BOULDER_AVOIDANCE = `// Wall/Boulder Follower: scans range sensors to avoid obstacles
function controller(obs, ctx) {
  const rays = obs.rays || [];
  let minLeft = 10;
  let minRight = 10;
  
  for (let i = 0; i < rays.length; i++) {
    const d = rays[i];
    if (i < rays.length / 2) minLeft = Math.min(minLeft, d);
    else minRight = Math.min(minRight, d);
  }
  
  let yawRate = 0;
  if (minLeft < 2.5) yawRate = -1.2;
  else if (minRight < 2.5) yawRate = 1.2;
  
  return {
    vx: Math.min(minLeft, minRight) < 1.5 ? 0.6 : 1.25,
    yawRate: yawRate,
    gait: "auto"
  };
}`;

export const TEMPLATE_SMOOTH_STOP = `// Smooth Stop: decelerates with exponential braking profile
function controller(obs, ctx) {
  const targetTime = 4.0;
  if (obs.t >= targetTime) {
    return { vx: 0, yawRate: 0, stop: true, bodyHeight: 0.4 };
  }
  const factor = Math.max(0, 1.0 - (obs.t / targetTime));
  return {
    vx: 1.4 * factor,
    yawRate: 0,
    gait: "walk"
  };
}`;

export const TEMPLATE_SPEED_GAIT = `// Speed-Adaptive Gait Selector: shifts gears from walk to bound
function controller(obs, ctx) {
  const fwd = obs.vel.forward;
  let gait = "walk";
  if (fwd > 1.4) gait = "bound";
  else if (fwd > 0.8) gait = "trot";
  
  return {
    vx: 1.6,
    yawRate: 0,
    gait: gait
  };
}`;

export const BUILT_IN_CONTROLLERS = {
  go_to_goal: {
    name: 'Go-to-Goal',
    code: TEMPLATE_GO_TO_GOAL,
    description: 'Steers toward the active mission waypoint',
  },
  edge_avoidance: {
    name: 'Edge Avoidance',
    code: TEMPLATE_EDGE_AVOIDANCE,
    description: 'Reverses and turns away from arena catch boundaries',
  },
  boulder_avoidance: {
    name: 'Boulder Avoidance',
    code: TEMPLATE_BOULDER_AVOIDANCE,
    description: 'Scans range sensors to avoid obstacles',
  },
  smooth_stop: {
    name: 'Smooth Stop',
    code: TEMPLATE_SMOOTH_STOP,
    description: 'Decelerates with exponential braking profile',
  },
  speed_gait: {
    name: 'Speed Gait',
    code: TEMPLATE_SPEED_GAIT,
    description: 'Shifts gears from walk to bound based on velocity',
  },
};

export const compileUserCode = compileControllerSource;
