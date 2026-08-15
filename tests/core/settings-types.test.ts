import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/core/settings-types";

describe("normalizeSettings", () => {
  it("liefert Defaults für null/undefined/Müll", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("x")).toEqual(DEFAULT_SETTINGS);
  });
  it("teilt keine Referenz mit den Defaults", () => {
    const a = normalizeSettings({});
    expect(a).not.toBe(DEFAULT_SETTINGS);
  });
  it("klemmt speakRate auf 0.5–2 und verwirft NaN/Strings", () => {
    expect(normalizeSettings({ speakRate: 9 }).speakRate).toBe(2);
    expect(normalizeSettings({ speakRate: 0.1 }).speakRate).toBe(0.5);
    expect(normalizeSettings({ speakRate: "1.5" }).speakRate).toBe(DEFAULT_SETTINGS.speakRate);
    expect(normalizeSettings({ speakRate: Number.NaN }).speakRate).toBe(DEFAULT_SETTINGS.speakRate);
  });
  it("verwirft falsch getypte Felder auf den Default (Strings, Booleans)", () => {
    expect(normalizeSettings({ exportEnabled: "yes" }).exportEnabled).toBe(false);
    expect(normalizeSettings({ exportFolder: 42 }).exportFolder).toBe("");
    expect(normalizeSettings({ exportInsertLink: true }).exportInsertLink).toBe(true);
  });
  it("verwirft unbekannte exportProfile-Werte auf den Default", () => {
    expect(normalizeSettings({ exportProfile: "mp3" }).exportProfile).toBe("phone-8k");
    expect(normalizeSettings({ exportProfile: "native" }).exportProfile).toBe("native");
  });
  it("leeres Dateimuster fällt auf Default zurück", () => {
    expect(normalizeSettings({ exportFilePattern: "   " }).exportFilePattern).toBe("{{note}}");
    expect(normalizeSettings({ exportFilePattern: "{{date}}-{{note}}" }).exportFilePattern).toBe("{{date}}-{{note}}");
  });
  it("behält unbekannte Felder nicht (kein Forward-Compat-Müll im Typ) — aber wirft nicht", () => {
    const s = normalizeSettings({ foo: 1 }) as unknown as Record<string, unknown>;
    expect(s.foo).toBeUndefined();
  });
});
