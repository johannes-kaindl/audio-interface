// Dünne Hülle um den Kit-Baustein `asset-store` (code-kit 0.49.0, aus dieser Datei gehoben, Stand Tag 0.7.4).
// Die Cache-Ablage (Cache API im Electron-Profil AUSSERHALB des Vaults, nie gesynct, Datei-Granularität beim
// Retry), Abbruchkanten und die SHA-256-Prüfung liegen im Kit. Hier bleibt, was audio-interface eigen ist:
// Schlüssel (Version + Datei), Bezug über `requestUrl`, die Engine-Deskriptoren als `AssetSet` und die Namen,
// auf die main.ts, Einstellungen, Piper-Engine und Tests bauen.
import { requestUrl } from "obsidian";
import { assetUrl, type AssetFile, type AssetKey, type EngineDescriptor } from "../core/engine-manifest";
import { AssetStore as KitAssetStore, subtleSha256Hex, type AssetFile as KitAssetFile, type AssetProgress, type VerifyResult } from "../vendor/kit/asset-store";
import type { CacheLike } from "../vendor/kit/cache-download";
import { withTimeout } from "../vendor/kit/timeout";

export const ASSET_CACHE_NAME = "audio-interface-engines";

// Eine Definition statt zweier: das Kit-Modul bringt den Cache-API-Port mit, der Test importiert
// ihn weiterhin von hier.
export type { CacheLike };

export interface StoreDeps {
  openCache(): Promise<CacheLike>;
  fetchFn(url: string, init?: { signal?: AbortSignal }): Promise<Response>;
  /** Hex-SHA-256. */
  digest(buf: ArrayBuffer): Promise<string>;
  assetVersion: string;
  baseUrl: string;
}

export type { AssetStatus, VerifyResult } from "../vendor/kit/asset-store";

/** Meldetext zu einem fehlgeschlagenen `verify`. Das Kit meldet eine nicht geladene Datei als `actual: ""`;
 *  das ist kein Prüfsummenfehler („got …“ mit leerem Ist-Wert), sondern „nicht geladen“ wie früher bei `getBuffer`. */
export function verifyFailureMessage(verdict: Extract<VerifyResult, { ok: false }>): string {
  if (verdict.actual === "") return `asset not downloaded: ${verdict.fileName}`;
  return `checksum mismatch: ${verdict.fileName} (expected ${verdict.expected.slice(0, 12)}…, got ${verdict.actual.slice(0, 12)}…)`;
}

export interface DownloadProgress {
  fileIndex: number;
  totalFiles: number;
  fileName: string;
  receivedBytes: number;
  totalBytes: number;
  overallReceived: number;
  overallTotal: number;
}

export function abortError(): Error {
  return new DOMException("aborted", "AbortError");
}

export class AssetStore {
  private readonly kit: KitAssetStore;

  constructor(deps: StoreDeps) {
    this.kit = new KitAssetStore({
      openCache: () => deps.openCache(),
      fetchFn: (url, init) => deps.fetchFn(url, init),
      digest: (buf) => deps.digest(buf),
      // Bezugs-URL (woher geladen wird).
      urlFor: (file: KitAssetFile) => assetUrl(deps.baseUrl, deps.assetVersion, file as AssetFile),
      // Cache-Schlüssel — bewusst OHNE Bezugs-URL: Version + Datei. Ein anderer Bezugsweg (Mirror,
      // lokaler Server im Smoke) darf den Bestand nicht unsichtbar machen; die Prüfsumme bindet die
      // Bytes an das Manifest, nicht die Herkunft. Cache API verlangt eine http(s)-URL als Schlüssel.
      // Nicht der inhaltsbasierte Standard des Kits: der Schlüssel bestehender Nutzer bleibt gültig.
      keyFor: (file: KitAssetFile) => `https://audio-interface.invalid/${deps.assetVersion}/${file.fileName}`,
      namespace: "audio-interface",
    });
  }

  async cachedFileNames(engines: EngineDescriptor[]): Promise<Set<string>> {
    return this.kit.cachedFileNames(engines);
  }

