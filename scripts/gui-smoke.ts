/**
 * GUI-Smoke-Treiber (Skill gui-smoke-setup, CORE-TEST-02 b): fährt die Prüfpunkte aus
 * `docs/SMOKE.md` gegen ein LAUFENDES Obsidian — echte Systemstimmen, echter Blob-Worker mit
 * ORT-WASM, echte Cache API, echte Vault-Datei. Das ist die Naht, die kein Unit-Test sieht.
 *
 * ## Voraussetzung: eine Zweitinstanz, nie die reguläre
 *
 * Der Treiber hat keinen Standardport. Die reguläre Instanz (9222) gehört den Sessions, die an ihr hängen;
 * ein `quit` oder `Page.reload` dort zerstört deren Zustand (Dach-AGENTS § Staging-Vaults). Gefahren wird gegen
 * eine Zweitinstanz mit eigenem Profil und eigenem Port:
 *
 * ```bash
 * UD=/tmp/obs-test-audio-interface; PORT=<freier Port>; mkdir -p
 * lsof -nP -iTCP:$PORT -sTCP:LISTEN; pgrep -f "user-data-dir=$UD"      # beides leer, sonst ausweichen
 * npm run build && npm run smoke:gui -- --setup                        # Staging-Vault aus docs/images/fixture
 * mkdir -p $UD && cp ~/Library/Application\ Support/obsidian/obsidian-*.asar $UD/
 * # $UD/obsidian.json: den Vault unter $STAGING_VAULTS_DIR eintragen, "language":"en"
 * /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir=$UD --remote-debugging-port=$PORT &
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label audio-interface \
 *   --intent "GUI-Smoke" --exclusive focus --port $PORT --ttl 900
 * npm run smoke:gui -- --port $PORT --assets http://127.0.0.1:8765/assets
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py release --port $PORT
 * ```
 *
 * Vertrauensdialog und Restricted Mode des frischen Profils bestätigt der Treiber selbst (`bereiteInstanzVor`).
 * Der erste Lauf nach der Profilanlage ist ein Aufwärmlauf und zählt nicht; je Messlauf startet ein frischer Prozess.
 *
 * ## Bilanz
 *
 * Vier Zustände nach CORE-TEST-19: grün · rot · übersprungen · nichts gemessen. Nenner ist `PUNKTE` (19 Punkte).
 * Exit 1 bei rot oder nichts gemessen, Exit 2 bei Abbruch. Bewusst abgewählt (übersprungen) sind nur:
 * die sieben Download-/Export-Punkte ohne `--assets` und die echte Umschrift ohne `--service`. Fehlt dem Treiber
 * in einem Punkt der Gegenstand (kein Herunterladen-Knopf, Download bleibt aus), ist der Punkt „nichts gemessen“
 * oder rot, nie still grün.
 *
 * Seit 0.3.0 prüft er beide ladbaren Stimmen: deutsch laden → exportieren, auf englisch wechseln
 * (dann fehlt nur noch das Modell, Worker + WASM sind geteilt) → laden → exportieren.
 *
 * Assets kommen im Smoke von einem lokalen Server statt von GitHub (kein Release nötig):
 *   npm run assets && Server mit CORS laut docs/SMOKE.md
 *   npm run smoke:gui -- --port $PORT --assets http://127.0.0.1:8765/assets   # --vault nur, wenn der Vault anders heisst
 * Der Treiber setzt dafür app.saveLocalStorage("audio-interface-asset-base", <url>) und lädt das
 * Plugin neu; am Ende räumt er den Schlüssel, die Cache-Einträge und die Smoke-Notiz wieder weg.
 */
import { join } from "node:path";

