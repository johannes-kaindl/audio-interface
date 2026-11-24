// vendored from obsidian-kit@0.106.0, src/pure/audio-provider.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Öffentlicher Vertrag des Fähigkeits-Besitzers `audio-interface` (Transkription + TTS) — Muster
 *  `pure/endpoint-source.ts`: EINE Quelle, der Besitzer re-exportiert sie, Konsumenten vendoren.
 *  Fehler sind Werte (`AudioProviderError`), Methoden fangen selbst — nie werfen.
 *
 *  **Form-Guard statt Versionskopie:** Ein Konsument prüft `isAudioProviderApi(x)`, nicht eine
 *  gespiegelte `apiVersion`-Konstante — eine Kopie altert unabhängig vom echten Anbieter und
 *  bleibt still grün, wenn sich der Vertrag ändert (LESSONS 2026-09-25, „llm-lab-Muster" — genau
 *  das soll dieser Vertrag NICHT wiederholen).
 *
 *  Die API abstrahiert über BACKENDS (mobil: Apple-Kurzbefehl, desktop: localhost-Dienst/Piper),
 *  nicht über die Brücke — ein Konsument merkt den Unterschied nie (Spec § Leitentscheidung). *
 *  **Abbruch (seit 0.93.0, additiv, v1 bleibt; Muster `describe-provider.ts`):** `transcribe` und `speak` bekommt ein optionales `signal`, der Fehlercode `aborted` ist neu. Der Vertrag sagt, was ein Anbieter tun muss, wenn er abbricht (Feld `signal`);
 *  ob das Backend dabei wirklich anhält, ist Sache des Anbieters und nicht Vertrag: ein Backend, das nicht anzuhalten ist, liefert trotzdem `aborted`, und für den Aufrufer endet das Warten. **Ein Anbieter vor 0.93.0** kennt `signal`
 *  nicht und ignoriert es: der Aufruf läuft zu Ende und liefert sein Ergebnis. Der Aufrufer, der abbrechen will, hört dann selbst auf zu warten (`Promise.race` gegen sein Signal) und verwirft das späte Ergebnis. Das Kit hat keinen
 *  Aufruf-Helfer, der den Anbieter ruft (`obsidian/capability-apis.ts` liest nur die API), also auch keinen, der das für einen alten Anbieter tut. `aborted` ist kein Fehler des Anbieters, sondern der Wunsch des Nutzers: `audioErrorText` zeigt dafür einen eigenen Text. */
export const AUDIO_PROVIDER_API_VERSION = 1;

export type AudioProviderErrorCode = "backend-unavailable" | "not-found" | "timeout" | "busy" | "unsupported" | "aborted" | "failed";
export interface AudioProviderError { error: AudioProviderErrorCode; message: string }

export interface TranscribeOptions {
  /** Beendet den Aufruf. **Pflicht des Anbieters:** ein schon abgebrochenes Signal liefert `aborted`, ohne das Backend zu rufen; ein Abbruch währenddessen ebenso. Kann der Anbieter das Backend nicht anhalten, liefert er trotzdem `aborted` und verwirft das späte Ergebnis. */
  signal?: AbortSignal;
}

export interface SpeakOptions {
  /** Vault-Zielordner (ohne Dateinamen) — die Endung wählt das Backend (z. B. `.caf` beim
   *  Kurzbefehl-Weg statt des naheliegenden `.m4a`). */
  targetFolder: string;
  /** Beendet den Aufruf. **Pflicht des Anbieters:** ein schon abgebrochenes Signal liefert `aborted`, ohne das Backend zu rufen; ein Abbruch währenddessen ebenso. Kann der Anbieter das Backend nicht anhalten, liefert er trotzdem `aborted` und verwirft das späte Ergebnis (bei `aborted` steht nichts neu im Vault). */
  signal?: AbortSignal;
}

export interface AudioProviderApi {
  version: 1;
  /** Audio-Datei (Vault-relativer Pfad) → transkribierter Text. */
  transcribe(vaultPath: string, opts?: TranscribeOptions): Promise<string | AudioProviderError>;
  /** Text → Vault-relativer Pfad der erzeugten Audio-Datei. */
  speak(text: string, opts: SpeakOptions): Promise<string | AudioProviderError>;
}

const METHODS = ["transcribe", "speak"] as const;

export function isAudioProviderApi(x: unknown): x is AudioProviderApi {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.version !== AUDIO_PROVIDER_API_VERSION) return false;
  return METHODS.every((m) => typeof o[m] === "function");
}
