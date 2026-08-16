// Ein aktiver Sprechvorgang pro Plugin: Systemstimme (spricht selbst) oder ladbare Engine
// (rendert PCM, das ein injizierter Player abspielt). Zustand nach außen für Statusleiste/Kommandos.
import type { PcmBuffer } from "../core/audio";
import { prepareSpeech } from "../core/speech-text";
import type { AudioInterfaceSettings } from "../core/settings-types";
import type { PiperEngine } from "./engines/piper-engine";
import type { SystemSpeechEngine } from "./engines/system-speech";

export interface PcmPlayer {
  play(pcm: PcmBuffer, signal: AbortSignal): Promise<void>;
  pause(): void;
  resume(): void;
}

export type SpeakerState =
  | { kind: "idle" }
  | { kind: "rendering"; done: number; total: number }
  | { kind: "speaking"; paused: boolean; engine: "builtin" | "loadable"; done: number; total: number };

export class SpeakerError extends Error {
  constructor(readonly code: "empty" | "engine-unavailable") {
    super(code);
    this.name = "SpeakerError";
  }
}

export interface SpeakerDeps {
  system: SystemSpeechEngine;
  loadable: () => PiperEngine | null;
  player: PcmPlayer;
  onState(s: SpeakerState): void;
}

export class Speaker {
  private state: SpeakerState = { kind: "idle" };
  private controller: AbortController | null = null;
  private activeEngine: "builtin" | "loadable" | null = null;

  constructor(private readonly deps: SpeakerDeps) {}

  getState(): SpeakerState {
    return this.state;
  }

  isBusy(): boolean {
    return this.state.kind !== "idle";
  }

  private set(s: SpeakerState): void {
    this.state = s;
    this.deps.onState(s);
  }

  /** Startet einen neuen Vorgang; ein laufender wird zuerst gestoppt. Wirft SpeakerError("empty"). */
  async speak(markdown: string, settings: AudioInterfaceSettings, useLoadable: boolean): Promise<void> {
    this.stop();
    const chunks = prepareSpeech(markdown);
    if (chunks.length === 0) throw new SpeakerError("empty");
    const controller = new AbortController();
    this.controller = controller;
    const total = chunks.length;
    try {
      if (useLoadable) {
        const engine = this.deps.loadable();
        if (!engine) throw new SpeakerError("engine-unavailable");
        this.activeEngine = "loadable";
        this.set({ kind: "rendering", done: 0, total });
        const pcm = await engine.synthesize(chunks, { lengthScale: engine.tempo / settings.speakRate }, controller.signal, (done, t) =>
          this.set({ kind: "rendering", done, total: t }),
        );
        if (controller.signal.aborted) return;
        this.set({ kind: "speaking", paused: false, engine: "loadable", done: 0, total });
        await this.deps.player.play(pcm, controller.signal);
      } else {
        this.activeEngine = "builtin";
        this.set({ kind: "speaking", paused: false, engine: "builtin", done: 0, total });
        await this.deps.system.speak(chunks, { voiceUri: settings.speakVoiceUri, rate: settings.speakRate, langPrefix: "de" }, controller.signal, (i) =>
          this.set({ kind: "speaking", paused: false, engine: "builtin", done: i, total }),
        );
      }
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) return;
      throw err;
    } finally {
      if (this.controller === controller) {
        this.controller = null;
        this.activeEngine = null;
        this.set({ kind: "idle" });
      }
    }
  }

  togglePause(): void {
    if (this.state.kind !== "speaking") return;
    const paused = !this.state.paused;
    if (this.activeEngine === "builtin") {
      if (paused) this.deps.system.pause();
      else this.deps.system.resume();
    } else {
      if (paused) this.deps.player.pause();
      else this.deps.player.resume();
    }
    this.set({ ...this.state, paused });
  }

  stop(): void {
    const c = this.controller;
    if (!c) return;
    this.controller = null;
    c.abort();
    this.activeEngine = null;
    this.set({ kind: "idle" });
  }
}
