// Settings-Wahrheit + Schema. Pur.
// Die generische Feldschleife dieser Datei IST der Kern des Kit-Moduls `pure/settings_schema`
// (obsidian-kit 0.27.0 nennt sie in seinem Modulkopf als kanonische Quelle, zusammengefuehrt mit vier
// weiteren Fassungen) — sie ist von hier ins Kit gewandert und kommt seit 2026-08-27 vendoriert zurueck.
// Hier liegt seitdem nur noch das SCHEMA: welches Feld welche Sonderregel hat. Die Pruefung selbst
// steht in src/vendor/kit/settings_schema.ts.
import { isLoadableEngineId, PIPER_DE_ENGINE_ID } from "./engine-manifest";
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
  /** Opt-in fuer die Transkription (schaltet die Dienst-Zeile frei; spricht selbst nichts an). */
  transcribeEnabled: boolean;
  /**
   * Basis-URL des lokalen `audio-ui`-Diensts.
   *
   * ⚠️ Nur localhost — s. `isLocalServiceUrl`. Eine frei waehlbare Adresse hiesse,
   * dass ein Vertipper private Sprachnotizen an einen fremden Server schickt.
   */
  transcribeServiceUrl: string;
}

/**
 * Erlaubt genau die Adressen, unter denen der Dienst ueberhaupt lauscht: er bindet
 * fest auf `127.0.0.1` und weist alles ab, dessen `Host` nicht `127.0.0.1`,
 * `localhost` oder `[::1]` ist (audio-ui `service/app.py`). Diese Grenze hier
 * spiegelt das, damit das Plugin gar nicht erst irgendwohin sendet.
 *
 * `http://127.0.0.1.evil.test` faellt durch: `hostname` ist dann der ganze Name,
 * nicht das Praefix.
 */
export function isLocalServiceUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  return LOCAL_HOSTS.includes(url.hostname);
}

const LOCAL_HOSTS: readonly string[] = ["127.0.0.1", "localhost", "[::1]"];

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
  transcribeEnabled: false,
  transcribeServiceUrl: "http://127.0.0.1:8765",
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
    transcribeServiceUrl: check<string>(isLocalServiceUrl),
  });
}

// exportFolder bekommt bewusst KEINEN Schema-Eintrag: "" heisst dort „neben der Notiz"
// (s. Feld-Doku oben, ausgewertet in obsidian/exporter.ts) — ein nonEmptyString wuerde den Fall
// unerreichbar machen. Die generische Bauform-Pruefung des Kits reicht.
