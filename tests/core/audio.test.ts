import { describe, expect, it } from "vitest";
import { concatWithSilence, encodeWav, normalizePeak, resample, silence, toInt16 } from "../../src/core/audio";

const sine = (f: number, sr: number, sec: number) =>
  Float32Array.from({ length: Math.round(sr * sec) }, (_, i) => Math.sin((2 * Math.PI * f * i) / sr));
const dominantHz = (x: Float32Array, sr: number) => {
  let zc = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 !== x[i] < 0) zc++;
  return zc / 2 / (x.length / sr);
};
const peakOf = (x: Float32Array) => x.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
const rmsOf = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

describe("silence / concatWithSilence", () => {
  it("silence rundet auf Samples", () => {
    expect(silence(50, 1000).length).toBe(50);
    expect(silence(0, 1000).length).toBe(0);
  });
  it("fügt Pausen in Samples ein und wirft bei Raten-Mismatch", () => {
    const a = { samples: new Float32Array(100).fill(0.5), sampleRate: 1000 };
    const out = concatWithSilence([{ pcm: a, pauseAfterMs: 50 }, { pcm: a, pauseAfterMs: 0 }], 1000);
    expect(out.sampleRate).toBe(1000);
    expect(out.samples.length).toBe(250);
    expect(out.samples[120]).toBe(0);
    expect(out.samples[160]).toBe(0.5);
    expect(() => concatWithSilence([{ pcm: { ...a, sampleRate: 2000 }, pauseAfterMs: 0 }], 1000)).toThrow(/sample rate/);
  });
  it("leere Liste → leerer Puffer", () => {
    expect(concatWithSilence([], 8000).samples.length).toBe(0);
  });
});

describe("resample", () => {
  it("22050→8000: Länge stimmt, 400-Hz-Ton bleibt 400 Hz, Amplitude ~1", () => {
    const out = resample({ samples: sine(400, 22050, 1), sampleRate: 22050 }, 8000);
    expect(out.sampleRate).toBe(8000);
    expect(Math.abs(out.samples.length - 8000)).toBeLessThanOrEqual(1);
    expect(dominantHz(out.samples, 8000)).toBeCloseTo(400, -1);
    const peak = peakOf(out.samples.subarray(200, 7800));
    expect(peak).toBeGreaterThan(0.9);
    expect(peak).toBeLessThan(1.05);
  });
  it("dämpft Anteile über der neuen Nyquist-Grenze (Anti-Aliasing)", () => {
    const out = resample({ samples: sine(6000, 22050, 1), sampleRate: 22050 }, 8000);
    expect(rmsOf(out.samples)).toBeLessThan(0.1);
  });
  it("gleiche Rate liefert Kopie", () => {
    const p = { samples: sine(1, 100, 1), sampleRate: 100 };
    const o = resample(p, 100);
    expect(o.samples).not.toBe(p.samples);
    expect(o.samples).toEqual(p.samples);
  });
  it("Upsampling 8000→22050 behält Frequenz", () => {
    const out = resample({ samples: sine(300, 8000, 1), sampleRate: 8000 }, 22050);
    expect(Math.abs(out.samples.length - 22050)).toBeLessThanOrEqual(1);
    expect(dominantHz(out.samples, 22050)).toBeCloseTo(300, -1);
  });
});

describe("toInt16 / encodeWav / normalizePeak", () => {
  it("klemmt und skaliert", () => {
    expect(Array.from(toInt16(Float32Array.from([0, 1, -1, 2, -2, 0.5])))).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
  });
  it("schreibt gültigen RIFF-Header (mono 16 bit)", () => {
    const wav = encodeWav({ samples: new Float32Array(10), sampleRate: 8000 });
    const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe("WAVE");
    expect(String.fromCharCode(...wav.subarray(12, 16))).toBe("fmt ");
    expect(dv.getUint32(16, true)).toBe(16);
    expect(dv.getUint16(20, true)).toBe(1);
    expect(dv.getUint16(22, true)).toBe(1);
    expect(dv.getUint32(24, true)).toBe(8000);
    expect(dv.getUint32(28, true)).toBe(16000);
    expect(dv.getUint16(32, true)).toBe(2);
    expect(dv.getUint16(34, true)).toBe(16);
    expect(String.fromCharCode(...wav.subarray(36, 40))).toBe("data");
    expect(dv.getUint32(40, true)).toBe(20);
    expect(wav.length).toBe(64);
    expect(dv.getUint32(4, true)).toBe(56);
  });
  it("normalizePeak senkt nur ab, hebt nie an", () => {
    expect(peakOf(normalizePeak(Float32Array.from([0.5, -2]), 0.9))).toBeCloseTo(0.9, 5);
    const quiet = Float32Array.from([0.1, -0.2]);
    expect(normalizePeak(quiet, 0.9)).toBe(quiet);
  });
});
