import { describe, expect, it } from "vitest";
import { joinVaultPath, renderFileName, withSuffix } from "../../src/core/file-naming";

describe("file-naming", () => {
  it("renderFileName ersetzt Platzhalter und illegale Zeichen", () => {
    expect(renderFileName("{{note}} {{date}}", { note: "A/B:C", date: "2026-08-15" })).toBe("A-B-C 2026-08-15");
    expect(renderFileName("{{ note }}", { note: "x", date: "" })).toBe("x");
    expect(renderFileName("   ", { note: "x", date: "" })).toBe("audio");
    expect(renderFileName("Ansage #1?", { note: "x", date: "" })).toBe("Ansage -1-");
  });
  it("withSuffix zählt hoch bis frei", () => {
    const taken = new Set(["a.wav", "a-2.wav"]);
    expect(withSuffix("a", "wav", (p) => taken.has(p))).toBe("a-3.wav");
    expect(withSuffix("b", "wav", () => false)).toBe("b.wav");
  });
  it("joinVaultPath normalisiert Slashes", () => {
    expect(joinVaultPath("", "x.wav")).toBe("x.wav");
    expect(joinVaultPath("/Audio/", "x.wav")).toBe("Audio/x.wav");
    expect(joinVaultPath("Audio/Sub", "x.wav")).toBe("Audio/Sub/x.wav");
  });
});
