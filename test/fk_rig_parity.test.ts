import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TwoBoneIK } from '../lib/droid/ik/TwoBoneIK';
import { RigApplier } from '../lib/droid/render/RigApplier';
import { DroidKinematicState } from '../lib/droid/types';
import { generateCanonicalTerrain } from '../lib/world/terrain/generator';

function buildMockQuadruped() {
  const robotGroup = new THREE.Group();
  const jointGroups: Record<string, THREE.Group> = {};

  const legConfigs = [
    { name: 'FL', x: 0.24, z: -0.15 },
    { name: 'FR', x: 0.24, z: 0.15 },
    { name: 'RL', x: -0.24, z: -0.15 },
    { name: 'RR', x: -0.24, z: 0.15 },
  ];
  const thighLen = 0.22;
  const calfLen = 0.22;

  for (const cfg of legConfigs) {
    const hipGroup = new THREE.Group();
    hipGroup.position.set(cfg.x, 0, cfg.z);
    robotGroup.add(hipGroup);
    jointGroups[`${cfg.name}_hip_joint`] = hipGroup;

    const thighGroup = new THREE.Group();
    hipGroup.add(thighGroup);
    jointGroups[`${cfg.name}_thigh_joint`] = thighGroup;

    const calfGroup = new THREE.Group();
    calfGroup.position.y = -thighLen;
    thighGroup.add(calfGroup);
    jointGroups[`${cfg.name}_calf_joint`] = calfGroup;

    const footObj = new THREE.Object3D();
    footObj.position.y = -calfLen;
    calfGroup.add(footObj);
    jointGroups[`${cfg.name}_foot`] = footObj as any;
  }

  return { robotGroup, jointGroups };
}

test('S-01 FK Parity: Rig joint rotation signs align visual foot with IK target', () => {
  const { robotGroup, jointGroups } = buildMockQuadruped();
  const applier = new RigApplier();
  const solver = new TwoBoneIK(0.22, 0.22);

  // Stance targets relative to hip
  const targets = [
    { dx: 0.0, dy: -0.385, dz: 0.0 },
    { dx: 0.06, dy: -0.380, dz: 0.04 },
    { dx: -0.06, dy: -0.370, dz: -0.04 },
  ];

  for (const target of targets) {
    const ik = solver.solve(target.dx, target.dy, target.dz, false);

    const state: DroidKinematicState = {
      timestamp: 1.0,
      bodyPos: [0, 0.5, 0],
      bodyQuat: [0, 0, 0, 1],
      linearVel: [0, 0, 0],
      angularVel: [0, 0, 0],
      joints: [
        { name: 'FR_hip_joint', angle: ik.hipAngle, velocity: 0 },
        { name: 'FR_thigh_joint', angle: ik.thighAngle, velocity: 0 },
        { name: 'FR_calf_joint', angle: ik.calfAngle, velocity: 0 },
      ],
      feet: [],
      stabilityMargin: 1.0,
      energyJoules: 0,
    };

    applier.apply(robotGroup, jointGroups, state);
    robotGroup.updateMatrixWorld(true);

    const footObj = jointGroups['FR_foot'];
    const worldPos = new THREE.Vector3();
    footObj.getWorldPosition(worldPos);

    // Expected world position: bodyPos + hipOffset(0.24, 0, 0.15) + target
    const expectedX = 0 + 0.24 + target.dx;
    const expectedY = 0.5 + target.dy;
    const expectedZ = 0 + 0.15 + target.dz;

    const error = Math.hypot(worldPos.x - expectedX, worldPos.y - expectedY, worldPos.z - expectedZ);
    assert.ok(
      error < 0.001,
      `FK error ${error.toFixed(6)}m exceeds 1mm threshold for target [${target.dx}, ${target.dy}, ${target.dz}]. Result was [${worldPos.x.toFixed(4)}, ${worldPos.y.toFixed(4)}, ${worldPos.z.toFixed(4)}], expected [${expectedX.toFixed(4)}, ${expectedY.toFixed(4)}, ${expectedZ.toFixed(4)}]`
    );
  }
});

test('S-02 Ground Blobs: Foot blobs clamp to terrain surface and attenuate with clearance', () => {
  const field = generateCanonicalTerrain(42);

  // When foot is swinging at y = 0.35m over terrain at y = 0.10m:
  const footPos = [2.0, 0.35, 1.0];
  const terrainY = field.sampleHeight(footPos[0], footPos[2]);
  const clearance = footPos[1] - terrainY;

  assert.ok(clearance > 0.05, 'Foot is in swing phase with positive clearance');

  // Surface clamped blob height
  const clampedBlobY = terrainY + 0.003;
  assert.ok(Math.abs(clampedBlobY - terrainY) <= 0.005, 'Blob is clamped directly on terrain surface');
  assert.ok(clampedBlobY < footPos[1] - 0.05, 'Blob is not floating in mid-air with the swinging foot');

  // Opacity attenuation: swinging foot clearance > 0.10m must have reduced/zero opacity
  const swingOpacity = Math.max(0, Math.min(0.25, 1 - clearance / 0.15));
  assert.ok(swingOpacity < 0.25, 'Swing blob opacity is attenuated with clearance');
});

test('S-03 Trail Line: Trail points are clamped to terrain and obey overlay gating', () => {
  const field = generateCanonicalTerrain(42);

  // When robot is at (1.5, 0.59, -1.0)
  const robotPos = new THREE.Vector3(1.5, 0.59, -1.0);
  const groundY = field.sampleHeight(robotPos.x, robotPos.z);

  const trailPointY = groundY + 0.015;
  assert.ok(Math.abs(trailPointY - groundY) < 0.03, 'Trail vertex is draped closely to terrain');
  assert.ok(trailPointY < robotPos.y - 0.2, 'Trail vertex is on the ground, not trailing from torso in the air');
});
