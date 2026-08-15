import { describe, expect, it } from "vitest";
import type { EngineDescriptor } from "../../src/core/engine-manifest";
import type { WorkerRequest, WorkerResponse } from "../../src/core/worker-protocol";
import type { AssetStore } from "../../src/obsidian/asset-store";
import { PiperEngine, type WorkerLike } from "../../src/obsidian/engines/piper-engine";
import type { ClockPort } from "../../src/vendor/kit-obsidian/clock";

const CONFIG = JSON.stringify({ audio: { sample_rate: 22050 }, espeak: { voice: "de" }, inference: {}, phoneme_id_map: { _: [0], "^": [1], $: [2] } });
const descriptor: EngineDescriptor = { id: "piper", kind: "loadable", label: "P", lang: "de", sampleRate: 22050, licenseSummary: "", assets: [
  { key: "worker", fileName: "w.js", bytes: 1, sha256: "a", license: "" }, { key: "wasm", fileName: "o.wasm", bytes: 1, sha256: "b", license: "" },
  { key: "model", fileName: "m.onnx", bytes: 1, sha256: "c", license: "" }, { key: "modelConfig", fileName: "m.json", bytes: 1, sha256: "d", license: "" } ] };

function fakeStore(opts: { status?: "missing" | "partial" | "complete"; verifyOk?: boolean } = {}) {
  const calls = { verify: 0 };
  const store = {
    status: async () => opts.status ?? "complete",
    verify: async () => { calls.verify++; return opts.verifyOk === false ? { ok: false as const, fileName: "o.wasm", expected: "bbbbbbbbbbbbbbbb", actual: "cccccccccccccccc" } : { ok: true as const }; },
    getText: async (_e: EngineDescriptor, key: string) => (key === "worker" ? "// worker source" : CONFIG),
    getBuffer: async () => new ArrayBuffer(4),
  } as unknown as AssetStore;
  return { store, calls };
}
function fakeClock() {
  const timers = new Map<number, () => void>(); let next = 1;
  const clock: ClockPort = { now: () => 0, setTimeout: (fn) => { const id = next++; timers.set(id, fn); return id; }, clearTimeout: (id) => { timers.delete(id); } };
  return { clock, fireAll: () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } }, pending: () => timers.size };
}
function fakeWorkerFactory() {
  const workers: (WorkerLike & { sent: WorkerRequest[]; terminated: boolean; emit: (m: WorkerResponse) => void; source: string })[] = [];
  const make = (source: string) => {
    const w = { source, sent: [] as WorkerRequest[], terminated: false, onmessage: null as WorkerLike["onmessage"], onerror: null as WorkerLike["onerror"],
      postMessage(m: WorkerRequest) { this.sent.push(m); }, terminate() { this.terminated = true; }, emit(m: WorkerResponse) { this.onmessage?.({ data: m }); } };
    workers.push(w); return w;
  };
  return { make, workers };
}
const chunks = [{ text: "Hallo.", pauseAfterMs: 0 }];
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe("PiperEngine", () => {
  it("readiness: off → needs-download → ready → loading/ready mit Worker", async () => {
    const st = fakeStore({ status: "missing" }); const f = fakeWorkerFactory(); const c = fakeClock();
    const e = new PiperEngine({ store: st.store, descriptor, makeWorker: f.make, clock: c.clock });
    expect(await e.readiness()).toBe("off");
    e.setEnabled(true);
    expect(await e.readiness()).toBe("needs-download");
    const st2 = fakeStore({ status: "complete" });
    const e2 = new PiperEngine({ store: st2.store, descriptor, makeWorker: f.make, clock: c.clock }); e2.setEnabled(true);
    expect(await e2.readiness()).toBe("ready");
  });
  it("erster synthesize: verify, init mit Puffern+Config, dann synthesize; progress und result durchgereicht", async () => {
    const st = fakeStore(); const f = fakeWorkerFactory(); const c = fakeClock();
    const e = new PiperEngine({ store: st.store, descriptor, makeWorker: f.make, clock: c.clock }); e.setEnabled(true);
    const progress: [number, number][] = [];
    const p = e.synthesize(chunks, { lengthScale: 1 }, new AbortController().signal, (d, t) => progress.push([d, t]));
    await flush();
    expect(st.calls.verify).toBe(1);
    expect(f.workers.length).toBe(1);
    const w = f.workers[0];
    expect(w.source).toBe("// worker source");
    expect(w.sent[0].type).toBe("init");
    expect(await e.readiness()).toBe("loading");
    w.emit({ type: "ready" }); await flush();
    expect(w.sent[1]).toMatchObject({ type: "synthesize", id: 1, chunks, lengthScale: 1 });
    w.emit({ type: "progress", id: 1, done: 1, total: 1 });
    w.emit({ type: "result", id: 1, samples: new Float32Array([0.5]), sampleRate: 22050 });
    const pcm = await p;
    expect(pcm.sampleRate).toBe(22050); expect(Array.from(pcm.samples)).toEqual([0.5]); expect(progress).toEqual([[1, 1]]);
    expect(await e.readiness()).toBe("ready");
    // zweiter Aufruf nutzt denselben Worker ohne neues init
    const p2 = e.synthesize(chunks, { lengthScale: 0.8 }, new AbortController().signal, () => {}); await flush();
    expect(f.workers.length).toBe(1); expect(w.sent[2]).toMatchObject({ type: "synthesize", id: 2, lengthScale: 0.8 });
    w.emit({ type: "result", id: 2, samples: new Float32Array(2), sampleRate: 22050 }); await p2;
  });
  it("Worker-Fehler ohne id → unavailable mit lastError; dispose setzt zurück", async () => {
    const st = fakeStore(); const f = fakeWorkerFactory(); const c = fakeClock();
    const e = new PiperEngine({ store: st.store, descriptor, makeWorker: f.make, clock: c.clock }); e.setEnabled(true);
    const p = e.synthesize(chunks, { lengthScale: 1 }, new AbortController().signal, () => {}); await flush();
    f.workers[0].emit({ type: "error", id: null, message: "wasm boom" });
    await expect(p).rejects.toThrow(/wasm boom/);
    expect(await e.readiness()).toBe("unavailable"); expect(e.lastError()).toBe("wasm boom"); expect(f.workers[0].terminated).toBe(true);
    e.dispose(); expect(await e.readiness()).toBe("ready");
  });
  it("Job-Fehler mit id verwirft nur den Job, Engine bleibt bereit", async () => {
    const st = fakeStore(); const f = fakeWorkerFactory(); const c = fakeClock();
    const e = new PiperEngine({ store: st.store, descriptor, makeWorker: f.make, clock: c.clock }); e.setEnabled(true);
    const p = e.synthesize(chunks, { lengthScale: 1 }, new AbortController().signal, () => {}); await flush();
    f.workers[0].emit({ type: "ready" }); await flush();
    f.workers[0].emit({ type: "error", id: 1, message: "phonemize failed" });
    await expect(p).rejects.toThrow(/phonemize/);
    expect(await e.readiness()).toBe("ready"); expect(f.workers[0].terminated).toBe(false);
  });
  it("abort terminiert den Worker und verwirft mit AbortError", async () => {
    const st = fakeStore(); const f = fakeWorkerFactory(); const c = fakeClock(); const ctrl = new AbortController();
    const e = new PiperEngine({ store: st.store, descriptor, makeWorker: f.make, clock: c.clock }); e.setEnabled(true);
    const p = e.synthesize(chunks, { lengthScale: 1 }, ctrl.signal, () => {}); await flush();
    f.workers[0].emit({ type: "ready" }); await flush();
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(f.workers[0].terminated).toBe(true);
    expect(await e.readiness()).toBe("ready");
  });
  it("verify-Mismatch → kein Worker, unavailable mit Datei im Fehlertext", async () => {
    const st = fakeStore({ verifyOk: false }); const f = fakeWorkerFactory(); const c = fakeClock();
    const e = new PiperEngine({ store: st.store, descriptor, makeWorker: f.make, clock: c.clock }); e.setEnabled(true);
    await expect(e.synthesize(chunks, { lengthScale: 1 }, new AbortController().signal, () => {})).rejects.toThrow(/checksum mismatch: o.wasm/);
    expect(f.workers.length).toBe(0); expect(await e.readiness()).toBe("unavailable");
  });
  it("Init-Timeout → unavailable", async () => {
    const st = fakeStore(); const f = fakeWorkerFactory(); const c = fakeClock();
    const e = new PiperEngine({ store: st.store, descriptor, makeWorker: f.make, clock: c.clock, initTimeoutMs: 100 }); e.setEnabled(true);
    const p = e.synthesize(chunks, { lengthScale: 1 }, new AbortController().signal, () => {}); await flush();
    c.fireAll();
    await expect(p).rejects.toThrow(/timeout/);
    expect(await e.readiness()).toBe("unavailable"); expect(f.workers[0].terminated).toBe(true);
  });
  it("Idle-Timer terminiert den Worker; setEnabled(false) ebenso und meldet off", async () => {
    const st = fakeStore(); const f = fakeWorkerFactory(); const c = fakeClock();
    const e = new PiperEngine({ store: st.store, descriptor, makeWorker: f.make, clock: c.clock, idleDisposeMs: 10 }); e.setEnabled(true);
    const p = e.synthesize(chunks, { lengthScale: 1 }, new AbortController().signal, () => {}); await flush();
    f.workers[0].emit({ type: "ready" }); await flush();
    f.workers[0].emit({ type: "result", id: 1, samples: new Float32Array(1), sampleRate: 22050 }); await p;
    expect(c.pending()).toBe(1); c.fireAll();
    expect(f.workers[0].terminated).toBe(true); expect(await e.readiness()).toBe("ready");
    e.setEnabled(false); expect(await e.readiness()).toBe("off");
  });
});
