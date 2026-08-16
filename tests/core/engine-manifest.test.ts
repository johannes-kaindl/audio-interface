import { describe, expect, it } from "vitest";
import {
  assetUrl,
  defaultExportEngineId,
  engineById,
  ENGINES,
  formatBytes,
  isLoadableEngineId,
  loadableEngines,
  missingBytes,
  PIPER_DE_ENGINE_ID,
  PIPER_EN_ENGINE_ID,
  totalBytes,
} from "../../src/core/engine-manifest";
import { exportEngineFor, speakEngineFor } from "../../src/core/engines";
import { DEFAULT_SETTINGS } from "../../src/core/settings-types";

describe("engine-manifest", () => {
  it("kennt Systemstimmen und zwei ladbare Stimmen; jede hat vier Assets", () => {
    expect(ENGINES.map((e) => e.kind)).toEqual(["builtin", "loadable", "loadable"]);
    expect(loadableEngines().map((e) => e.id)).toEqual([PIPER_DE_ENGINE_ID, PIPER_EN_ENGINE_ID]);
    for (const e of loadableEngines()) {
      expect(e.assets.map((a) => a.key)).toEqual(["worker", "wasm", "model", "modelConfig"]);
      expect(totalBytes(e)).toBeGreaterThan(70_000_000);
      for (const a of e.assets) {
        expect(a.bytes).toBeGreaterThan(0);
        expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
    expect(engineById(PIPER_DE_ENGINE_ID)!.tempo).toBe(0.85);
    expect(engineById(PIPER_DE_ENGINE_ID)!.lang).toBe("de");
    expect(engineById(PIPER_EN_ENGINE_ID)!.lang).toBe("en");
  });
  it("Worker und ORT-WASM sind byte- und namensgleich geteilt, Modelle nicht", () => {
    const [de, en] = loadableEngines();
    const shared = (e: typeof de) => e.assets.filter((a) => a.key === "worker" || a.key === "wasm");
    expect(shared(de)).toEqual(shared(en));
    const model = (e: typeof de) => e.assets.find((a) => a.key === "model")!.fileName;
    expect(model(de)).not.toBe(model(en));
  });
  it("missingBytes zählt nur, was fehlt — die zweite Stimme kostet ihr Modell, nicht die Laufzeit", () => {
    const [de, en] = loadableEngines();
    expect(missingBytes(de, new Set())).toBe(totalBytes(de));
    const afterDe = new Set(de.assets.map((a) => a.fileName));
    expect(missingBytes(en, afterDe)).toBe(en.assets.filter((a) => a.key === "model" || a.key === "modelConfig").reduce((n, a) => n + a.bytes, 0));
    expect(missingBytes(en, afterDe)).toBeLessThan(totalBytes(en) - 13_000_000);
  });
  it("isLoadableEngineId kennt nur die ladbaren", () => {
    expect(isLoadableEngineId(PIPER_EN_ENGINE_ID)).toBe(true);
    expect(isLoadableEngineId("system-voices")).toBe(false);
    expect(isLoadableEngineId("piper-fr-nobody")).toBe(false);
  });
  it("defaultExportEngineId folgt der Oberflächensprache, sonst der ersten Stimme", () => {
    expect(defaultExportEngineId("de")).toBe(PIPER_DE_ENGINE_ID);
    expect(defaultExportEngineId("en")).toBe(PIPER_EN_ENGINE_ID);
    expect(defaultExportEngineId("en-GB")).toBe(PIPER_EN_ENGINE_ID);
    expect(defaultExportEngineId("fr")).toBe(PIPER_DE_ENGINE_ID);
    expect(defaultExportEngineId(null)).toBe(PIPER_DE_ENGINE_ID);
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
  it("exportEngineFor folgt der gewählten Stimme, nicht der geladenen", () => {
    const s = { ...DEFAULT_SETTINGS, exportEnabled: true, exportEngineId: PIPER_EN_ENGINE_ID };
    expect(exportEngineFor(s, ready)).toBeNull();
    expect(exportEngineFor(s, { [PIPER_EN_ENGINE_ID]: "ready" })).toBe(PIPER_EN_ENGINE_ID);
  });
  it("speakEngineFor: Systemstimmen, außer ladbar gewünscht + bereit", () => {
    expect(speakEngineFor(DEFAULT_SETTINGS, ready)).toBe("system-voices");
    expect(speakEngineFor({ ...DEFAULT_SETTINGS, speakWithLoadable: true }, ready)).toBe("system-voices");
    expect(speakEngineFor({ ...DEFAULT_SETTINGS, speakWithLoadable: true, exportEnabled: true }, ready)).toBe(PIPER_DE_ENGINE_ID);
    expect(speakEngineFor({ ...DEFAULT_SETTINGS, speakWithLoadable: true, exportEnabled: true }, {})).toBe("system-voices");
    expect(speakEngineFor({ ...DEFAULT_SETTINGS, speakWithLoadable: true, exportEnabled: true, exportEngineId: PIPER_EN_ENGINE_ID }, { [PIPER_EN_ENGINE_ID]: "ready" })).toBe(PIPER_EN_ENGINE_ID);
  });
});
