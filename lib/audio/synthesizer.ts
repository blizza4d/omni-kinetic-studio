/**
 * Synthesized Vacuum-Conducted Audio System (Pack K — F-011)
 *
 * Implements physically based structure-borne audio conducted through the lunar droid's chassis:
 * - WebAudio synthesis only (ZERO binary audio assets)
 * - Muffled lowpass foot impact thumps
 * - Soft servo mechanical whine scaled by joint velocity
 * - Autoplay safety: initializes only after user gesture
 * - Master volume and global mute
 */

export class LunarAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted = true;
  private volume = 0.25;
  private activeVoices = 0;
  private readonly maxVoices = 8;

  public initialize(): void {
    if (this.ctx || typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch {
      // Audio not permitted or supported
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1.0, vol));
    if (!this.isMuted && this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Structure-borne footstep impact thump conducted through the chassis.
   */
  public triggerFootThump(intensity = 0.5): void {
    if (this.isMuted || !this.ctx || !this.masterGain || this.activeVoices >= this.maxVoices) return;

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    try {
      this.activeVoices++;
      const t0 = this.ctx.currentTime;
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.08);
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);

      // Audio-only synthetic decay noise
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }

      const src = this.ctx.createBufferSource();
      src.buffer = noiseBuffer;

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(140 + 100 * intensity, t0);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.28 * intensity, t0 + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);

      src.connect(lp);
      lp.connect(gain);
      gain.connect(this.masterGain);

      src.start(t0);
      src.onended = () => {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      };
    } catch {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }
  }

  /**
   * Hop launch pulse.
   */
  public triggerHopThud(chargePct = 0.5): void {
    if (this.isMuted || !this.ctx || !this.masterGain || this.activeVoices >= this.maxVoices) return;

    try {
      this.activeVoices++;
      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(65 + 40 * chargePct, t0);
      osc.frequency.exponentialRampToValueAtTime(32, t0 + 0.15);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.35 * chargePct, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t0);
      osc.stop(t0 + 0.16);
      osc.onended = () => {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      };
    } catch {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }
  }
}

export const globalAudioSynthesizer = new LunarAudioSynthesizer();
