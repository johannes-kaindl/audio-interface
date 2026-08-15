// Settings-Wahrheit + Normalisierung. Pur.
// Kit-`mergeSettings` ist bewusst ein Shallow-Spread ohne Typprüfung (REGISTRY „Settings-Merge, der
// Feldwerte prüft statt sie durchzureichen") — die Prüfung je Feld und die Bereichs-Klemmen leben hier.
import { mergeSettings } from "../vendor/kit/settings";

export type ExportProfile = "phone-8k" | "native";

export interface AudioInterfaceSettings {
  /** URI der Systemstimme; "" = automatisch (erste deutsche, sonst erste). */
  speakVoiceUri: string;
  /** Sprechtempo 0,5–2,0. */
  speakRate: number;
  /** Vorlesen über die ladbare Stimme statt der Systemstimme (nur wenn bereit). */
  speakWithLoadable: boolean;
  /** Opt-in für den WAV-Export (schaltet die Engine-Zeile frei; lädt selbst nichts). */
  exportEnabled: boolean;
  exportEngineId: string;
  exportProfile: ExportProfile;
  /** Zielordner im Vault; "" = neben der Notiz. */
  exportFolder: string;
  /** Dateiname ohne Endung, Platzhalter {{note}} und {{date}}. */
  exportFilePattern: string;
  exportInsertLink: boolean;
}

export const SPEAK_RATE = { min: 0.5, max: 2, step: 0.1 } as const;
export const EXPORT_PROFILES: readonly ExportProfile[] = ["phone-8k", "native"];

export const DEFAULT_SETTINGS: AudioInterfaceSettings = {
  speakVoiceUri: "",
  speakRate: 1,
  speakWithLoadable: false,
  exportEnabled: false,
  exportEngineId: "piper-de-thorsten-medium",
  exportProfile: "phone-8k",
  exportFolder: "",
  exportFilePattern: "{{note}}",
  exportInsertLink: false,
};

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export function normalizeSettings(raw: unknown): AudioInterfaceSettings {
  const merged = mergeSettings(DEFAULT_SETTINGS, raw) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  // Typ je Feld gegen den Default prüfen — ein Feld mit fremdem Typ fällt auf den Default zurück.
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = merged[key];
    out[key] = typeof v === typeof def && !(typeof v === "number" && !Number.isFinite(v)) ? v : def;
  }
  const s = out as unknown as AudioInterfaceSettings;
  return {
    ...s,
    speakRate: clamp(s.speakRate, SPEAK_RATE.min, SPEAK_RATE.max),
    exportProfile: EXPORT_PROFILES.includes(s.exportProfile) ? s.exportProfile : DEFAULT_SETTINGS.exportProfile,
    exportFilePattern: s.exportFilePattern.trim() === "" ? DEFAULT_SETTINGS.exportFilePattern : s.exportFilePattern,
  };
}
