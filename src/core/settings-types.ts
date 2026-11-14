// Settings-Wahrheit + Schema. Pur.
// Die generische Feldschleife dieser Datei IST der Kern des Kit-Moduls `pure/settings_schema`
// (obsidian-kit 0.27.0 nennt sie in seinem Modulkopf als kanonische Quelle, zusammengefuehrt mit vier
// weiteren Fassungen) — sie ist von hier ins Kit gewandert und kommt seit 2026-08-27 vendoriert zurueck.
// Hier liegt seitdem nur noch das SCHEMA: welches Feld welche Sonderregel hat. Die Pruefung selbst
// steht in src/vendor/kit/settings_schema.ts.
import { isLoadableEngineId, PIPER_DE_ENGINE_ID } from "./engine-manifest";
import { isLoopbackHttpUrl } from "../vendor/kit/loopback";
import { check, clampFloatField, clampIntField, nonEmptyString, oneOf, validateSettings } from "../vendor/kit/settings_schema";

export type ExportProfile = "phone-8k" | "native";
/** Zweites Backend für die Umschrift, neben dem localhost-Dienst (Welle 13, Baustein B). */
export type TranscribeBackend = "localhost" | "shortcuts";

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
  /** Opt-in fuer die Transkription (schaltet die Dienst-Zeile frei; spricht selbst nichts an). */
  transcribeEnabled: boolean;
  /**
   * Basis-URL des lokalen `audio-ui`-Diensts.
   *
   * ⚠️ Nur localhost — s. `isLoopbackHttpUrl` (Kit). Der Dienst bindet fest auf `127.0.0.1` und weist
   * jeden anderen `Host` ab (audio-ui `service/app.py`); die Grenze hier spiegelt das. Eine frei
   * waehlbare Adresse hiesse, dass ein Vertipper private Sprachnotizen an einen fremden Server schickt.
   */
  transcribeServiceUrl: string;
  /** Welches Backend die Umschrift ausführt — localhost-Dienst (Default, Desktop) oder
   *  Apple-Kurzbefehl (mobil nutzbar, s. shortcuts-transcriber.ts). */
  transcribeBackend: TranscribeBackend;
  /** Exakter Name des Kurzbefehls für die Umschrift. */
  transcribeShortcutName: string;
  /** Ein gelöschter Kurzbefehl antwortet nie — der Timeout ist die einzige Verteidigung. */
  transcribeShortcutTimeoutMs: number;
  /** Opt-in für TTS als Datei über den Kurzbefehl (schaltet die Zeile frei; spricht selbst nichts
   *  an) — macht das Vorlesen erstmals mobil nutzbar, unabhängig vom WAV-Export (Piper). */
  ttsShortcutEnabled: boolean;
  /** Exakter Name des Kurzbefehls für TTS als Datei. */
  ttsShortcutName: string;
  /** Vault-relativer Zielordner; "" = neben der Notiz (wie exportFolder). */
  ttsShortcutFolder: string;
  ttsShortcutTimeoutMs: number;
  /** Statusleisten-Eintrag (Vorlesen, Render, Download) zeigen. Standard an: ein Update lässt keine genutzte Anzeige verschwinden. */
  showStatusBar: boolean;
}

export const SPEAK_RATE = { min: 0.5, max: 2, step: 0.1 } as const;
export const EXPORT_PROFILES: readonly ExportProfile[] = ["phone-8k", "native"];
export const TRANSCRIBE_BACKENDS: readonly TranscribeBackend[] = ["localhost", "shortcuts"];
/** Ein gelöschter Kurzbefehl antwortet nie — Grenzen, nicht Komfort. */
export const SHORTCUT_TIMEOUT_MS = { min: 5_000, max: 600_000 } as const;

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
  transcribeEnabled: false,
  transcribeServiceUrl: "http://127.0.0.1:8765",
  transcribeBackend: "localhost",
  transcribeShortcutName: "Transcribe Audio (Obsidian)",
  transcribeShortcutTimeoutMs: 120_000,
  ttsShortcutEnabled: false,
  ttsShortcutName: "Speak Text (Obsidian)",
  ttsShortcutFolder: "",
  ttsShortcutTimeoutMs: 120_000,
  showStatusBar: true, // = STATUS_BAR_DEFAULT des Kit-Bausteins; src/core bleibt frei von obsidian-Importen (check:pure), ein Test hält beide gleich
};

export function normalizeSettings(raw: unknown): AudioInterfaceSettings {
  return validateSettings(DEFAULT_SETTINGS, raw, {
    speakRate: clampFloatField(SPEAK_RATE.min, SPEAK_RATE.max),
    exportProfile: oneOf(EXPORT_PROFILES),
    // Eine Stimme, die es nicht (mehr) gibt, faellt auf die Werksstimme zurueck — sonst zeigte der
    // Tab eine leere Auswahl und der Export bliebe ohne Erklaerung stumm. Der typeof-Guard ist
    // Pflicht: `check` reicht den ROHEN Wert durch, `isLoadableEngineId` nimmt einen String.
    exportEngineId: check<string>((v) => typeof v === "string" && isLoadableEngineId(v)),
    // "check": die Raender zaehlen beim Leer-Test mit ("   " ist leer), gespeichert wird der rohe Wert.
    exportFilePattern: nonEmptyString({ trim: "check" }),
    // Faellt eine fremde Adresse auf den Default zurueck, statt sie zu uebernehmen:
    // die Einstellung ist eine Ziel-Erlaubnis, kein Freitext.
    transcribeServiceUrl: check<string>(isLoopbackHttpUrl),
    transcribeBackend: oneOf(TRANSCRIBE_BACKENDS),
    transcribeShortcutName: nonEmptyString({ trim: "check" }),
    transcribeShortcutTimeoutMs: clampIntField(SHORTCUT_TIMEOUT_MS.min, SHORTCUT_TIMEOUT_MS.max),
    ttsShortcutName: nonEmptyString({ trim: "check" }),
    ttsShortcutTimeoutMs: clampIntField(SHORTCUT_TIMEOUT_MS.min, SHORTCUT_TIMEOUT_MS.max),
  });
}

// exportFolder und ttsShortcutFolder bekommen bewusst KEINEN Schema-Eintrag: "" heisst dort
// „neben der Notiz" (s. Feld-Doku oben) — ein nonEmptyString wuerde den Fall unerreichbar machen.
// Die generische Bauform-Pruefung des Kits reicht.
