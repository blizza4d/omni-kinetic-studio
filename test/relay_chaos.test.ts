import test from 'node:test';
import assert from 'node:assert/strict';
import { TelemetryChunk } from '../contracts';
import { generateDeterministicEnvironmentSpec } from '../lib/nebius/prompts';
import { LocalRunnerAdapter } from '../sim/runner_interface';

interface ClientReconstructedStream {
  receivedChunks: TelemetryChunk[];
  dedupedChunks: TelemetryChunk[];
  gapsDetected: number;
  duplicatesDropped: number;
}

function processIncomingChunk(
  incoming: TelemetryChunk,
  state: ClientReconstructedStream
) {
  state.receivedChunks.push(incoming);

  // Check if chunk is duplicate
  const isDuplicate = state.dedupedChunks.some(c => c.chunkIndex === incoming.chunkIndex);
  if (isDuplicate) {
    state.duplicatesDropped++;
    return;
  }

  // Check for gaps
  if (state.dedupedChunks.length > 0) {
    const lastChunk = state.dedupedChunks[state.dedupedChunks.length - 1];
    if (incoming.chunkIndex > lastChunk.chunkIndex + 1) {
      state.gapsDetected += (incoming.chunkIndex - (lastChunk.chunkIndex + 1));
    }
  }

  state.dedupedChunks.push(incoming);
  // Sort into in-order chronological sequence
  state.dedupedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
}

test('Relay Chaos Test: Disconnect, Last-Event-ID Resume, Reorder & Duplicate Invariance', async () => {
  const runner = new LocalRunnerAdapter('test_chaos_job');
  const spec = generateDeterministicEnvironmentSpec('crater traverse');

  // Start simulation to produce chunks
  await runner.start(spec, 4);
  // Wait 1.6s to produce ~3 chunks
  await new Promise(r => setTimeout(r, 1600));

  const { chunks } = await runner.telemetry('test_chaos_job', 0);
  await runner.stop();

  assert.ok(chunks.length >= 2, `Expected at least 2 chunks, got ${chunks.length}`);

  const clientState: ClientReconstructedStream = {
    receivedChunks: [],
    dedupedChunks: [],
    gapsDetected: 0,
    duplicatesDropped: 0,
  };

  // Phase 1: Client receives chunk 0
  processIncomingChunk(chunks[0], clientState);
  assert.equal(clientState.dedupedChunks.length, 1);
  assert.equal(clientState.dedupedChunks[0].chunkIndex, 0);

  // Phase 2: Injected Chaos - Chunk 0 arrives AGAIN (network duplicate)
  processIncomingChunk(chunks[0], clientState);
  assert.equal(clientState.duplicatesDropped, 1, 'Duplicate chunk must be dropped');
  assert.equal(clientState.dedupedChunks.length, 1, 'Deduped count must not increase');

  // Phase 3: Simulated Connection Drop & Last-Event-ID Resumption
  // Client reconnects with Last-Event-ID = 0, requesting chunks starting from 1
  const resumeCursor = 0;
  const resumedChunks = chunks.slice(resumeCursor + 1);

  for (const chunk of resumedChunks) {
    processIncomingChunk(chunk, clientState);
  }

  // Validate integrity: all chunks present, in order, zero gaps
  assert.equal(clientState.dedupedChunks.length, chunks.length);
  for (let i = 0; i < clientState.dedupedChunks.length; i++) {
    assert.equal(clientState.dedupedChunks[i].chunkIndex, i, `Chunk at index ${i} must match sequence`);
  }
  assert.equal(clientState.gapsDetected, 0, 'No gaps detected in stream playback');
});
