import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRoboticsTelemetry } from '../lib/telemetry/robotics';
import { EpisodeDemonstrationRecorder } from '../lib/dataset/episodeRecorder';
import { generateDeterministicPlan } from '../lib/nebius/taskPlanner';
import { TelemetryFrame } from '../contracts';
import { PerceptionStore } from '../lib/perception/lidar';
import {
  PROFILE_LUNAR_ROVER_4WD,
  PROFILE_AGILE_LAB_BOT,
  getRobotProfile,
} from '../lib/robotics/profiles';
import { ShortcutRegistry } from '../lib/control/shortcuts';
import { SimEngine } from '../lib/sim/SimEngine';
import {
  buildRosTwistPayload,
  parseInboundHardwareMessage,
  HardwareBridgeClient,
} from '../lib/bridge/rosBridge';
import {
  runBenchmarkSuite,
  exportBenchmarkJson,
  exportBenchmarkMarkdown,
} from '../lib/sim2real/benchmark';

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

  recorder.recordStep(
    mockFrame,
    { vx: 0.3, vy: 0, yawRate: 0, gait: 'auto' },
    'keyboard',
    false,
    [4.25, 5.1, 14.0]
  );
  assert.equal(recorder.getActiveFrameCount(), 1);

  const ep = recorder.stopAndSave(true, 'Test run');
  assert.ok(ep);
  assert.equal(ep.meta.success, true);
  assert.equal(ep.frames.length, 1);

  // Test LeRobot JSONL serialization including observation.lidar_ranges
  const jsonl = recorder.exportLeRobotJsonl(epId);
  assert.ok(jsonl.includes('"control_source":"keyboard"'));
  assert.ok(jsonl.includes('"observation.state.pose":[0.1,0.44,0]'));
  assert.ok(jsonl.includes('"observation.lidar_ranges":[4.25,5.1,14]'));
  const parsedFirstLine = JSON.parse(jsonl.split('\n')[0]!);
  assert.equal(parsedFirstLine.frame_index, 0);
  assert.deepEqual(parsedFirstLine.observation.lidar_ranges, [4.25, 5.1, 14]);

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

test('Multi-Robot Profiles & Configurable LiDAR: switches Lunar Rover 4WD & casts 48-72 rays', () => {
  const reg = new ShortcutRegistry();
  const engine = new SimEngine(reg);

  const rover = engine.setRobotProfile('lunar_rover_4wd');
  assert.equal(rover.locomotionType, 'differential_4wd');
  assert.equal(rover.maxTorqueNm, PROFILE_LUNAR_ROVER_4WD.maxTorqueNm);

  const pStore = PerceptionStore.getInstance();
  assert.equal(pStore.getLidarConfig().rayCount, 72);

  // Step forward and confirm non-holonomic wheel rotation angles update
  engine.arbiter.takeManualControl('keyboard', 0);
  engine.inputs.handleKeyDown({ code: 'KeyW', key: 'w' });
  for (let i = 0; i < 15; i++) {
    engine.executeFixedStep(i, 1 / 60);
  }
  const renderOut: any = {
    time: 0,
    step: 0,
    pos: [0, 0, 0],
    quat: [0, 0, 0, 1],
    vel: [0, 0, 0],
    yaw: 0,
    speed: 0,
    cmdSpeed: 0,
    joints: {},
    jointTorques: {},
    feet: [],
    antennaAngles: [0, 0],
    gaitState: 'walk',
    gaitPattern: 'trot',
    froudeNumber: 0,
    hopActive: false,
    justLanded: false,
    landingImpactSpeed: 0,
    stabilityMargin: 1,
    tiltDeg: 0,
    distanceToEdge: 18,
    boundaryState: 'inside',
  };
  engine.sampleRenderState(1.0, renderOut);
  assert.equal(renderOut.profileId, 'lunar_rover_4wd');
  assert.ok(Array.isArray(renderOut.wheelAngles) && Math.abs(renderOut.wheelAngles[0]) > 0.01);

  const scan48 = engine.computeLidarScan(48, 16.0, (210 * Math.PI) / 180);
  assert.equal(scan48.length, 48);

  const labBot = getRobotProfile('agile_lab_bot');
  assert.equal(labBot.id, PROFILE_AGILE_LAB_BOT.id);
  assert.ok(labBot.maxLinearVelMps > rover.maxLinearVelMps);
});

