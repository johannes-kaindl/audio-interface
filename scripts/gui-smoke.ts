/**
 * GUI-Smoke-Treiber (Skill gui-smoke-setup, CORE-TEST-02 b): fährt die Prüfpunkte aus
 * `docs/SMOKE.md` gegen ein LAUFENDES Obsidian — echte Systemstimmen, echter Blob-Worker mit
 * ORT-WASM, echte Cache API, echte Vault-Datei. Das ist die Naht, die kein Unit-Test sieht.
 *
 * ⚠️ **Zuerst prüfen, wer sonst an Obsidian hängt.** Obsidian ist Single-Instance — ein
 * `quit` trifft die Instanz, an der möglicherweise eine andere Session arbeitet, und zerstört
 * deren Zustand. Der eigene Lauf ist danach sauber grün; der Schaden entsteht woanders und
 * fällt nicht auf.
 *
 * ```bash
 * lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
 * ```
 *
 * Hört der Port schon, dann **mitnutzen statt neu starten**: ein eigenes Fenster per
 * `vault-open` über IPC öffnen, dann `attachTo("workspace", port, vault)` — der Vault-Name
 * wählt, nicht die Reihenfolge. ⚠️ Die Port-Prüfung ersetzt die Frage nicht: sie zeigt aktive
 * CDP-Treiber, aber nicht, wer ein Fenster offen hält oder auf den Port wartet.
 *
 * Erst wenn nichts läuft — oder nach Absprache mit dem, der es benutzt — gilt das Rezept unten.
 *
 * Voraussetzung (der eine Handgriff, der Handarbeit bleibt):
 *   osascript -e 'quit app "Obsidian"'; open -a Obsidian --args --remote-debugging-port=9222
 *   OBSIDIAN_PLUGIN_DIR="$STAGING_VAULTS_DIR/audio-interface/.obsidian/plugins/audio-interface" npm run deploy
 *
 * Seit 0.3.0 prüft er beide ladbaren Stimmen: deutsch laden → exportieren, auf englisch wechseln
 * (dann fehlt nur noch das Modell, Worker + WASM sind geteilt) → laden → exportieren.
 *
 * Assets kommen im Smoke von einem lokalen Server statt von GitHub (kein Release nötig):
 *   npm run assets && python3 -m http.server -d dist-assets 8765   # + CORS, s. docs/SMOKE.md
 *   npm run smoke:gui -- --assets http://127.0.0.1:8765   # --vault nur, wenn der Vault anders heisst
 * Der Treiber setzt dafür app.saveLocalStorage("audio-interface-asset-base", <url>) und lädt das
 * Plugin neu; am Ende räumt er den Schlüssel, die Cache-Einträge und die Smoke-Notiz wieder weg.
 */
import { Cdp, notices, openNote, pollUntil } from "../../tools/obsidian-cdp/cdp.js";

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

interface Check { name: string; passed: boolean; detail: string }
const checks: Check[] = [];
function record(name: string, passed: boolean, detail: string): void {
  checks.push({ name, passed, detail });
  console.log(`${passed ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function reloadPlugin(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); await new Promise((r) => setTimeout(r, 800)); return true;`);
}

