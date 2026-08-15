import { describe, expect, it } from "vitest";
import type { PcmBuffer } from "../../src/core/audio";
import { DEFAULT_SETTINGS } from "../../src/core/settings-types";
import type { PiperEngine } from "../../src/obsidian/engines/piper-engine";
import type { SystemSpeechEngine } from "../../src/obsidian/engines/system-speech";
import { Speaker, type PcmPlayer, type SpeakerState } from "../../src/obsidian/speaker";

function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function setup(opts: { loadable?: boolean } = {}) {
  const states: SpeakerState[] = [];
  const sys = { calls: [] as unknown[], pause: 0, resume: 0, def: deferred<void>() };
  const system = {
    speak: (chunks: unknown, o: unknown, signal: AbortSignal, onChunk?: (i: number) => void) => { sys.calls.push({ chunks, o }); onChunk?.(0); signal.addEventListener("abort", () => sys.def.reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); return sys.def.promise; },
    pause: () => { sys.pause++; }, resume: () => { sys.resume++; },
  } as unknown as SystemSpeechEngine;
  const eng = { def: deferred<PcmBuffer>(), calls: [] as unknown[] };
  const loadable = { synthesize: (chunks: unknown, o: unknown, signal: AbortSignal, onProgress: (d: number, t: number) => void) => { eng.calls.push({ chunks, o }); onProgress(1, 2); signal.addEventListener("abort", () => eng.def.reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); return eng.def.promise; } } as unknown as PiperEngine;
  const pl = { def: deferred<void>(), played: [] as PcmBuffer[], pause: 0, resume: 0 };
  const player: PcmPlayer = { play: (pcm, signal) => { pl.played.push(pcm); signal.addEventListener("abort", () => pl.def.reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); return pl.def.promise; }, pause: () => { pl.pause++; }, resume: () => { pl.resume++; } };
  const speaker = new Speaker({ system, loadable: () => (opts.loadable === false ? null : loadable), player, onState: (s) => states.push(s) });
  return { speaker, states, sys, eng, pl };
}

describe("Speaker", () => {
  it("leerer Text wirft SpeakerError(empty)", async () => {
    const { speaker } = setup();
    await expect(speaker.speak("---\na: 1\n---\n", DEFAULT_SETTINGS, false)).rejects.toMatchObject({ code: "empty" });
  });
  it("builtin: speaking-Zustände, Ende → idle", async () => {
    const { speaker, states, sys } = setup();
    const p = speaker.speak("Hallo Welt.", { ...DEFAULT_SETTINGS, speakRate: 1.2 }, false); await flush();
    expect(sys.calls.length).toBe(1);
    expect(states[0]).toMatchObject({ kind: "speaking", engine: "builtin", total: 1 });
    expect(speaker.isBusy()).toBe(true);
    sys.def.resolve(); await p;
    expect(states[states.length - 1]).toEqual({ kind: "idle" });
  });
  it("loadable: rendering → speaking über Player; lengthScale = 1/rate", async () => {
    const { speaker, states, eng, pl } = setup();
    const p = speaker.speak("Hallo Welt.", { ...DEFAULT_SETTINGS, speakRate: 2 }, true); await flush();
    expect(eng.calls[0]).toMatchObject({ o: { lengthScale: 0.5 } });
    expect(states.some((s) => s.kind === "rendering" && s.done === 1)).toBe(true);
    eng.def.resolve({ samples: new Float32Array(10), sampleRate: 22050 }); await flush();
    expect(pl.played.length).toBe(1);
    expect(states[states.length - 1]).toMatchObject({ kind: "speaking", engine: "loadable" });
    pl.def.resolve(); await p;
    expect(speaker.getState()).toEqual({ kind: "idle" });
  });
  it("loadable ohne Engine → SpeakerError(engine-unavailable)", async () => {
    const { speaker } = setup({ loadable: false });
    await expect(speaker.speak("Hallo.", DEFAULT_SETTINGS, true)).rejects.toMatchObject({ code: "engine-unavailable" });
    expect(speaker.getState()).toEqual({ kind: "idle" });
  });
  it("stop bricht ab, löst speak() ohne Fehler auf, Zustand idle", async () => {
    const { speaker, sys } = setup();
    const p = speaker.speak("Hallo.", DEFAULT_SETTINGS, false); await flush();
    speaker.stop();
    await p;
    expect(speaker.getState()).toEqual({ kind: "idle" });
    expect(sys.calls.length).toBe(1);
  });
  it("togglePause delegiert je Engine und spiegelt paused", async () => {
    const { speaker, sys, pl, eng } = setup();
    const p = speaker.speak("Hallo.", DEFAULT_SETTINGS, false); await flush();
    speaker.togglePause(); expect(sys.pause).toBe(1); expect(speaker.getState()).toMatchObject({ kind: "speaking", paused: true });
    speaker.togglePause(); expect(sys.resume).toBe(1);
    sys.def.resolve(); await p;
    const p2 = speaker.speak("Hallo.", DEFAULT_SETTINGS, true); await flush();
    eng.def.resolve({ samples: new Float32Array(1), sampleRate: 22050 }); await flush();
    speaker.togglePause(); expect(pl.pause).toBe(1);
    pl.def.resolve(); await p2;
  });
  it("neuer speak() stoppt den laufenden zuerst", async () => {
    const { speaker, sys } = setup();
    const p1 = speaker.speak("Eins.", DEFAULT_SETTINGS, false); await flush();
    const p2 = speaker.speak("Zwei.", DEFAULT_SETTINGS, false); await flush();
    await p1;
    expect(sys.calls.length).toBe(2);
    speaker.stop(); await p2;
  });
});
