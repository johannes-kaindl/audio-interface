// Systemstimmen über window.speechSynthesis: sprechen, nicht rendern (kein PCM — Spec §2.1).
// Satzweise Utterances: Chrome/Electron kappt lange Utterances stumm nach ~15 s. Pausen zwischen den
// Chunks kommen aus dem Chunk (Timer über den injizierten Clock-Port). Abbruch → cancel().
import type { SpeechChunk } from "../../core/speech-text";
import type { ClockPort } from "../../vendor/kit-obsidian/clock";

export interface VoiceInfo {
  uri: string;
  name: string;
  lang: string;
  local: boolean;
}

export interface SpeakOptions {
  /** "" = automatisch: erste Stimme mit `langPrefix`, sonst erste überhaupt. */
  voiceUri: string;
  rate: number;
  langPrefix?: string;
}

/** Ausschnitt von SpeechSynthesis, den die Engine braucht — als Interface, damit Tests eine Attrappe geben. */
export interface SynthLike {
  getVoices(): SpeechSynthesisVoice[];
  speak(u: SpeechSynthesisUtterance): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  addEventListener(type: "voiceschanged", listener: () => void): void;
  removeEventListener(type: "voiceschanged", listener: () => void): void;
}

export type UtteranceFactory = (text: string) => SpeechSynthesisUtterance;

export class SpeechAbortError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}

export class SystemSpeechEngine {
  readonly kind = "builtin" as const;

  constructor(
    private readonly synth: SynthLike,
    private readonly makeUtterance: UtteranceFactory,
    private readonly clock: ClockPort,
  ) {}

  /** Die Stimmenliste ist beim ersten Zugriff oft leer und kommt per `voiceschanged` — Fehlerfall Spec §6. */
  waitForVoices(timeoutMs = 2000): Promise<VoiceInfo[]> {
    const now = this.listVoices();
    if (now.length > 0) return Promise.resolve(now);
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.synth.removeEventListener("voiceschanged", finish);
        this.clock.clearTimeout(timer);
        resolve(this.listVoices());
      };
      const timer = this.clock.setTimeout(finish, timeoutMs);
      this.synth.addEventListener("voiceschanged", finish);
    });
  }

  listVoices(langPrefix?: string): VoiceInfo[] {
    const all = this.synth.getVoices().map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, local: v.localService }));
    return langPrefix ? all.filter((v) => v.lang.toLowerCase().startsWith(langPrefix.toLowerCase())) : all;
  }

  defaultVoiceUri(langPrefix: string): string | null {
    return this.listVoices(langPrefix)[0]?.uri ?? this.listVoices()[0]?.uri ?? null;
  }

  private resolveVoice(opts: SpeakOptions): SpeechSynthesisVoice | null {
    const voices = this.synth.getVoices();
    const wanted = opts.voiceUri || this.defaultVoiceUri(opts.langPrefix ?? "de");
    return voices.find((v) => v.voiceURI === wanted) ?? null;
  }

  async speak(chunks: SpeechChunk[], opts: SpeakOptions, signal: AbortSignal, onChunk?: (index: number) => void): Promise<void> {
    const voice = this.resolveVoice(opts);
    for (let i = 0; i < chunks.length; i++) {
      if (signal.aborted) throw new SpeechAbortError();
      onChunk?.(i);
      await this.speakOne(chunks[i].text, voice, opts.rate, signal);
      if (chunks[i].pauseAfterMs > 0 && i < chunks.length - 1) await this.wait(chunks[i].pauseAfterMs, signal);
    }
  }

  private speakOne(text: string, voice: SpeechSynthesisVoice | null, rate: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const u = this.makeUtterance(text);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.rate = rate;
      const onAbort = (): void => {
        this.synth.cancel();
        reject(new SpeechAbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      u.onend = () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      u.onerror = (e) => {
        signal.removeEventListener("abort", onAbort);
        // interrupted/canceled kommen von unserem eigenen cancel() — das ist kein Fehler.
        if (e.error === "interrupted" || e.error === "canceled") reject(new SpeechAbortError());
        else reject(new Error(`speech synthesis: ${e.error}`));
      };
      this.synth.speak(u);
    });
  }

  private wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this.clock.setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        this.clock.clearTimeout(id);
        reject(new SpeechAbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  pause(): void {
    this.synth.pause();
  }

  resume(): void {
    this.synth.resume();
  }
}