import { createBilanz, parseArgs, runDriver } from "../../tools/obsidian-cdp/bilanz.js";
import {
  type Cdp,
  attachTo,
  beimAbbruch,
  bereiteInstanzVor,
  clearNotices,
  istAbgebrochen,
  notices,
  openNote,
  pollUntil,
  requireVisible,
  schliesseEinstellungen,
} from "../../tools/obsidian-cdp/cdp.js";
import { buildVault, requireEigenerBuild, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "audio-interface";
// Der Staging-Vault heisst wie das Repo (Dach-Konvention) — nicht wie die Plugin-Id,
// auch wenn beide hier denselben Text tragen.
const REPO_NAME = "audio-interface";
const SMOKE_NOTE = "_audio-interface-smoke.md";
const SMOKE_BODY = "# Ansage\n\nGuten Tag, Sie erreichen die Mailbox der Beispiel GmbH. Bitte hinterlassen Sie eine Nachricht.\n";
// Für den Lauf mit der englischen Stimme — eine deutsche Ansage englisch phonemisiert wäre ein
// Ergebnis, das niemand hören will, und der Prüfpunkt soll den echten Weg gehen.
const SMOKE_BODY_EN = "# Greeting\n\nHello, you have reached the mailbox of Example Company. Please leave a message after the tone.\n";
const ASSET_KEY = "audio-interface-asset-base";
const PROBE_AUDIO = "_audio-interface-probe.webm";
const PROBE_NOTE = "_audio-interface-probe.md";
// 1 s Stille als WebM/Opus. Genau das Format, das der DIENST nicht lesen kann
// (gemessen 2026-09-03: HTTP 400) und das der RENDERER dekodieren muss, damit die
// Funktion traegt — Obsidians eigener Audio-Recorder erzeugt es. Als Konstante statt
// als Fixture-Datei, damit der Treiber selbstgenuegsam bleibt.
const PROBE_WEBM_B64 =
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAPCEU2bdLpNu4tTq4QVSalmU6yBoU27i1Or" +
  "hBZUrmtTrIHWTbuMU6uEElTDZ1OsggFMTbuMU6uEHFO7a1OsggOs7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrX" +
  "sYMPQkBNgIxMYXZmNjMuMS4xMDFXQYxMYXZmNjMuMS4xMDFEiYhAj4AAAAAAABZUrmvxrgEAAAAAAABo14EBc8WIvOuIxQ85" +
  "gG6cgQAitZyDdW5kiIEAhoZBX09QVVNWqoNjLqBWu4QExLQAg4ECI+ODhAExLQDhkZ+BAbWIQM9AAAAAAABiZIEQVe6BAGOi" +
  "k09wdXNIZWFkAQE4AYA+AAAAAAASVMNn+3Nzn2PAgGfImUWjh0VOQ09ERVJEh4xMYXZmNjMuMS4xMDFzc9ZjwItjxYi864jF" +
  "DzmAbmfIoUWjh0VOQ09ERVJEh5RMYXZjNjMuMS4xMDEgbGlib3B1c2fIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDEuMDA4MDAw" +
  "MDAwAB9DtnVB2ueBAKOHgQAAgLj//qOHgQAVgLj//qOHgQApgLj//qOHgQA9gLj//qOHgQBRgLj//qOHgQBlgLj//qOHgQB5" +
  "gLj//qOHgQCNgLj//qOHgQChgLj//qOHgQC1gLj//qOHgQDJgLj//qOHgQDdgLj//qOHgQDxgLj//qOHgQEFgLj//qOHgQEZ" +
  "gLj//qOHgQEtgLj//qOHgQFBgLj//qOHgQFVgLj//qOHgQFpgLj//qOHgQF9gLj//qOHgQGRgLj//qOHgQGlgLj//qOHgQG5" +
  "gLj//qOHgQHNgLj//qOHgQHhgLj//qOHgQH1gLj//qOHgQIJgLj//qOHgQIdgLj//qOHgQIxgLj//qOHgQJFgLj//qOHgQJZ" +
  "gLj//qOHgQJtgLj//qOHgQKBgLj//qOHgQKVgLj//qOHgQKpgLj//qOHgQK9gLj//qOHgQLRgLj//qOHgQLlgLj//qOHgQL5" +
  "gLj//qOHgQMNgLj//qOHgQMhgLj//qOHgQM1gLj//qOHgQNJgLj//qOHgQNdgLj//qOHgQNxgLj//qOHgQOFgLj//qOHgQOZ" +
  "gLj//qOHgQOtgLj//qOHgQPBgLj//qOHgQPVgLj//qCToYeBA+kAuP/+m4EHdaKEAM3+YBxTu2uRu4+zgQC3iveBAfGCAczw" +
  "gQM=";
const DE_ENGINE_ID = "piper-de-thorsten-medium";
const EN_ENGINE_ID = "piper-en-ljspeech-medium";

/** Soll-Liste aller Prüfpunkte — der Nenner der Bilanz (CORE-TEST-19). Ein Punkt, der nie aufgezeichnet wird,
 *  zählt als „nichts gemessen“, nie als grün. */
const P = {
  leftover: "Keine liegen gebliebenen Smoke-Dateien aus einem abgebrochenen frueheren Lauf",
  geladen: "Plugin geladen, 8 Kommandos",
  stimme: "Deutsche Systemstimme vorhanden",
  vorlesen: "Vorlesen startet (Statusleiste) und stoppt",
  exportAus: "Export-Kommando vor Download ausgeblendet",
  backend: "NEU: Settings: Backend-Wahl fuer die Umschrift sichtbar (localhost + Kurzbefehl)",
  ttsZeilen: "NEU: Settings: TTS-als-Datei-Zeilen (Kurzbefehl-Name) nur nach Opt-in sichtbar",
  api: "NEU: Anbieter-API v1 (app.plugins.plugins[id].api) hat die vertragliche Form",
  engineZeile: "Settings: Engine-Zeile mit Herunterladen-Knopf",
  download: "Download über Knopf → Bereit",
  exportWav: "Export erzeugt WAV 8 kHz > 1 s",
  stimmenwechsel: "Stimmenwechsel auf die andere Stimme: nur das Modell fehlt",
  zweiteBereit: "Zweite Stimme geladen → Bereit",
  exportWav2: "Export mit der zweiten Stimme erzeugt WAV 8 kHz > 1 s",
  entfernen: "Nach Entfernen wieder Herunterladen-Knopf",
  menueAus: "Umschrift aus: kein Kontextmenue-Eintrag",
  menueAn: "Umschrift an: Eintrag an der Audiodatei, nicht an der Notiz",
  ohneDienst: "Ohne Dienst: benannte Meldung, keine Notiz",
  umschrift: "Echte Umschrift einer WebM-Datei legt eine Notiz mit Embed an",
} as const;
/** Die sieben Punkte, die einen Asset-Server brauchen (`--assets`). */
const ASSET_PUNKTE = [P.engineZeile, P.download, P.exportWav, P.stimmenwechsel, P.zweiteBereit, P.exportWav2, P.entfernen] as const;
const PUNKTE = Object.values(P);

const bilanz = createBilanz({ punkte: PUNKTE });
const record = bilanz.record;

/** Alle sichtbaren Notice-Texte als Renderer-Ausdruck — `document` UND `activeDocument`: nach `app.setting.open()` liegt
 *  eine Notice im Dokument des Einstellungs-Fensters, und `document.querySelectorAll(".notice")` bliebe leer
 *  (CORE-TEST-15: eine Suche nach Fehler-Notices wäre dann immer grün). Dieselben zwei Dokumente wie `notices()`. */
const NOTICE_TEXTE = `(() => {
  const docs = new Set([document]);
  if (typeof activeDocument !== "undefined" && activeDocument) docs.add(activeDocument);
  return [...docs].flatMap((d) => [...d.querySelectorAll(".notice")].map((n) => n.textContent.trim()));
})()`;

function arg(name: string, def: string): string {
  return parseArgs(process.argv.slice(2)).value(name) ?? def;
}

async function reloadPlugin(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); return true;`);
  // Im Abbruch wartet der Schritt nicht (Frist 1 s je Schritt, Abbruch-Modul der Brücke).
  if (!istAbgebrochen()) await new Promise((r) => setTimeout(r, 800));
}

/** Staging-Vault aus dem getrackten Fixture herstellen (`docs/images/fixture`, wie `shots.ts`). Eigener Modus, weil Obsidian
 *  den Vault danach neu öffnen muss: `buildVault` setzt `workspace.json` und `data.json` zurück. */
function setupVault(): void {
  const repoRoot = process.cwd();
  const vaultDir = stagingVaultDir(REPO_NAME);
  const log = buildVault({
    repoRoot,
    vaultDir,
    fixtureDir: join(repoRoot, "docs/images/fixture"),
    generator: "make-audio.mjs",
    pluginId: PLUGIN_ID,
  });
  for (const zeile of log) console.log(`  ${zeile}`);
  console.log(`\nVault: ${vaultDir}\nZweitinstanz mit diesem Vault in ihrer obsidian.json starten (Kopf dieser Datei), dann \`npm run smoke:gui -- --port <Port>\`.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("setup")) {
    setupVault();
    return;
  }
  const portArg = args.value("port");
  if (!portArg || !Number.isInteger(Number(portArg))) {
    throw new Error(
      "--port <Port> ist Pflicht (Zweitinstanz, Rezept im Kopf dieser Datei). Es gibt keinen Standardport: 9222 ist die reguläre Instanz, an der andere Sessions hängen.",
    );
  }
  const port = Number(portArg);
  const vault = args.value("vault") ?? REPO_NAME;
  const assets = args.value("assets") ?? "";
  const keep = args.has("keep");
  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Workspace-Fenster auf Port ${port} für Vault „${vault}“. Läuft die Zweitinstanz mit --remote-debugging-port=${port} und ist der Vault in ihrer obsidian.json eingetragen (Rezept im Kopf dieser Datei)?`,
    );
  }
  let previousBase: unknown = null;

  // Alles, was der Lauf an Vault, Cache, localStorage und Settings aendert, raeumen zwei Schritte des Abbruch-Moduls der
  // Bruecke zurueck (`beimAbbruch`, angemeldet VOR der ersten Aenderung; je Schritt hoechstens 1 s, deshalb getrennt).
  // Normalweg: `finally` schliesst sie rueckwaerts. Ctrl-C/SIGTERM: das Modul sperrt den Hauptzweig, faehrt sie
  // rueckwaerts, druckt die Bilanz, Exit 130. Der fruehere lokale Handler lief neben dem `finally` her (Rennen). Beide Schritte
  // sind idempotent.
  const zustandZurueck = async (): Promise<void> => {
    if (keep) return;
    await cdp.evaluate(`
      for (const p of ["_audio-interface-smoke.md", "_audio-interface-smoke.wav", "_audio-interface-smoke-2.wav", "_audio-interface-probe.webm", "_audio-interface-probe.md"]) { const f = app.vault.getAbstractFileByPath(p); if (f) await app.vault.delete(f); }
      const cache = await caches.open("audio-interface-engines"); for (const k of await cache.keys()) await cache.delete(k);
      app.saveLocalStorage(${JSON.stringify(ASSET_KEY)}, ${JSON.stringify(previousBase ?? null)});
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; if (p) { p.settings.exportEnabled = false; p.settings.transcribeEnabled = false; p.settings.transcribeServiceUrl = "http://127.0.0.1:8765"; await p.saveSettings(); }
      return true;`);
  };
  const neuLaden = beimAbbruch(async () => { if (!keep) await reloadPlugin(cdp); }, "Plugin neu laden");
  const zustand = beimAbbruch(zustandZurueck, "Smoke-Zustand zurücksetzen");

  try {
    // Ohne Fokus drosselt Chromium den Renderer (leerer DOM bei korrektem App-Zustand).
    await requireVisible(cdp);
    const vaultName = await cdp.evaluate<string>(`return window.app ? app.vault.getName() : "";`);
    if (vaultName !== vault) {
      throw new Error(
        `Verbunden mit Vault „${vaultName}“, erwartet war „${vault}“. Der Smoke läuft nur gegen seinen Staging-Vault: gegen einen Arbeitsvault gemessen wäre das Ergebnis unbelegt (Dach-AGENTS § Staging-Vaults).`,
      );
    }
    // Läuft der Lauf gegen den eigenen Stand? `manifest.version` ist dafür blind (Store- und Repo-Build tragen dieselbe Nummer).
    const ort = await cdp.evaluate<{ basePath: string; configDir: string }>(
      `return { basePath: app.vault.adapter.basePath, configDir: app.vault.configDir };`,
    );
    requireEigenerBuild(
      join(ort.basePath, ort.configDir, "plugins", PLUGIN_ID, "main.js"),
      join(process.cwd(), "main.js"),
      (meldung) => { console.log(meldung); },
    );
    // Frisches Profil: Vertrauensdialog bestätigen, Restricted Mode aufheben, Plugin laden. Der Hinweis gehört in den Punkt „Plugin geladen“.
    const vorbereitet = await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID], nurVault: REPO_NAME, sprache: "en" });
    console.log(`Instanz: ${vorbereitet.hinweis}`);

    // Vorbereitung: Asset-Basis setzen (nur wenn übergeben), Plugin frisch laden.
    previousBase = await cdp.evaluate<unknown>(`return app.loadLocalStorage(${JSON.stringify(ASSET_KEY)});`);

    // Alle Smoke-Dateien tragen das Praefix `_audio-interface-` (SMOKE_NOTE, PROBE_AUDIO,
    // PROBE_NOTE, die beiden Export-WAVs oben) — das macht liegen gebliebene Dateien aus
    // einem per SIGINT/SIGTERM abgebrochenen frueheren Lauf erkennbar, BEVOR dieser Lauf
    // selbst welche anlegt.
    const leftover = await cdp.evaluate<string[]>(`
      return app.vault.getFiles().map((f) => f.path).filter((p) => p.startsWith("_audio-interface-"));
    `);
    record(
      P.leftover,
      leftover.length === 0,
      leftover.length === 0
        ? "kein Rest im Vault"
        : `${leftover.length} Datei(en) gefunden und entfernt: ${leftover.join(", ")} — vermutlich Ctrl-C/Crash im vorigen Lauf vor dessen Aufraeumen; dieser Lauf faehrt normal weiter`,
    );
    if (leftover.length > 0) {
      await cdp.evaluate(`
        for (const path of ${JSON.stringify(leftover)}) {
          const file = app.vault.getAbstractFileByPath(path);
          if (file) await app.vault.delete(file);
        }
        return true;
      `);
    }

    if (assets) await cdp.evaluate(`app.saveLocalStorage(${JSON.stringify(ASSET_KEY)}, ${JSON.stringify(assets)}); return true;`);
    // Ausgangslage „nichts geladen": der Engine-Cache ist origin-weit (alle Vaults) — der Smoke leert ihn,
    // die Assets sind jederzeit neu ladbar (docs/SMOKE.md nennt das ausdrücklich).
    await cdp.evaluate(`const c = await caches.open("audio-interface-engines"); for (const k of await c.keys()) await c.delete(k); return true;`);
    await reloadPlugin(cdp);

    // 1 Plugin geladen, acht Kommandos (Welle 13: +2 TTS-als-Datei-Kommandos)
    const cmds = await cdp.evaluate<string[]>(`return Object.keys(app.commands.commands).filter((k) => k.startsWith("${PLUGIN_ID}:")).sort();`);
    record(P.geladen, cmds.length === 8, cmds.length === 8 ? cmds.join(", ") : `${cmds.join(", ") || "(keine)"} — ${vorbereitet.hinweis}`);

    // 2 Systemstimmen: mindestens eine deutsche
    const de = await cdp.evaluate<number>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      await p.system.waitForVoices(3000);
      return p.system.listVoices("de").length;`);
    record(P.stimme, de > 0, `${de} de-Stimmen`);

    // 3 Vorlesen startet und stoppt (Statusleiste)
    await openNote(cdp, SMOKE_NOTE, SMOKE_BODY, "source");
    await cdp.evaluate(`app.commands.executeCommandById("${PLUGIN_ID}:speak-note"); return true;`);
    const speaking = await pollUntil<string>(cdp, `const el = document.querySelector(".audio-interface-status"); return el && !el.classList.contains("is-hidden") ? el.textContent : null;`, 5000, 200);
    await cdp.evaluate(`app.commands.executeCommandById("${PLUGIN_ID}:speak-stop"); return true;`);
    const stopped = await pollUntil<boolean>(cdp, `const el = document.querySelector(".audio-interface-status"); return el && el.classList.contains("is-hidden") ? true : null;`, 3000, 100);
    record(P.vorlesen, !!speaking && !!stopped, `Status war „${speaking ?? "-"}“`);

    // 4 Export-Kommando vor Download NICHT in der Palette
    await cdp.evaluate(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; p.settings.exportEnabled = false; await p.saveSettings(); p.piper.setEnabled(false); return true;`);
    await reloadPlugin(cdp);
    await openNote(cdp, SMOKE_NOTE, SMOKE_BODY, "source");
    const before = await cdp.evaluate<boolean>(`const c = app.commands.commands["${PLUGIN_ID}:export-note-wav"]; return c.checkCallback(true) === true;`);
    record(P.exportAus, before === false, `checkCallback=${before}`);

    // NEU (Welle 13) 4a/4b Settings: Backend-Wahl fuer die Umschrift + TTS-als-Datei-Zeilen —
    // EIN Tab-Aufenthalt, ausschliesslich ueber setControlValue (wie Checkpunkt 5 unten): ein
    // direktes p.settings.x=… VOR dem ersten Oeffnen traefe die 1.13-Cache-Falle aus der
    // settings-tab.ts-Kopfzeile (die gecachten settingItems vom addSettingTab-Zeitpunkt wuerden
    // gerendert, nicht der frische Zustand).
    const settingsRows = await cdp.evaluate<{ ttsBefore: boolean; backendOptions: string; ttsAfter: boolean }>(`
      app.setting.open(); app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
      await new Promise((r) => setTimeout(r, 600));
      const tab = app.setting.activeTab;
      const root = () => tab?.containerEl ?? document;
      const rowNames = () => [...root().querySelectorAll(".setting-item-name")].map((el) => el.textContent);
      const ttsBefore = rowNames().some((t) => /Shortcut name|Kurzbefehl-Name/i.test(t));

      await tab.setControlValue("transcribeEnabled", true);
      await new Promise((r) => setTimeout(r, 900));
      const backendSelect = [...root().querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => /Shortcut|Kurzbefehl/i.test(o.textContent)) &&
        [...s.options].some((o) => /local|service|Dienst/i.test(o.textContent)));
      const backendOptions = backendSelect ? [...backendSelect.options].map((o) => o.textContent.trim()).join(" | ") : "(kein Backend-Dropdown gefunden)";

      await tab.setControlValue("ttsShortcutEnabled", true);
      await new Promise((r) => setTimeout(r, 900));
      const ttsAfter = rowNames().some((t) => /Shortcut name|Kurzbefehl-Name/i.test(t));

      return { ttsBefore, backendOptions, ttsAfter };`);
    await schliesseEinstellungen(cdp);
    record(
      P.backend,
      /Shortcut|Kurzbefehl/i.test(settingsRows.backendOptions) && /local|service|Dienst/i.test(settingsRows.backendOptions),
      settingsRows.backendOptions.slice(0, 160),
    );
    record(
      P.ttsZeilen,
      settingsRows.ttsBefore === false && settingsRows.ttsAfter === true,
      `vorher=${settingsRows.ttsBefore}, nachher=${settingsRows.ttsAfter}`,
    );

    // NEU (Welle 13) 4c Anbieter-API v1: Form-Guard genau wie ein fremdes Plugin ihn saehe.
    const apiForm = await cdp.evaluate<{ version: unknown; transcribe: string; speak: string }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return { version: p.api?.version, transcribe: typeof p.api?.transcribe, speak: typeof p.api?.speak };`);
    record(
      P.api,
      apiForm.version === 1 && apiForm.transcribe === "function" && apiForm.speak === "function",
      `version=${String(apiForm.version)}, transcribe=${apiForm.transcribe}, speak=${apiForm.speak}`,
    );

    // Aufraeumen: die beiden Opt-ins wieder auf den Ausgangszustand, bevor die Baseline-Punkte
    // weiterlaufen (sie erwarten transcribeEnabled/ttsShortcutEnabled aus, s. Punkt 11 unten).
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.transcribeEnabled = false; p.settings.ttsShortcutEnabled = false; await p.saveSettings(); return true;`);

    if (!assets) {
      for (const name of ASSET_PUNKTE) bilanz.skipped(name, "kein --assets (die Prüfpunkte 5–10 brauchen einen Asset-Server)");
    } else {
      // 5 Settings: Export einschalten → Engine-Zeile mit „Herunterladen“
      const rowText = await cdp.evaluate<string>(`
        app.setting.open(); app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
        await new Promise((r) => setTimeout(r, 600));
        const tab = app.setting.activeTab;
        // wie der Nutzer: über den Toggle-Pfad des Tabs, nicht am Plugin vorbei
        await tab.setControlValue("exportEnabled", true);
        await new Promise((r) => setTimeout(r, 900));
        const btns = [...(tab?.containerEl ?? document).querySelectorAll("button")].map((b) => b.textContent.trim());
        return btns.join(" | ");`);
      record(P.engineZeile, /Herunterladen|Download/.test(rowText), rowText.slice(0, 120));

      // 6 Download über den Knopf → Zustand „Bereit“
      const geklickt = await cdp.evaluate<boolean>(`
        const tab = app.setting.activeTab;
        const btn = [...(tab?.containerEl ?? document).querySelectorAll("button")].find((b) => /Herunterladen|Download/.test(b.textContent));
        if (!btn) return false;
        btn.click(); return true;`);
      if (!geklickt) {
        // Ein fehlender Knopf ist ein Befund, kein Abbruch des Treibers (Baseline Welle 13, Befund 2): der Gegenstand wurde nicht erreicht.
        bilanz.unmeasured(P.download, "kein Herunterladen-Knopf in der Engine-Zeile gefunden");
      } else {
        const ready = await pollUntil<string>(cdp, `
          const tab = app.setting.activeTab; const root = tab?.containerEl ?? document;
          const st = root.querySelector(".audio-interface-engine-state"); return st && /Bereit|Ready/.test(st.textContent) ? st.textContent : null;`, 180_000, 1000);
        record(P.download, !!ready, ready ?? "kein Bereit-Zustand binnen 180 s");
      }
      await schliesseEinstellungen(cdp);

      // 7 Export erzeugt WAV, 8000 Hz, > 1 s
      await openNote(cdp, SMOKE_NOTE, SMOKE_BODY, "source");
      await cdp.evaluate(`app.vault.getAbstractFileByPath("_audio-interface-smoke.wav") && await app.vault.delete(app.vault.getAbstractFileByPath("_audio-interface-smoke.wav")); return true;`);
      const can = await cdp.evaluate<boolean>(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; await p.piper.readiness(); await new Promise((r)=>setTimeout(r,200)); const c = app.commands.commands["${PLUGIN_ID}:export-note-wav"]; return c.checkCallback(true) === true;`);
      await clearNotices(cdp);
      await cdp.evaluate(`app.commands.executeCommandById("${PLUGIN_ID}:export-note-wav"); return true;`);
      // Entweder die Datei erscheint, oder ein Fehler-Notice — beides beendet das Warten (sonst 120 s Blindflug).
      const outcome = await pollUntil<{ wav?: { bytes: number; rate: number; seconds: number }; notice?: string } | null>(cdp, `
        const bad = ${NOTICE_TEXTE}.find((t) => /fehlgeschlagen|failed|Nicht verfügbar|Unavailable|abgebrochen|cancelled/i.test(t));
        if (bad) return { notice: bad };
        const f = app.vault.getAbstractFileByPath("_audio-interface-smoke.wav"); if (!f) return null;
        const buf = await app.vault.readBinary(f); const dv = new DataView(buf);
        const rate = dv.getUint32(24, true); const data = dv.getUint32(40, true);
        return { wav: { bytes: buf.byteLength, rate, seconds: data / 2 / rate } };`, 120_000, 500);
      const wav = outcome?.wav ?? null;
      record(P.exportWav, can && !!wav && wav.rate === 8000 && wav.seconds > 1, wav ? `${wav.bytes} B, ${wav.rate} Hz, ${wav.seconds.toFixed(1)} s` : `checkCallback=${can}, keine Datei — ${outcome?.notice ?? `Notices: ${await notices(cdp)}`}`);

      // 8 Stimmenwechsel auf die ANDERE Stimme: nur das Modell fehlt noch (Worker + WASM sind geteilt).
      // Welche das ist, haengt an der Oberflaechensprache — der Erststart waehlt danach vor.
      const geladene = await cdp.evaluate<string>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.exportEngineId;`);
      const andere = geladene === EN_ENGINE_ID ? DE_ENGINE_ID : EN_ENGINE_ID;
      const enRow = await cdp.evaluate<string>(`
        app.setting.open(); app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
        await new Promise((r) => setTimeout(r, 600));
        const tab = app.setting.activeTab;
        await tab.setControlValue("exportEngineId", ${JSON.stringify(andere)});
        await new Promise((r) => setTimeout(r, 900));
        const btns = [...(tab?.containerEl ?? document).querySelectorAll("button")].map((b) => b.textContent.trim());
        return btns.join(" | ");`);
      // Nur Modell + Config fehlen → der Knopf nennt ~60 MB, nicht ~75 MB.
      const enSizeOk = /Herunterladen|Download/.test(enRow) && !/7\d[.,]\d MB/.test(enRow);
      record(P.stimmenwechsel, enSizeOk, `${andere}: ${enRow.slice(0, 140)}`);

      const enGeklickt = await cdp.evaluate<boolean>(`
        const tab = app.setting.activeTab;
        const btn = [...(tab?.containerEl ?? document).querySelectorAll("button")].find((b) => /Herunterladen|Download/.test(b.textContent));
        if (!btn) return false;
        btn.click(); return true;`);
      if (!enGeklickt) {
        bilanz.unmeasured(P.zweiteBereit, "kein Herunterladen-Knopf für die zweite Stimme gefunden");
      } else {
        const enReady = await pollUntil<string>(cdp, `
          const tab = app.setting.activeTab; const root = tab?.containerEl ?? document;
          const st = root.querySelector(".audio-interface-engine-state"); return st && /Bereit|Ready/.test(st.textContent) ? st.textContent : null;`, 180_000, 1000);
        record(P.zweiteBereit, !!enReady, enReady ?? "kein Bereit-Zustand binnen 180 s");
      }
      await schliesseEinstellungen(cdp);

      // 9 Export mit der zweiten Stimme (zweite Datei, weil die erste noch liegt) — Text in ihrer Sprache
      await openNote(cdp, SMOKE_NOTE, andere === EN_ENGINE_ID ? SMOKE_BODY_EN : SMOKE_BODY, "source");
      await cdp.evaluate(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; await p.piper.readiness(); await new Promise((r)=>setTimeout(r,200)); return true;`);
      await clearNotices(cdp);
      await cdp.evaluate(`app.commands.executeCommandById("${PLUGIN_ID}:export-note-wav"); return true;`);
      const enOutcome = await pollUntil<{ wav?: { bytes: number; rate: number; seconds: number }; notice?: string } | null>(cdp, `
        const bad = ${NOTICE_TEXTE}.find((t) => /fehlgeschlagen|failed|Nicht verfügbar|Unavailable|abgebrochen|cancelled/i.test(t));
        if (bad) return { notice: bad };
        const f = app.vault.getAbstractFileByPath("_audio-interface-smoke-2.wav"); if (!f) return null;
        const buf = await app.vault.readBinary(f); const dv = new DataView(buf);
        const rate = dv.getUint32(24, true); const data = dv.getUint32(40, true);
        return { wav: { bytes: buf.byteLength, rate, seconds: data / 2 / rate } };`, 120_000, 500);
      const enWav = enOutcome?.wav ?? null;
      record(P.exportWav2, !!enWav && enWav.rate === 8000 && enWav.seconds > 1, enWav ? `${enWav.bytes} B, ${enWav.rate} Hz, ${enWav.seconds.toFixed(1)} s` : `keine Datei — ${enOutcome?.notice ?? `Notices: ${await notices(cdp)}`}`);

      // 10 Entfernen → wieder „Herunterladen“
      const removed = await cdp.evaluate<string>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const cache = await caches.open("audio-interface-engines"); const keys = await cache.keys();
        for (const k of keys) await cache.delete(k);
        p.piper.dispose();
        app.setting.open(); app.setting.openTabById(${JSON.stringify(PLUGIN_ID)}); await new Promise((r) => setTimeout(r, 900));
        const tab = app.setting.activeTab;
        const btns = [...(tab?.containerEl ?? document).querySelectorAll("button")].map((b) => b.textContent.trim());
        return btns.join(" | ");`);
      await schliesseEinstellungen(cdp);
      record(P.entfernen, /Herunterladen|Download/.test(removed), removed.slice(0, 120));

      // Stimmenwahl zurücksetzen — der Smoke hinterlässt keinen fremden Zustand.
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.exportEngineId = ${JSON.stringify(geladene)}; await p.saveSettings(); return true;`).catch(() => undefined);
    }
    // ── Umschrift: Audiodatei → Text ───────────────────────────────────────
    const service = arg("service", "");
    await cdp.evaluate(`
      const raw = atob(${JSON.stringify(PROBE_WEBM_B64)});
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      for (const path of [${JSON.stringify(PROBE_AUDIO)}, ${JSON.stringify(PROBE_NOTE)}]) {
        const alt = app.vault.getAbstractFileByPath(path); if (alt) await app.vault.delete(alt);
      }
      await app.vault.createBinary(${JSON.stringify(PROBE_AUDIO)}, bytes.buffer);
      return true;`);

    const menuTitles = (path: string) =>
      cdp.evaluate<string[]>(`
        // Kein require("obsidian") — im CDP-Renderer-Scope ist das Modul nicht
        // aufloesbar. Ein Fake-Menue reicht und prueft genau unseren
        // Registrierungscode: er ruft addItem(cb) und darin setTitle/setIcon/onClick.
        const file = app.vault.getAbstractFileByPath(${JSON.stringify(path)});
        const items = [];
        const menu = {
          addItem(cb) {
            const item = {
              title: "",
              setTitle(text) { this.title = text; return this; },
              setIcon() { return this; },
              onClick(fn) { this.click = fn; return this; },
            };
            cb(item);
            items.push(item);
            return this;
          },
        };
        app.workspace.trigger("file-menu", menu, file, "file-explorer");
        return items.map((i) => i.title).filter(Boolean);`);

    // 11 Ohne Opt-in kein Eintrag — das Plugin spricht ungefragt nichts an.
    const menuOff = await menuTitles(PROBE_AUDIO);
    record(P.menueAus, !menuOff.some((x) => /Text umwandeln|Transcribe/i.test(x)), menuOff.join(" | ") || "(leer)");

    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.transcribeEnabled = true;
      p.settings.transcribeServiceUrl = ${JSON.stringify(service || "http://127.0.0.1:8798")};
      await p.saveSettings(); return true;`);

    // 12 Mit Opt-in erscheint er — aber nur an Audiodateien, nicht an Notizen.
    const menuOn = await menuTitles(PROBE_AUDIO);
    const menuNote = await menuTitles(SMOKE_NOTE);
    record(
      P.menueAn,
      menuOn.some((x) => /Text umwandeln|Transcribe/i.test(x)) && !menuNote.some((x) => /Text umwandeln|Transcribe/i.test(x)),
      `Audio: ${menuOn.join(" | ")} || Notiz: ${menuNote.join(" | ") || "(leer)"}`,
    );

    if (!service) {
      // 13 Ohne Dienst: eine benannte Meldung, kein Absturz und keine halbe Notiz.
      await clearNotices(cdp);
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        void p.transcribeAudio(app.vault.getAbstractFileByPath(${JSON.stringify(PROBE_AUDIO)}));
        return true;`);
      const offline = await pollUntil<string>(cdp, `
        const hit = ${NOTICE_TEXTE}.find((x) => /antwortet nicht|not answering/i.test(x));
        return hit ?? null;`, 8000, 200);
      const stray = await cdp.evaluate<boolean>(`return app.vault.getAbstractFileByPath(${JSON.stringify(PROBE_NOTE)}) !== null;`);
      record(P.ohneDienst, !!offline && !stray, offline ? offline.slice(0, 90) : `keine Meldung; Notiz da: ${stray}`);
      bilanz.skipped(P.umschrift, "kein --service (braucht einen laufenden audio-ui-Dienst)");
    } else {
      bilanz.skipped(P.ohneDienst, "ein --service läuft: der Fall „kein Dienst“ ist hier nicht herstellbar");
      // 13 Der ganze Weg: WebM dekodieren, 16-kHz-Mono senden, Notiz anlegen.
      await clearNotices(cdp);
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        void p.transcribeAudio(app.vault.getAbstractFileByPath(${JSON.stringify(PROBE_AUDIO)}));
        return true;`);
      const made = await pollUntil<{ body?: string; notice?: string } | null>(cdp, `
        const bad = ${NOTICE_TEXTE}.find((x) => /fehlgeschlagen|failed|antwortet nicht|not answering|noch nicht bereit|not ready/i.test(x));
        if (bad) return { notice: bad };
        const f = app.vault.getAbstractFileByPath(${JSON.stringify(PROBE_NOTE)});
        if (!f) return null;
        return { body: await app.vault.read(f) };`, 90_000, 500);
      record(
        P.umschrift,
        !!made?.body && made.body.includes(`![[${PROBE_AUDIO}]]`),
        made?.notice ?? (made?.body ? made.body.slice(0, 80).replace(/\n/g, " ") : "keine Notiz"),
      );
    }

  } finally {
    // Normalweg: Zustand zurueck (Notiz, WAV, Cache, Asset-Basis auf Vorwert, Settings), danach das Plugin neu laden.
    // Nach Ctrl-C raeumt das Modul auf, druckt die Bilanz und beendet den Prozess; dieser Zweig darf dann weder ein zweites
    // Mal aufraeumen noch die Bilanz ein zweites Mal drucken.
    await zustand.schliesse().catch((e: unknown) => { if (!istAbgebrochen()) console.log(`Aufraeumen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`); });
    await neuLaden.schliesse().catch(() => undefined);
    if (istAbgebrochen()) return;
    cdp.close();
  }
  bilanz.abschluss();
}

runDriver(main);
