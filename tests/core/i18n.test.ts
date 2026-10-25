import { describe, expect, it } from "vitest";
import { DE, EN } from "../../src/i18n/strings";

describe("i18n-Wörterbücher", () => {
  it("DE und EN haben dieselben Schlüssel", () => {
    expect(Object.keys(DE).sort()).toEqual(Object.keys(EN).sort());
  });
  it("Platzhalter stimmen je Schlüssel überein", () => {
    for (const k of Object.keys(EN)) {
      const ph = (s: string) => (s.match(/\{\d\}/g) ?? []).sort();
      expect(ph(DE[k]), k).toEqual(ph(EN[k]));
    }
  });
  it("die Engine-Zeile nennt, dass die Ablage je Obsidian-Profil gilt und alle Vaults teilen", () => {
    expect(EN["settings.engine.desc"]).toMatch(/profile/);
    expect(EN["settings.engine.desc"]).toMatch(/all vaults/);
    expect(DE["settings.engine.desc"]).toMatch(/Profil/);
    expect(DE["settings.engine.desc"]).toMatch(/alle Vaults/);
  });
});
