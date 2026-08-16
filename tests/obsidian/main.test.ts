import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import { PIPER_DE_ENGINE_ID, PIPER_EN_ENGINE_ID } from "../../src/core/engine-manifest";
import type { PiperEngine } from "../../src/obsidian/engines/piper-engine";
import { makeFakeApp } from "../vendor/kit/obsidian-mock";
import AudioInterfacePlugin from "../../src/main";

// Renderer-Globals, die main.ts beim Laden anfasst — minimal gestubbt.
const fakeSynth = { getVoices: () => [{ voiceURI: "de1", name: "Anna", lang: "de-DE", localService: true }], speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = { speechSynthesis: fakeSynth, setTimeout, clearTimeout };
  (globalThis as unknown as { activeWindow: unknown }).activeWindow = { fetch: vi.fn() };
  (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class { text: string; constructor(t: string) { this.text = t; } };
  (globalThis as unknown as { caches: unknown }).caches = { open: async () => ({ match: async () => undefined, put: async () => {}, delete: async () => true }) };
});

async function load(data: unknown = null) {
  const app = makeFakeApp();
  app.loadLocalStorage = () => null;
  const plugin = new AudioInterfacePlugin(app, { id: "audio-interface", name: "Audio Interface", version: "0.1.0" } as never);
  await plugin.saveData(data);
  await plugin.onload();
  await new Promise((r) => setTimeout(r, 0));
  return { app, plugin };
}
const cmd = (plugin: AudioInterfacePlugin, id: string) => (plugin as unknown as { commands: { id: string; checkCallback?: (c: boolean) => boolean; callback?: () => void }[] }).commands.find((c) => c.id === id)!;

describe("AudioInterfacePlugin", () => {
  it("registriert sechs Kommandos und einen Settings-Tab", async () => {
    const { plugin } = await load();
    const ids = (plugin as unknown as { commands: { id: string }[] }).commands.map((c) => c.id).sort();
    expect(ids).toEqual(["export-note-wav", "export-selection-wav", "speak-note", "speak-selection", "speak-stop", "speak-toggle-pause"]);
    expect((plugin as unknown as { settingTabs: unknown[] }).settingTabs.length).toBe(1);
  });
  it("Export-Kommandos sind ohne bereite Engine ausgeblendet", async () => {
    const { plugin, app } = await load({ exportEnabled: false });
    const view = new MarkdownView(new WorkspaceLeaf()); (view as unknown as { file: TFile }).file = new TFile();
    app.workspace.getActiveViewOfType.mockReturnValue(view);
    expect(cmd(plugin, "export-note-wav").checkCallback!(true)).toBe(false);
  });
  it("Export-Kommandos erscheinen mit Opt-in + bereiter Engine und Markdown-View", async () => {
    const { plugin, app } = await load({ exportEnabled: true });
    (plugin as unknown as { readiness: string }).readiness = "ready";
    expect(cmd(plugin, "export-note-wav").checkCallback!(true)).toBe(false); // keine View
    const view = new MarkdownView(new WorkspaceLeaf()); (view as unknown as { file: TFile }).file = new TFile();
    app.workspace.getActiveViewOfType.mockReturnValue(view);
    expect(cmd(plugin, "export-note-wav").checkCallback!(true)).toBe(true);
  });
  it("Settings werden normalisiert geladen", async () => {
    const { plugin } = await load({ speakRate: 7, exportProfile: "mp3" });
    expect(plugin.settings.speakRate).toBe(2); expect(plugin.settings.exportProfile).toBe("phone-8k");
  });
  it("ohne gespeicherte Wahl folgt die Stimme der Oberflächensprache (Mock: en)", async () => {
    const { plugin } = await load({ exportEnabled: true });
    expect(plugin.settings.exportEngineId).toBe(PIPER_EN_ENGINE_ID);
    expect(plugin.piper.id).toBe(PIPER_EN_ENGINE_ID);
  });
  it("eine gespeicherte Wahl überschreibt die Sprachvorwahl nicht", async () => {
    const { plugin } = await load({ exportEngineId: PIPER_DE_ENGINE_ID });
    expect(plugin.settings.exportEngineId).toBe(PIPER_DE_ENGINE_ID);
  });
  it("eingeschaltet ist immer nur die gewählte Stimme — beim Wechsel geht die alte aus", async () => {
    const { plugin } = await load({ exportEnabled: true, exportEngineId: PIPER_DE_ENGINE_ID });
    const engines = (plugin as unknown as { engines: Map<string, PiperEngine> }).engines;
    expect(engines.get(PIPER_DE_ENGINE_ID)!.isEnabled()).toBe(true);
    expect(engines.get(PIPER_EN_ENGINE_ID)!.isEnabled()).toBe(false);
    // wie der Nutzer: über den Settings-Tab
    const tab = (plugin as unknown as { settingTab: { setControlValue(k: string, v: unknown): Promise<void> } }).settingTab;
    await tab.setControlValue("exportEngineId", PIPER_EN_ENGINE_ID);
    expect(engines.get(PIPER_DE_ENGINE_ID)!.isEnabled()).toBe(false);
    expect(engines.get(PIPER_EN_ENGINE_ID)!.isEnabled()).toBe(true);
    expect(plugin.piper.id).toBe(PIPER_EN_ENGINE_ID);
  });
  it("onunload stoppt und gibt die Engine frei", async () => {
    const { plugin } = await load();
    const dispose = vi.spyOn(plugin.piper, "dispose"); const stop = vi.spyOn(plugin.speaker, "stop");
    plugin.onunload();
    expect(dispose).toHaveBeenCalled(); expect(stop).toHaveBeenCalled();
  });
});
