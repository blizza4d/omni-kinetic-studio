/**
 * Screenshot (2x PNG) & Video Clip (WebM MediaRecorder) Capture Utilities (Phase W10.1)
 */

export function isClipRecordingSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof (window as any).MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

/**
 * Captures a crisp PNG screenshot of the WebGL canvas (optionally upscaled 2x) and triggers download.
 */
export async function captureCanvasScreenshot(
  sourceCanvas: HTMLCanvasElement,
  filename = `omni-kinetic-${Date.now()}.png`,
  scale = 2
): Promise<{ ok: boolean; width: number; height: number; copiedToClipboard: boolean; error?: string }> {
  try {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = Math.max(1, sourceCanvas.width * scale);
    outCanvas.height = Math.max(1, sourceCanvas.height * scale);
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return { ok: false, width: 0, height: 0, copiedToClipboard: false, error: '2D context unavailable.' };

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, outCanvas.width, outCanvas.height);

    const blob = await new Promise<Blob | null>((resolve) => outCanvas.toBlob(resolve, 'image/png'));
    if (!blob) return { ok: false, width: 0, height: 0, copiedToClipboard: false, error: 'PNG encoding failed.' };

    let copiedToClipboard = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof (window as any).ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new (window as any).ClipboardItem({ 'image/png': blob })]);
        copiedToClipboard = true;
      }
    } catch {
      // Clipboard write optional
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return { ok: true, width: outCanvas.width, height: outCanvas.height, copiedToClipboard };
  } catch (err: any) {
    return { ok: false, width: 0, height: 0, copiedToClipboard: false, error: String(err?.message || err) };
  }
}

export class CanvasClipRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private recording = false;

  public isRecording(): boolean {
    return this.recording;
  }

  public start(
    canvas: HTMLCanvasElement,
    options?: { fps?: number; maxDurationSec?: number; onAutoStop?: () => void }
  ): { ok: boolean; error?: string } {
    if (!isClipRecordingSupported()) {
      return { ok: false, error: 'Clip recording (MediaRecorder) is not supported in this browser.' };
    }
    if (this.recording) return { ok: false, error: 'Already recording.' };

    try {
      const stream = canvas.captureStream(options?.fps ?? 30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';

      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      this.chunks = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) this.chunks.push(ev.data);
      };
      rec.onstop = () => {
        this.recording = false;
        if (this.stopTimer) {
          clearTimeout(this.stopTimer);
          this.stopTimer = null;
        }
        if (this.chunks.length > 0) {
          const blob = new Blob(this.chunks, { type: mimeType || 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `omni-kinetic-clip-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1500);
        }
        this.chunks = [];
      };

      rec.start(250);
      this.recorder = rec;
      this.recording = true;

      const capSec = Math.min(30, options?.maxDurationSec ?? 30);
      this.stopTimer = setTimeout(() => {
        this.stop();
        options?.onAutoStop?.();
      }, capSec * 1000);

      return { ok: true };
    } catch (err: any) {
      this.recording = false;
      return { ok: false, error: String(err?.message || err) };
    }
  }

  public stop(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.recorder && this.recording) {
      try {
        this.recorder.stop();
      } catch {
        this.recording = false;
      }
    }
  }

  public dispose(): void {
    this.stop();
    this.recorder = null;
    this.chunks = [];
  }
}
