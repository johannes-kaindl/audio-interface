// Spielt PCM der ladbaren Engine über die Web Audio API ab. Pause = Kontext anhalten.
import type { PcmBuffer } from "../core/audio";
import type { PcmPlayer } from "./speaker";

export class AudioContextPlayer implements PcmPlayer {
  private ctx: AudioContext | null = null;

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  play(pcm: PcmBuffer, signal: AbortSignal): Promise<void> {
    const ctx = this.context();
    const buffer = ctx.createBuffer(1, pcm.samples.length, pcm.sampleRate);
    buffer.copyToChannel(pcm.samples as Float32Array<ArrayBuffer>, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        source.onended = null;
        try {
          source.stop();
        } catch {
          /* schon beendet */
        }
        reject(new DOMException("aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      source.onended = () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      void ctx.resume().then(() => source.start());
    });
  }

  pause(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  async close(): Promise<void> {
    await this.ctx?.close();
    this.ctx = null;
  }
}
