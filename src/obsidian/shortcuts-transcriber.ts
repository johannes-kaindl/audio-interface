// Zweites Backend für die Umschrift, neben dem localhost-Dienst (transcriber.ts): Kurzbefehl statt
// HTTP. Reicht nur den Vault-relativen Pfad durch — „Audio transkribieren" lädt die Datei selbst
// per „Datei abrufen" und nimmt m4a direkt (gemessen im Spike); die WAV-Dekodier-Strecke des
// localhost-Backends gilt hier nicht.
//
// Bewusst KEIN gemeinsames Interface mit `Transcriber` erzwungen: die Eingabeform ist strukturell
// verschieden (Bytes vs. Vault-Pfad), nur die Ausgabeform (`TranscribeOutcome`) ist gemeinsam. Die
// Vereinheitlichung über beide Backends passiert eine Ebene höher, in der Anbieter-API v1
// (`transcribe(vaultPath)`).
import type { TranscribeOutcome } from "../core/dictation-service";
import type { ShortcutResult, ShortcutsBridge } from "../vendor/kit-obsidian/shortcuts-bridge";

export interface ShortcutsTranscriberDeps {
  bridge: ShortcutsBridge;
  shortcutName: () => string;
  timeoutMs: () => number;
}

// Die Brücke unterscheidet error/cancel/timeout/busy — `TranscribeFailure` (dictation-service.ts)
// kennt diese Vokabeln nicht, weil sie vom localhost-Dienst kommt. `detail` trägt den Brücken-Text
// immer (nie leer, s. shortcuts-bridge.ts), die Notice zeigt also nie den generischen `kind`.
const GENERIC_FAILURE = "dienst_fehler" as const;

export class ShortcutsTranscriber {
  constructor(private readonly deps: ShortcutsTranscriberDeps) {}

  async transcribePath(vaultPath: string): Promise<TranscribeOutcome> {
    const res = await this.deps.bridge.run({
      shortcut: this.deps.shortcutName(),
      input: vaultPath,
      timeoutMs: this.deps.timeoutMs(),
    });
    return outcomeFromResult(res);
  }
}

function outcomeFromResult(res: ShortcutResult): TranscribeOutcome {
  if (res.ok) return { ok: true, text: res.result, audioS: 0, dauerS: res.durationMs / 1000, rtf: 0 };
  return { ok: false, kind: GENERIC_FAILURE, detail: res.message };
}
