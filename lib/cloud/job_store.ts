import {
  EnvironmentSpec,
  JobStatusV3,
  TelemetryChunk,
  TelemetryManifest,
} from '@/contracts';
import { LocalRunnerAdapter, NebiusJobRunnerAdapter, RunnerInterface } from '@/sim/runner_interface';

export interface ActiveJobRecord {
  jobId: string;
  mode: 'local_demo' | 'cloud_nebius' | 'cached_cloud';
  spec: EnvironmentSpec;
  runner: RunnerInterface;
  status: JobStatusV3;
  chunks: TelemetryChunk[];
  lastHeartbeat: number;
  createdAt: number;
}

class JobStoreManager {
  private jobs: Map<string, ActiveJobRecord> = new Map();

  public createJob(jobId: string, spec: EnvironmentSpec, mode: 'local_demo' | 'cloud_nebius' = 'local_demo'): ActiveJobRecord {
    const runner = mode === 'cloud_nebius'
      ? new NebiusJobRunnerAdapter(jobId)
      : new LocalRunnerAdapter(jobId);

    const initialStatus: JobStatusV3 = {
      jobId,
      state: mode === 'cloud_nebius' ? 'cold_start' : 'running',
      status: mode === 'cloud_nebius' ? 'cold_start' : 'running',
      progress: 0,
      mode,
      message: mode === 'cloud_nebius'
        ? 'Provisioning NVIDIA L40S GPU node on Nebius Serverless Jobs...'
        : 'Authoritative local simulation active [DEMO: LOCAL RUNNER]',
      elapsed: 0,
      costSoFar: 0,
      estimatedRange: mode === 'cloud_nebius' ? [0.02, 0.05] : [0, 0],
      region: mode === 'cloud_nebius' ? 'eu-north1' : 'local_browser',
      heartbeatAge: 0,
      currentEpisode: 1,
      currentReward: 0,
      collisionCount: 0,
      successRate: 0.99,
      timestamp: Date.now(),
    };

    const record: ActiveJobRecord = {
      jobId,
      mode,
      spec,
      runner,
      status: initialStatus,
      chunks: [],
      lastHeartbeat: Date.now(),
      createdAt: Date.now(),
    };

    this.jobs.set(jobId, record);
    return record;
  }

  public getJob(jobId: string): ActiveJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  public listJobs(): ActiveJobRecord[] {
    return Array.from(this.jobs.values());
  }

  public updateHeartbeat(jobId: string) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.lastHeartbeat = Date.now();
    }
  }

  public addChunk(jobId: string, chunk: TelemetryChunk) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.chunks.push(chunk);
      job.lastHeartbeat = Date.now();
    }
  }

  public async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    await job.runner.cancel(jobId);
    job.status.state = 'cancelled';
    job.status.status = 'cancelled';
    job.status.message = `Job ${jobId} cancelled. Cloud GPU billing stopped.`;
    return true;
  }
}

// Global singleton for Next.js server runtime
const globalForJobs = globalThis as unknown as { jobStore?: JobStoreManager };
export const jobStore = globalForJobs.jobStore ?? new JobStoreManager();
if (process.env.NODE_ENV !== 'production') globalForJobs.jobStore = jobStore;
