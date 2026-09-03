import { describe, expect, it } from "vitest";
import { readServiceHealth, serviceStatus, transcribeOutcome } from "../../src/core/dictation-service";

describe("readServiceHealth", () => {
  it("wartet_auf_consent sperrt die Transkription nicht — maßgeblich ist engines_geladen", () => {
    const h = readServiceHealth({
      zustand: "wartet_auf_consent",
      detail: "Der Dialog wartet auf einen Klick.",
      engine: "parakeet",
      engines_geladen: ["parakeet"],
      version: "0.5.0",
    });
    expect(h.canTranscribe).toBe(true);
    expect(h.mic).toBe("wartet_auf_consent");
  });
});

describe("transcribeOutcome", () => {
  it("503 ist 'noch nicht bereit' — Dienst läuft, Modell fehlt", () => {
    const r = transcribeOutcome({ status: 503, body: { detail: "Engine 'parakeet' ist noch nicht bereit." } });
    expect(r).toEqual({
      ok: false,
      kind: "nicht_bereit",
      detail: "Engine 'parakeet' ist noch nicht bereit.",
    });
  });
});

describe("transcribeOutcome — Erfolgsfall", () => {
  it("200 liefert Text und die Messwerte des Diensts", () => {
    const r = transcribeOutcome({
      status: 200,
      body: { text: "Guten Morgen.", engine: "parakeet", audio_s: 2.5, dauer_s: 0.11, rtf: 0.044 },
    });
    expect(r).toEqual({ ok: true, text: "Guten Morgen.", audioS: 2.5, dauerS: 0.11, rtf: 0.044 });
  });
});

describe("transcribeOutcome — Fehlerarten", () => {
  it("400, 413 und 500 werden unterschieden, damit der Hinweis zum Fall passt", () => {
    const kind = (status: number) => {
      const r = transcribeOutcome({ status, body: { detail: "d" } });
      return r.ok ? "ok" : r.kind;
    };
    expect(kind(400)).toBe("unlesbar");
    expect(kind(413)).toBe("zu_lang");
    expect(kind(500)).toBe("dienst_fehler");
  });
  it("ein unbekannter Status fällt auf dienst_fehler zurück statt zu werfen", () => {
    const r = transcribeOutcome({ status: 418, body: {} });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.kind).toBe("dienst_fehler");
  });
});

describe("serviceStatus", () => {
  it("erreicht der Request den Dienst nicht, ist das der dritte Zustand — nicht ein Fehler des Diensts", () => {
    expect(serviceStatus({ reachable: false })).toEqual({ state: "nicht_erreichbar", canTranscribe: false });
  });
  it("antwortet der Dienst, kommt der Zustand aus seiner Meldung — Transkription bleibt davon unabhaengig", () => {
    const body = { zustand: "wartet_auf_consent", engines_geladen: ["parakeet"] };
    expect(serviceStatus({ reachable: true, body })).toEqual({
      state: "wartet_auf_consent",
      canTranscribe: true,
    });
  });
});
