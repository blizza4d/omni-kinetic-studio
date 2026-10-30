import { NextRequest } from 'next/server';
import { LocalSimulationRunner } from '@/lib/telemetry/local_runner';
import { JobStatus, TelemetryBatch } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId') || `job_${Date.now()}`;
  const mode = (searchParams.get('mode') as 'cloud_nebius' | 'local_demo') || 'local_demo';
  const durationSec = parseInt(searchParams.get('duration') || '60', 10);
  const iteration = parseInt(searchParams.get('iteration') || '1', 10);

  // Resume cursor support: Last-Event-ID from header or query param
  const lastEventIdStr = req.headers.get('last-event-id') || searchParams.get('lastEventId');
  const resumeBatchId = lastEventIdStr ? parseInt(lastEventIdStr, 10) : -1;

  const encoder = new TextEncoder();
  const runner = new LocalSimulationRunner(jobId, 60, iteration);

  const specParam = searchParams.get('spec');
  if (specParam) {
    try {
      const parsedSpec = JSON.parse(decodeURIComponent(specParam));
      runner.setEnvironmentSpec(parsedSpec);
    } catch {
      // ignore
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      function sendSSE(event: string, data: any, id?: number) {
        if (isClosed) return;
        try {
          const idLine = id !== undefined ? `id: ${id}\n` : '';
          controller.enqueue(encoder.encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          isClosed = true;
        }
      }

      // Initial status event
      const isCloud = mode === 'cloud_nebius';
      let coldStartCount = isCloud ? 4 : 0;

      const initialStatus: JobStatus = {
        jobId,
        status: isCloud ? 'cold_start' : 'running',
        progress: 0,
        mode,
        elapsed: 0,
        currentEpisode: 1,
        currentReward: 0,
        collisionCount: 0,
        successRate: 0.98,
        message: isCloud
          ? 'Provisioning NVIDIA L40S container on Nebius Serverless Jobs (~00:04)...'
          : 'Authoritative local simulation active (Demo Mode)',
        timestamp: Date.now(),
      };
      sendSSE('status', initialStatus);

      const batchIntervalMs = 500; // Emit batch every 500ms (30 frames @ 60 FPS)
      const framesPerBatch = 30;
      const totalBatches = (durationSec * 60) / framesPerBatch;
      let batchId = 0;

      // If client is reconnecting with resumeBatchId, fast-forward missed batches
      if (resumeBatchId >= 0 && resumeBatchId < totalBatches) {
        for (let i = 0; i <= resumeBatchId; i++) {
          runner.getNextBatch(framesPerBatch);
        }
        batchId = resumeBatchId + 1;
      }

      const intervalId = setInterval(() => {
        if (isClosed) {
          clearInterval(intervalId);
          return;
        }

        // Handle cold start countdown for cloud mode
        if (coldStartCount > 0) {
          coldStartCount--;
          const pct = Math.round(((4 - coldStartCount) / 4) * 20);
          sendSSE('status', {
            jobId,
            status: 'cold_start',
            progress: pct,
            mode: 'cloud_nebius',
            elapsed: 4 - coldStartCount,
            message: `Pulling image cr.nemotron.nvidia.com/embodied-ai:latest on L40S node (~00:0${coldStartCount})...`,
            timestamp: Date.now(),
          });
          return;
        }

        if (batchId >= totalBatches) {
          clearInterval(intervalId);
          if (!isClosed) {
            sendSSE('status', {
              jobId,
              status: 'succeeded',
              progress: 100,
              mode,
              elapsed: durationSec,
              message: `Simulation job completed successfully (${durationSec}s streamed)`,
              timestamp: Date.now(),
            });
            controller.close();
            isClosed = true;
          }
          return;
        }

        const batch = runner.getNextBatch(framesPerBatch);
        // Overwrite batch ID to be sequential for SSE event ID
        batch.batchId = batchId;
        sendSSE('telemetry', batch, batchId);

        batchId++;
        const progress = Math.min(100, Math.round((batchId / totalBatches) * 100));
        const lastFrame = batch.frames[batch.frames.length - 1];

        if (batchId % 2 === 0) {
          sendSSE('status', {
            jobId,
            status: 'running',
            progress,
            mode,
            elapsed: Math.round(batchId * (batchIntervalMs / 1000)),
            currentEpisode: lastFrame?.episode ?? 1,
            currentReward: lastFrame?.reward ?? 0,
            collisionCount: lastFrame?.collisions.length ?? 0,
            successRate: 0.98,
            message: `Active streaming: t=${lastFrame?.t.toFixed(1)}s, progress ${progress}%`,
            timestamp: Date.now(),
          });
        }
      }, batchIntervalMs);

      req.signal.addEventListener('abort', () => {
        clearInterval(intervalId);
        isClosed = true;
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
