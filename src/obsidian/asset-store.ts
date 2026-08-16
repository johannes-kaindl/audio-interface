// uebernommen (Muster) aus local-image-generator/src/obsidian/model-store.ts (Stand vor 05b3c20), 2026-08-15
// Asset-Ablage über die Cache API: liegt im Electron-Profil AUSSERHALB des Vaults (nie gesynct),
// überlebt Neustarts, Datei-Granularität beim Retry. Neu gegenüber der Vorlage: SHA-256-Prüfung
// gegen das eingebettete Manifest und Abbruch per AbortSignal. Deps injizierbar → Node-testbar.
import { assetUrl, type AssetFile, type AssetKey, type EngineDescriptor } from "../core/engine-manifest";

export const ASSET_CACHE_NAME = "audio-interface-engines";

export interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, res: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
}

export interface StoreDeps {
  openCache(): Promise<CacheLike>;
  fetchFn(url: string, init?: { signal?: AbortSignal }): Promise<Response>;
  /** Hex-SHA-256. */
  digest(buf: ArrayBuffer): Promise<string>;
  assetVersion: string;
  baseUrl: string;
}

export type AssetStatus = "missing" | "partial" | "complete";

export interface DownloadProgress {
  fileIndex: number;
  totalFiles: number;
  fileName: string;
  receivedBytes: number;
  totalBytes: number;
  overallReceived: number;
  overallTotal: number;
}

export type VerifyResult = { ok: true } | { ok: false; fileName: string; expected: string; actual: string };

export function abortError(): Error {
  return new DOMException("aborted", "AbortError");
}

export class AssetStore {
  constructor(private readonly deps: StoreDeps) {}

  /** Bezugs-URL (woher geladen wird). */
  private urlFor(file: AssetFile): string {
    return assetUrl(this.deps.baseUrl, this.deps.assetVersion, file);
  }

  /** Cache-Schlüssel — bewusst OHNE Bezugs-URL: Version + Datei. Ein anderer Bezugsweg (Mirror,
   *  lokaler Server im Smoke) darf den Bestand nicht unsichtbar machen; die Prüfsumme bindet die
   *  Bytes an das Manifest, nicht die Herkunft. Cache API verlangt eine http(s)-URL als Schlüssel. */
  private keyFor(file: AssetFile): string {
    return `https://audio-interface.invalid/${this.deps.assetVersion}/${file.fileName}`;
  }

  private fileFor(engine: EngineDescriptor, key: AssetKey): AssetFile {
    const f = engine.assets.find((a) => a.key === key);
    if (!f) throw new Error(`unknown asset key: ${key}`);
    return f;
  }

  async cachedFiles(engine: EngineDescriptor): Promise<AssetFile[]> {
    const cache = await this.deps.openCache();
    const out: AssetFile[] = [];
    for (const f of engine.assets) if (await cache.match(this.keyFor(f))) out.push(f);
    return out;
  }

  async status(engine: EngineDescriptor): Promise<AssetStatus> {
    const n = (await this.cachedFiles(engine)).length;
    if (n === 0) return "missing";
    return n === engine.assets.length ? "complete" : "partial";
  }

  /** Lädt nur fehlende Dateien. Abbruch: fertige Dateien bleiben, die angefangene wird verworfen. */
  async download(engine: EngineDescriptor, onProgress: (p: DownloadProgress) => void, signal: AbortSignal): Promise<void> {
    const cache = await this.deps.openCache();
    const cached = new Set((await this.cachedFiles(engine)).map((f) => f.key));
    const todo = engine.assets.filter((f) => !cached.has(f.key));
    const overallTotal = todo.reduce((n, f) => n + f.bytes, 0);
    let overallReceived = 0;
    for (let i = 0; i < todo.length; i++) {
      const file = todo[i];
      const url = this.urlFor(file);
      const key = this.keyFor(file);
      if (signal.aborted) throw abortError();
      const res = await this.deps.fetchFn(url, { signal });
      if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status} for ${file.fileName}`);
      const lengthHeader = res.headers.get("content-length");
      const expected = lengthHeader === null ? null : Number(lengthHeader);
      const totalBytes = expected ?? file.bytes;
      const [progressBranch, cacheBranch] = res.body.tee();
      const putDone = cache.put(key, new Response(cacheBranch, { headers: res.headers }));
      // No-op-Catch: putDone läuft NEBEN der Leseschleife; scheitert der Stream, gäbe es sonst eine
      // unhandledrejection, bevor unten `await putDone` das echte Ergebnis sieht.
      putDone.catch(() => {});
      let received = 0;
      const reader = progressBranch.getReader();
      try {
        for (;;) {
          if (signal.aborted) {
            await reader.cancel();
            throw abortError();
          }
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          overallReceived += value.byteLength;
          onProgress({ fileIndex: i + 1, totalFiles: todo.length, fileName: file.fileName, receivedBytes: received, totalBytes, overallReceived, overallTotal });
        }
        await putDone;
      } catch (err) {
        await putDone.catch(() => {});
        await cache.delete(key);
        throw err;
      }
      if (expected !== null && received !== expected) {
        await cache.delete(key);
        throw new Error(`download incomplete for ${file.fileName} (${received}/${expected} bytes)`);
      }
    }
  }

  async verify(engine: EngineDescriptor): Promise<VerifyResult> {
    for (const f of engine.assets) {
      const buf = await this.getBuffer(engine, f.key);
      const actual = await this.deps.digest(buf);
      if (actual !== f.sha256) return { ok: false, fileName: f.fileName, expected: f.sha256, actual };
    }
    return { ok: true };
  }

  private async matchOrThrow(engine: EngineDescriptor, key: AssetKey): Promise<Response> {
    const cache = await this.deps.openCache();
    const res = await cache.match(this.keyFor(this.fileFor(engine, key)));
    if (!res) throw new Error(`asset not downloaded: ${key}`);
    return res;
  }

  async getBuffer(engine: EngineDescriptor, key: AssetKey): Promise<ArrayBuffer> {
    return (await this.matchOrThrow(engine, key)).arrayBuffer();
  }

  async getText(engine: EngineDescriptor, key: AssetKey): Promise<string> {
    return (await this.matchOrThrow(engine, key)).text();
  }

  async remove(engine: EngineDescriptor): Promise<void> {
    const cache = await this.deps.openCache();
    for (const f of engine.assets) await cache.delete(this.keyFor(f));
  }
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function realStoreDeps(assetVersion: string, baseUrl: string): StoreDeps {
  return {
    openCache: () => caches.open(ASSET_CACHE_NAME),
    fetchFn: (url, init) => activeWindow.fetch(url, init),
    digest: sha256Hex,
    assetVersion,
    baseUrl,
  };
}
