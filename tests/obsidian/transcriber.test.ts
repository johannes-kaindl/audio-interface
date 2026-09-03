import { describe, expect, it } from "vitest";
import { Transcriber } from "../../src/obsidian/transcriber";

type Req = { url: string; method: string; body?: ArrayBuffer; contentType?: string };

/** Zwei Kanäle, 48 kHz — also genau das, was der Dienst NICHT direkt lesen könnte. */
const stereo48k = (frames: number) => ({
  channels: [new Float32Array(frames).fill(0.5), new Float32Array(frames).fill(-0.5)],
  sampleRate: 48000,
});

const makeTranscriber = (reply: (req: Req) => { status: number; json: unknown }, seen: Req[] = []) =>
  new Transcriber({
    baseUrl: () => "http://127.0.0.1:8765",
    request: (req) => {
      seen.push(req);
      return Promise.resolve(reply(req));
    },
    decode: () => Promise.resolve(stereo48k(4800)),
  });

describe("Transcriber.transcribeFile", () => {
  it("schickt 16-kHz-Mono-WAV, egal was hineingeht", async () => {
    const seen: Req[] = [];
    const t = makeTranscriber(() => ({ status: 200, json: { text: "hallo", audio_s: 0.1, dauer_s: 0.01, rtf: 0.1 } }), seen);

    const out = await t.transcribeFile(new ArrayBuffer(8));

    expect(out).toEqual({ ok: true, text: "hallo", audioS: 0.1, dauerS: 0.01, rtf: 0.1 });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("http://127.0.0.1:8765/transcribe");
    expect(seen[0]!.method).toBe("POST");

    // RIFF/WAVE mit 1 Kanal und 16000 Hz im Header — sonst hat die Kette
    // (dekodieren, mono mischen, resampeln, kodieren) irgendwo ausgesetzt.
    const wav = new DataView(seen[0]!.body!);
    expect(String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3))).toBe("RIFF");
    expect(wav.getUint16(22, true)).toBe(1);
    expect(wav.getUint32(24, true)).toBe(16000);
  });

  it("reicht einen Dienst-Fehler als Ergebnis durch, statt zu werfen", async () => {
    const t = makeTranscriber(() => ({ status: 503, json: { detail: "lädt noch" } }));
    const out = await t.transcribeFile(new ArrayBuffer(8));
    expect(out).toEqual({ ok: false, kind: "nicht_bereit", detail: "lädt noch" });
  });
});

describe("Transcriber.health", () => {
  it("liest den Zustand des Diensts", async () => {
    const t = makeTranscriber(() => ({
      status: 200,
      json: { zustand: "bereit", detail: "", ursache: null, retry_sinnvoll: true, engines_geladen: ["parakeet"] },
    }));
    expect(await t.health()).toEqual({
      state: "bereit",
      canTranscribe: true,
      detail: "",
      cause: null,
      retryUseful: true,
    });
  });

  it("antwortet der Dienst gar nicht, ist das nicht_erreichbar — kein Absturz", async () => {
    const t = new Transcriber({
      baseUrl: () => "http://127.0.0.1:8765",
      request: () => Promise.reject(new Error("ECONNREFUSED")),
      decode: () => Promise.resolve(stereo48k(16)),
    });
    expect(await t.health()).toEqual({
      state: "nicht_erreichbar",
      canTranscribe: false,
      detail: "",
      cause: null,
      retryUseful: true,
    });
  });
});
