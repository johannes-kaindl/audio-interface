import { describe, expect, it } from "vitest";
import { joinVaultPath, renderFileName } from "../../src/core/file-naming";
import { firstFreeName } from "../../src/vendor/kit/filename-policy";

describe("file-naming", () => {
  it("renderFileName ersetzt Platzhalter und illegale Zeichen", () => {
    expect(renderFileName("{{note}} {{date}}", { note: "A/B:C", date: "2026-08-15" })).toBe("A-B-C 2026-08-15");
    expect(renderFileName("{{ note }}", { note: "x", date: "" })).toBe("x");
    expect(renderFileName("   ", { note: "x", date: "" })).toBe("audio");
    expect(renderFileName("Ansage #1?", { note: "x", date: "" })).toBe("Ansage -1-");
  });
  it("Kollision: firstFreeName im Stil dash zählt hoch bis frei (Export und Umschrift; vorher withSuffix)", () => {
    const taken = new Set(["a.wav", "a-2.wav", "v1.2 notiz.md"]);
    expect(firstFreeName("a.wav", "file", (p) => taken.has(p), { style: "dash" })).toBe("a-3.wav");
    expect(firstFreeName("b.wav", "file", () => false, { style: "dash" })).toBe("b.wav");
    expect(firstFreeName("v1.2 notiz.md", "file", (p) => taken.has(p), { style: "dash" })).toBe("v1.2 notiz-2.md");   // ein Punkt im Namen stört nicht
  });
  it("joinVaultPath normalisiert Slashes", () => {
    expect(joinVaultPath("", "x.wav")).toBe("x.wav");
    expect(joinVaultPath("/Audio/", "x.wav")).toBe("Audio/x.wav");
    expect(joinVaultPath("Audio/Sub", "x.wav")).toBe("Audio/Sub/x.wav");
  });
});
