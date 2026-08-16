import { describe, expect, it } from "vitest";
import { App, Plugin } from "obsidian";
import { engineById, PIPER_DE_ENGINE_ID } from "../../src/core/engine-manifest";
import type { EngineReadiness } from "../../src/core/engines";
import { IDLE, type RunState } from "../../src/core/run-state";
import { DEFAULT_SETTINGS } from "../../src/core/settings-types";
import { initI18n } from "../../src/i18n/strings";
import type { AssetStatus } from "../../src/obsidian/asset-store";
import { AudioInterfaceSettingTab, type SettingsHost } from "../../src/obsidian/settings-tab";

initI18n("de");
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function makeHost(over: Partial<SettingsHost> & { status?: AssetStatus; readiness?: EngineReadiness; dl?: RunState } = {}) {
  const calls = { start: 0, abort: 0, remove: 0, retry: 0, changed: [] as string[], saved: 0 };
  const host: SettingsHost = {
    settings: { ...DEFAULT_SETTINGS },
    saveSettings: async () => { calls.saved++; },
    listVoices: () => [{ uri: "en1", name: "Sam", lang: "en-US", local: true }, { uri: "de1", name: "Anna", lang: "de-DE", local: true }],
    piperDescriptor: engineById(PIPER_DE_ENGINE_ID)!,
    assetBaseUrl: "https://github.com/x/releases/download",
    assetVersion: "0.1.0",
    assetStatus: async () => over.status ?? "missing",
    engineReadiness: async () => over.readiness ?? "off",
    engineError: () => "wasm boom",
    downloadState: () => over.dl ?? IDLE,
    startDownload: () => { calls.start++; },
    abortDownload: () => { calls.abort++; },
    removeAssets: async () => { calls.remove++; },
    retryEngine: () => { calls.retry++; },
    onSettingsChanged: (k) => { calls.changed.push(k); },
    ...over,
  };
  return { host, calls };
}
const makeTab = (host: SettingsHost) => new AudioInterfaceSettingTab(new App() as never, new (Plugin as unknown as new () => never)(), host);
const flat = (tab: AudioInterfaceSettingTab) => tab.getSettingDefinitions().flatMap((g) => ("items" in g ? g.items ?? [] : [g])) as { name?: string; control?: { key: string; options?: Record<string, string> }; render?: unknown }[];
const el = (tab: AudioInterfaceSettingTab) => tab.containerEl as unknown as FakeEl;
type FakeEl = { children: FakeEl[]; className: string; textContent?: string; __component?: { textValue?: string; clickCB?: () => void } };
const rowsIn = (tab: AudioInterfaceSettingTab) => el(tab).children.filter((c) => c.className.includes("setting-item")).length;

describe("AudioInterfaceSettingTab", () => {
  it("Export aus: nur Stimme, Tempo, Export-Toggle, Dienst-Hinweis; deutsche Stimme zuerst im Dropdown", () => {
    const { host } = makeHost(); const tab = makeTab(host);
    const items = flat(tab);
    expect(items.map((i) => i.control?.key ?? i.name)).toEqual(["speakVoiceUri", "speakRate", "exportEnabled", "Lokaler Sprachdienst"]);
    expect(Object.keys(items[0].control!.options!)).toEqual(["", "de1", "en1"]);
  });
  it("Export an + missing: Engine-Zeile (Hatch) mit „Herunterladen“ und Größe, Export-Felder sichtbar", async () => {
    const { host, calls } = makeHost({ status: "missing", readiness: "needs-download" });
    host.settings.exportEnabled = true;
    const tab = makeTab(host); tab.display(); await flush();
    const items = flat(tab);
    expect(items.some((i) => typeof i.render === "function" && i.name?.includes("Piper"))).toBe(true);
    expect(items.map((i) => i.control?.key).filter(Boolean)).toEqual(["speakVoiceUri", "speakRate", "exportEnabled", "exportProfile", "exportFilePattern", "exportInsertLink"]);
    const texts = allText(tab);
    expect(texts).toContain("Herunterladen (");
    expect(texts).toContain("MB");
    // Klick auf den Knopf → startDownload
    const btn = findButton(tab, "Herunterladen");
    btn.clickCB(); expect(calls.start).toBe(1);
  });
  it("complete + ready: „Bereit“ + Entfernen; speakWithLoadable-Zeile erscheint", async () => {
    const { host } = makeHost({ status: "complete", readiness: "ready" }); host.settings.exportEnabled = true;
    const tab = makeTab(host); tab.display(); await flush();
    expect(flat(tab).some((i) => i.control?.key === "speakWithLoadable")).toBe(true);
    expect(allText(tab)).toContain("Bereit · v");
    expect(findButton(tab, "Entfernen")).toBeTruthy();
  });
  it("laufender Download: Fortschritt + Abbrechen", async () => {
    const { host, calls } = makeHost({ status: "partial", readiness: "needs-download", dl: { kind: "running", phase: "downloading", done: 12 * 1048576, total: 78 * 1048576 } });
    host.settings.exportEnabled = true;
    const tab = makeTab(host); tab.display(); await flush();
    expect(allText(tab)).toContain("Lade 12.0/78.0 MB");
    findButton(tab, "Abbrechen").clickCB(); expect(calls.abort).toBe(1);
  });
  it("unavailable: Fehlertext + Erneut versuchen (retryEngine)", async () => {
    const { host, calls } = makeHost({ status: "complete", readiness: "unavailable" }); host.settings.exportEnabled = true;
    const tab = makeTab(host); tab.display(); await flush();
    expect(allText(tab)).toContain("wasm boom");
    findButton(tab, "Erneut").clickCB(); expect(calls.retry).toBe(1);
  });
  it("setControlValue klemmt über normalizeSettings, speichert, meldet; exportEnabled-Umschalten baut neu", async () => {
    const { host, calls } = makeHost(); const tab = makeTab(host); tab.display(); await flush();
    const before = rowsIn(tab);
    await tab.setControlValue("speakRate", 9);
    expect(host.settings.speakRate).toBe(2); expect(calls.saved).toBe(1); expect(calls.changed).toEqual(["speakRate"]);
    await tab.setControlValue("exportEnabled", true); await flush();
    expect(rowsIn(tab)).toBeGreaterThan(before);
  });
});

function allText(tab: AudioInterfaceSettingTab): string {
  const parts: string[] = [];
  const walk = (e: FakeEl): void => {
    if (e.textContent) parts.push(e.textContent);
    if (e.__component?.textValue) parts.push(e.__component.textValue);
    for (const c of e.children ?? []) walk(c);
  };
  walk(el(tab));
  return parts.join(" | ");
}

function findButton(tab: AudioInterfaceSettingTab, text: string): { clickCB: () => void } {
  const found: { clickCB: () => void }[] = [];
  const walk = (e: FakeEl): void => {
    if (e.__component?.textValue?.includes(text)) found.push(e.__component as { clickCB: () => void });
    for (const c of e.children ?? []) walk(c);
  };
  walk(el(tab));
  if (!found[0]) throw new Error(`button "${text}" not found`);
  return found[0];
}
