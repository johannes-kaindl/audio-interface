// Anbieter-API v1 (Welle 13, Baustein 5) — Vertrag aus dem Kit (`vendor/kit/audio-provider.ts`).
// REGISTRY-Muster „Anbieter-API v1": dünner Adapter vor den internen Backends, nie die Fassade
// selbst; Fehler sind Werte, keine Ausnahmen (außer bei den injizierten Backend-Aufrufen selbst,
// die hier gefangen und in Werte übersetzt werden).
//
// Die Achse ist BACKEND, nicht Fähigkeit: `transcribe()` verzweigt nach `settings.transcribeBackend`
// (Nutzerwahl, beide Wege funktionieren auf dem Desktop); `speak()` bevorzugt Piper, wenn eine
// ladbare Stimme bereit ist, sonst den Kurzbefehl-Weg (falls eingerichtet) — der Konsument sieht
// den Unterschied nie (Spec § Leitentscheidung).
import { AUDIO_PROVIDER_API_VERSION, type AudioProviderApi, type AudioProviderError, type AudioProviderErrorCode } from "../vendor/kit/audio-provider";
import type { TranscribeFailure, TranscribeOutcome } from "../core/dictation-service";
import { ExportError } from "./exporter";
import { ShortcutTtsError } from "./shortcut-tts";
import type { ShortcutResult } from "../vendor/kit-obsidian/shortcuts-bridge";

export interface AudioProviderApiDeps {
  transcribeBackend: () => "localhost" | "shortcuts";
  /** Nur für den localhost-Weg: Erreichbarkeit + Bereitschaft, ohne schon Bytes zu lesen. */
  transcribeLocalhostReady: () => Promise<{ ok: true } | { ok: false; message: string }>;
  /** `null` = Datei existiert nicht. */
  readVaultBytes: (vaultPath: string) => Promise<ArrayBuffer | null>;
  transcribeLocalhost: (bytes: ArrayBuffer) => Promise<TranscribeOutcome>;
  transcribeShortcut: (vaultPath: string) => Promise<TranscribeOutcome>;

  piperReady: () => boolean;
  /** @returns Vault-Pfad. Wirft `ExportError`. */
  speakPiper: (text: string, targetFolder: string) => Promise<string>;
  ttsShortcutEnabled: () => boolean;
  /** @returns Vault-Pfad. Wirft `ShortcutTtsError`. */
  speakShortcut: (text: string, targetFolder: string) => Promise<string>;
}

function err(error: AudioProviderErrorCode, message: string): AudioProviderError {
  return { error, message };
}

function mapTranscribeFailure(kind: TranscribeFailure): AudioProviderErrorCode {
  switch (kind) {
    case "ungueltige_anfrage":
    case "zu_gross":
      return "unsupported";
    case "nicht_bereit":
      return "backend-unavailable";
    case "dienst_fehler":
      return "failed";
  }
}

// Dieselbe Vokabel wie shortcuts-transcriber.ts: die Brücke unterscheidet
// error/cancel/timeout/busy/file-missing, der Anbieter-Vertrag kennt nur die fünf Kit-Codes.
function mapShortcutReason(reason: Extract<ShortcutResult, { ok: false }>["reason"] | "file-missing"): AudioProviderErrorCode {
  switch (reason) {
    case "timeout":
      return "timeout";
    case "busy":
      return "busy";
    case "error":
    case "cancel":
    case "file-missing":
      return "failed";
  }
}

function mapExportError(e: unknown): AudioProviderError {
  if (e instanceof ExportError) {
    if (e.code === "empty") return err("unsupported", "Nichts zu sprechen — der Text ist leer.");
    return err("failed", e.message);
  }
  return err("failed", e instanceof Error ? e.message : String(e));
}

function mapShortcutTtsError(e: unknown): AudioProviderError {
  if (e instanceof ShortcutTtsError) {
    if (e.code === "empty") return err("unsupported", "Nichts zu sprechen — der Text ist leer.");
    return err(mapShortcutReason(e.code), e.message);
  }
  return err("failed", e instanceof Error ? e.message : String(e));
}

export function createAudioProviderApi(deps: AudioProviderApiDeps): AudioProviderApi {
  return {
    version: AUDIO_PROVIDER_API_VERSION,

    async transcribe(vaultPath) {
      if (deps.transcribeBackend() === "shortcuts") {
        const outcome = await deps.transcribeShortcut(vaultPath);
        return outcome.ok ? outcome.text : err(mapTranscribeFailure(outcome.kind), outcome.detail);
      }
      const ready = await deps.transcribeLocalhostReady();
      if (!ready.ok) return err("backend-unavailable", ready.message);
      const bytes = await deps.readVaultBytes(vaultPath);
      if (bytes === null) return err("not-found", `Datei nicht gefunden: ${vaultPath}`);
      const outcome = await deps.transcribeLocalhost(bytes);
      return outcome.ok ? outcome.text : err(mapTranscribeFailure(outcome.kind), outcome.detail);
    },

    async speak(text, opts) {
      if (deps.piperReady()) {
        try {
          return await deps.speakPiper(text, opts.targetFolder);
        } catch (e) {
          return mapExportError(e);
        }
      }
      if (deps.ttsShortcutEnabled()) {
        try {
          return await deps.speakShortcut(text, opts.targetFolder);
        } catch (e) {
          return mapShortcutTtsError(e);
        }
      }
      return err("backend-unavailable", "Weder eine ladbare Stimme noch der Kurzbefehl-Weg für TTS sind eingerichtet.");
    },
  };
}
