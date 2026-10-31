import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalRunnerAdapter, NebiusJobRunnerAdapter } from '../sim/runner_interface';
import { generateDeterministicEnvironmentSpec } from '../lib/nebius/prompts';
import { jobStore } from '../lib/cloud/job_store';
import { getSimAdapter, listSimAdapters } from '../sim/adapters';

test('Part II Cloud: LocalRunnerAdapter implements RunnerInterface with chunking and cancel/retry', async () => {
  const runner = new LocalRunnerAdapter('test_job_contract');
  const spec = generateDeterministicEnvironmentSpec('lunar traversal');

  // Submit job
  const submission = await runner.submit(spec, { durationSec: 3 });
  assert.equal(submission.mode, 'local_demo');
  assert.ok(submission.jobId.startsWith('job_local_'));

  // Query status
  const status = await runner.status(submission.jobId);
  assert.equal(status.mode, 'local_demo');
  assert.equal(status.state, 'running');
  assert.equal(status.costSoFar, 0.0);

  // Wait 1.1s for telemetry chunks to be recorded
  await new Promise((r) => setTimeout(r, 1100));

  // Telemetry chunk retrieval
  const { chunks, nextCursor } = await runner.telemetry(submission.jobId, 0);
  assert.ok(chunks.length >= 1, `Expected at least 1 chunk, got ${chunks.length}`);
  assert.equal(chunks[0].chunkIndex, 0);
  assert.ok(chunks[0].checksum.length > 0);
  assert.ok(chunks[0].frameCount > 0);

  // Cancel job
  const cancelResult = await runner.cancel(submission.jobId);
  assert.equal(cancelResult.success, true);

  const statusAfterCancel = await runner.status(submission.jobId);
  assert.equal(statusAfterCancel.state, 'cancelled');

  // Retry job
  const retryResult = await runner.retry(submission.jobId);
  assert.ok(retryResult.jobId.startsWith('job_local_'));
  await runner.stop();
});

test('Part II Cloud: NebiusJobRunnerAdapter cold start, telemetry chunking, and cancel', async () => {
  const cloudRunner = new NebiusJobRunnerAdapter('test_cloud_contract');
  const spec = generateDeterministicEnvironmentSpec('martian sprint');

  const submission = await cloudRunner.submit(spec, { durationSec: 10 });
  assert.equal(submission.mode, 'cloud_nebius');
  assert.ok(submission.jobId.startsWith('job_nebius_l40s_'));

  const status = await cloudRunner.status(submission.jobId);
  assert.equal(status.state, 'cold_start');
  assert.equal(status.region, 'eu-north1');
  assert.ok(status.message.includes('L40S'));

  // Cancel before warm-up completes
  const cancelResult = await cloudRunner.cancel(submission.jobId);
  assert.equal(cancelResult.success, true);

  const cancelledStatus = await cloudRunner.status(submission.jobId);
  assert.equal(cancelledStatus.state, 'cancelled');
});

test('Part II Cloud: JobStore registers and retrieves active simulation jobs', () => {
  const spec = generateDeterministicEnvironmentSpec('crater climb');
  const job = jobStore.createJob('job_test_store_1', spec, 'local_demo');

  assert.equal(job.jobId, 'job_test_store_1');
  assert.equal(job.mode, 'local_demo');

  const retrieved = jobStore.getJob('job_test_store_1');
  assert.ok(retrieved);
  assert.equal(retrieved?.jobId, 'job_test_store_1');

  jobStore.updateHeartbeat('job_test_store_1');
  assert.ok(retrieved?.lastHeartbeat! <= Date.now());
});

test('Part II Cloud: SimAdapter registry adheres to Option (c) Truth Table invariants', () => {
  const adapters = listSimAdapters();
  assert.ok(adapters.length >= 4);

  const groot = getSimAdapter('groot');
  assert.equal(groot.status, 'not_run');
  assert.equal(groot.uiBadge, 'NOT RUN IN THIS BUILD');
  assert.equal(groot.truthTableStatus, 'Not Run');

  const cosmos = getSimAdapter('cosmos');
  assert.equal(cosmos.status, 'not_run');
  assert.equal(cosmos.uiBadge, 'NOT RUN IN THIS BUILD');
  assert.equal(cosmos.truthTableStatus, 'Not Run');

  const local = getSimAdapter('local_kinematics');
  assert.equal(local.status, 'active');
  assert.equal(local.truthTableStatus, 'Live');
});
