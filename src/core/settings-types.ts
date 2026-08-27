// Settings-Wahrheit + Schema. Pur.
// Die generische Feldschleife dieser Datei IST der Kern des Kit-Moduls `pure/settings_schema`
// (obsidian-kit 0.27.0 nennt sie in seinem Modulkopf als kanonische Quelle, zusammengefuehrt mit vier
// weiteren Fassungen) — sie ist von hier ins Kit gewandert und kommt seit 2026-08-27 vendoriert zurueck.
// Hier liegt seitdem nur noch das SCHEMA: welches Feld welche Sonderregel hat. Die Pruefung selbst
// steht in src/vendor/kit/settings_schema.ts.
import { isLoadableEngineId, PIPER_DE_ENGINE_ID } from "./engine-manifest";
import { mergeSettings } from "../vendor/kit/settings";
import { check, clampFloatField, nonEmptyString, oneOf, validateSettings } from "../vendor/kit/settings_schema";

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
  /** Id einer ladbaren Stimme (Export UND Vorlesen-mit-ladbarer-Stimme). */
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
  exportEngineId: PIPER_DE_ENGINE_ID,
  exportProfile: "phone-8k",
  exportFolder: "",
  exportFilePattern: "{{note}}",
  exportInsertLink: false,
};

export function normalizeSettings(raw: unknown): AudioInterfaceSettings {
  return validateSettings(DEFAULT_SETTINGS, mergeSettings(DEFAULT_SETTINGS, raw), {
    speakRate: clampFloatField(SPEAK_RATE.min, SPEAK_RATE.max),
    exportProfile: oneOf(EXPORT_PROFILES),
    // Eine Stimme, die es nicht (mehr) gibt, faellt auf die Werksstimme zurueck — sonst zeigte der
    // Tab eine leere Auswahl und der Export bliebe ohne Erklaerung stumm. Der typeof-Guard ist
    // Pflicht: `check` reicht den ROHEN Wert durch, `isLoadableEngineId` nimmt einen String.
    exportEngineId: check<string>((v) => typeof v === "string" && isLoadableEngineId(v)),
    // "check": die Raender zaehlen beim Leer-Test mit ("   " ist leer), gespeichert wird der rohe Wert.
    exportFilePattern: nonEmptyString({ trim: "check" }),
  });
}

// exportFolder bekommt bewusst KEINEN Schema-Eintrag: "" heisst dort „neben der Notiz"
// (s. Feld-Doku oben, ausgewertet in obsidian/exporter.ts) — ein nonEmptyString wuerde den Fall
// unerreichbar machen. Die generische Bauform-Pruefung des Kits reicht.
