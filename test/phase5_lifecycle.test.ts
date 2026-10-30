import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalRunnerAdapter, NebiusJobRunnerAdapter } from '../sim/runner_interface';
import { generateDeterministicEnvironmentSpec } from '../lib/nebius/prompts';
import { RunSummarySchema } from '../contracts';
import { exportSyntheticDataset } from '../lib/dataset/synthetic_exporter';

test('Phase 5 Runner Interface: LocalRunnerAdapter starts, streams telemetry, and generates valid RunSummary', async () => {
  const runner = new LocalRunnerAdapter('test_job_1');
  const spec = generateDeterministicEnvironmentSpec('quadruped debris traversal');

  let batchesReceived = 0;
  let finalStatus: any = null;

  runner.onTelemetry((batch) => {
    batchesReceived++;
    assert.ok(batch.frames.length > 0);
    assert.ok(['2.0', '3.0', '4.0'].includes(batch.frames[0].schemaVersion));
  });

  runner.onStatus((status) => {
    finalStatus = status;
  });

  // Run for 1.2 seconds (should produce ~2 batches)
  await runner.start(spec, 2);
  await new Promise((r) => setTimeout(r, 1200));
  await runner.stop();

  assert.ok(batchesReceived >= 1, `Expected at least 1 batch, received ${batchesReceived}`);
  assert.equal(runner.getMode(), 'local_demo');

  const summary = runner.getSummary();
  const parsed = RunSummarySchema.parse(summary);
  assert.equal(parsed.mode, 'local_demo');
  assert.ok(parsed.distanceCovered >= 0);
  assert.ok(parsed.durationSeconds > 0);
});

test('Phase 5 Nebius Runner: NebiusJobRunnerAdapter initializes in cold_start and formats valid cloud summary', async () => {
  const cloudRunner = new NebiusJobRunnerAdapter('test_cloud_job');
  const spec = generateDeterministicEnvironmentSpec('crater debris');

  let initialStatus: any = null;
  cloudRunner.onStatus((status) => {
    if (!initialStatus) initialStatus = status;
  });

  await cloudRunner.start(spec, 10);
  assert.equal(cloudRunner.getMode(), 'cloud_nebius');
  assert.ok(initialStatus);
  assert.equal(initialStatus.status, 'cold_start');

  const cloudSummary = cloudRunner.getSummary();
  const parsedCloud = RunSummarySchema.parse(cloudSummary);
  assert.equal(parsedCloud.mode, 'cloud_nebius');
  assert.ok(parsedCloud.sourceLabels.includes('nebius_serverless_jobs'));

  await cloudRunner.stop();
});

test('Phase 5 Synthetic Exporter: exports valid manifest and JSONL dataset with deterministic checksum', () => {
  const spec = generateDeterministicEnvironmentSpec('low gravity test');
  const runner = new LocalRunnerAdapter('test_exporter');
  runner.start(spec, 5);

  const mockFrames = [
    runner['runner'].generateFrame(0),
    runner['runner'].generateFrame(1),
    runner['runner'].generateFrame(2),
  ];
  runner.stop();

  const bundle = exportSyntheticDataset(spec, mockFrames);
  assert.ok(bundle.manifest);
  assert.equal(bundle.manifest.totalFrames, 3);
  assert.equal(bundle.manifest.taskName, spec.taskName);
  assert.ok(bundle.manifest.sha256Checksum.startsWith('sha256_'));

  const lines = bundle.jsonlContent.split('\n');
  assert.equal(lines.length, 3);
  const parsedFirst = JSON.parse(lines[0]);
  assert.equal(parsedFirst.step, 0);
  assert.ok(parsedFirst.observation.robotPos);
});
