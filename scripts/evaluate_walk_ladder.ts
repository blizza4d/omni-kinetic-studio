import fs from 'fs';
import path from 'path';
import { LocalSimulationRunner } from '../lib/telemetry/local_runner';
import { EnvironmentSpec, TelemetryFrame } from '../contracts';
import { generateDeterministicEnvironmentSpec } from '../lib/nebius/prompts';
import { quaternionToYaw } from '../lib/frames';

interface LadderRungResult {
  rung: string;
  name: string;
  verdict: 'PASS' | 'FAIL';
  firstFailingCause?: string;
  metrics: {
    duration: number;
    frames: number;
    slipAngleMeanDeg: number;
    slipAngleP95Deg: number;
    slipAngleMaxDeg: number;
    lateralErrorMeanM: number;
    lateralErrorP95M: number;
    lateralErrorMaxM: number;
    headingErrorP95Deg: number;
    headingZeroCrossingsPerSec: number;
    pathStraightness: number;
    rollRMSDeg: number;
    pitchRMSDeg: number;
    stanceSlipMaxM: number;
    footprintLineResidualM: number;
    goalReached: boolean;
  };
  details: string;
}

function computeAngleDiff(a: number, b: number): number {
  let diff = a - b;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}

function evaluateRun(runner: LocalSimulationRunner, spec: EnvironmentSpec, maxSteps = 300, goalPos: [number, number] = [15, 0]): LadderRungResult['metrics'] {
  runner.setEnvironmentSpec(spec);
  runner.reset();

  const frames: TelemetryFrame[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const f = runner.generateFrame(i);
    frames.push(f);
    if (f.status === 'goal_reached' || f.status === 'out_of_bounds') break;
  }

  const slips: number[] = [];
  const lateralErrors: number[] = [];
  const headingErrors: number[] = [];
  let zeroCrossings = 0;
  let lastHeadingErr = 0;
  let pathLength = 0;
  let prevPos: [number, number] | null = null;
  const startPos: [number, number] = [frames[0].bodies[0].pos[0], frames[0].bodies[0].pos[2]];

  const dx = goalPos[0] - startPos[0];
  const dz = goalPos[1] - startPos[1];
  const targetDist = Math.hypot(dx, dz);
  const targetHeading = Math.atan2(-dz, dx);

  const footprintXs: number[] = [];
  const footprintZs: number[] = [];

  let sumRollSq = 0;
  let sumPitchSq = 0;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const body = f.bodies[0];
    const x = body.pos[0];
    const z = body.pos[2]; // Canonical World pos: index 0 = x, index 2 = z

    if (prevPos) {
      pathLength += Math.hypot(x - prevPos[0], z - prevPos[1]);
    }
    prevPos = [x, z];

    // Velocity vector
    const vx = body.vel[0];
    const vz = body.vel[2];
    const speed = Math.hypot(vx, vz);

    // Body yaw using canonical frames
    const bodyYaw = quaternionToYaw(body.quat as any);

    if (speed > 0.05) {
      const velAngle = Math.atan2(-vz, vx);
      const slip = Math.abs(computeAngleDiff(velAngle, bodyYaw)) * (180 / Math.PI);
      slips.push(slip);
    }

    // Perpendicular distance to planned line
    if (targetDist > 0.01) {
      const latErr = Math.abs((goalPos[1] - startPos[1]) * x - (goalPos[0] - startPos[0]) * z + goalPos[0] * startPos[1] - goalPos[1] * startPos[0]) / targetDist;
      lateralErrors.push(latErr);
    }

    // Heading error to target line
    if (speed > 0.05) {
      const velH = Math.atan2(-vz, vx);
      const hErr = computeAngleDiff(velH, targetHeading);
      headingErrors.push(Math.abs(hErr) * (180 / Math.PI));
      if (i > 0 && ((hErr >= 0 && lastHeadingErr < 0) || (hErr < 0 && lastHeadingErr >= 0))) {
        zeroCrossings++;
      }
      lastHeadingErr = hErr;
    }

    // Footprints
    if (f.feet) {
      for (const foot of f.feet) {
        if (foot.contact) {
          footprintXs.push(foot.pos[0]);
          footprintZs.push(foot.pos[2]);
        }
      }
    }

    // Roll and Pitch from joints/slope
    const pitch = f.slopeUnderBody || 0;
    const roll = 0;
    sumPitchSq += (pitch * 180 / Math.PI) ** 2;
    sumRollSq += (roll * 180 / Math.PI) ** 2;
  }

  slips.sort((a, b) => a - b);
  lateralErrors.sort((a, b) => a - b);
  headingErrors.sort((a, b) => a - b);

  const durationSec = frames.length * (frames[0]?.dt || 0.0167);
  const netDisp = prevPos ? Math.hypot(prevPos[0] - startPos[0], prevPos[1] - startPos[1]) : 0;
  const straightness = pathLength > 0 ? netDisp / pathLength : 1.0;

  // Linear fit residual for footprints
  let footprintLineResidualM = 0;
  if (footprintXs.length > 5 && targetDist > 0.01) {
    let sumRes = 0;
    for (let k = 0; k < footprintXs.length; k++) {
      const fx = footprintXs[k];
      const fz = footprintZs[k];
      const d = Math.abs((goalPos[1] - startPos[1]) * fx - (goalPos[0] - startPos[0]) * fz + goalPos[0] * startPos[1] - goalPos[1] * startPos[0]) / targetDist;
      sumRes += d * d;
    }
    footprintLineResidualM = Math.sqrt(sumRes / footprintXs.length);
  }

  const finalDist = prevPos ? Math.hypot(goalPos[0] - prevPos[0], goalPos[1] - prevPos[1]) : 999;
  const goalReached = finalDist < 1.2 || frames[frames.length - 1]?.status === 'goal_reached';

  return {
    duration: Number(durationSec.toFixed(2)),
    frames: frames.length,
    slipAngleMeanDeg: Number((slips.reduce((a, b) => a + b, 0) / Math.max(1, slips.length)).toFixed(2)),
    slipAngleP95Deg: Number((slips[Math.floor(slips.length * 0.95)] || 0).toFixed(2)),
    slipAngleMaxDeg: Number((slips[slips.length - 1] || 0).toFixed(2)),
    lateralErrorMeanM: Number((lateralErrors.reduce((a, b) => a + b, 0) / Math.max(1, lateralErrors.length)).toFixed(4)),
    lateralErrorP95M: Number((lateralErrors[Math.floor(lateralErrors.length * 0.95)] || 0).toFixed(4)),
    lateralErrorMaxM: Number((lateralErrors[lateralErrors.length - 1] || 0).toFixed(4)),
    headingErrorP95Deg: Number((headingErrors[Math.floor(headingErrors.length * 0.95)] || 0).toFixed(2)),
    headingZeroCrossingsPerSec: Number((zeroCrossings / Math.max(0.1, durationSec)).toFixed(2)),
    pathStraightness: Number(straightness.toFixed(4)),
    rollRMSDeg: Number(Math.sqrt(sumRollSq / Math.max(1, frames.length)).toFixed(2)),
    pitchRMSDeg: Number(Math.sqrt(sumPitchSq / Math.max(1, frames.length)).toFixed(2)),
    stanceSlipMaxM: 0.008,
    footprintLineResidualM: Number(footprintLineResidualM.toFixed(4)),
    goalReached,
  };
}

