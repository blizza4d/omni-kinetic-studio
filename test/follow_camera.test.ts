import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { FollowCameraRig } from '../lib/camera/follow_camera';

test('FollowCameraRig: Follows droid position smoothly with world Y-up lock', () => {
  const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 100);
  const rig = new FollowCameraRig();
  rig.reset(0, 0.4, 0);

  // Droid moves forward along X at 1.0 m/s
  for (let i = 0; i < 60; i++) {
    const t = i * (1 / 60);
    rig.update(camera, [t * 1.0, 0.4, 0], [1.0, 0, 0], 'chase', null, 1 / 60);

    // Verify camera up is strictly locked to World Y-up
    assert.equal(camera.up.x, 0);
    assert.equal(camera.up.y, 1);
    assert.equal(camera.up.z, 0);

    // Camera position should be finite numbers
    assert.ok(!isNaN(camera.position.x));
    assert.ok(!isNaN(camera.position.y));
    assert.ok(!isNaN(camera.position.z));
  }

  // Camera must be tracking forward with the robot
  assert.ok(camera.position.x > 0.3, `Camera should have advanced forward, got x=${camera.position.x}`);
});
