import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { EngineDescriptor } from "../../src/core/engine-manifest";
import { AssetStore, type CacheLike, type StoreDeps } from "../../src/obsidian/asset-store";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const bytes = (n: number, seed = 1): Uint8Array<ArrayBuffer> => { const u = new Uint8Array(new ArrayBuffer(n)); for (let i = 0; i < n; i++) u[i] = (i * seed + 7) % 251; return u; };

function makeEngine(files: Record<string, Uint8Array<ArrayBuffer>>): EngineDescriptor {
  return {
    id: "e", kind: "loadable", label: "E", lang: "de", sampleRate: 22050, licenseSummary: "",
    assets: [
      { key: "worker", fileName: "w.js", bytes: files["w.js"].length, sha256: sha(files["w.js"]), license: "" },
      { key: "wasm", fileName: "o.wasm", bytes: files["o.wasm"].length, sha256: sha(files["o.wasm"]), license: "" },
      { key: "model", fileName: "m.onnx", bytes: files["m.onnx"].length, sha256: sha(files["m.onnx"]), license: "" },
      { key: "modelConfig", fileName: "m.json", bytes: files["m.json"].length, sha256: sha(files["m.json"]), license: "" },
    ],
  };
}

function memCache(): CacheLike & { store: Map<string, Uint8Array<ArrayBuffer>> } {
  const store = new Map<string, Uint8Array<ArrayBuffer>>();
  return {
    store,
    async match(url) { const b = store.get(url); return b ? new Response(b) : undefined; },
    async put(url, res) { store.set(url, new Uint8Array(await res.arrayBuffer()) as Uint8Array<ArrayBuffer>); },
    async delete(url) { return store.delete(url); },
  };
}

function streamOf(data: Uint8Array<ArrayBuffer>, chunk = 7, opts: { signal?: AbortSignal; stopAfter?: number } = {}): ReadableStream<Uint8Array> {
  let pos = 0;
  return new ReadableStream({
    pull(controller) {
      if (opts.signal?.aborted) { controller.error(new DOMException("aborted", "AbortError")); return; }
      if (opts.stopAfter !== undefined && pos >= opts.stopAfter) { controller.close(); return; }
      if (pos >= data.length) { controller.close(); return; }
      controller.enqueue(data.subarray(pos, Math.min(data.length, pos + chunk)));
      pos += chunk;
    },
  });
}

function makeDeps(files: Record<string, Uint8Array<ArrayBuffer>>, cache: CacheLike, opts: { fail?: string; short?: string; abortAt?: { name: string; ctrl: AbortController; afterBytes: number } } = {}): StoreDeps {
  return {
    openCache: async () => cache,
    fetchFn: async (url, init) => {
      const name = url.split("/").pop()!;
      if (opts.fail === name) return new Response(null, { status: 404 });
      const data = files[name];
      if (opts.short === name) return new Response(streamOf(data, 7, { stopAfter: 10 }), { headers: { "content-length": String(data.length) } });
      if (opts.abortAt?.name === name) {
        const { ctrl, afterBytes } = opts.abortAt;
        let sent = 0;
        const s = new ReadableStream<Uint8Array<ArrayBuffer>>({ pull(c) { if (sent >= afterBytes) { ctrl.abort(); } if (sent >= data.length) { c.close(); return; } c.enqueue(data.subarray(sent, sent + 5)); sent += 5; } });
        return new Response(s, { headers: { "content-length": String(data.length) } });
      }
      return new Response(streamOf(data, 7, { signal: init?.signal }), { headers: { "content-length": String(data.length) } });
    },
    digest: async (buf) => sha(new Uint8Array(buf)),
    assetVersion: "0.1.0",
    baseUrl: "https://x/releases/download",
  };
}

const FILES = { "w.js": bytes(50, 1), "o.wasm": bytes(120, 3), "m.onnx": bytes(300, 5), "m.json": bytes(20, 9) };

