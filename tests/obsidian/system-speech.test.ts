import { describe, expect, it } from "vitest";
import { SystemSpeechEngine, type SynthLike } from "../../src/obsidian/engines/system-speech";
import type { ClockPort } from "../../src/vendor/kit-obsidian/clock";

type Utt = { text: string; voice: SpeechSynthesisVoice | null; rate: number; lang: string; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

function fakeClock() {
  const timers = new Map<number, () => void>(); let next = 1;
  const clock: ClockPort = { now: () => 0, setTimeout: (fn, _ms) => { const id = next++; timers.set(id, fn); return id; }, clearTimeout: (id) => { timers.delete(id); } };
  return { clock, fire: () => { const [id, fn] = timers.entries().next().value as [number, () => void]; timers.delete(id); fn(); }, pending: () => timers.size };
}

function fakeSynth(voices: { voiceURI: string; name: string; lang: string; localService: boolean }[]) {
  const spoken: Utt[] = []; const listeners = new Set<() => void>(); let list = voices;
  const calls = { cancel: 0, pause: 0, resume: 0 };
  const synth: SynthLike = {
    getVoices: () => list as unknown as SpeechSynthesisVoice[],
    speak: (u) => spoken.push(u as unknown as Utt),
    cancel: () => { calls.cancel++; },
    pause: () => { calls.pause++; },
    resume: () => { calls.resume++; },
    addEventListener: (_t, l) => { listeners.add(l); },
    removeEventListener: (_t, l) => { listeners.delete(l); },
  };
  return { synth, spoken, calls, setVoices: (v: typeof voices) => { list = v; listeners.forEach((l) => l()); } };
}
const makeUtterance = (text: string) => ({ text, voice: null, rate: 1, lang: "", onend: null, onerror: null }) as unknown as SpeechSynthesisUtterance;
const DE = { voiceURI: "de1", name: "Anna", lang: "de-DE", localService: true };
const EN = { voiceURI: "en1", name: "Sam", lang: "en-US", localService: true };

describe("SystemSpeechEngine", () => {
  it("waitForVoices wartet auf voiceschanged, sonst Timeout", async () => {
    const s = fakeSynth([]); const c = fakeClock(); const e = new SystemSpeechEngine(s.synth, makeUtterance, c.clock);
    const p = e.waitForVoices(2000);
    s.setVoices([DE]);
    expect((await p).map((v) => v.uri)).toEqual(["de1"]);
    const s2 = fakeSynth([]); const c2 = fakeClock(); const e2 = new SystemSpeechEngine(s2.synth, makeUtterance, c2.clock);
    const p2 = e2.waitForVoices(2000); c2.fire();
    expect(await p2).toEqual([]);
  });
  it("listVoices filtert nach Sprache; defaultVoiceUri bevorzugt de", () => {
    const s = fakeSynth([EN, DE]); const e = new SystemSpeechEngine(s.synth, makeUtterance, fakeClock().clock);
    expect(e.listVoices("de").map((v) => v.name)).toEqual(["Anna"]);
    expect(e.defaultVoiceUri("de")).toBe("de1");
    expect(e.defaultVoiceUri("fr")).toBe("en1");
  });
  it("speak reiht Chunks nacheinander, setzt Stimme/Tempo, Pausen über den Clock", async () => {
    const s = fakeSynth([EN, DE]); const c = fakeClock(); const e = new SystemSpeechEngine(s.synth, makeUtterance, c.clock);
    const order: number[] = [];
    const p = e.speak([{ text: "Eins.", pauseAfterMs: 250 }, { text: "Zwei.", pauseAfterMs: 600 }], { voiceUri: "", rate: 1.5 }, new AbortController().signal, (i) => order.push(i));
    await Promise.resolve();
    expect(s.spoken.length).toBe(1);
    expect(s.spoken[0].voice).toEqual(DE); expect(s.spoken[0].rate).toBe(1.5); expect(s.spoken[0].lang).toBe("de-DE");
    s.spoken[0].onend!(); await Promise.resolve(); await Promise.resolve();
    expect(c.pending()).toBe(1); expect(s.spoken.length).toBe(1);
    c.fire(); await Promise.resolve(); await Promise.resolve();
    expect(s.spoken.length).toBe(2);
    s.spoken[1].onend!();
    await p;
    expect(order).toEqual([0, 1]);
    expect(c.pending()).toBe(0);
  });
  it("abort ruft cancel() und verwirft mit AbortError", async () => {
    const s = fakeSynth([DE]); const c = fakeClock(); const e = new SystemSpeechEngine(s.synth, makeUtterance, c.clock); const ctrl = new AbortController();
    const p = e.speak([{ text: "Eins.", pauseAfterMs: 0 }], { voiceUri: "de1", rate: 1 }, ctrl.signal);
    await Promise.resolve();
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(s.calls.cancel).toBe(1);
  });
  it("Utterance-Fehler wird durchgereicht, interrupted gilt als Abbruch", async () => {
    const s = fakeSynth([DE]); const e = new SystemSpeechEngine(s.synth, makeUtterance, fakeClock().clock);
    const p = e.speak([{ text: "x", pauseAfterMs: 0 }], { voiceUri: "de1", rate: 1 }, new AbortController().signal);
    await Promise.resolve(); s.spoken[0].onerror!({ error: "synthesis-failed" });
    await expect(p).rejects.toThrow(/synthesis-failed/);
    const s2 = fakeSynth([DE]); const e2 = new SystemSpeechEngine(s2.synth, makeUtterance, fakeClock().clock);
    const p2 = e2.speak([{ text: "x", pauseAfterMs: 0 }], { voiceUri: "de1", rate: 1 }, new AbortController().signal);
    await Promise.resolve(); s2.spoken[0].onerror!({ error: "interrupted" });
    await expect(p2).rejects.toMatchObject({ name: "AbortError" });
  });
  it("pause/resume delegieren", () => {
    const s = fakeSynth([DE]); const e = new SystemSpeechEngine(s.synth, makeUtterance, fakeClock().clock);
    e.pause(); e.resume(); expect(s.calls).toMatchObject({ pause: 1, resume: 1 });
  });
});
