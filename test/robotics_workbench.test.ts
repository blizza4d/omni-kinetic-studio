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
import { SimEngine, InterpolatedDroidRenderState } from '../lib/sim/SimEngine';
import { TransientRoboticsStore } from '../lib/telemetry/transientStore';
import { GestureTeleopStabilizer } from '../lib/filters/gestureController';
import { ImitationPolicy } from '../src/robotics/imitationPolicy';
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
  assert.equal(parsedFirstLine.timestamp_ms >= 0, true);
  assert.deepEqual(parsedFirstLine.observation.position, [0.1, 0.44, 0]);
  assert.deepEqual(parsedFirstLine.observation.orientation, [0, 0, 0, 1]);
  assert.deepEqual(parsedFirstLine.observation.linear_vel, [0.3, 0, 0]);
  assert.equal(typeof parsedFirstLine.observation.pitch, 'number');
  assert.equal(typeof parsedFirstLine.observation.roll, 'number');
  assert.equal(parsedFirstLine.action.throttle, 0.3);
  assert.equal(parsedFirstLine.action.steering, 0);
  assert.deepEqual(parsedFirstLine.observation.lidar_ranges, [4.25, 5.1, 14]);
  assert.equal(recorder.toggleEpisodeSuccess(epId), false);
  assert.equal(recorder.toggleEpisodeSuccess(epId), true);

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
  assert.ok(plan.mission_summary.length > 10);
  assert.ok(plan.waypoints.length >= 3);
  assert.equal(typeof plan.waypoints[0]!.x, 'number');
  assert.equal(typeof plan.waypoints[0]!.z, 'number');
  assert.ok(plan.safety_constraints.max_speed > 0);
  assert.ok(plan.safety_constraints.max_tilt_deg > 0);
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
  const renderOut: InterpolatedDroidRenderState = {
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

test('TransientRoboticsStore: tracks >30deg tilt safety warning & performance tier MediaPipe FPS', () => {
  const store = TransientRoboticsStore.getInstance();
  store.setPerformanceTier('balanced');
  assert.equal(store.getState().mediapipeTargetFps, 18);
  store.setPerformanceTier('low');
  assert.equal(store.getState().mediapipeTargetFps, 10);
  store.setPerformanceTier('high');
  assert.equal(store.getState().mediapipeTargetFps, 30);

  store.writePhysicsFrame({
    timestampMs: 100,
    step: 6,
    pos: [1.0, 0.4, 2.0],
    quat: [0, 0, 0, 1],
    vel: [0.5, 0, 0],
    angVelDegS: [0, 0, 0],
    pitchDeg: 33.5,
    rollDeg: 4.0,
    yawDeg: 0,
    wheelSlip: 0.12,
    slopeDeg: 22.0,
    slopeTractionFactor: 0.78,
    groundContactCount: 4,
    suspensionClamped: true,
    gravityMps2: 1.62,
    eStopActive: false,
  });
  const snap = store.getState();
  assert.equal(snap.tiltWarning, true);
  assert.equal(snap.suspensionClamped, true);
  assert.equal(snap.slopeTractionFactor, 0.78);
});

test('GestureTeleopStabilizer: applies EMA smoothing, deadzone suppression, and >300ms failsafe ramp-to-zero', () => {
  const stabilizer = new GestureTeleopStabilizer({
    emaAlpha: 0.3,
    deadzone: 0.1,
    minConfidence: 0.6,
    failsafeTimeoutMs: 300,
  });

  // Inside deadzone -> suppressed to exact 0
  const dzOut = stabilizer.step({
    rawThrottle: 0.05,
    rawSteering: -0.08,
    handPresent: true,
    confidence: 0.95,
    nowMs: 100,
  });
  assert.equal(dzOut.vx, 0);
  assert.equal(dzOut.yawRate, 0);
  assert.equal(dzOut.failsafeActive, false);

  // Strong command -> EMA smooths smoothly toward target
  const out1 = stabilizer.step({
    rawThrottle: 1.0,
    rawSteering: 0.5,
    handPresent: true,
    confidence: 0.95,
    nowMs: 133,
  });
  assert.ok(out1.vx > 0 && out1.vx < 1.5);
  assert.equal(out1.signalValid, true);

  // Signal loss > 300ms -> activates failsafe and ramps velocity toward zero
  const outFailsafe1 = stabilizer.step({
    rawThrottle: 1.0,
    rawSteering: 0.5,
    handPresent: false,
    confidence: 0.0,
    nowMs: 500,
  });
  assert.equal(outFailsafe1.failsafeActive, true);
  assert.ok(outFailsafe1.vx < out1.vx);

  const outFailsafeLater = stabilizer.step({
    rawThrottle: 0,
    rawSteering: 0,
    handPresent: false,
    confidence: 0.0,
    nowMs: 900,
  });
  assert.equal(outFailsafeLater.failsafeActive, true);
  assert.ok(outFailsafeLater.vx < 0.05);
});

test('ImitationPolicy: handles empty/fail episodes safely, trains on Success demos, and predicts in < 1 ms', () => {
  const policy = new ImitationPolicy();
  const recorder = new EpisodeDemonstrationRecorder();

  // Empty fit returns untrained stats cleanly
  const emptyStats = policy.fit(recorder.getEpisodes(), 3);
  assert.equal(emptyStats.trained, false);
  const emptyPred = policy.predict({
    position: [0, 0.44, 0],
    yawRad: 0,
    linearVel: [0, 0, 0],
    angularVelDegS: [0, 0, 0],
    pitchDeg: 0,
    rollDeg: 0,
  });
  assert.equal(emptyPred.throttle, 0);
  assert.equal(emptyPred.steering, 0);
  assert.equal(emptyPred.confidence, 0);

  const makeFrame = (x: number, z: number, vx: number): TelemetryFrame => ({
    schemaVersion: '4.0',
    seq: 1,
    dt: 0.0167,
    t: 0.0167,
    episode: 1,
    iteration: 2,
    bodies: [{ id: 'torso', pos: [x, 0.44, z], quat: [0, 0, 0, 1], vel: [vx, 0, 0] }],
    joints: [],
    feet: [
      { id: 'FL', pos: [x + 0.2, 0, z - 0.1], contact: true },
      { id: 'FR', pos: [x + 0.2, 0, z + 0.1], contact: true },
      { id: 'RL', pos: [x - 0.2, 0, z - 0.1], contact: true },
      { id: 'RR', pos: [x - 0.2, 0, z + 0.1], contact: true },
    ],
    valid: true,
    status: 'running',
  });

  // Fail-tagged episode must be excluded from training
  recorder.startRecording('keyboard', 1.62, 42, 'fail-demo');
  recorder.recordStep(makeFrame(5, 5, -0.5), { vx: -1.0, vy: 0, yawRate: 1.5 }, 'keyboard', false, [2, 2, 2]);
  recorder.stopAndSave(false);

  const failOnlyStats = policy.fit(recorder.getEpisodes(), 3);
  assert.equal(failOnlyStats.trained, false);

  // Success-tagged episode must train Weighted k-NN cleanly
  recorder.startRecording('keyboard', 1.62, 42, 'success-demo');
  recorder.recordStep(makeFrame(1.0, 0.0, 0.8), { vx: 0.9, vy: 0, yawRate: -0.25 }, 'keyboard', false, [10, 12, 11]);
  recorder.recordStep(makeFrame(1.2, 0.0, 0.85), { vx: 1.0, vy: 0, yawRate: -0.2 }, 'keyboard', false, [10, 12, 11]);
  recorder.stopAndSave(true);

  const trainedStats = policy.fit(recorder.getEpisodes(), 2);
  assert.equal(trainedStats.trained, true);
  assert.equal(trainedStats.episodeCount, 1);
  assert.equal(trainedStats.sampleCount, 2);

  const pred = policy.predict({
    position: [1.1, 0.44, 0.0],
    yawRad: 0,
    linearVel: [0.82, 0, 0],
    angularVelDegS: [0, 0, 0],
    pitchDeg: 0,
    rollDeg: 0,
    lidarRanges: [10, 12, 11],
  });
  assert.ok(pred.throttle > 0.7 && pred.throttle <= 1.05);
  assert.ok(pred.steering < 0);
  assert.ok(pred.confidence > 0.5);
  assert.ok(pred.inferenceTimeMs < 5.0);
  assert.equal(pred.usedDemoCount, 1);
});

test('Domain Randomization Control Latency Buffer: delays actuation by configured ms window', () => {
  const engineNoLag = new SimEngine(new ShortcutRegistry());
  engineNoLag.arbiter.takeManualControl('keyboard', 0);
  engineNoLag.inputs.handleKeyDown({ code: 'KeyW', key: 'w' });
  for (let i = 0; i < 8; i++) {
    engineNoLag.executeFixedStep(i, 1 / 60);
  }
  const immediatePosX = engineNoLag.getLatestKinematic()!.bodyPos[0];

  const engineLag = new SimEngine(new ShortcutRegistry());
  engineLag.applyDomainPhysics({ controlLatencyMs: 160, seed: 777 });
  assert.equal(engineLag.getDomainPhysics().seed, 777);
  engineLag.arbiter.takeManualControl('keyboard', 0);
  engineLag.inputs.handleKeyDown({ code: 'KeyW', key: 'w' });
  for (let i = 0; i < 8; i++) {
    engineLag.executeFixedStep(i, 1 / 60);
  }
  const delayedPosX = engineLag.getLatestKinematic()!.bodyPos[0];

  // With 160 ms delay (10 steps), the first 8 steps stay at origin while immediate advances > 1cm
  assert.ok(immediatePosX > 0.01);
  assert.ok(delayedPosX < immediatePosX * 0.25);

  // Clearing latency releases buffer cleanly
  engineLag.applyDomainPhysics({ controlLatencyMs: 0 });
  assert.equal(engineLag.getDomainPhysics().controlLatencyMs, 0);
});

test('Episode Scrubber & Filtered Export: trims frame range, deletes episodes, and filters Success-only JSONL/CSV', () => {
  const recorder = new EpisodeDemonstrationRecorder();
  const dummyFrame = (t: number, vx: number): TelemetryFrame => ({
    schemaVersion: '4.0',
    seq: Math.round(t * 60),
    dt: 0.0167,
    t,
    episode: 1,
    iteration: 2,
    bodies: [{ id: 'torso', pos: [t, 0.44, 0], quat: [0, 0, 0, 1], vel: [vx, 0, 0] }],
    joints: [],
    feet: [{ id: 'FL', pos: [t + 0.2, 0, 0.1], contact: true }],
    valid: true,
    status: 'running',
  });

  const ep1 = recorder.startRecording('keyboard', 3.72, 99, 'mars-ep', {
    seed: 1234,
    gravityMps2: 3.72,
    frictionCoeff: 0.65,
    maxTorqueNm: 30,
    imuNoiseSigma: 0.02,
    controlLatencyMs: 50,
  });
  for (let i = 0; i < 6; i++) {
    recorder.recordStep(dummyFrame(i * 0.1, 0.5 + i * 0.1), { vx: 0.8, vy: 0, yawRate: 0 }, 'keyboard', false, [5, 5, 5]);
  }
  recorder.stopAndSave(true);

  const ep2 = recorder.startRecording('keyboard', 1.62, 42, 'failed-ep');
  recorder.recordStep(dummyFrame(0, 0), { vx: 0, vy: 0, yawRate: 0 }, 'keyboard', false, [5, 5, 5]);
  recorder.stopAndSave(false);

  // Trim ep1 from index 2..4 -> 3 frames re-indexed 0..2
  const trimmed = recorder.trimEpisode(ep1, 2, 4);
  assert.ok(trimmed);
  assert.equal(trimmed.frames.length, 3);
  assert.equal(trimmed.meta.frameCount, 3);
  assert.equal(trimmed.frames[0]!.step, 0);
  assert.equal(trimmed.meta.domainMeta?.seed, 1234);

  // Success-only exports must contain ep1 (3 lines JSONL, 1 header + 3 rows CSV) and exclude ep2
  const successJsonl = recorder.exportLeRobotJsonl(undefined, true);
  assert.equal(successJsonl.split('\n').length, 3);
  assert.ok(!successJsonl.includes(ep2));
  assert.ok(successJsonl.includes('"seed":1234'));

  const successCsv = recorder.exportRoboticsCsv(undefined, true);
  assert.equal(successCsv.split('\n').length, 4); // header + 3 rows

  // Delete ep2
  assert.equal(recorder.deleteEpisode(ep2), true);
  assert.equal(recorder.getEpisodes().length, 1);
});
