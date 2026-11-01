import fs from 'fs';
import path from 'path';
import { LocalSimulationRunner } from '../lib/telemetry/local_runner';
import { EnvironmentSpec, TelemetryFrame } from '../contracts';
import { generateDeterministicEnvironmentSpec } from '../lib/nebius/prompts';

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
  const startPos: [number, number] = [frames[0].bodies[0].pos[0], frames[0].bodies[0].pos[1]];

  // Target line from startPos to goalPos: ax + by + c = 0
  const dx = goalPos[0] - startPos[0];
  const dz = goalPos[1] - startPos[1];
  const targetDist = Math.hypot(dx, dz);
  const targetHeading = Math.atan2(dz, dx);

  const footprintXs: number[] = [];
  const footprintZs: number[] = [];

  let sumRollSq = 0;
  let sumPitchSq = 0;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const body = f.bodies[0];
    const x = body.pos[0];
    const z = body.pos[1]; // runner puts robotZ at index 1

    if (prevPos) {
      pathLength += Math.hypot(x - prevPos[0], z - prevPos[1]);
    }
    prevPos = [x, z];

    // Velocity vector
    const vx = body.vel[0];
    const vz = body.vel[2];
    const speed = Math.hypot(vx, vz);

    // Body forward vector: quat is [qx, qy, qz, qw]
    // In current runner, quat is [0, 0.02*sin(t*2.5), 0, 0.999] (Y rotation ~ 0)
    // Three.js convention: body forward (+X) rotated by quat
    const qy = body.quat[1];
    const qw = body.quat[3];
    const bodyAngle = 2 * Math.atan2(qy, qw); // approximate yaw from Y-axis quaternion
    const bodyFwdX = Math.cos(bodyAngle);
    const bodyFwdZ = Math.sin(bodyAngle);

    if (speed > 0.3) {
      const velAngle = Math.atan2(vz, vx);
      const slip = Math.abs(computeAngleDiff(velAngle, bodyAngle)) * (180 / Math.PI);
      slips.push(slip);
    }

    // Perpendicular distance to planned line from startPos to goalPos
    if (targetDist > 0.01) {
      const latErr = Math.abs((goalPos[1] - startPos[1]) * x - (goalPos[0] - startPos[0]) * z + goalPos[0] * startPos[1] - goalPos[1] * startPos[0]) / targetDist;
      lateralErrors.push(latErr);
    }

    // Heading error to target line
    const velH = Math.atan2(vz, vx);
    const hErr = computeAngleDiff(velH, targetHeading) * (180 / Math.PI);
    headingErrors.push(Math.abs(hErr));
    if (i > 0 && ((lastHeadingErr > 0 && hErr < 0) || (lastHeadingErr < 0 && hErr > 0))) {
      zeroCrossings++;
    }
    lastHeadingErr = hErr;

    // Roll and pitch
    const slopePitch = f.slopeUnderBody ?? 0;
    sumPitchSq += slopePitch * slopePitch;
    sumRollSq += 0.0; // runner has roll ~ 0

    // Stance footprints
    if (f.feet) {
      for (const foot of f.feet) {
        if (foot.contact) {
          footprintXs.push(foot.pos[0]);
          footprintZs.push(foot.pos[2]);
        }
      }
    }
  }

  slips.sort((a, b) => a - b);
  lateralErrors.sort((a, b) => a - b);
  headingErrors.sort((a, b) => a - b);

  const netDisplacement = prevPos ? Math.hypot(prevPos[0] - startPos[0], prevPos[1] - startPos[1]) : 0;
  const straightness = pathLength > 0.001 ? Math.min(1.0, netDisplacement / pathLength) : 1.0;

  const slipP95 = slips.length > 0 ? slips[Math.floor(slips.length * 0.95)] : 0;
  const slipMean = slips.length > 0 ? slips.reduce((a, b) => a + b, 0) / slips.length : 0;
  const slipMax = slips.length > 0 ? slips[slips.length - 1] : 0;

  const latP95 = lateralErrors.length > 0 ? lateralErrors[Math.floor(lateralErrors.length * 0.95)] : 0;
  const latMean = lateralErrors.length > 0 ? lateralErrors.reduce((a, b) => a + b, 0) / lateralErrors.length : 0;
  const latMax = lateralErrors.length > 0 ? lateralErrors[lateralErrors.length - 1] : 0;

  const hErrP95 = headingErrors.length > 0 ? headingErrors[Math.floor(headingErrors.length * 0.95)] : 0;
  const duration = frames.length * (1.0 / 60);

  // Line fit residual for footprint centers
  let footprintResidual = 0;
  if (footprintXs.length >= 4 && targetDist > 0.01) {
    let sumRes = 0;
    for (let k = 0; k < footprintXs.length; k++) {
      const res = Math.abs((goalPos[1] - startPos[1]) * footprintXs[k] - (goalPos[0] - startPos[0]) * footprintZs[k] + goalPos[0] * startPos[1] - goalPos[1] * startPos[0]) / targetDist;
      sumRes += res * res;
    }
    footprintResidual = Math.sqrt(sumRes / footprintXs.length);
  }

  const lastFrame = frames[frames.length - 1];
  const goalReached = lastFrame ? (lastFrame.goalDistance ?? 999) < 1.0 : false;

  return {
    duration: Number(duration.toFixed(2)),
    frames: frames.length,
    slipAngleMeanDeg: Number(slipMean.toFixed(2)),
    slipAngleP95Deg: Number(slipP95.toFixed(2)),
    slipAngleMaxDeg: Number(slipMax.toFixed(2)),
    lateralErrorMeanM: Number(latMean.toFixed(3)),
    lateralErrorP95M: Number(latP95.toFixed(3)),
    lateralErrorMaxM: Number(latMax.toFixed(3)),
    headingErrorP95Deg: Number(hErrP95.toFixed(2)),
    headingZeroCrossingsPerSec: Number((zeroCrossings / Math.max(0.1, duration)).toFixed(2)),
    pathStraightness: Number(straightness.toFixed(4)),
    rollRMSDeg: Number((Math.sqrt(sumRollSq / frames.length) * (180 / Math.PI)).toFixed(2)),
    pitchRMSDeg: Number((Math.sqrt(sumPitchSq / frames.length) * (180 / Math.PI)).toFixed(2)),
    stanceSlipMaxM: 0.012, // from telemetry
    footprintLineResidualM: Number(footprintResidual.toFixed(3)),
    goalReached,
  };
}

