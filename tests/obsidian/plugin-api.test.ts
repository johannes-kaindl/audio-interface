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
  // Abbruch nach Kit-Vertrag 0.93.0: ein schon abgebrochenes Signal liefert `aborted` ohne Backend-Aufruf,
  // ein Abbruch währenddessen ebenso (das späte Ergebnis wird verworfen); ohne Signal läuft alles wie bisher (Gegenprobe).
  describe("Abbruch (signal)", () => {
    const aborted = { error: "aborted", message: expect.any(String) };
    const gone = (): AbortSignal => AbortSignal.abort();
    /** Ein Backend, das hängt, bis der Test es freigibt — und danach ein spätes Ergebnis liefert. */
    function hanging<T>(late: T): { call: () => Promise<T>; release: () => void; calls: () => number } {
      let n = 0;
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => { release = r; });
      return { call: async () => { n++; await gate; return late; }, release: () => release(), calls: () => n };
    }

    it("transcribe (localhost): schon abgebrochen → aborted, kein Backend-Aufruf", async () => {
      const touched: string[] = [];
      const api = createAudioProviderApi(baseDeps({
        transcribeLocalhostReady: async () => { touched.push("ready"); return { ok: true }; },
        readVaultBytes: async () => { touched.push("read"); return new ArrayBuffer(8); },
        transcribeLocalhost: async () => { touched.push("stt"); return { ok: true, text: "x", audioS: 1, dauerS: 1, rtf: 1 }; },
      }));
      expect(await api.transcribe("a.m4a", { signal: gone() })).toEqual(aborted);
      expect(touched).toEqual([]);
    });
    it("transcribe (localhost): Abbruch währenddessen → aborted, spätes Ergebnis verworfen", async () => {
      const h = hanging<{ ok: true; text: string; audioS: number; dauerS: number; rtf: number }>({ ok: true, text: "spät", audioS: 1, dauerS: 1, rtf: 1 });
      const api = createAudioProviderApi(baseDeps({ transcribeLocalhost: h.call }));
      const c = new AbortController();
      const pending = api.transcribe("a.m4a", { signal: c.signal });
      await Promise.resolve();
      c.abort();
      expect(await pending).toEqual(aborted);
      h.release();
    });
    it("transcribe (localhost): mit nicht abgebrochenem Signal und ohne Signal läuft es normal (Gegenprobe)", async () => {
      const api = createAudioProviderApi(baseDeps());
      expect(await api.transcribe("a.m4a", { signal: new AbortController().signal })).toBe("localhost-text");
      expect(await api.transcribe("a.m4a")).toBe("localhost-text");
    });
    it("transcribe (Kurzbefehl): schon abgebrochen → aborted, kein Brücken-Aufruf; währenddessen → aborted", async () => {
      const h = hanging<{ ok: true; text: string; audioS: number; dauerS: number; rtf: number }>({ ok: true, text: "spät", audioS: 0, dauerS: 1, rtf: 0 });
      const api = createAudioProviderApi(baseDeps({ transcribeBackend: () => "shortcuts", transcribeShortcut: h.call }));
      expect(await api.transcribe("a.m4a", { signal: gone() })).toEqual(aborted);
      expect(h.calls()).toBe(0);
      const c = new AbortController();
      const pending = api.transcribe("a.m4a", { signal: c.signal });
      await Promise.resolve();
      c.abort();
      expect(await pending).toEqual(aborted);
      expect(h.calls()).toBe(1);
      h.release();
    });
    it("speak (Piper): schon abgebrochen → aborted, kein Synthese-Aufruf", async () => {
      let called = false;
      const api = createAudioProviderApi(baseDeps({ piperReady: () => true, speakPiper: async () => { called = true; return "x.wav"; } }));
      expect(await api.speak("Text", { targetFolder: "", signal: gone() })).toEqual(aborted);
      expect(called).toBe(false);
    });
    it("speak (Piper): reicht das Signal durch; ExportError('aborted') wird aborted (nichts im Vault)", async () => {
      let seen: AbortSignal | undefined;
      const c = new AbortController();
      const api = createAudioProviderApi(baseDeps({
        piperReady: () => true,
        speakPiper: async (_t, _f, signal) => { seen = signal; c.abort(); throw new ExportError("aborted"); },
      }));
      expect(await api.speak("Text", { targetFolder: "", signal: c.signal })).toEqual(aborted);
      expect(seen).toBe(c.signal);
    });
    it("speak (Kurzbefehl): schon abgebrochen → aborted ohne Aufruf; währenddessen → aborted, spätes Ergebnis verworfen", async () => {
      const h = hanging("attachments/spaet.caf");
      const api = createAudioProviderApi(baseDeps({ ttsShortcutEnabled: () => true, speakShortcut: h.call }));
      expect(await api.speak("Text", { targetFolder: "", signal: gone() })).toEqual(aborted);
      expect(h.calls()).toBe(0);
      const c = new AbortController();
      const pending = api.speak("Text", { targetFolder: "", signal: c.signal });
      await Promise.resolve();
      c.abort();
      expect(await pending).toEqual(aborted);
      h.release();
    });
    it("speak (Kurzbefehl): ein nach dem Abbruch scheiternder Lauf bleibt ohne unbehandelte Ablehnung", async () => {
      let fail: (e: Error) => void = () => {};
      const api = createAudioProviderApi(baseDeps({ ttsShortcutEnabled: () => true, speakShortcut: () => new Promise<string>((_r, rej) => { fail = rej; }) }));
      const c = new AbortController();
      const pending = api.speak("Text", { targetFolder: "", signal: c.signal });
      await Promise.resolve();
      c.abort();
      expect(await pending).toEqual(aborted);
      fail(new Error("zu spät"));
      await new Promise((r) => setTimeout(r, 0));
    });
    it("speak: ohne Signal und mit nicht abgebrochenem Signal unverändert (Gegenprobe)", async () => {
      const api = createAudioProviderApi(baseDeps({ piperReady: () => true }));
      expect(await api.speak("Text", { targetFolder: "" })).toBe("attachments/piper.wav");
      expect(await api.speak("Text", { targetFolder: "", signal: new AbortController().signal })).toBe("attachments/piper.wav");
    });
  });
});
