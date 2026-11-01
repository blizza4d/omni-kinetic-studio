import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalSimulationRunner } from '../lib/telemetry/local_runner';
import { generateDeterministicEnvironmentSpec } from '../lib/nebius/prompts';

test('Walk Ladder L0 Gate: Flat and empty terrain achieves straight motion', () => {
  const runner = new LocalSimulationRunner();
  const baseSpec = generateDeterministicEnvironmentSpec('quadruped, low-gravity debris field');
  const spec = {
    ...baseSpec,
    terrain: {
      ...baseSpec.terrain,
      roughness: 0.0,
      amplitude: 0.0,
    },
    debris: {
      ...baseSpec.debris,
      count: 0,
    },
  };
  runner.setEnvironmentSpec(spec as any);

  const frames = [];
  for (let i = 0; i < 400; i++) {
    frames.push(runner.generateFrame(i));
  }

  // Trajectory analysis
  const spawnX = spec.spawn.pos[0];
  const spawnZ = spec.spawn.pos[2];
  const goalX = spec.goal.pos[0];
  const goalZ = spec.goal.pos[2];

  const dx = goalX - spawnX;
  const dz = goalZ - spawnZ;
  const lineLen = Math.hypot(dx, dz);

  let maxLateralError = 0;
  const slipAnglesDeg: number[] = [];

  for (const f of frames) {
    const rx = f.bodies[0].pos[0];
    const rz = f.bodies[0].pos[2];
    const vx = f.bodies[0].vel[0];
    const vz = f.bodies[0].vel[2];

    // Lateral distance to spawn->goal straight line
    const lateralDist = Math.abs(dz * rx - dx * rz + goalX * spawnZ - goalZ * spawnX) / lineLen;
    if (lateralDist > maxLateralError) maxLateralError = lateralDist;

    // Heading vs Velocity angle (slip angle)
    const speed = Math.hypot(vx, vz);
    if (speed > 0.05) {
      // Velocity angle in world
      const velHeading = Math.atan2(-vz, vx);
      // Yaw from bodies[0].quat
      const q = f.bodies[0].quat;
      // In canonical convention: yaw around Y
      const yaw = Math.atan2(2 * (q[3] * q[1] - q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[2] * q[2]));
      let slip = Math.abs(yaw - velHeading) * (180 / Math.PI);
      while (slip > 180) slip = Math.abs(slip - 360);
      slipAnglesDeg.push(slip);
    }
  }

  slipAnglesDeg.sort((a, b) => a - b);
  const slipP95 = slipAnglesDeg[Math.floor(slipAnglesDeg.length * 0.95)] || 0;

  // Compute straightness (net distance / integrated path length)
  let integratedPath = 0;
  for (let i = 1; i < frames.length; i++) {
    const p0 = frames[i - 1].bodies[0].pos;
    const p1 = frames[i].bodies[0].pos;
    integratedPath += Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
  }
  const firstPos = frames[0].bodies[0].pos;
  const lastPos = frames[frames.length - 1].bodies[0].pos;
  const netDisp = Math.hypot(lastPos[0] - firstPos[0], lastPos[2] - firstPos[2]);
  const straightness = netDisp / Math.max(0.01, integratedPath);

  console.log(`L0 Results: Slip P95 = ${slipP95.toFixed(2)} deg, Max Lateral Error = ${maxLateralError.toFixed(3)}m, Straightness = ${straightness.toFixed(4)}`);

  // Acceptance Invariants
  assert.ok(slipP95 <= 2.0, `L0 Slip P95 ${slipP95.toFixed(2)} deg exceeds 2.0 deg limit`);
  assert.ok(maxLateralError <= 0.05, `L0 Max lateral error ${maxLateralError.toFixed(3)}m exceeds 0.05m limit`);
  assert.ok(straightness >= 0.995, `L0 Straightness ${straightness.toFixed(4)} below 0.995 limit`);
});
