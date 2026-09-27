import { describe, expect, it } from "vitest";
import { createAudioProviderApi, type AudioProviderApiDeps } from "../../src/obsidian/plugin-api";
import { ExportError } from "../../src/obsidian/exporter";
import { ShortcutTtsError } from "../../src/obsidian/shortcut-tts";

function baseDeps(over: Partial<AudioProviderApiDeps> = {}): AudioProviderApiDeps {
  return {
    transcribeBackend: () => "localhost",
    transcribeLocalhostReady: async () => ({ ok: true }),
    readVaultBytes: async () => new ArrayBuffer(8),
    transcribeLocalhost: async () => ({ ok: true, text: "localhost-text", audioS: 1, dauerS: 1, rtf: 1 }),
    transcribeShortcut: async () => ({ ok: true, text: "shortcut-text", audioS: 0, dauerS: 1, rtf: 0 }),
    piperReady: () => false,
    speakPiper: async () => "attachments/piper.wav",
    ttsShortcutEnabled: () => false,
    speakShortcut: async () => "attachments/shortcut.caf",
    ...over,
  };
}

describe("createAudioProviderApi", () => {
  it("trägt version 1", () => {
    expect(createAudioProviderApi(baseDeps()).version).toBe(1);
  });

  describe("transcribe", () => {
    it("localhost: erfolgreich → Text", async () => {
      const api = createAudioProviderApi(baseDeps());
      expect(await api.transcribe("a.m4a")).toBe("localhost-text");
    });
    it("localhost: nicht erreichbar → backend-unavailable", async () => {
      const api = createAudioProviderApi(baseDeps({ transcribeLocalhostReady: async () => ({ ok: false, message: "antwortet nicht" }) }));
      expect(await api.transcribe("a.m4a")).toEqual({ error: "backend-unavailable", message: "antwortet nicht" });
    });
    it("localhost: Datei fehlt → not-found, OHNE den Dienst zu fragen", async () => {
      let asked = false;
      const api = createAudioProviderApi(baseDeps({ readVaultBytes: async () => null, transcribeLocalhost: async () => { asked = true; return { ok: true, text: "x", audioS: 0, dauerS: 0, rtf: 0 }; } }));
      expect(await api.transcribe("fehlt.m4a")).toEqual({ error: "not-found", message: "Datei nicht gefunden: fehlt.m4a" });
      expect(asked).toBe(false);
    });
    it("localhost: Dienst-Fehlschlag wird auf den Kit-Code abgebildet", async () => {
      const api = createAudioProviderApi(baseDeps({ transcribeLocalhost: async () => ({ ok: false, kind: "zu_gross", detail: "> 600s" }) }));
      expect(await api.transcribe("a.m4a")).toEqual({ error: "unsupported", message: "> 600s" });
    });
    it("shortcuts: erfolgreich → Text, ohne den localhost-Dienst zu fragen", async () => {
      let asked = false;
      const api = createAudioProviderApi(baseDeps({ transcribeBackend: () => "shortcuts", transcribeLocalhostReady: async () => { asked = true; return { ok: true }; } }));
      expect(await api.transcribe("a.m4a")).toBe("shortcut-text");
      expect(asked).toBe(false);
    });
    it("shortcuts: Timeout wird auf den Kit-Code abgebildet", async () => {
      const api = createAudioProviderApi(baseDeps({ transcribeBackend: () => "shortcuts", transcribeShortcut: async () => ({ ok: false, kind: "dienst_fehler", detail: "keine Antwort innerhalb von 120000 ms" }) }));
      expect(await api.transcribe("a.m4a")).toEqual({ error: "failed", message: "keine Antwort innerhalb von 120000 ms" });
    });
  });

  describe("speak", () => {
    it("bevorzugt Piper, wenn eine ladbare Stimme bereit ist", async () => {
      let shortcutCalled = false;
      const api = createAudioProviderApi(baseDeps({ piperReady: () => true, ttsShortcutEnabled: () => true, speakShortcut: async () => { shortcutCalled = true; return "x"; } }));
      expect(await api.speak("Text", { targetFolder: "attachments" })).toBe("attachments/piper.wav");
      expect(shortcutCalled).toBe(false);
    });
    it("fällt auf den Kurzbefehl-Weg zurück, wenn Piper nicht bereit ist", async () => {
      const api = createAudioProviderApi(baseDeps({ piperReady: () => false, ttsShortcutEnabled: () => true }));
      expect(await api.speak("Text", { targetFolder: "attachments" })).toBe("attachments/shortcut.caf");
    });
    it("meldet backend-unavailable, wenn weder Piper noch der Kurzbefehl-Weg bereitstehen", async () => {
      const api = createAudioProviderApi(baseDeps({ piperReady: () => false, ttsShortcutEnabled: () => false }));
      expect(await api.speak("Text", { targetFolder: "" })).toEqual({ error: "backend-unavailable", message: expect.any(String) });
    });
    it("bildet ExportError('empty') auf unsupported ab", async () => {
      const api = createAudioProviderApi(baseDeps({ piperReady: () => true, speakPiper: async () => { throw new ExportError("empty"); } }));
      expect(await api.speak("", { targetFolder: "" })).toEqual({ error: "unsupported", message: expect.any(String) });
    });
    it("bildet ShortcutTtsError('timeout') auf timeout ab", async () => {
      const api = createAudioProviderApi(baseDeps({ ttsShortcutEnabled: () => true, speakShortcut: async () => { throw new ShortcutTtsError("timeout", "keine Antwort innerhalb von 120000 ms"); } }));
      expect(await api.speak("Text", { targetFolder: "" })).toEqual({ error: "timeout", message: "keine Antwort innerhalb von 120000 ms" });
    });
  });
});
