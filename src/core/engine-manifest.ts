// Beschreibung der Engines und ihrer Assets. Pur. Die Prüfsummen kommen aus der generierten Datei
// (Build), damit main.js jede Asset-Datei vor dem Instanziieren gegen SHA-256 prüfen kann (Spec §5).
//
// Seit 0.3.0 mehrstimmig: die generierte Datei liefert die GETEILTE Laufzeit (Worker + ORT-WASM) und
// je Stimme Modell + Config; die redaktionelle Seite (Label, Werks-Tempo, Lizenz-Kurzform) steht hier.
// Getrennt, weil das eine gemessen ist und das andere entschieden.
import { PIPER_SHARED_ASSETS, PIPER_VOICES } from "./engine-manifest.generated";

export type AssetKey = "worker" | "wasm" | "model" | "modelConfig";
export type EngineKind = "builtin" | "loadable" | "service";
export type EngineLang = "de" | "en";

export interface AssetFile {
  key: AssetKey;
  fileName: string;
  bytes: number;
  /** Hex, 64 Zeichen. Leer nur im ungebauten Erst-Stand. */
  sha256: string;
  license: string;
}

/** Was `build-assets.mjs` je Stimme misst: Abtastrate aus der Piper-Config, Modell + Config. */
export interface VoiceAssets {
  sampleRate: number;
  assets: AssetFile[];
}

export interface EngineDescriptor {
  id: string;
  kind: EngineKind;
  /** Anzeigename, sprachneutral (Eigenname). */
  label: string;
  lang: EngineLang;
  /** null = Systemstimmen (kein PCM). */
  sampleRate: number | null;
  /** Werks-Tempo als Piper-`length_scale`-Faktor (1 = Modell-Default, < 1 = schneller). Für Thorsten
   *  nach Hörprobe 2026-08-16 auf 0,85 gesetzt: bei 1,0 klingt die Stimme „verschlafen". */
  tempo?: number;
  assets: AssetFile[];
  licenseSummary: string;
}

export const BUILTIN_ENGINE_ID = "system-voices";
export const PIPER_DE_ENGINE_ID = "piper-de-thorsten-medium";
export const PIPER_EN_ENGINE_ID = "piper-en-ljspeech-medium";
export const RELEASE_BASE_URL = "https://github.com/johannes-kaindl/audio-interface/releases/download";

interface PiperVoiceMeta {
  id: string;
  /** Schlüssel in der generierten Datei = Piper-Stimmenname. */
  voice: string;
  label: string;
  lang: EngineLang;
  tempo?: number;
  licenseSummary: string;
}

const PIPER_VOICE_META: PiperVoiceMeta[] = [
  {
    id: PIPER_DE_ENGINE_ID,
    voice: "de_DE-thorsten-medium",
    label: "Piper · Thorsten (de_DE, medium)",
    lang: "de",
    tempo: 0.85,
    licenseSummary: "Voice CC0 · onnxruntime-web MIT · eSpeak-NG/ephone GPL-3.0",
  },
  {
    id: PIPER_EN_ENGINE_ID,
    voice: "en_US-ljspeech-medium",
    label: "Piper · LJSpeech (en_US, medium)",
    lang: "en",
    licenseSummary: "Voice public domain · onnxruntime-web MIT · eSpeak-NG/ephone GPL-3.0",
  },
];

/** Reihenfolge der Assets bleibt worker · wasm · model · modelConfig — die geteilten zuerst. */
function piperEngine(meta: PiperVoiceMeta): EngineDescriptor | null {
  const gen = PIPER_VOICES[meta.voice];
  // Fehlt die Stimme im generierten Manifest, ist `npm run assets` nicht gelaufen. Dann fällt sie weg,
  // statt mit halben Angaben in die Auswahl zu kommen; `check:manifest` fängt den Fall im Gate.
  if (!gen) return null;
  return {
    id: meta.id,
    kind: "loadable",
    label: meta.label,
    lang: meta.lang,
    sampleRate: gen.sampleRate,
    tempo: meta.tempo,
    assets: [...PIPER_SHARED_ASSETS, ...gen.assets],
    licenseSummary: meta.licenseSummary,
  };
}

export const ENGINES: EngineDescriptor[] = [
  { id: BUILTIN_ENGINE_ID, kind: "builtin", label: "System voices", lang: "de", sampleRate: null, assets: [], licenseSummary: "" },
  ...PIPER_VOICE_META.map(piperEngine).filter((e): e is EngineDescriptor => e !== null),
];

export function engineById(id: string): EngineDescriptor | undefined {
  return ENGINES.find((e) => e.id === id);
}

/** Die ladbaren Stimmen in Anzeige-Reihenfolge (= Reihenfolge der Tabelle oben). */
export function loadableEngines(): EngineDescriptor[] {
  return ENGINES.filter((e) => e.kind === "loadable");
}

export function isLoadableEngineId(id: string): boolean {
  return loadableEngines().some((e) => e.id === id);
}

/** Erstauswahl nach Oberflächensprache: passende Stimme, sonst die erste. Ein Store-Nutzer mit
 *  englischer Oberfläche soll nicht erst eine deutsche Stimme laden, um zu merken, dass es die
 *  falsche ist. Gilt nur für den Erststart — danach zählt die gespeicherte Wahl. */
export function defaultExportEngineId(uiLang: string | null | undefined): string {
  const loadable = loadableEngines();
  const prefix = (uiLang ?? "").toLowerCase().slice(0, 2);
  return (loadable.find((e) => e.lang === prefix) ?? loadable[0]).id;
}

export function assetUrl(baseUrl: string, version: string, file: AssetFile): string {
  return `${baseUrl.replace(/\/+$/, "")}/${version}/${file.fileName}`;
}

export function totalBytes(e: EngineDescriptor): number {
  return e.assets.reduce((n, a) => n + a.bytes, 0);
}

/** Was von dieser Stimme noch fehlt, wenn `have` (Dateinamen) schon im Cache liegt — die geteilte
 *  Laufzeit zählt nur einmal, die zweite Stimme kostet deshalb nur ihr Modell. */
export function missingBytes(e: EngineDescriptor, have: ReadonlySet<string>): number {
  return e.assets.reduce((n, a) => (have.has(a.fileName) ? n : n + a.bytes), 0);
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
