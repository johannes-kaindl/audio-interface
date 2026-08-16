// Zweigleisige Settings — EINE Wahrheit für beide Renderpfade (REGISTRY „Zweigleisige deklarative
// Settings — eine-Wahrheit-Walker"; Muster 3d-codeblocks/src/obsidian/settings.ts, Hatch-Muster
// paperless-storage/src/obsidian/settings-tab.ts). Bedingte Zeilen werden WEGGELASSEN, nicht per
// `visible` versteckt — der native 1.13-Renderer wertet `visible` an Gruppen-Items nicht aus.
import { PluginSettingTab, Setting, type App, type Plugin, type SettingDefinitionItem, type SettingGroupItem } from "obsidian";
import { formatBytes, totalBytes, type EngineDescriptor } from "../core/engine-manifest";
import type { EngineReadiness } from "../core/engines";
import type { RunState } from "../core/run-state";
import { normalizeSettings, SPEAK_RATE, type AudioInterfaceSettings } from "../core/settings-types";
import { t } from "../i18n/strings";
import { getLang } from "../vendor/kit/i18n";
import { confirmAction } from "../vendor/kit-obsidian/confirm";
import { FolderSuggest } from "../vendor/kit-obsidian/folder-suggest";
import { refreshSettingsTab, renderSettingDefinitions } from "../vendor/kit-obsidian/settings_walker";
import type { AssetStatus } from "./asset-store";
import type { VoiceInfo } from "./engines/system-speech";

/** Was der Tab vom Plugin braucht — als Interface, damit Tests eine Attrappe geben können. */
export interface SettingsHost {
  settings: AudioInterfaceSettings;
  saveSettings(): Promise<void>;
  listVoices(): VoiceInfo[];
  piperDescriptor: EngineDescriptor;
  assetBaseUrl: string;
  /** Version, unter der die Assets im Release liegen (= Plugin-Version). */
  assetVersion: string;
  assetStatus(): Promise<AssetStatus>;
  engineReadiness(): Promise<EngineReadiness>;
  engineError(): string | null;
  downloadState(): RunState;
  startDownload(): void;
  abortDownload(): void;
  removeAssets(): Promise<void>;
  retryEngine(): void;
  /** Wird nach jeder Wertänderung gerufen (Engine an/aus, Toggles). */
  onSettingsChanged(key: keyof AudioInterfaceSettings): void;
}

type Key = keyof AudioInterfaceSettings;
type Def = SettingGroupItem<Key>;

export class AudioInterfaceSettingTab extends PluginSettingTab {
  // Zwischengespeicherte asynchrone Zustände — getSettingDefinitions() muss synchron sein.
  private assetStatus: AssetStatus = "missing";
  private readiness: EngineReadiness = "off";
  private cleanupPrevious: () => void = () => {};

  constructor(
    app: App,
    plugin: Plugin,
    private readonly host: SettingsHost,
  ) {
    super(app, plugin);
  }

  // ── Die eine Wahrheit ────────────────────────────────────────────────────
  getSettingDefinitions(): SettingDefinitionItem<Key>[] {
    const s = this.host.settings;
    const voices = this.host.listVoices();
    const de = voices.filter((v) => v.lang.toLowerCase().startsWith("de"));
    const rest = voices.filter((v) => !v.lang.toLowerCase().startsWith("de"));
    const voiceOptions: Record<string, string> = { "": t("settings.speakVoiceUri.auto") };
    for (const v of [...de, ...rest]) voiceOptions[v.uri] = `${v.name} (${v.lang})`;

    const speakItems: Def[] = [
      {
        name: t("settings.speakVoiceUri.name"),
        desc: voices.length === 0 ? t("settings.speakVoiceUri.none") : t("settings.speakVoiceUri.desc"),
        control: { type: "dropdown", key: "speakVoiceUri", options: voiceOptions },
      },
      {
        name: t("settings.speakRate.name"),
        desc: t("settings.speakRate.desc"),
        control: { type: "slider", key: "speakRate", min: SPEAK_RATE.min, max: SPEAK_RATE.max, step: SPEAK_RATE.step, displayFormat: (v: number) => `${v.toFixed(1)}×` },
      },
    ];
    if (s.exportEnabled && this.readiness === "ready") {
      speakItems.push({
        name: t("settings.speakWithLoadable.name"),
        desc: t("settings.speakWithLoadable.desc"),
        control: { type: "toggle", key: "speakWithLoadable" },
      });
    }

    const exportItems: Def[] = [
      { name: t("settings.exportEnabled.name"), desc: t("settings.exportEnabled.desc"), control: { type: "toggle", key: "exportEnabled" } },
    ];
    if (s.exportEnabled) {
      exportItems.push(
        { name: this.host.piperDescriptor.label, desc: this.engineDesc(), render: (setting) => this.renderEngineRow(setting) },
        {
          name: t("settings.exportProfile.name"),
          desc: t("settings.exportProfile.desc"),
          control: { type: "dropdown", key: "exportProfile", options: { "phone-8k": t("settings.exportProfile.phone8k"), native: t("settings.exportProfile.native") } },
        },
        { name: t("settings.exportFolder.name"), desc: t("settings.exportFolder.desc"), render: (setting) => this.renderFolder(setting) },
        { name: t("settings.exportFilePattern.name"), desc: t("settings.exportFilePattern.desc"), control: { type: "text", key: "exportFilePattern" } },
        { name: t("settings.exportInsertLink.name"), desc: t("settings.exportInsertLink.desc"), control: { type: "toggle", key: "exportInsertLink" } },
      );
    }

    return [
      { type: "group", heading: t("settings.speak.heading"), items: speakItems },
      { type: "group", heading: t("settings.export.heading"), items: exportItems },
      { type: "group", heading: t("settings.dienst.heading"), items: [{ name: t("settings.dienst.name"), desc: t("settings.dienst.desc") }] },
    ];
  }

