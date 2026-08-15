import { describe, expect, it } from "vitest";
import { assetUrl, engineById, ENGINES, formatBytes, PIPER_DE_ENGINE_ID, totalBytes } from "../../src/core/engine-manifest";
import { exportEngineFor, speakEngineFor } from "../../src/core/engines";
import { DEFAULT_SETTINGS } from "../../src/core/settings-types";

describe("engine-manifest", () => {
  it("kennt Systemstimmen und die Piper-Stimme; Piper hat vier Assets", () => {
    expect(ENGINES.map((e) => e.kind)).toEqual(["builtin", "loadable"]);
    const piper = engineById(PIPER_DE_ENGINE_ID)!;
    expect(piper.assets.map((a) => a.key)).toEqual(["worker", "wasm", "model", "modelConfig"]);
    expect(totalBytes(piper)).toBeGreaterThan(70_000_000);
    for (const a of piper.assets) {
      expect(a.bytes).toBeGreaterThan(0);
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
  it("assetUrl hängt Version und Dateiname an, ohne doppelte Slashes", () => {
    const f = engineById(PIPER_DE_ENGINE_ID)!.assets[1];
    expect(assetUrl("https://x/releases/download/", "0.1.0", f)).toBe("https://x/releases/download/0.1.0/ort-wasm-simd-threaded.wasm");
  });
  it("formatBytes", () => {
    expect(formatBytes(63201294)).toBe("60,3 MB");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1536, ".")).toBe("1.5 KB");
  });
});

describe("engines", () => {
  const ready = { [PIPER_DE_ENGINE_ID]: "ready" as const };
  it("exportEngineFor: null ohne Opt-in oder ohne Bereitschaft", () => {
    expect(exportEngineFor(DEFAULT_SETTINGS, ready)).toBeNull();
    expect(exportEngineFor({ ...DEFAULT_SETTINGS, exportEnabled: true }, {})).toBeNull();
    expect(exportEngineFor({ ...DEFAULT_SETTINGS, exportEnabled: true }, { [PIPER_DE_ENGINE_ID]: "needs-download" })).toBeNull();
    expect(exportEngineFor({ ...DEFAULT_SETTINGS, exportEnabled: true }, ready)).toBe(PIPER_DE_ENGINE_ID);
  });
  it("speakEngineFor: Systemstimmen, außer ladbar gewünscht + bereit", () => {
    expect(speakEngineFor(DEFAULT_SETTINGS, ready)).toBe("system-voices");
    expect(speakEngineFor({ ...DEFAULT_SETTINGS, speakWithLoadable: true }, ready)).toBe("system-voices");
    expect(speakEngineFor({ ...DEFAULT_SETTINGS, speakWithLoadable: true, exportEnabled: true }, ready)).toBe(PIPER_DE_ENGINE_ID);
    expect(speakEngineFor({ ...DEFAULT_SETTINGS, speakWithLoadable: true, exportEnabled: true }, {})).toBe("system-voices");
  });
});
