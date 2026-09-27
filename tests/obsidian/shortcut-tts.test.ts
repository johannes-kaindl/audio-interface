import { describe, expect, it } from "vitest";
import { ShortcutTtsError, speakViaShortcut } from "../../src/obsidian/shortcut-tts";
import type { ShortcutRun, ShortcutResult, ShortcutsBridge } from "../../src/vendor/kit-obsidian/shortcuts-bridge";

const makeBridge = (reply: (req: ShortcutRun) => ShortcutResult, seen: ShortcutRun[] = []): ShortcutsBridge => ({
  run: (req) => {
    seen.push(req);
    return Promise.resolve(reply(req));
  },
});

const deps = (bridge: ShortcutsBridge, overrides: Partial<{ shortcutName: string; timeoutMs: number; targetFolder: string; now: number }> = {}) => ({
  bridge,
  shortcutName: () => overrides.shortcutName ?? "Speak Text (Obsidian)",
  timeoutMs: () => overrides.timeoutMs ?? 120000,
  targetFolder: () => overrides.targetFolder ?? "attachments",
  now: () => overrides.now ?? 1234567890,
});

describe("speakViaShortcut", () => {
  it("faltet Markdown zu Klartext und schickt ihn als expectFile-Lauf", async () => {
    const seen: ShortcutRun[] = [];
    const bridge = makeBridge(() => ({ ok: true, result: "", file: "attachments/note-1234567890.caf", durationMs: 500 }), seen);

    const path = await speakViaShortcut("# Titel\n\nHallo **Welt**.", deps(bridge), "note");

    expect(path).toBe("attachments/note-1234567890.caf");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.input).toBe("Titel Hallo Welt.");
    expect(seen[0]!.shortcut).toBe("Speak Text (Obsidian)");
    expect(seen[0]!.timeoutMs).toBe(120000);
    expect(seen[0]!.expectFile?.vaultPathPrefix).toBe("attachments/note-1234567890");
  });

  it("wirft ShortcutTtsError('empty') statt die Brücke zu rufen, wenn nichts zu sprechen ist", async () => {
    const seen: ShortcutRun[] = [];
    const bridge = makeBridge(() => ({ ok: true, result: "", file: "x.caf", durationMs: 1 }), seen);

    await expect(speakViaShortcut("```\ncode\n```", deps(bridge), "note")).rejects.toThrow(ShortcutTtsError);
    expect(seen).toHaveLength(0);
  });

  it("reicht einen Fehlschlag der Brücke als ShortcutTtsError durch", async () => {
    const bridge = makeBridge(() => ({ ok: false, reason: "timeout", message: "keine Antwort innerhalb von 120000 ms", durationMs: 120000 }));
    await expect(speakViaShortcut("Text", deps(bridge), "note")).rejects.toMatchObject({ code: "timeout", message: "keine Antwort innerhalb von 120000 ms" });
  });

  it("wirft file-missing, wenn die Brücke ok meldet aber keine Datei nennt", async () => {
    const bridge = makeBridge(() => ({ ok: true, result: "", durationMs: 5 }));
    await expect(speakViaShortcut("Text", deps(bridge), "note")).rejects.toMatchObject({ code: "file-missing" });
  });
});
