import { getLanguage, MarkdownView, Notice, Plugin, TFile, TFolder, type Editor } from "obsidian";
import { defaultExportEngineId, engineById, loadableEngines, RELEASE_BASE_URL, type EngineDescriptor } from "./core/engine-manifest";
import { exportEngineFor, speakEngineFor, type EngineReadiness } from "./core/engines";
import { abort, begin, fail, finish, IDLE, isBusy, progress, type RunState } from "./core/run-state";
import { normalizeSettings, type AudioInterfaceSettings } from "./core/settings-types";
import { initI18n, t } from "./i18n/strings";
import { AssetStore, realStoreDeps, type AssetStatus } from "./obsidian/asset-store";
import { PiperEngine, type WorkerLike } from "./obsidian/engines/piper-engine";
import { SystemSpeechEngine } from "./obsidian/engines/system-speech";
import { ExportError, runExport, type VaultPort } from "./obsidian/exporter";
import { AudioContextPlayer } from "./obsidian/pcm-player";
import { AudioInterfaceSettingTab, type SettingsHost } from "./obsidian/settings-tab";
import { Speaker, SpeakerError } from "./obsidian/speaker";
import { StatusBar } from "./obsidian/status-bar";
import { realClock } from "./vendor/kit-obsidian/clock";

/** Für den GUI-Smoke überschreibbar (lokaler Asset-Server): app.saveLocalStorage("audio-interface-asset-base", url). */
const ASSET_BASE_KEY = "audio-interface-asset-base";

function realMakeWorker(source: string): WorkerLike {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const worker = new Worker(url, { type: "module" });
  URL.revokeObjectURL(url);
  return worker as unknown as WorkerLike;
}

export default class AudioInterfacePlugin extends Plugin {
  settings: AudioInterfaceSettings = normalizeSettings(null);
  system!: SystemSpeechEngine;
  store!: AssetStore;
  speaker!: Speaker;
  /** Eine Engine je ladbarer Stimme; aktiv (Worker im Speicher) ist immer höchstens die gewählte. */
  private engines = new Map<string, PiperEngine>();
  private statusBar!: StatusBar;
  private player!: AudioContextPlayer;
  private settingTab!: AudioInterfaceSettingTab;
  private assetBaseUrl = RELEASE_BASE_URL;
  private readiness: EngineReadiness = "off";
  private download: { state: RunState; controller: AbortController | null } = { state: IDLE, controller: null };
  private exportController: AbortController | null = null;
  private exportState: RunState = IDLE;

  async onload(): Promise<void> {
    initI18n(getLanguage());
    await this.loadSettings();
    const stored: unknown = this.app.loadLocalStorage(ASSET_BASE_KEY);
    if (typeof stored === "string" && stored.trim() !== "") this.assetBaseUrl = stored.trim();

    if (loadableEngines().length === 0) throw new Error("engine manifest broken");
    // Asset-Version = Plugin-Version: die Release-Assets liegen am Tag des Plugins.
    this.store = new AssetStore(realStoreDeps(this.manifest.version, this.assetBaseUrl));
    this.system = new SystemSpeechEngine(window.speechSynthesis, (text) => new SpeechSynthesisUtterance(text), realClock);
    for (const descriptor of loadableEngines()) {
      this.engines.set(descriptor.id, new PiperEngine({ store: this.store, descriptor, makeWorker: realMakeWorker, clock: realClock }));
    }
    this.applyEngineSelection();
    this.player = new AudioContextPlayer();
    this.statusBar = new StatusBar(this.addStatusBarItem(), () => this.stopAll());
    this.speaker = new Speaker({
      system: this.system,
      loadable: () => (this.readiness === "ready" ? this.piper : null),
      player: this.player,
      onState: (s) => this.statusBar.setSpeaker(s),
    });
    this.settingTab = new AudioInterfaceSettingTab(this.app, this, this.settingsHost());
    this.addSettingTab(this.settingTab);
    this.registerCommands();
    this.addRibbonIcon("audio-lines", t("cmd.speakNote"), () => void this.speakActive("note"));
    void this.system.waitForVoices();
    // Der native Settings-Renderer (≥1.13) cacht die Definitionen beim addSettingTab — sobald die
    // Bereitschaft bekannt ist, einmal nachziehen.
    void this.refreshReadiness().then(() => this.settingTab.refresh());
  }

  onunload(): void {
    this.stopAll();
    for (const e of this.engines.values()) e.dispose();
    void this.player.close();
  }

