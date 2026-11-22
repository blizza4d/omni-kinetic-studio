import * as fs from 'fs';
import * as path from 'path';
import { SimEngine } from '../lib/sim/SimEngine';
import { ShortcutRegistry } from '../lib/control/shortcuts';

export interface GoldenStep {
  step: number;
  t: number;
  bodyPos: [number, number, number];
  bodyQuat: [number, number, number, number];
  joints: { name: string; angle: number }[];
  feet: {
    id: string;
    worldPos: [number, number, number];
    localPos: [number, number, number];
    state: string;
  }[];
}

export interface GoldenTrace {
  seed: number;
  gravity: number;
  durationSeconds: number;
  fps: number;
  totalSteps: number;
  steps: GoldenStep[];
}

export function recordGoldenTrace(durationSeconds = 10.0, fps = 60, seed = 42): GoldenTrace {
  const totalSteps = Math.round(durationSeconds * fps);
  const dt = 1.0 / fps;

  const registry = new ShortcutRegistry();
  const engine = new SimEngine(registry, {
    scenario: {
      seed,
      gravity: 1.62,
      episodeLength: 16.7,
      startPos: [0, 0],
      startHeading: 0,
    },
  });

  const steps: GoldenStep[] = [];

  for (let s = 0; s < totalSteps; s++) {
    const state = engine.executeFixedStep(s, dt);

    steps.push({
      step: s,
      t: Number((s * dt).toFixed(4)),
      bodyPos: [
        Number(state.bodyPos[0].toFixed(6)),
        Number(state.bodyPos[1].toFixed(6)),
        Number(state.bodyPos[2].toFixed(6)),
      ],
      bodyQuat: [
        Number(state.bodyQuat[0].toFixed(6)),
        Number(state.bodyQuat[1].toFixed(6)),
        Number(state.bodyQuat[2].toFixed(6)),
        Number(state.bodyQuat[3].toFixed(6)),
      ],
      joints: state.joints.map((j) => ({
        name: j.name,
        angle: Number(j.angle.toFixed(6)),
      })),
      feet: state.feet.map((f) => ({
        id: f.id,
        worldPos: [
          Number(f.worldPos[0].toFixed(6)),
          Number(f.worldPos[1].toFixed(6)),
          Number(f.worldPos[2].toFixed(6)),
        ],
        localPos: [
          Number(f.localPos[0].toFixed(6)),
          Number(f.localPos[1].toFixed(6)),
          Number(f.localPos[2].toFixed(6)),
        ],
        state: f.state,
      })),
    });
  }

  return {
    seed,
    gravity: 1.62,
    durationSeconds,
    fps,
    totalSteps,
    steps,
  };
}

if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.includes('record_golden_trace'))) {
  console.log('[Golden Trace] Recording 10s at 60Hz with fixed seed 42...');
  const trace = recordGoldenTrace(10.0, 60, 42);

  const targets = [
    path.resolve(process.cwd(), 'tests', 'golden', 'gait-before.json'),
    path.resolve(process.cwd(), 'test', 'golden', 'gait-before.json'),
  ];

  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(trace, null, 2), 'utf-8');
    console.log(`[Golden Trace] Written to ${target} (${trace.steps.length} steps, ${(fs.statSync(target).size / 1024).toFixed(1)} KB)`);
  }
}