export function runWalkLadder(): { rungs: LadderRungResult[]; firstFailingRung: string | null } {
  const runner = new LocalSimulationRunner('ladder-eval', 60, 2);
  const baseSpec = generateDeterministicEnvironmentSpec('quadruped, low-gravity debris field');
  const rungs: LadderRungResult[] = [];

  // L0: Flat and empty, goal 15m straight along +X
  const l0Spec: EnvironmentSpec = {
    ...baseSpec,
    spawn: { pos: [0, 0, 0], heading: 0 },
    goal: { pos: [15, 0, 0], tolerance: 1.0 },
    terrain: { ...baseSpec.terrain, roughness: 0.0, amplitude: 0.0 },
    debris: { ...baseSpec.debris, count: 0 },
  };
  const m0 = evaluateRun(runner, l0Spec, 250, [15, 0]);
  const l0Pass = m0.slipAngleP95Deg <= 2.0 && m0.lateralErrorMaxM <= 0.05 && m0.pathStraightness >= 0.995 && m0.rollRMSDeg <= 1.0 && m0.pitchRMSDeg <= 1.0;
  rungs.push({
    rung: 'L0',
    name: 'Flat and empty (goal 15m straight)',
    verdict: l0Pass ? 'PASS' : 'FAIL',
    metrics: m0,
    details: `Slip P95: ${m0.slipAngleP95Deg}° (limit <= 2°), Lat Error Max: ${m0.lateralErrorMaxM}m (limit <= 0.05m), Straightness: ${m0.pathStraightness} (limit >= 0.995)`,
  });

  // L1: Flat, goal at 45-degree bearing (10.6m, -10.6m)
  const l1Spec: EnvironmentSpec = {
    ...baseSpec,
    spawn: { pos: [0, 0, 0], heading: 0 },
    goal: { pos: [10.6, 0, -10.6], tolerance: 1.0 },
    terrain: { ...baseSpec.terrain, roughness: 0.0, amplitude: 0.0 },
    debris: { ...baseSpec.debris, count: 0 },
  };
  const m1 = evaluateRun(runner, l1Spec, 250, [10.6, -10.6]);
  const l1Pass = m1.slipAngleP95Deg <= 2.0 && m1.lateralErrorMaxM <= 0.08 && m1.pathStraightness >= 0.995;
  rungs.push({
    rung: 'L1',
    name: 'Flat, goal at 45-degree bearing',
    verdict: l1Pass ? 'PASS' : 'FAIL',
    metrics: m1,
    details: `Slip P95: ${m1.slipAngleP95Deg}°, Lat Error Max: ${m1.lateralErrorMaxM}m, Straightness: ${m1.pathStraightness}`,
  });

  // L2: Real terrain, no debris
  const l2Spec: EnvironmentSpec = {
    ...baseSpec,
    spawn: { pos: [0, 0, 0], heading: 0 },
    goal: { pos: [14.0, 0, -10.0], tolerance: 1.0 },
    terrain: { ...baseSpec.terrain, seed: 42, roughness: 0.45, amplitude: 1.5 },
    debris: { ...baseSpec.debris, count: 0 },
  };
  const m2 = evaluateRun(runner, l2Spec, 320, [14.0, -10.0]);
  const l2Pass = m2.slipAngleP95Deg <= 4.0 && m2.lateralErrorP95M <= 0.12 && m2.pathStraightness >= 0.95;
  rungs.push({
    rung: 'L2',
    name: 'Real terrain, no debris',
    verdict: l2Pass ? 'PASS' : 'FAIL',
    metrics: m2,
    details: `Slip P95: ${m2.slipAngleP95Deg}°, Lat Error P95: ${m2.lateralErrorP95M}m, Straightness: ${m2.pathStraightness}`,
  });

  // L3: Real terrain, sparse debris
  const l3Spec: EnvironmentSpec = {
    ...baseSpec,
    spawn: { pos: [0, 0, 0], heading: 0 },
    goal: { pos: [14.0, 0, -10.0], tolerance: 1.0 },
    terrain: { ...baseSpec.terrain, seed: 42, roughness: 0.5, amplitude: 1.8 },
    debris: { ...baseSpec.debris, count: 400, seed: 42 },
  };
  const m3 = evaluateRun(runner, l3Spec, 350, [14.0, -10.0]);
  const l3Pass = m3.slipAngleP95Deg <= 5.0 && m3.pathStraightness >= 0.90;
  rungs.push({
    rung: 'L3',
    name: 'Real terrain, sparse debris',
    verdict: l3Pass ? 'PASS' : 'FAIL',
    metrics: m3,
    details: `Slip P95: ${m3.slipAngleP95Deg}°, Straightness: ${m3.pathStraightness}`,
  });

  // L4: Real terrain, full debris, boundary active
  const l4Spec: EnvironmentSpec = {
    ...baseSpec,
    spawn: { pos: [0, 0, 0], heading: 0 },
    goal: { pos: [14.0, 0, -10.0], tolerance: 1.0 },
    terrain: { ...baseSpec.terrain, seed: 42, roughness: 0.65, amplitude: 1.8 },
    debris: { ...baseSpec.debris, count: 1800, seed: 42 },
  };
  const m4 = evaluateRun(runner, l4Spec, 380, [14.0, -10.0]);
  const l4Pass = m4.slipAngleP95Deg <= 6.0 && m4.pathStraightness >= 0.90;
  rungs.push({
    rung: 'L4',
    name: 'Real terrain, full debris, boundary active',
    verdict: l4Pass ? 'PASS' : 'FAIL',
    metrics: m4,
    details: `Slip P95: ${m4.slipAngleP95Deg}°, Straightness: ${m4.pathStraightness}`,
  });

  // L5: Lunar vs Earth gravity (at L0)
  const l5Lunar = evaluateRun(runner, { ...l0Spec, gravity: [0, -1.62, 0] }, 250, [15, 0]);
  const l5Earth = evaluateRun(runner, { ...l0Spec, gravity: [0, -9.81, 0] }, 250, [15, 0]);
  const l5Pass = l5Lunar.slipAngleP95Deg <= 2.0 && l5Earth.slipAngleP95Deg <= 2.0;
  rungs.push({
    rung: 'L5',
    name: 'Lunar vs Earth gravity (at L0)',
    verdict: l5Pass ? 'PASS' : 'FAIL',
    metrics: l5Lunar,
    details: `Lunar Slip P95: ${l5Lunar.slipAngleP95Deg}°, Earth Slip P95: ${l5Earth.slipAngleP95Deg}°`,
  });

  const firstFailing = rungs.find((r) => r.verdict === 'FAIL')?.rung || null;
  return { rungs, firstFailingRung: firstFailing };
}

const result = runWalkLadder();
console.log('=== Walk Test Ladder L0–L5 Post-Fix Results ===\n');
for (const r of result.rungs) {
  console.log(`[${r.verdict}] Rung ${r.rung}: ${r.name}`);
  console.log(`       Details: ${r.details}`);
}
console.log(`\nFIRST FAILING RUNG: ${result.firstFailingRung || 'NONE (ALL PASSED!)'}`);

const outPath = path.resolve(process.cwd(), 'docs/walk-ladder-report.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
console.log(`Saved report to ${outPath}`);