  // ── Stimmenauswahl ───────────────────────────────────────────────────────
  /** Die gewählte ladbare Stimme. */
  get piper(): PiperEngine {
    const e = this.engines.get(this.settings.exportEngineId);
    if (!e) throw new Error(`unknown engine: ${this.settings.exportEngineId}`);
    return e;
  }

  private selectedDescriptor(): EngineDescriptor {
    const d = engineById(this.settings.exportEngineId);
    if (!d) throw new Error(`unknown engine: ${this.settings.exportEngineId}`);
    return d;
  }

  /** Nur die gewählte Stimme ist eingeschaltet — ein Modell im Speicher kostet ~250 MB, zwei
   *  Worker nebeneinander hätte niemand bestellt. `setEnabled(false)` gibt den Worker frei. */
  private applyEngineSelection(): void {
    for (const [id, engine] of this.engines) engine.setEnabled(this.settings.exportEnabled && id === this.settings.exportEngineId);
  }

  // ── Settings ─────────────────────────────────────────────────────────────
  async loadSettings(): Promise<void> {
    const raw: unknown = await this.loadData();
    this.settings = normalizeSettings(raw);
    // Erststart: Stimme nach Oberflächensprache vorwählen. Nur wenn NICHTS gespeichert ist — eine
    // getroffene Wahl darf ein Sprachwechsel in Obsidian nicht stillschweigend überschreiben.
    const stored = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>).exportEngineId : undefined;
    if (typeof stored !== "string") this.settings.exportEngineId = defaultExportEngineId(getLanguage());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private settingsHost(): SettingsHost {
    const host: SettingsHost = {
      settings: this.settings,
      saveSettings: () => this.saveSettings(),
      listVoices: () => this.system.listVoices(),
      loadableEngines: loadableEngines(),
      selectedEngine: () => this.selectedDescriptor(),
      assetBaseUrl: this.assetBaseUrl,
      assetVersion: this.manifest.version,
      assetOverview: async () => {
        const engines = loadableEngines();
        const statuses: Record<string, AssetStatus> = {};
        for (const e of engines) statuses[e.id] = await this.store.status(e);
        return { statuses, cachedFiles: [...(await this.store.cachedFileNames(engines))] };
      },
      engineReadiness: () => this.refreshReadiness(),
      engineError: () => this.piper.lastError(),
      downloadState: () => this.download.state,
      startDownload: () => void this.startDownload(),
      abortDownload: () => this.download.controller?.abort(),
      removeAssets: async () => {
        this.piper.dispose();
        await this.store.remove(this.selectedDescriptor(), loadableEngines());
        await this.refreshReadiness();
      },
      retryEngine: () => {
        this.piper.dispose();
        void this.refreshReadiness();
      },
      onSettingsChanged: (key) => {
        if (key === "exportEnabled" || key === "exportEngineId") {
          // Beim Stimmenwechsel läuft evtl. noch die alte Engine — erst anhalten, dann umschalten.
          if (key === "exportEngineId") this.speaker.stop();
          this.applyEngineSelection();
          void this.refreshReadiness();
        }
      },
    };
    // `settings` lebt im Plugin (Kommandos lesen es dort); der Tab schreibt über den Host — beide
    // Sichten zeigen auf dasselbe Objekt, ohne this-Alias.
    Object.defineProperty(host, "settings", {
      get: () => this.settings,
      set: (v: AudioInterfaceSettings) => {
        this.settings = v;
      },
    });
    return host;
  }

  private async refreshReadiness(): Promise<EngineReadiness> {
    this.readiness = await this.piper.readiness();
    return this.readiness;
  }

  // ── Download ─────────────────────────────────────────────────────────────
  private async startDownload(): Promise<void> {
    if (isBusy(this.download.state)) return;
    const controller = new AbortController();
    this.download = { state: begin("downloading"), controller };
    let lastRefresh = 0;
    const setState = (s: RunState, force = false): void => {
      this.download.state = s;
      this.statusBar.setRun(s);
      const now = Date.now();
      if (force || now - lastRefresh > 250) {
        lastRefresh = now;
        this.settingTab.refresh();
      }
    };
    try {
      await this.store.download(
        this.selectedDescriptor(),
        (p) => setState(progress(this.download.state, "downloading", p.overallReceived, p.overallTotal)),
        controller.signal,
      );
      setState(finish(this.download.state, "ok"), true);
    } catch (err) {
      if (controller.signal.aborted) setState(abort(this.download.state), true);
      else setState(fail(this.download.state, err instanceof Error ? err.message : String(err)), true);
    } finally {
      this.download.controller = null;
      await this.refreshReadiness();
      this.statusBar.setRun(IDLE);
      this.settingTab.refresh();
    }
  }

