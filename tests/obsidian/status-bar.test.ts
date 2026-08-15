import { describe, expect, it } from "vitest";
import { initI18n } from "../../src/i18n/strings";
import { statusText } from "../../src/obsidian/status-bar";

initI18n("de");
describe("statusText", () => {
  it("idle → null", () => { expect(statusText({ kind: "idle" }, { kind: "idle" })).toBeNull(); });
  it("Rendern/Vorlesen/Pause aus dem Sprecher", () => {
    expect(statusText({ kind: "rendering", done: 2, total: 5 }, { kind: "idle" })).toBe("Rendern 2/5");
    expect(statusText({ kind: "speaking", paused: false, engine: "builtin", done: 0, total: 3 }, { kind: "idle" })).toBe("Vorlesen 1/3");
    expect(statusText({ kind: "speaking", paused: true, engine: "builtin", done: 1, total: 3 }, { kind: "idle" })).toBe("Pause 2/3");
  });
  it("Lauf-Zustände haben Vorrang: Download in MB, Rendern, Speichern", () => {
    expect(statusText({ kind: "idle" }, { kind: "running", phase: "downloading", done: 12 * 1048576, total: 78 * 1048576 })).toBe("Lade 12/78 MB");
    expect(statusText({ kind: "idle" }, { kind: "running", phase: "synthesizing", done: 3, total: 9 })).toBe("Rendern 3/9");
    expect(statusText({ kind: "idle" }, { kind: "running", phase: "writing", done: 0, total: 1 })).toBe("WAV wird gespeichert…");
  });
});