test('ROS 2 / HIL WebSocket Bridge: formats Twist, enforces E-STOP zeroing, parses REP-103 & runs Loopback', () => {
  // Active drive Twist
  const { twist, json } = buildRosTwistPayload(1.2, 0.0, -0.4, false, 'rosbridge_v2', '/cmd_vel');
  assert.equal(twist.linear.x, 1.2);
  assert.equal(twist.angular.z, -0.4);
  assert.ok(json.includes('"op":"publish"'));

  // Immediate E-STOP override clears velocities unconditionally
  const { twist: stoppedTwist } = buildRosTwistPayload(1.2, 0.3, 0.9, true, 'raw_json');
  assert.equal(stoppedTwist.linear.x, 0);
  assert.equal(stoppedTwist.linear.y, 0);
  assert.equal(stoppedTwist.angular.z, 0);

  // REP-103 (ROS +X fwd, +Y left, +Z up) -> Omni-Kinetic (+X fwd, +Y up, +Z right)
  const inboundRos = JSON.stringify({
    op: 'publish',
    topic: '/odom',
    msg: {
      pose: {
        pose: {
          position: { x: 4.0, y: 2.0, z: 0.5 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      },
      twist: { twist: { linear: { x: 0.8, y: 0.1 } } },
    },
  });
  const parsed = parseInboundHardwareMessage(inboundRos, 'ros_rep103');
  assert.ok(parsed);
  assert.equal(parsed.x, 4.0);
  assert.equal(parsed.y, 0.5);
  assert.equal(parsed.z, -2.0);
  assert.equal(parsed.vx, 0.8);

  // Mock Loopback Integration
  const rxRecords: number[] = [];
  const client = new HardwareBridgeClient({
    onTelemetry: (t) => rxRecords.push(t.x),
  });
  client.updateConfig({ rateHz: 20, protocol: 'rosbridge_v2' });
  client.startLoopback({ x: 1.0, z: 0.0, yaw: 0 });
  assert.equal(client.getDiagnostics().status, 'loopback');
  client.sendCommand(1.0, 0, 0, false, performance.now() + 200);
  const diag = client.getDiagnostics();
  assert.equal(diag.txCount, 1);
  assert.ok(diag.lastTxJson.includes('"x":1'));
  client.dispose();
  assert.equal(client.getDiagnostics().status, 'disconnected');
});

test('Sim-to-Real Benchmark Suite: executes 3 randomized trials and generates Scorecard + JSON/Markdown', async () => {
  const scorecard = await runBenchmarkSuite({
    scenarioId: 'obstacle_slalom',
    trialCount: 3,
    profileId: 'quadruped_scout',
  });

  assert.equal(scorecard.trialCount, 3);
  assert.equal(scorecard.trials.length, 3);
  assert.ok(scorecard.successRatePct >= 0 && scorecard.successRatePct <= 100);
  assert.ok(scorecard.meanTimeToGoalSec > 0);
  assert.ok(scorecard.meanPathEfficiencyPct >= 0);

  const md = exportBenchmarkMarkdown(scorecard);
  assert.ok(md.includes('## Evaluation Scorecard'));
  assert.ok(md.includes('| #1 |'));

  const json = exportBenchmarkJson(scorecard);
  const decoded = JSON.parse(json);
  assert.equal(decoded.scenarioId, 'obstacle_slalom');
  assert.equal(decoded.trials.length, 3);
});