  status(engine: EngineDescriptor): ReturnType<KitAssetStore["status"]> {
    return this.kit.status(engine);
  }

  /** Lädt nur fehlende Dateien. Abbruch: fertige Dateien bleiben, die angefangene wird verworfen. */
  download(engine: EngineDescriptor, onProgress: (p: DownloadProgress) => void, signal: AbortSignal): Promise<void> {
    const bytesOf = new Map(engine.assets.map((a) => [a.fileName, a.bytes]));
    return this.kit.download(
      engine,
      (p: AssetProgress) => onProgress({ ...p, totalBytes: bytesOf.get(p.fileName) ?? p.receivedBytes }),
      signal,
    );
  }

  verify(engine: EngineDescriptor): ReturnType<KitAssetStore["verify"]> {
    return this.kit.verify(engine);
  }

  getBuffer(engine: EngineDescriptor, key: AssetKey): Promise<ArrayBuffer> {
    return this.kit.getBuffer(engine, key);
  }

  getText(engine: EngineDescriptor, key: AssetKey): Promise<string> {
    return this.kit.getText(engine, key);
  }

  /** Entfernt die Dateien dieser Stimme. `keepAlive` nennt die übrigen Stimmen: ist eine davon noch
   *  vollständig geladen, bleiben die GETEILTEN Dateien (Worker, ORT-WASM) liegen — sonst risse das
   *  Entfernen der einen Stimme der anderen die Laufzeit unter den Füßen weg. */
  remove(engine: EngineDescriptor, keepAlive: EngineDescriptor[] = []): Promise<void> {
    return this.kit.remove(engine, keepAlive);
  }
}

/** Bewusst nicht `sha256Hex` aus code-kit: die Kit-Fassung ist synchron und rechnet in JS auf dem
 *  Hauptthread (gemessen 2026-10-23 an 63 MB: 190 ms blockiert, nativ `crypto.subtle` 24 ms und
 *  asynchron); die Modelldateien liegen schon am Stück im Speicher, Streaming bringt hier nichts.
 *  `subtleSha256Hex` des Kits rechnet über `crypto.subtle`. */
const sha256Hex = (buf: ArrayBuffer): Promise<string> => subtleSha256Hex(buf, crypto.subtle);

/** Gemessen 2026-08-16: `fetch` gegen `github.com/…/releases/download/…` scheitert im Renderer
 *  (Origin `app://obsidian.md`) an CORS — der erste Hop (302 auf objects.githubusercontent.com)
 *  traegt keine CORS-Header. Ein lokaler Smoke-Server mit `Access-Control-Allow-Origin: *` verdeckt
 *  das. Obsidians `requestUrl` geht am CORS vorbei (REGISTRY „Endpunkt-Probe mit requestUrl"), kennt
 *  aber weder Streaming noch Abort: der Koerper kommt am Stueck (63 MB im Speicher — tragbar), der
 *  Fortschritt springt je Datei, ein Abbruch wirkt zwischen den Dateien. Deshalb hier ein Zeitlimit
 *  je Datei, sonst hinge ein stockender Download ewig. */
const PER_FILE_TIMEOUT_MS = 15 * 60_000;

async function fetchViaRequestUrl(url: string): Promise<Response> {
  const timers = { setTimeout: (fn: () => void, ms: number) => window.setTimeout(fn, ms), clearTimeout: (id: number) => window.clearTimeout(id) };
  const result = await withTimeout(requestUrl({ url, method: "GET", throw: false }), PER_FILE_TIMEOUT_MS, timers);
  if (result.timedOut) throw new Error(`download timed out: ${url}`);
  const r = result.value;
  const body = r.status >= 200 && r.status < 300 ? r.arrayBuffer : null;
  return new Response(body, { status: r.status, headers: body ? { "content-length": String(body.byteLength) } : {} });
}

export function realStoreDeps(assetVersion: string, baseUrl: string): StoreDeps {
  return {
    openCache: () => caches.open(ASSET_CACHE_NAME),
    fetchFn: (url) => fetchViaRequestUrl(url),
    digest: sha256Hex,
    assetVersion,
    baseUrl,
  };
}
