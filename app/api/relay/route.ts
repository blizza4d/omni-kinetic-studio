import { NextRequest, NextResponse } from 'next/server';
import { jobStore } from '@/lib/cloud/job_store';
import { RelayStats, TelemetryChunk } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId') || 'default_job';
  const isPoll = searchParams.get('poll') === 'true';

  // Read resume cursor from Last-Event-ID header or query param
  const lastEventIdHeader = req.headers.get('last-event-id') || searchParams.get('cursor');
  let resumeCursor = lastEventIdHeader !== null && lastEventIdHeader !== undefined
    ? parseInt(lastEventIdHeader, 10)
    : -1;

  let job = jobStore.getJob(jobId);
  if (!job) {
    // If job does not exist in store, check if it's a fixture/cached cloud replay
    return NextResponse.json({
      error: `Job ${jobId} not found in active relay store.`,
      status: 'not_found',
    }, { status: 404 });
  }

  // Polling fallback mode
  if (isPoll) {
    const startIdx = Math.max(0, resumeCursor + 1);
    const { chunks, nextCursor } = await job.runner.telemetry(jobId, startIdx);
    return NextResponse.json({
      jobId,
      chunks,
      nextCursor,
      status: job.status,
    });
  }

  // SSE Stream Mode
  const encoder = new TextEncoder();
  const relayStats: RelayStats = {
    chunksReceived: 0,
    gapsDetected: 0,
    duplicatesDropped: 0,
    reconnectCount: resumeCursor >= 0 ? 1 : 0,
    relayLagMs: 0,
    bufferedMs: 0,
    status: 'healthy',
  };

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      let expectedChunkIndex = resumeCursor + 1;

      function sendSSE(event: string, data: any, id?: number) {
        if (isClosed) return;
        try {
          const idStr = id !== undefined ? `id: ${id}\n` : '';
          controller.enqueue(encoder.encode(`${idStr}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          isClosed = true;
        }
      }

      sendSSE('relay_connected', {
        jobId,
        resumeCursor,
        status: job.status,
        relayStats,
      });

      const pollIntervalMs = 250;
      let backoffMs = pollIntervalMs;

      const interval = setInterval(async () => {
        if (isClosed) {
          clearInterval(interval);
          return;
        }

        const now = Date.now();
        const heartbeatAgeSec = Math.round((now - job.lastHeartbeat) / 1000);
        job.status.heartbeatAge = heartbeatAgeSec;

        // Fetch new chunks since expectedChunkIndex
        const { chunks, nextCursor } = await job.runner.telemetry(jobId, expectedChunkIndex);

        if (chunks.length > 0) {
          backoffMs = 250; // reset backoff upon data receipt

          for (const chunk of chunks) {
            // Deduplication
            if (chunk.chunkIndex < expectedChunkIndex) {
              relayStats.duplicatesDropped++;
              continue;
            }

            // Gap Detection
            if (chunk.chunkIndex > expectedChunkIndex) {
              relayStats.gapsDetected++;
              sendSSE('relay_gap', {
                expected: expectedChunkIndex,
                received: chunk.chunkIndex,
                message: `Gap detected in telemetry stream: expected chunk ${expectedChunkIndex}, received ${chunk.chunkIndex}`,
              });
            }

            expectedChunkIndex = chunk.chunkIndex + 1;
            relayStats.chunksReceived++;
            relayStats.bufferedMs = Math.max(0, (chunk.tEnd - chunk.tStart) * 1000);

            // Backpressure check: if buffered latency > 2.0s
            if (relayStats.bufferedMs > 2000) {
              relayStats.status = 'buffering';
            } else {
              relayStats.status = 'healthy';
            }

            sendSSE('telemetry_chunk', chunk, chunk.chunkIndex);
          }
        } else {
          // Increase poll backoff up to 2000ms if no new chunks
          backoffMs = Math.min(2000, backoffMs + 250);
        }

        // Emit heartbeat and status update
        const currentJobStatus = await job.runner.status(jobId);
        sendSSE('job_status', currentJobStatus);

        if (currentJobStatus.state === 'succeeded' || currentJobStatus.state === 'cancelled' || currentJobStatus.state === 'failed') {
          sendSSE('relay_done', { finalStatus: currentJobStatus, relayStats });
          clearInterval(interval);
          isClosed = true;
          try {
            controller.close();
          } catch {
            // ignore
          }
        }
      }, pollIntervalMs);

      req.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(interval);
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
