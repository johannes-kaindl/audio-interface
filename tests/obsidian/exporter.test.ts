import { describe, expect, it } from "vitest";
import type { PcmBuffer } from "../../src/core/audio";
import { IDLE, type RunState } from "../../src/core/run-state";
import { DEFAULT_SETTINGS, type AudioInterfaceSettings } from "../../src/core/settings-types";
import type { PiperEngine } from "../../src/obsidian/engines/piper-engine";
import { runExport, type VaultPort } from "../../src/obsidian/exporter";

const sine = (sr: number, sec: number) => Float32Array.from({ length: Math.round(sr * sec) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr));

function fakeEngine(opts: { fail?: string; hangUntilAbort?: boolean } = {}) {
  const seen: { lengthScale?: number }[] = [];
  const engine = {
    tempo: 0.85,
    seen,
    synthesize: (chunks: { text: string }[], o: { lengthScale: number }, signal: AbortSignal, onProgress: (d: number, t: number) => void): Promise<PcmBuffer> =>
      new Promise((resolve, reject) => {
        seen.push(o);
        if (opts.fail) { reject(new Error(opts.fail)); return; }
        onProgress(1, chunks.length);
        if (opts.hangUntilAbort) { signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); return; }
        resolve({ samples: sine(22050, 1), sampleRate: 22050 });
      }),
  } as unknown as PiperEngine & { seen: { lengthScale?: number }[] };
  return engine;
}
function fakeVault(existing: string[] = [], folders: string[] = []) {
  const files = new Map<string, Uint8Array>(); const created: string[] = []; const folderSet = new Set(folders);
  for (const e of existing) files.set(e, new Uint8Array(0));
  const vault: VaultPort = {
    exists: (p) => files.has(p), folderExists: (p) => folderSet.has(p),
    createFolder: async (p) => { created.push(p); folderSet.add(p); },
    createBinary: async (p, d) => { files.set(p, d); },
  };
  return { vault, files, created };
}
const input = { markdown: "# Ansage\n\nGuten Tag.", noteBasename: "Mailbox", noteFolder: "Arbeit", today: "2026-08-15" };
const wavRate = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset).getUint32(24, true);
const run = (settings: Partial<AudioInterfaceSettings>, engine = fakeEngine(), v = fakeVault(), signal = new AbortController().signal) => {
  const states: RunState[] = [];
  const p = runExport(input, { engine, vault: v.vault, settings: { ...DEFAULT_SETTINGS, exportEnabled: true, ...settings }, onState: (s) => states.push(s) }, signal);
  return { p, states, v };
};

describe("runExport", () => {
  it("Zustandsfolge preparing→synthesizing→encoding→writing→done, Datei neben der Notiz, 8 kHz, Werks-Tempo der Engine", async () => {
    const engine = fakeEngine();
    const { p, states, v } = run({}, engine);
    const r = await p;
    expect(engine.seen[0]).toEqual({ lengthScale: 0.85 });
    expect(states.map((s) => (s.kind === "running" ? s.phase : s.kind))).toEqual(["preparing", "synthesizing", "synthesizing", "encoding", "writing", "done"]);
    expect(r.path).toBe("Arbeit/Mailbox.wav"); expect(r.sampleRate).toBe(8000); expect(r.seconds).toBeCloseTo(1, 1);
    expect(wavRate(v.files.get("Arbeit/Mailbox.wav")!)).toBe(8000);
    expect(states[states.length - 1]).toEqual({ kind: "done", detail: "Arbeit/Mailbox.wav" });
  });
  it("Profil native behält 22050 Hz; Exportordner wird angelegt; Muster mit Datum", async () => {
    const { p, v } = run({ exportProfile: "native", exportFolder: "Audio/Out", exportFilePattern: "{{date}} {{note}}" });
    const r = await p;
    expect(r.path).toBe("Audio/Out/2026-08-15 Mailbox.wav"); expect(v.created).toEqual(["Audio/Out"]);
    expect(wavRate(v.files.get(r.path)!)).toBe(22050);
  });
  it("Kollision → Suffix -2", async () => {
    const { p } = run({}, fakeEngine(), fakeVault(["Arbeit/Mailbox.wav"]));
    expect((await p).path).toBe("Arbeit/Mailbox-2.wav");
  });
  it("leerer Text → failed(empty), nichts geschrieben", async () => {
    const states: RunState[] = []; const v = fakeVault();
    await expect(runExport({ ...input, markdown: "---\nx: 1\n---\n" }, { engine: fakeEngine(), vault: v.vault, settings: DEFAULT_SETTINGS, onState: (s) => states.push(s) }, new AbortController().signal)).rejects.toMatchObject({ code: "empty" });
    expect(states[states.length - 1]).toEqual({ kind: "failed", message: "empty" }); expect(v.files.size).toBe(0);
  });
  it("Engine-Fehler → failed mit Meldung", async () => {
    const { p, states } = run({}, fakeEngine({ fail: "wasm boom" }));
    await expect(p).rejects.toMatchObject({ code: "engine" });
    expect(states[states.length - 1]).toEqual({ kind: "failed", message: "wasm boom" });
  });
  it("Abbruch während synthesizing → aborted, kein createBinary, kein späterer Fehler überschreibt", async () => {
    const ctrl = new AbortController(); const v = fakeVault();
    const { p, states } = run({}, fakeEngine({ hangUntilAbort: true }), v, ctrl.signal);
    await Promise.resolve(); ctrl.abort();
    await expect(p).rejects.toMatchObject({ code: "aborted" });
    expect(states[states.length - 1]).toEqual({ kind: "aborted" }); expect(v.files.size).toBe(0);
    expect(states.filter((s) => s.kind === "failed").length).toBe(0);
    expect(IDLE.kind).toBe("idle");
  });
});