  private size(): string {
    return formatBytes(totalBytes(this.host.piperDescriptor), getLang() === "de" ? "," : ".");
  }

  private engineDesc(): string {
    const d = this.host.piperDescriptor;
    return t("settings.engine.desc", this.size(), this.host.assetBaseUrl, d.licenseSummary);
  }

  /** Engine-Zeile: Zustand + genau der Knopf, der jetzt sinnvoll ist. */
  private renderEngineRow(setting: Setting): void {
    const dl = this.host.downloadState();
    const size = this.size();
    setting.setName(this.host.piperDescriptor.label);
    setting.setDesc(this.engineDesc());
    if (dl.kind === "running") {
      const mb = (n: number) => (n / 1048576).toFixed(1);
      setting.controlEl.createSpan({ text: t("settings.engine.downloading", mb(dl.done), mb(dl.total)), cls: "audio-interface-engine-state" });
      setting.addButton((b) => b.setButtonText(t("settings.engine.abort")).onClick(() => this.host.abortDownload()));
      return;
    }
    if (this.readiness === "unavailable") {
      setting.controlEl.createSpan({ text: t("settings.engine.error", this.host.engineError() ?? "?"), cls: "audio-interface-engine-state mod-warning" });
      setting.addButton((b) => b.setButtonText(t("settings.engine.retry")).onClick(() => { this.host.retryEngine(); this.refresh(); }));
      setting.addButton((b) => b.setButtonText(t("settings.engine.remove")).onClick(() => void this.confirmRemove()));
      return;
    }
    if (dl.kind === "failed") {
      setting.controlEl.createSpan({ text: t("settings.engine.error", dl.message), cls: "audio-interface-engine-state mod-warning" });
      setting.addButton((b) => b.setButtonText(t("settings.engine.retry")).setCta().onClick(() => this.host.startDownload()));
      return;
    }
    if (this.assetStatus === "complete") {
      setting.controlEl.createSpan({ text: t("settings.engine.ready", this.host.assetVersion), cls: "audio-interface-engine-state" });
      setting.addButton((b) => b.setButtonText(t("settings.engine.remove")).onClick(() => void this.confirmRemove()));
      return;
    }
    if (this.assetStatus === "partial") {
      setting.controlEl.createSpan({ text: t("settings.engine.partial"), cls: "audio-interface-engine-state" });
    }
    setting.addButton((b) => b.setButtonText(t("settings.engine.download", size)).setCta().onClick(() => this.host.startDownload()));
  }

  private async confirmRemove(): Promise<void> {
    const ok = await confirmAction(this.app, { message: t("settings.engine.removeConfirm"), confirmLabel: t("settings.engine.remove"), warning: true });
    if (!ok) return;
    await this.host.removeAssets();
    this.refresh();
  }

  private renderFolder(setting: Setting): void {
    setting.addText((text) => {
      text.setValue(this.host.settings.exportFolder).onChange((v) => void this.setControlValue("exportFolder", v));
      new FolderSuggest(this.app, text.inputEl);
    });
  }

  getControlValue(key: string): unknown {
    return (this.host.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    // Immer durch normalizeSettings: einzige Stelle, die Müllwerte abfängt (der deklarative Host
    // prüft nur den Typ, nicht unsere Grenzen).
    this.host.settings = normalizeSettings({ ...this.host.settings, [key]: value });
    await this.host.saveSettings();
    this.host.onSettingsChanged(key as keyof AudioInterfaceSettings);
    if (key === "exportEnabled") this.refresh();
  }

  /** Zustände frisch lesen (Cache API, Engine) und den Tab neu zeichnen — nie aus gespeicherten Werten. */
  refresh(): void {
    void Promise.all([this.host.assetStatus(), this.host.engineReadiness()]).then(([status, readiness]) => {
      this.assetStatus = status;
      this.readiness = readiness;
      refreshSettingsTab(this, () => this.rebuild());
    });
  }

  // ── Imperativer Fallback (Obsidian < 1.13) ───────────────────────────────
  private rebuild(): void {
    this.cleanupPrevious();
    this.containerEl.empty();
    this.cleanupPrevious = renderSettingDefinitions(this.containerEl, this.getSettingDefinitions(), this, this.app);
  }

  display(): void {
    this.rebuild();
    this.refresh();
  }

  /** Gemessen (Obsidian 1.13.7, 2026-08-15): beim Öffnen des Tabs ruft der Host weder `display()`
   *  noch `getSettingDefinitions()`, sondern rendert die beim `addSettingTab` gecachten
   *  `settingItems` — und ruft vorher `hide()`. Bedingte Zeilen (Engine-Zeile, Export-Felder)
   *  wären sonst so alt wie der Plugin-Start; deshalb stößt `hide()` einen Refresh an, der die
   *  Zustände frisch liest und `update()` ruft. Beim Schließen läuft er ebenfalls — harmlos. */
  hide(): void {
    this.cleanupPrevious();
    this.cleanupPrevious = () => {};
    this.refresh();
  }
}
