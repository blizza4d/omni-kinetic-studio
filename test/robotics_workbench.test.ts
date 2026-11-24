import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRoboticsTelemetry, DEFAULT_ROBOTICS_TELEMETRY } from '../lib/telemetry/robotics';
import { EpisodeDemonstrationRecorder } from '../lib/dataset/episodeRecorder';
import { generateDeterministicPlan } from '../lib/nebius/taskPlanner';
import { TelemetryFrame } from '../contracts';

test('Robotics Telemetry: extracts typed kinematics, torques and safety envelope from TelemetryFrame', () => {
  const dummyFrame: TelemetryFrame = {
    schemaVersion: '4.0',
    seq: 120,
    dt: 0.0167,
    t: 2.0,
    episode: 1,
    iteration: 2,
    bodies: [
      {
        id: 'torso',
        pos: [2.5, 0.44, -1.2],
        quat: [0, 0.7071, 0, 0.7071], // 90 degree yaw rotation
        vel: [0.85, 0.0, -0.12],
      },
    ],
    joints: [
      { name: 'fl_hip', angle: 0.15, velocity: 0.5, torque: 12.4 },
      { name: 'fl_thigh', angle: -0.4, velocity: -0.8, torque: 22.1 },
      { name: 'fl_calf', angle: 0.6, velocity: 1.2, torque: 18.0 },
    ],
    feet: [
      { id: 'FL', pos: [2.8, 0, -1.0], contact: true },
      { id: 'FR', pos: [2.8, 0, -1.4], contact: true },
      { id: 'RL', pos: [2.2, 0, -1.0], contact: true },
      { id: 'RR', pos: [2.2, 0, -1.4], contact: false },
    ],
    bodyHeightAboveGround: 0.44,
    slopeUnderBody: 4.2,
    gait: { phase: 0.5, speed: 0.85, cmdSpeed: 0.9 },
    boundary: { state: 'inside', distanceToEdge: 17.5 },
    collisions: [],
    valid: true,
    status: 'running',
  };

  const telemetry = extractRoboticsTelemetry(dummyFrame, false, 2.4, 60);

  assert.equal(telemetry.pose.x, 2.5);
  assert.equal(telemetry.pose.y, 0.44);
  assert.equal(telemetry.pose.z, -1.2);
  assert.equal(telemetry.velocity.speedMps, 0.858);
  assert.equal(telemetry.safety.eStopActive, false);
  assert.equal(telemetry.safety.groundedFeetCount, 3);
  assert.equal(telemetry.safety.tiltStatus, 'nominal');
  assert.equal(telemetry.actuators.length, 3);
  assert.equal(telemetry.actuators[0]!.name, 'fl_hip');
  assert.equal(telemetry.actuators[0]!.torqueNm, 12.4);
  assert.equal(telemetry.actuators[0]!.powerWatts, 6.2); // |12.4 * 0.5|
});

test('Demonstration Recorder: records time-synced steps and exports valid LeRobot JSONL and CSV', () => {
  const recorder = new EpisodeDemonstrationRecorder();
  const epId = recorder.startRecording('keyboard', 1.62, 42);
  assert.ok(recorder.getIsRecording());

  const mockFrame: TelemetryFrame = {
    schemaVersion: '4.0',
    seq: 1,
    dt: 0.0167,
    t: 0.0167,
    episode: 1,
    iteration: 2,
    bodies: [{ id: 'torso', pos: [0.1, 0.44, 0], quat: [0, 0, 0, 1], vel: [0.3, 0, 0] }],
    joints: [{ name: 'fl_hip', angle: 0.1, velocity: 0.2 }],
    feet: [{ id: 'FL', pos: [0.3, 0, 0.2], contact: true }],
    valid: true,
    status: 'running',
  };

  recorder.recordStep(mockFrame, { vx: 0.3, vy: 0, yawRate: 0, gait: 'auto' }, 'keyboard', false);
  assert.equal(recorder.getActiveFrameCount(), 1);

  const ep = recorder.stopAndSave(true, 'Test run');
  assert.ok(ep);
  assert.equal(ep.meta.success, true);
  assert.equal(ep.frames.length, 1);

  // Test LeRobot JSONL serialization
  const jsonl = recorder.exportLeRobotJsonl(epId);
  assert.ok(jsonl.includes('"control_source":"keyboard"'));
  assert.ok(jsonl.includes('"observation.state.pose":[0.1,0.44,0]'));
  const parsedFirstLine = JSON.parse(jsonl.split('\n')[0]!);
  assert.equal(parsedFirstLine.frame_index, 0);

  // Test CSV serialization
  const csv = recorder.exportRoboticsCsv(epId);
  assert.ok(csv.startsWith('episode_id,step,timestamp_ms,control_source'));
  const csvRows = csv.split('\n');
  assert.equal(csvRows.length, 2);
  assert.ok(csvRows[1]!.includes(',keyboard,0.100,0.440,0.000,'));
});

test('Nemotron Task Planner: generates structured plan conforming to robotics schema', () => {
  const plan = generateDeterministicPlan('Survey western boulder cluster safely', [0, 0.44, 0]);

  assert.ok(plan.task_name.includes('Western Boulder Cluster'));
  assert.ok(plan.waypoints.length >= 3);
  assert.ok(plan.safety_constraints.max_pitch_deg > 0);
  assert.ok(plan.safety_constraints.min_obstacle_clearance >= 0.5);
  assert.ok(plan.reasoning.length > 10);
  assert.equal(plan.waypoints[0]!.id, 1);
  assert.ok(plan.waypoints[0]!.target_speed > 0);
});