describe("AssetStore", () => {
  it("status: missing → partial → complete", async () => {
    const cache = memCache(); const engine = makeEngine(FILES); const store = new AssetStore(makeDeps(FILES, cache));
    expect(await store.status(engine)).toBe("missing");
    cache.store.set("https://x/releases/download/0.1.0/w.js", FILES["w.js"]);
    expect(await store.status(engine)).toBe("partial");
    await store.download(engine, () => {}, new AbortController().signal);
    expect(await store.status(engine)).toBe("complete");
  });
  it("download lädt nur fehlende Dateien, Fortschritt monoton bis Gesamtgröße", async () => {
    const cache = memCache(); const engine = makeEngine(FILES);
    cache.store.set("https://x/releases/download/0.1.0/w.js", FILES["w.js"]);
    const store = new AssetStore(makeDeps(FILES, cache));
    const seen: number[] = []; const names = new Set<string>();
    await store.download(engine, (p) => { seen.push(p.overallReceived); names.add(p.fileName); expect(p.overallTotal).toBe(440); }, new AbortController().signal);
    expect(names.has("w.js")).toBe(false);
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1])).toBe(true);
    expect(seen[seen.length - 1]).toBe(440);
    expect(cache.store.get("https://x/releases/download/0.1.0/m.onnx")).toEqual(FILES["m.onnx"]);
  });
  it("HTTP 404 → wirft, nichts von dieser Datei im Cache", async () => {
    const cache = memCache(); const engine = makeEngine(FILES); const store = new AssetStore(makeDeps(FILES, cache, { fail: "o.wasm" }));
    await expect(store.download(engine, () => {}, new AbortController().signal)).rejects.toThrow(/HTTP 404/);
    expect(cache.store.has("https://x/releases/download/0.1.0/w.js")).toBe(true);
    expect(cache.store.has("https://x/releases/download/0.1.0/o.wasm")).toBe(false);
  });
  it("Content-Length ≠ empfangen → Datei gelöscht, wirft", async () => {
    const cache = memCache(); const engine = makeEngine(FILES); const store = new AssetStore(makeDeps(FILES, cache, { short: "m.onnx" }));
    await expect(store.download(engine, () => {}, new AbortController().signal)).rejects.toThrow(/incomplete/);
    expect(cache.store.has("https://x/releases/download/0.1.0/m.onnx")).toBe(false);
  });
  it("Abbruch mitten im Stream → AbortError, fertige Dateien bleiben, angefangene weg", async () => {
    const cache = memCache(); const engine = makeEngine(FILES); const ctrl = new AbortController();
    const store = new AssetStore(makeDeps(FILES, cache, { abortAt: { name: "m.onnx", ctrl, afterBytes: 40 } }));
    await expect(store.download(engine, () => {}, ctrl.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(cache.store.has("https://x/releases/download/0.1.0/w.js")).toBe(true);
    expect(cache.store.has("https://x/releases/download/0.1.0/o.wasm")).toBe(true);
    expect(cache.store.has("https://x/releases/download/0.1.0/m.onnx")).toBe(false);
    expect(cache.store.has("https://x/releases/download/0.1.0/m.json")).toBe(false);
  });
  it("verify erkennt manipulierte Bytes und nennt Datei + Summen", async () => {
    const cache = memCache(); const engine = makeEngine(FILES); const store = new AssetStore(makeDeps(FILES, cache));
    await store.download(engine, () => {}, new AbortController().signal);
    expect(await store.verify(engine)).toEqual({ ok: true });
    cache.store.set("https://x/releases/download/0.1.0/o.wasm", bytes(120, 4));
    const r = await store.verify(engine);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.fileName).toBe("o.wasm"); expect(r.expected).toBe(sha(FILES["o.wasm"])); expect(r.actual).toBe(sha(bytes(120, 4))); }
  });
  it("getBuffer/getText und remove", async () => {
    const cache = memCache(); const engine = makeEngine(FILES); const store = new AssetStore(makeDeps(FILES, cache));
    await expect(store.getBuffer(engine, "model")).rejects.toThrow(/not downloaded/);
    await store.download(engine, () => {}, new AbortController().signal);
    expect(new Uint8Array(await store.getBuffer(engine, "model"))).toEqual(FILES["m.onnx"]);
    expect(await store.getText(engine, "modelConfig")).toBe(new TextDecoder().decode(FILES["m.json"]));
    await store.remove(engine);
    expect(cache.store.size).toBe(0);
    expect(await store.status(engine)).toBe("missing");
  });
});
