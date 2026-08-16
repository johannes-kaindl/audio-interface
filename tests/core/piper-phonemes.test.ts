import { describe, expect, it } from "vitest";
import { ipaToIds, langPackFor, parsePiperConfig } from "../../src/core/piper-phonemes";

const map = { _: [0], "^": [1], $: [2], " ": [3], ɡ: [10], ˈ: [11], u: [12], ː: [13] };

describe("ipaToIds", () => {
  it("BOS, (id, PAD)*, EOS", () => {
    expect(ipaToIds("ɡˈuː", map)).toEqual({ ids: [1, 10, 0, 11, 0, 12, 0, 13, 0, 2], unknown: [] });
  });
  it("meldet unbekannte Zeichen einmal und überspringt sie", () => {
    const r = ipaToIds("ɡ??x", map);
    expect(r.ids).toEqual([1, 10, 0, 2]);
    expect(r.unknown).toEqual(["?", "x"]);
  });
  it("Leerstring → nur BOS/EOS", () => {
    expect(ipaToIds("", map).ids).toEqual([1, 2]);
  });
});

describe("parsePiperConfig", () => {
  it("wirft mit Klartext bei fehlenden Feldern", () => {
    expect(() => parsePiperConfig({})).toThrow(/audio/);
    expect(() => parsePiperConfig({ audio: { sample_rate: 22050 } })).toThrow(/espeak/);
    expect(() => parsePiperConfig({ audio: { sample_rate: 22050 }, espeak: { voice: "de" }, inference: {} })).toThrow(/phoneme_id_map/);
  });
  it("übernimmt Felder, ergänzt Inference-Defaults, filtert kaputte Map-Einträge", () => {
    const c = parsePiperConfig({ audio: { sample_rate: 22050, quality: "medium" }, espeak: { voice: "de" }, inference: { noise_scale: 0.5 }, phoneme_id_map: { a: [4], b: "x" } });
    expect(c.audio.sample_rate).toBe(22050);
    expect(c.inference).toEqual({ noise_scale: 0.5, length_scale: 1, noise_w: 0.8 });
    expect(c.phoneme_id_map).toEqual({ a: [4] });
  });
});

describe("langPackFor", () => {
  it("englische Stimmen ziehen en-all, alles andere gmw", () => {
    // Piper schreibt fuer en_US-Stimmen mal `en` (ljspeech, kristin), mal `en-us` (joe, amy).
    expect(langPackFor("en")).toBe("en-all");
    expect(langPackFor("en-us")).toBe("en-all");
    expect(langPackFor("en-US")).toBe("en-all");
    expect(langPackFor("en-GB-x-rp")).toBe("en-all");
    expect(langPackFor("de")).toBe("gmw");
    expect(langPackFor("nl")).toBe("gmw");
  });
});