async function main(): Promise<void> {
  const port = Number(arg("port", "9222"));
  const vault = arg("vault", REPO_NAME);
  const assets = arg("assets", "");
  const keep = process.argv.includes("--keep");
  const cdp = await Cdp.attach(port, vault);
  let previousBase: unknown = null;

  // Dieselbe Aufraeumarbeit wie im `finally` unten — als eigene Funktion, damit der
  // SIGINT/SIGTERM-Handler sie aufrufen kann, ohne Code zu duplizieren. Ein Ctrl-C mitten
  // im Lauf ueberspringt das `finally` NICHT (try/catch-Semantik), sondern beendet den
  // Node-Prozess sofort — ohne eigenen Handler blieben Smoke-Notizen/-Dateien, der
  // Engine-Cache, die Asset-Basis in localStorage und exportEnabled/transcribeEnabled
  // unwiederhergestellt stehen.
  const cleanupState = async (): Promise<void> => {
    if (!keep) {
      await cdp.evaluate(`
        for (const p of ["_audio-interface-smoke.md", "_audio-interface-smoke.wav", "_audio-interface-smoke-2.wav", "_audio-interface-probe.webm", "_audio-interface-probe.md"]) { const f = app.vault.getAbstractFileByPath(p); if (f) await app.vault.delete(f); }
        const cache = await caches.open("audio-interface-engines"); for (const k of await cache.keys()) await cache.delete(k);
        app.saveLocalStorage(${JSON.stringify(ASSET_KEY)}, ${JSON.stringify(previousBase ?? null)});
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; if (p) { p.settings.exportEnabled = false; p.settings.transcribeEnabled = false; p.settings.transcribeServiceUrl = "http://127.0.0.1:8765"; await p.saveSettings(); }
        return true;`).catch(() => undefined);
      await reloadPlugin(cdp).catch(() => undefined);
    }
  };

  let signalCleanupRunning = false;
  const onAbortSignal = (signal: NodeJS.Signals) => {
    if (signalCleanupRunning) return;
    signalCleanupRunning = true;
    void (async () => {
      console.log(`\n\nAbbruch durch ${signal} — raeume Smoke-Zustand auf...`);
      await cleanupState();
      cdp.close();
      process.exit(130);
    })();
  };
  process.on("SIGINT", onAbortSignal);
  process.on("SIGTERM", onAbortSignal);

  try {
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
      "Keine liegen gebliebenen Smoke-Dateien aus einem abgebrochenen frueheren Lauf",
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

    // 1 Plugin geladen, sechs Kommandos
    const cmds = await cdp.evaluate<string[]>(`return Object.keys(app.commands.commands).filter((k) => k.startsWith("${PLUGIN_ID}:")).sort();`);
    record("Plugin geladen, 6 Kommandos", cmds.length === 6, cmds.join(", "));

    // 2 Systemstimmen: mindestens eine deutsche
    const de = await cdp.evaluate<number>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      await p.system.waitForVoices(3000);
      return p.system.listVoices("de").length;`);
    record("Deutsche Systemstimme vorhanden", de > 0, `${de} de-Stimmen`);

    // 3 Vorlesen startet und stoppt (Statusleiste)
    await openNote(cdp, SMOKE_NOTE, SMOKE_BODY, "source");
    await cdp.evaluate(`app.commands.executeCommandById("${PLUGIN_ID}:speak-note"); return true;`);
    const speaking = await pollUntil<string>(cdp, `const el = document.querySelector(".audio-interface-status"); return el && !el.classList.contains("is-hidden") ? el.textContent : null;`, 5000, 200);
    await cdp.evaluate(`app.commands.executeCommandById("${PLUGIN_ID}:speak-stop"); return true;`);
    const stopped = await pollUntil<boolean>(cdp, `const el = document.querySelector(".audio-interface-status"); return el && el.classList.contains("is-hidden") ? true : null;`, 3000, 100);
    record("Vorlesen startet (Statusleiste) und stoppt", !!speaking && !!stopped, `Status war „${speaking ?? "-"}“`);

    // 4 Export-Kommando vor Download NICHT in der Palette
    await cdp.evaluate(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; p.settings.exportEnabled = false; await p.saveSettings(); p.piper.setEnabled(false); return true;`);
    await reloadPlugin(cdp);
    await openNote(cdp, SMOKE_NOTE, SMOKE_BODY, "source");
    const before = await cdp.evaluate<boolean>(`const c = app.commands.commands["${PLUGIN_ID}:export-note-wav"]; return c.checkCallback(true) === true;`);
    record("Export-Kommando vor Download ausgeblendet", before === false, `checkCallback=${before}`);

    if (!assets) {
      record("Download/Export (übersprungen — kein --assets)", true, "Prüfpunkte 5–10 brauchen einen Asset-Server");
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
      record("Settings: Engine-Zeile mit Herunterladen-Knopf", /Herunterladen|Download/.test(rowText), rowText.slice(0, 120));

      // 6 Download über den Knopf → Zustand „Bereit“
      await cdp.evaluate(`
        const tab = app.setting.activeTab;
        const btn = [...(tab?.containerEl ?? document).querySelectorAll("button")].find((b) => /Herunterladen|Download/.test(b.textContent));
        btn.click(); return true;`);
      const ready = await pollUntil<string>(cdp, `
        const tab = app.setting.activeTab; const root = tab?.containerEl ?? document;
        const st = root.querySelector(".audio-interface-engine-state"); return st && /Bereit|Ready/.test(st.textContent) ? st.textContent : null;`, 180_000, 1000);
      record("Download über Knopf → Bereit", !!ready, ready ?? "kein Bereit-Zustand binnen 180 s");
      await cdp.evaluate(`app.setting.close(); return true;`);

      // 7 Export erzeugt WAV, 8000 Hz, > 1 s
      await openNote(cdp, SMOKE_NOTE, SMOKE_BODY, "source");
      await cdp.evaluate(`app.vault.getAbstractFileByPath("_audio-interface-smoke.wav") && await app.vault.delete(app.vault.getAbstractFileByPath("_audio-interface-smoke.wav")); return true;`);
      const can = await cdp.evaluate<boolean>(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; await p.piper.readiness(); await new Promise((r)=>setTimeout(r,200)); const c = app.commands.commands["${PLUGIN_ID}:export-note-wav"]; return c.checkCallback(true) === true;`);
      await cdp.evaluate(`document.querySelectorAll(".notice").forEach((n) => n.remove()); app.commands.executeCommandById("${PLUGIN_ID}:export-note-wav"); return true;`);
      // Entweder die Datei erscheint, oder ein Fehler-Notice — beides beendet das Warten (sonst 120 s Blindflug).
      const outcome = await pollUntil<{ wav?: { bytes: number; rate: number; seconds: number }; notice?: string } | null>(cdp, `
        const bad = [...document.querySelectorAll(".notice")].map((n) => n.textContent.trim()).find((t) => /fehlgeschlagen|failed|Nicht verfügbar|Unavailable|abgebrochen|cancelled/i.test(t));
        if (bad) return { notice: bad };
        const f = app.vault.getAbstractFileByPath("_audio-interface-smoke.wav"); if (!f) return null;
        const buf = await app.vault.readBinary(f); const dv = new DataView(buf);
        const rate = dv.getUint32(24, true); const data = dv.getUint32(40, true);
        return { wav: { bytes: buf.byteLength, rate, seconds: data / 2 / rate } };`, 120_000, 500);
      const wav = outcome?.wav ?? null;
      record("Export erzeugt WAV 8 kHz > 1 s", can && !!wav && wav.rate === 8000 && wav.seconds > 1, wav ? `${wav.bytes} B, ${wav.rate} Hz, ${wav.seconds.toFixed(1)} s` : `checkCallback=${can}, keine Datei — ${outcome?.notice ?? `Notices: ${await notices(cdp)}`}`);

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
      record(`Stimmenwechsel auf ${andere}: nur das Modell fehlt`, enSizeOk, enRow.slice(0, 140));

      await cdp.evaluate(`
        const tab = app.setting.activeTab;
        const btn = [...(tab?.containerEl ?? document).querySelectorAll("button")].find((b) => /Herunterladen|Download/.test(b.textContent));
        btn.click(); return true;`);
      const enReady = await pollUntil<string>(cdp, `
        const tab = app.setting.activeTab; const root = tab?.containerEl ?? document;
        const st = root.querySelector(".audio-interface-engine-state"); return st && /Bereit|Ready/.test(st.textContent) ? st.textContent : null;`, 180_000, 1000);
      record("Zweite Stimme geladen → Bereit", !!enReady, enReady ?? "kein Bereit-Zustand binnen 180 s");
      await cdp.evaluate(`app.setting.close(); return true;`);

      // 9 Export mit der zweiten Stimme (zweite Datei, weil die erste noch liegt) — Text in ihrer Sprache
      await openNote(cdp, SMOKE_NOTE, andere === EN_ENGINE_ID ? SMOKE_BODY_EN : SMOKE_BODY, "source");
      await cdp.evaluate(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; await p.piper.readiness(); await new Promise((r)=>setTimeout(r,200)); document.querySelectorAll(".notice").forEach((n) => n.remove()); app.commands.executeCommandById("${PLUGIN_ID}:export-note-wav"); return true;`);
      const enOutcome = await pollUntil<{ wav?: { bytes: number; rate: number; seconds: number }; notice?: string } | null>(cdp, `
        const bad = [...document.querySelectorAll(".notice")].map((n) => n.textContent.trim()).find((t) => /fehlgeschlagen|failed|Nicht verfügbar|Unavailable|abgebrochen|cancelled/i.test(t));
        if (bad) return { notice: bad };
        const f = app.vault.getAbstractFileByPath("_audio-interface-smoke-2.wav"); if (!f) return null;
        const buf = await app.vault.readBinary(f); const dv = new DataView(buf);
        const rate = dv.getUint32(24, true); const data = dv.getUint32(40, true);
        return { wav: { bytes: buf.byteLength, rate, seconds: data / 2 / rate } };`, 120_000, 500);
      const enWav = enOutcome?.wav ?? null;
      record("Export mit der zweiten Stimme erzeugt WAV 8 kHz > 1 s", !!enWav && enWav.rate === 8000 && enWav.seconds > 1, enWav ? `${enWav.bytes} B, ${enWav.rate} Hz, ${enWav.seconds.toFixed(1)} s` : `keine Datei — ${enOutcome?.notice ?? `Notices: ${await notices(cdp)}`}`);

      // 10 Entfernen → wieder „Herunterladen“
      const removed = await cdp.evaluate<string>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const cache = await caches.open("audio-interface-engines"); const keys = await cache.keys();
        for (const k of keys) await cache.delete(k);
        p.piper.dispose();
        app.setting.open(); app.setting.openTabById(${JSON.stringify(PLUGIN_ID)}); await new Promise((r) => setTimeout(r, 900));
        const tab = app.setting.activeTab;
        const btns = [...(tab?.containerEl ?? document).querySelectorAll("button")].map((b) => b.textContent.trim());
        app.setting.close(); return btns.join(" | ");`);
      record("Nach Entfernen wieder Herunterladen-Knopf", /Herunterladen|Download/.test(removed), removed.slice(0, 120));

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
    record("Umschrift aus: kein Kontextmenue-Eintrag", !menuOff.some((x) => /Text umwandeln|Transcribe/i.test(x)), menuOff.join(" | ") || "(leer)");

    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.transcribeEnabled = true;
      p.settings.transcribeServiceUrl = ${JSON.stringify(service || "http://127.0.0.1:8798")};
      await p.saveSettings(); return true;`);

    // 12 Mit Opt-in erscheint er — aber nur an Audiodateien, nicht an Notizen.
    const menuOn = await menuTitles(PROBE_AUDIO);
    const menuNote = await menuTitles(SMOKE_NOTE);
    record(
      "Umschrift an: Eintrag an der Audiodatei, nicht an der Notiz",
      menuOn.some((x) => /Text umwandeln|Transcribe/i.test(x)) && !menuNote.some((x) => /Text umwandeln|Transcribe/i.test(x)),
      `Audio: ${menuOn.join(" | ")} || Notiz: ${menuNote.join(" | ") || "(leer)"}`,
    );

    if (!service) {
      // 13 Ohne Dienst: eine benannte Meldung, kein Absturz und keine halbe Notiz.
      await cdp.evaluate(`document.querySelectorAll(".notice").forEach((n) => n.remove()); return true;`);
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        void p.transcribeAudio(app.vault.getAbstractFileByPath(${JSON.stringify(PROBE_AUDIO)}));
        return true;`);
      const offline = await pollUntil<string>(cdp, `
        const hit = [...document.querySelectorAll(".notice")].map((n) => n.textContent.trim()).find((x) => /antwortet nicht|not answering/i.test(x));
        return hit ?? null;`, 8000, 200);
      const stray = await cdp.evaluate<boolean>(`return app.vault.getAbstractFileByPath(${JSON.stringify(PROBE_NOTE)}) !== null;`);
      record("Ohne Dienst: benannte Meldung, keine Notiz", !!offline && !stray, offline ? offline.slice(0, 90) : `keine Meldung; Notiz da: ${stray}`);
      record("Echte Umschrift (uebersprungen — kein --service)", true, "braucht einen laufenden audio-ui-Dienst");
    } else {
      // 13 Der ganze Weg: WebM dekodieren, 16-kHz-Mono senden, Notiz anlegen.
      await cdp.evaluate(`document.querySelectorAll(".notice").forEach((n) => n.remove()); return true;`);
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        void p.transcribeAudio(app.vault.getAbstractFileByPath(${JSON.stringify(PROBE_AUDIO)}));
        return true;`);
      const made = await pollUntil<{ body?: string; notice?: string } | null>(cdp, `
        const bad = [...document.querySelectorAll(".notice")].map((n) => n.textContent.trim()).find((x) => /fehlgeschlagen|failed|antwortet nicht|not answering|noch nicht bereit|not ready/i.test(x));
        if (bad) return { notice: bad };
        const f = app.vault.getAbstractFileByPath(${JSON.stringify(PROBE_NOTE)});
        if (!f) return null;
        return { body: await app.vault.read(f) };`, 90_000, 500);
      record(
        "Echte Umschrift einer WebM-Datei legt eine Notiz mit Embed an",
        !!made?.body && made.body.includes(`![[${PROBE_AUDIO}]]`),
        made?.notice ?? (made?.body ? made.body.slice(0, 80).replace(/\n/g, " ") : "keine Notiz"),
      );
    }

  } finally {
    // Aufräumen: Notiz, WAV, Cache, Asset-Basis auf Vorwert, Settings zurück. Dieselbe
    // Funktion wie der SIGINT/SIGTERM-Handler oben — kein Doppelcode.
    process.off("SIGINT", onAbortSignal);
    process.off("SIGTERM", onAbortSignal);
    await cleanupState();
    cdp.close();
  }
  const failed = checks.filter((c) => !c.passed);
  console.log(`\n${checks.length - failed.length}/${checks.length} Prüfpunkte grün`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
