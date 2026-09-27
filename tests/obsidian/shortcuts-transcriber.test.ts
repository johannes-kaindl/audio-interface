import { describe, expect, it } from "vitest";
import { ShortcutsTranscriber } from "../../src/obsidian/shortcuts-transcriber";
import type { ShortcutRun, ShortcutResult, ShortcutsBridge } from "../../src/vendor/kit-obsidian/shortcuts-bridge";

const makeBridge = (reply: (req: ShortcutRun) => ShortcutResult, seen: ShortcutRun[] = []): ShortcutsBridge => ({
  run: (req) => {
    seen.push(req);
    return Promise.resolve(reply(req));
  },
});

describe("ShortcutsTranscriber.transcribePath", () => {
  it("reicht den Vault-Pfad als Input durch, ohne Bytes zu lesen — anders als der localhost-Weg", async () => {
    const seen: ShortcutRun[] = [];
    const bridge = makeBridge(() => ({ ok: true, result: "Guten Tag, hier ist ein Test.", durationMs: 17900 }), seen);
    const t = new ShortcutsTranscriber({ bridge, shortcutName: () => "Transcribe Audio (Obsidian)", timeoutMs: () => 120000 });

    const out = await t.transcribePath("Aufnahmen/mailbox.m4a");

    expect(out).toEqual({ ok: true, text: "Guten Tag, hier ist ein Test.", audioS: 0, dauerS: 17.9, rtf: 0 });
    expect(seen[0]).toEqual({ shortcut: "Transcribe Audio (Obsidian)", input: "Aufnahmen/mailbox.m4a", timeoutMs: 120000 });
  });

  it("bildet einen Brücken-Fehlschlag auf ein durchreichbares Ergebnis ab, statt zu werfen", async () => {
    const bridge = makeBridge(() => ({ ok: false, reason: "timeout", message: "keine Antwort innerhalb von 120000 ms", durationMs: 120000 }));
    const t = new ShortcutsTranscriber({ bridge, shortcutName: () => "x", timeoutMs: () => 120000 });

    expect(await t.transcribePath("a.m4a")).toEqual({ ok: false, kind: "dienst_fehler", detail: "keine Antwort innerhalb von 120000 ms" });
  });
});
