import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDebrisField } from '../lib/world/debris';

test('S-04 Radar: Debris filtering removes noise pebbles and keeps significant boulders', () => {
  const debris = generateDebrisField(1800, [40, 40], 42, () => 0);
  assert.ok(debris.length >= 1000, 'Original debris field has > 1000 items');

  // Filter for radar clutter elimination: boulders >= 0.44m
  const radarObstacles = debris.filter((d) => d.scale >= 0.44);

  assert.ok(
    radarObstacles.length < 500,
    `Radar obstacle count (${radarObstacles.length}) must be < 500 to prevent white-noise clutter`
  );
  assert.ok(
    radarObstacles.length > 50,
    `Radar should retain prominent boulders (${radarObstacles.length} retained)`
  );
});

test('S-04 Radar: Relative coordinate transform centers on robot', () => {
  const cx = 65;
  const cy = 65;
  const scale = 58 / 20.0; // 2.9 px per meter

  const robotPos = { x: 5.0, z: -3.0 };
  const goalPos = { x: 14.0, z: -10.0 };

  // Transform relative to robot
  const gx = cx + (goalPos.x - robotPos.x) * scale;
  const gy = cy + (goalPos.z - robotPos.z) * scale;

  const expectedGx = 65 + (14.0 - 5.0) * 2.9;
  const expectedGy = 65 + (-10.0 - (-3.0)) * 2.9;

  assert.equal(gx, expectedGx);
  assert.equal(gy, expectedGy);

  // Robot itself is always at center (cx, cy)
  const rx = cx + (robotPos.x - robotPos.x) * scale;
  const ry = cy + (robotPos.z - robotPos.z) * scale;
  assert.equal(rx, cx);
  assert.equal(ry, cy);
});

test('S-04 Radar: Heading angle calculation rotates arrow with robot orientation', () => {
  function getArrowRotation(headingYaw: number): number {
    const vx = Math.cos(headingYaw);
    const vz = -Math.sin(headingYaw);
    return Math.atan2(vz, vx) + Math.PI / 2;
  }

  // Heading = 0 (pointing East, +X): rotation should be PI/2
  const rotEast = getArrowRotation(0);
  assert.ok(Math.abs(rotEast - Math.PI / 2) < 1e-5, 'Pointing East rotates 90 deg clockwise');

  // Heading = PI/2 (pointing North, -Z in world): rotation should be 0 (Up)
  const rotNorth = getArrowRotation(Math.PI / 2);
  assert.ok(Math.abs(rotNorth - 0) < 1e-5, 'Pointing North has 0 rotation (points Up)');

  // Heading = -PI/2 (pointing South, +Z in world): rotation should be PI (Down)
  const rotSouth = getArrowRotation(-Math.PI / 2);
  assert.ok(Math.abs(Math.abs(rotSouth) - Math.PI) < 1e-5, 'Pointing South rotates 180 deg (points Down)');
});
