import test from 'node:test';
import assert from 'node:assert/strict';
import { TelemetryJitterBuffer, InterpolatedFrame } from '../lib/telemetry/jitter_buffer';
import { TelemetryFrame } from '../contracts';

test('TelemetryJitterBuffer: Interpolates position, quaternion, joints smoothly between frames', () => {
  const buffer = new TelemetryJitterBuffer();

  const frame1: TelemetryFrame = {
    step: 0,
    time: 0.0,
    bodies: [{ id: 'torso', name: 'torso', pos: [0, 0.4, 0], quat: [0, 0, 0, 1] }],
    joints: [{ name: 'FL_thigh_joint', angle: 0.0, velocity: 0 }],
    contacts: [],
  };

  const frame2: TelemetryFrame = {
    step: 1,
    time: 0.10,
    bodies: [{ id: 'torso', name: 'torso', pos: [1.0, 0.4, 0], quat: [0, 0, 0, 1] }],
    joints: [{ name: 'FL_thigh_joint', angle: 0.5, velocity: 0 }],
    contacts: [],
  };

  const frame3: TelemetryFrame = {
    step: 2,
    time: 0.20,
    bodies: [{ id: 'torso', name: 'torso', pos: [2.0, 0.4, 0], quat: [0, 0, 0, 1] }],
    joints: [{ name: 'FL_thigh_joint', angle: 1.0, velocity: 0 }],
    contacts: [],
  };

  buffer.pushFrames([frame1, frame2, frame3]);

  const out: InterpolatedFrame = {
    time: 0,
    pos: [0, 0, 0],
    quat: [0, 0, 0, 1],
    joints: {},
    feet: [],
    isHold: false,
  };

  // Sample at t = 0.05s (half-way between frame1 and frame2)
  buffer.advance(0.05);
  const ok = buffer.sample(out);

  assert.equal(ok, true);
  assert.ok(Math.abs(out.pos[0] - 0.5) < 0.05, `Expected x ~ 0.5, got ${out.pos[0]}`);
  assert.ok(Math.abs(out.joints['FL_thigh_joint'] - 0.25) < 0.05, `Expected joint ~ 0.25, got ${out.joints['FL_thigh_joint']}`);
});