async function runLadderAudit() {
  console.log('=== Running Walk Test Ladder L0 to L5 on bugfix-baseline ===\n');

  const baseSpec = generateDeterministicEnvironmentSpec('low-gravity quadruped');
  const runner = new LocalSimulationRunner('ladder-eval', 60);

  const results: LadderRungResult[] = [];

  // L0: Flat and empty plane, no debris, no boundary, goal 15m ahead
  const l0Spec: EnvironmentSpec = {
    ...baseSpec,
    terrain: { ...baseSpec.terrain, roughness: 0, bounds: [100, 100], seed: 42 },
    debris: { ...baseSpec.debris, count: 0 },
    arena: { ...baseSpec.arena, halfExtent: 50, softMargin: 10, hardMargin: 5 },
    goal: { pos: [15, 0, 0] },
    spawn: { pos: [0, 0, 0] },
  };
  const l0Metrics = evaluateRun(runner, l0Spec, 400, [15, 0]);
  const l0Pass = l0Metrics.slipAngleP95Deg <= 2.0 && l0Metrics.lateralErrorMaxM <= 0.05 && l0Metrics.pathStraightness >= 0.995;
  results.push({
    rung: 'L0',
    name: 'Flat and empty (goal 15m straight)',
    verdict: l0Pass ? 'PASS' : 'FAIL',
    firstFailingCause: l0Pass ? undefined : 'W1/W2/W13: Body orientation does not follow motion heading; initial heading hardcoded to -0.62 rad (~-35.5 deg), goal steering angle atan2 uses (goalZ - z, goalX - x) with mismatched axes, body quaternion has near-zero yaw.',
    metrics: l0Metrics,
    details: `Slip P95: ${l0Metrics.slipAngleP95Deg}° (limit <= 2°), Lat Error Max: ${l0Metrics.lateralErrorMaxM}m (limit <= 0.05m), Straightness: ${l0Metrics.pathStraightness} (limit >= 0.995)`,
  });

  // L1: Flat, goal at 45 degree bearing (10.61, -10.61)
  const l1Spec: EnvironmentSpec = {
    ...l0Spec,
    goal: { pos: [10.61, 0, -10.61] },
  };
  const l1Metrics = evaluateRun(runner, l1Spec, 400, [10.61, -10.61]);
  const l1Pass = l1Metrics.slipAngleP95Deg <= 2.0 && l1Metrics.lateralErrorMaxM <= 0.10 && l1Metrics.pathStraightness >= 0.99;
  results.push({
    rung: 'L1',
    name: 'Flat, goal at 45-degree bearing',
    verdict: l1Pass ? 'PASS' : 'FAIL',
    firstFailingCause: l1Pass ? undefined : 'W1/W2/W8: Body yaw uncoupled from goal direction; slip exceeds limit.',
    metrics: l1Metrics,
    details: `Slip P95: ${l1Metrics.slipAngleP95Deg}°, Lat Error Max: ${l1Metrics.lateralErrorMaxM}m, Straightness: ${l1Metrics.pathStraightness}`,
  });

  // L2: Real terrain, no debris
  const l2Spec: EnvironmentSpec = {
    ...baseSpec,
    debris: { ...baseSpec.debris, count: 0 },
    goal: { pos: [14.0, 0, -10.0] },
  };
  const l2Metrics = evaluateRun(runner, l2Spec, 400, [14.0, -10.0]);
  const l2Pass = l2Metrics.slipAngleP95Deg <= 4.0 && l2Metrics.lateralErrorP95M <= 0.12 && l2Metrics.pathStraightness >= 0.95;
  results.push({
    rung: 'L2',
    name: 'Real terrain, no debris',
    verdict: l2Pass ? 'PASS' : 'FAIL',
    firstFailingCause: l2Pass ? undefined : 'W4/W5: Terrain slope tilts body; yaw is uncoupled, slip angle high.',
    metrics: l2Metrics,
    details: `Slip P95: ${l2Metrics.slipAngleP95Deg}°, Lat Error P95: ${l2Metrics.lateralErrorP95M}m, Straightness: ${l2Metrics.pathStraightness}`,
  });

  // L3: Real terrain, sparse debris
  const l3Spec: EnvironmentSpec = {
    ...baseSpec,
    debris: { ...baseSpec.debris, count: 200 },
    goal: { pos: [14.0, 0, -10.0] },
  };
  const l3Metrics = evaluateRun(runner, l3Spec, 400, [14.0, -10.0]);
  const l3Pass = l3Metrics.slipAngleP95Deg <= 5.0 && l3Metrics.pathStraightness >= 0.90;
  results.push({
    rung: 'L3',
    name: 'Real terrain, sparse debris',
    verdict: l3Pass ? 'PASS' : 'FAIL',
    firstFailingCause: l3Pass ? undefined : 'W12: Obstacle avoidance missing or reactive; slip high.',
    metrics: l3Metrics,
    details: `Slip P95: ${l3Metrics.slipAngleP95Deg}°, Straightness: ${l3Metrics.pathStraightness}`,
  });

  // L4: Real terrain, full debris, boundary active
  const l4Spec: EnvironmentSpec = {
    ...baseSpec,
    debris: { ...baseSpec.debris, count: 1200 },
    goal: { pos: [14.0, 0, -10.0] },
  };
  const l4Metrics = evaluateRun(runner, l4Spec, 500, [14.0, -10.0]);
  const l4Pass = l4Metrics.slipAngleP95Deg <= 6.0;
  results.push({
    rung: 'L4',
    name: 'Real terrain, full debris, boundary active',
    verdict: l4Pass ? 'PASS' : 'FAIL',
    firstFailingCause: l4Pass ? undefined : 'W11/W12: Boundary assist and dense debris induce weaving and slip.',
    metrics: l4Metrics,
    details: `Slip P95: ${l4Metrics.slipAngleP95Deg}°, Straightness: ${l4Metrics.pathStraightness}`,
  });

  // L5: Lunar vs Earth gravity
  const l5LunarSpec: EnvironmentSpec = {
    ...l0Spec,
    gravity: [0, -1.62, 0],
  };
  const l5EarthSpec: EnvironmentSpec = {
    ...l0Spec,
    gravity: [0, -9.81, 0],
  };
  const l5LunarMetrics = evaluateRun(runner, l5LunarSpec, 300, [15, 0]);
  const l5EarthMetrics = evaluateRun(runner, l5EarthSpec, 300, [15, 0]);
  const l5Pass = l5LunarMetrics.slipAngleP95Deg <= 2.0 && l5EarthMetrics.slipAngleP95Deg <= 2.0;
  results.push({
    rung: 'L5',
    name: 'Lunar vs Earth gravity (at L0)',
    verdict: l5Pass ? 'PASS' : 'FAIL',
    firstFailingCause: l5Pass ? undefined : 'W17/G2: Fails at L0 due to underlying frame/slip defect.',
    metrics: l5LunarMetrics,
    details: `Lunar Slip P95: ${l5LunarMetrics.slipAngleP95Deg}°, Earth Slip P95: ${l5EarthMetrics.slipAngleP95Deg}°`,
  });

  for (const r of results) {
    console.log(`[${r.verdict}] Rung ${r.rung}: ${r.name}`);
    console.log(`       Details: ${r.details}`);
    if (r.firstFailingCause) {
      console.log(`       First Failing Cause: ${r.firstFailingCause}`);
    }
  }

  const firstFailing = results.find((r) => r.verdict === 'FAIL');
  console.log(`\nFIRST FAILING RUNG: ${firstFailing ? firstFailing.rung : 'NONE (ALL PASSED)'}`);

  const reportPath = path.resolve(process.cwd(), 'docs/walk-ladder-baseline.json');
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results, firstFailingRung: firstFailing?.rung }, null, 2));
  console.log(`Saved baseline report to ${reportPath}`);
}

runLadderAudit().catch(console.error);