  // ── Kommandos ────────────────────────────────────────────────────────────
  private registerCommands(): void {
    this.addCommand({ id: "speak-note", name: t("cmd.speakNote"), callback: () => void this.speakActive("note") });
    this.addCommand({ id: "speak-selection", name: t("cmd.speakSelection"), callback: () => void this.speakActive("selection") });
    this.addCommand({ id: "speak-toggle-pause", name: t("cmd.togglePause"), callback: () => this.speaker.togglePause() });
    this.addCommand({ id: "speak-stop", name: t("cmd.stop"), callback: () => this.stopAll() });
    this.addCommand({
      id: "export-note-wav",
      name: t("cmd.exportNote"),
      checkCallback: (checking) => this.exportCommand(checking, "note"),
    });
    this.addCommand({
      id: "export-selection-wav",
      name: t("cmd.exportSelection"),
      checkCallback: (checking) => this.exportCommand(checking, "selection"),
    });
  }

  private exportCommand(checking: boolean, scope: "note" | "selection"): boolean {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const engineId = exportEngineFor(this.settings, { [this.settings.exportEngineId]: this.readiness });
    const can = view !== null && engineId !== null && !isBusy(this.exportState);
    if (!checking && can) void this.exportActive(scope);
    return can;
  }

  private stopAll(): void {
    this.speaker.stop();
    this.exportController?.abort();
    this.download.controller?.abort();
  }

  private activeSource(scope: "note" | "selection"): { view: MarkdownView; file: TFile; editor: Editor; text: string } | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice(t("notice.noMarkdownView"));
      return null;
    }
    const editor = view.editor;
    if (scope === "selection") {
      const sel = editor.getSelection();
      if (sel.trim() === "") {
        new Notice(t("notice.noSelection"));
        return null;
      }
      return { view, file: view.file, editor, text: sel };
    }
    return { view, file: view.file, editor, text: editor.getValue() };
  }

  private async speakActive(scope: "note" | "selection"): Promise<void> {
    const src = this.activeSource(scope);
    if (!src) return;
    const useLoadable = speakEngineFor(this.settings, { [this.settings.exportEngineId]: this.readiness }) === this.settings.exportEngineId;
    try {
      await this.speaker.speak(src.text, this.settings, useLoadable);
    } catch (err) {
      if (err instanceof SpeakerError) {
        new Notice(err.code === "empty" ? t("notice.empty") : t("notice.engineUnavailable"));
        return;
      }
      new Notice(t("notice.speakFailed", err instanceof Error ? err.message : String(err)));
      void this.refreshReadiness();
    }
  }

  private vaultPort(): VaultPort {
    const vault = this.app.vault;
    return {
      exists: (path) => vault.getAbstractFileByPath(path) !== null,
      folderExists: (path) => vault.getAbstractFileByPath(path) instanceof TFolder,
      createFolder: async (path) => {
        await vault.createFolder(path);
      },
      createBinary: async (path, data) => {
        const buf = new ArrayBuffer(data.byteLength);
        new Uint8Array(buf).set(data);
        await vault.createBinary(path, buf);
      },
    };
  }

  private async exportActive(scope: "note" | "selection"): Promise<void> {
    const src = this.activeSource(scope);
    if (!src) return;
    const controller = new AbortController();
    this.exportController = controller;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const result = await runExport(
        { markdown: src.text, noteBasename: src.file.basename, noteFolder: src.file.parent?.path === "/" ? "" : (src.file.parent?.path ?? ""), today },
        {
          engine: this.piper,
          vault: this.vaultPort(),
          settings: this.settings,
          onState: (s) => {
            this.exportState = s;
            this.statusBar.setRun(s);
          },
        },
        controller.signal,
      );
      new Notice(t("notice.exported", result.path, result.seconds.toFixed(1), String(result.sampleRate)));
      if (this.settings.exportInsertLink) {
        const cursor = src.editor.getCursor("to");
        src.editor.replaceRange(`\n![[${result.path}]]\n`, cursor);
      }
    } catch (err) {
      if (err instanceof ExportError && err.code === "aborted") new Notice(t("notice.exportAborted"));
      else if (err instanceof ExportError && err.code === "empty") new Notice(t("notice.empty"));
      else new Notice(t("notice.exportFailed", err instanceof Error ? err.message : String(err)));
      void this.refreshReadiness();
    } finally {
      this.exportController = null;
      this.exportState = IDLE;
      this.statusBar.setRun(IDLE);
    }
  }
}
