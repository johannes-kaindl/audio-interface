// TTS als Datei über die Kurzbefehl-Brücke: Text → Kurzbefehl → fertige Vault-Datei. Anders als
// engines/{piper-engine,system-speech}.ts (liefern PCM zum sofortigen Abspielen) und exporter.ts
// (Piper-spezifisch: chunks → engine.synthesize → encodeWav → Vault-Schreiben) — die Brücke liefert
// die fertige Datei direkt (`expectFile`), keine PCM-Stufe, keine Wiedergabe. Deshalb eigenständiges
// Geschwistermodul statt Erweiterung von exporter.ts (Spec Welle 13, Baustein 3).
import { prepareSpeech } from "../core/speech-text";
import type { ShortcutResult, ShortcutsBridge } from "../vendor/kit-obsidian/shortcuts-bridge";

export interface ShortcutTtsDeps {
  bridge: ShortcutsBridge;
  shortcutName: () => string;
  timeoutMs: () => number;
  /** Vault-relativer Zielordner, ohne Dateiname. */
  targetFolder: () => string;
  /** Für den eindeutigen Dateinamen-Prefix — die Endung wählt der Kurzbefehl, ein Kollisionscheck
   *  über `withSuffix` (core/file-naming) geht deshalb nicht: die Endung ist vorher nicht bekannt. */
  now: () => number;
}

type FailReason = Extract<ShortcutResult, { ok: false }>["reason"] | "file-missing";

export class ShortcutTtsError extends Error {
  constructor(
    readonly code: "empty" | FailReason,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ShortcutTtsError";
  }
}

/** Faltet Markdown zu einem Klartext-Satz (kein Chunking mit Pausen — die Brücke ist one-shot,
 *  kein Streaming; die Pausen aus `prepareSpeech` sind fürs Vorlesen gedacht, hier fällt nur der
 *  Text zusammen). */
function plainText(markdown: string): string {
  return prepareSpeech(markdown)
    .map((c) => c.text)
    .join(" ");
}

/** @returns der Vault-relative Pfad der erzeugten Audiodatei. Wirft `ShortcutTtsError`. */
export async function speakViaShortcut(markdown: string, deps: ShortcutTtsDeps, filePrefix: string): Promise<string> {
  const text = plainText(markdown);
  if (text === "") throw new ShortcutTtsError("empty");

  const prefix = `${deps.targetFolder()}/${filePrefix}-${deps.now()}`;
  const res = await deps.bridge.run({
    shortcut: deps.shortcutName(),
    input: text,
    timeoutMs: deps.timeoutMs(),
    expectFile: { vaultPathPrefix: prefix },
  });
  if (!res.ok) throw new ShortcutTtsError(res.reason, res.message);
  if (!res.file) throw new ShortcutTtsError("file-missing", "Kurzbefehl meldete Erfolg, aber keine Datei");
  return res.file;
}
