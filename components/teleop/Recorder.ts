import { DemonstrationStep } from '@/contracts';

export class DAggerRecorder {
  private isRecording = false;
  private currentEpisode: DemonstrationStep[] = [];
  private allEpisodes: DemonstrationStep[][] = [];
  private startTime = 0;

  public startRecording() {
    this.isRecording = true;
    this.currentEpisode = [];
    this.startTime = performance.now();
  }

  public recordStep(
    robotPos: [number, number, number],
    robotQuat: [number, number, number, number],
    currentJoints: Record<string, number>,
    actionJointTargets: Record<string, number>
  ) {
    if (!this.isRecording) return;

    const timeSec = Number(((performance.now() - this.startTime) / 1000).toFixed(4));
    const step: DemonstrationStep = {
      t: timeSec,
      timestamp: timeSec,
      observation: {
        robotPos,
        robotQuat,
        jointAngles: { ...currentJoints },
      },
      action: { ...actionJointTargets },
      confidence: 1.0,
    };

    this.currentEpisode.push(step);
  }

  public stopRecording(): DemonstrationStep[] {
    this.isRecording = false;
    if (this.currentEpisode.length > 0) {
      this.allEpisodes.push([...this.currentEpisode]);
    }
    const finished = [...this.currentEpisode];
    this.currentEpisode = [];
    return finished;
  }

  public getActiveEpisodeCount(): number {
    return this.allEpisodes.length;
  }

  public getRecordedStepCount(): number {
    return this.currentEpisode.length;
  }

  public exportDataset() {
    return {
      version: '1.0',
      type: 'DAgger_human_correction_episodes',
      totalEpisodes: this.allEpisodes.length,
      createdAt: new Date().toISOString(),
      episodes: this.allEpisodes,
    };
  }

  public clear() {
    this.isRecording = false;
    this.currentEpisode = [];
    this.allEpisodes = [];
  }
}
