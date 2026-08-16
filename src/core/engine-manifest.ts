// Beschreibung der Engines und ihrer Assets. Pur. Die Prüfsummen kommen aus der generierten Datei
// (Build), damit main.js jede Asset-Datei vor dem Instanziieren gegen SHA-256 prüfen kann (Spec §5).
import { PIPER_DE_ASSETS, PIPER_DE_SAMPLE_RATE } from "./engine-manifest.generated";

export type AssetKey = "worker" | "wasm" | "model" | "modelConfig";
export type EngineKind = "builtin" | "loadable" | "service";

export interface AssetFile {
  key: AssetKey;
  fileName: string;
  bytes: number;
  /** Hex, 64 Zeichen. Leer nur im ungebauten Erst-Stand. */
  sha256: string;
  license: string;
}

export interface EngineDescriptor {
  id: string;
  kind: EngineKind;
  /** Anzeigename, sprachneutral (Eigenname). */
  label: string;
  lang: "de";
  /** null = Systemstimmen (kein PCM). */
  sampleRate: number | null;
  /** Werks-Tempo als Piper-`length_scale`-Faktor (1 = Modell-Default, < 1 = schneller). Gewählt nach
   *  Hörprobe 2026-08-16: thorsten-medium klingt bei 1,0 „verschlafen", 0,85 nicht. */
  tempo?: number;
  assets: AssetFile[];
  licenseSummary: string;
}

export const BUILTIN_ENGINE_ID = "system-voices";
export const PIPER_DE_ENGINE_ID = "piper-de-thorsten-medium";
export const RELEASE_BASE_URL = "https://github.com/johannes-kaindl/audio-interface/releases/download";

export const ENGINES: EngineDescriptor[] = [
  { id: BUILTIN_ENGINE_ID, kind: "builtin", label: "System voices", lang: "de", sampleRate: null, assets: [], licenseSummary: "" },
  {
    id: PIPER_DE_ENGINE_ID,
    kind: "loadable",
    label: "Piper · Thorsten (de_DE, medium)",
    lang: "de",
    sampleRate: PIPER_DE_SAMPLE_RATE,
    tempo: 0.85,
    assets: PIPER_DE_ASSETS,
    licenseSummary: "Voice CC0 · onnxruntime-web MIT · eSpeak-NG/ephone GPL-3.0",
  },
];

export function engineById(id: string): EngineDescriptor | undefined {
  return ENGINES.find((e) => e.id === id);
}

export function assetUrl(baseUrl: string, version: string, file: AssetFile): string {
  return `${baseUrl.replace(/\/+$/, "")}/${version}/${file.fileName}`;
}

export function totalBytes(e: EngineDescriptor): number {
  return e.assets.reduce((n, a) => n + a.bytes, 0);
}

/** "63,2 MB" — deutsches Dezimalkomma bewusst nur hier; die UI zeigt Größen, sie rechnet nicht damit. */
export function formatBytes(n: number, decimalSeparator = ","): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
  return `${s.replace(".", decimalSeparator)} ${units[u]}`;
}
