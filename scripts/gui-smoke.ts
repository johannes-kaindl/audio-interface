/**
 * GUI-Smoke-Treiber (Skill gui-smoke-setup, CORE-TEST-02 b): fährt die Prüfpunkte aus
 * `docs/SMOKE.md` gegen ein LAUFENDES Obsidian — echte Systemstimmen, echter Blob-Worker mit
 * ORT-WASM, echte Cache API, echte Vault-Datei. Das ist die Naht, die kein Unit-Test sieht.
 *
 * Voraussetzung (der eine Handgriff, der Handarbeit bleibt):
 *   osascript -e 'quit app "Obsidian"'; open -a Obsidian --args --remote-debugging-port=9222
 *   OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/audio-interface" npm run deploy
 *
 * Seit 0.3.0 prüft er beide ladbaren Stimmen: deutsch laden → exportieren, auf englisch wechseln
 * (dann fehlt nur noch das Modell, Worker + WASM sind geteilt) → laden → exportieren.
 *
 * Assets kommen im Smoke von einem lokalen Server statt von GitHub (kein Release nötig):
 *   npm run assets && python3 -m http.server -d dist-assets 8765   # + CORS, s. docs/SMOKE.md
 *   npm run smoke:gui -- --vault 00_ProtoVault --assets http://127.0.0.1:8765
 * Der Treiber setzt dafür app.saveLocalStorage("audio-interface-asset-base", <url>) und lädt das
 * Plugin neu; am Ende räumt er den Schlüssel, die Cache-Einträge und die Smoke-Notiz wieder weg.
 */
import { Cdp, notices, openNote, pollUntil } from "./lib/cdp.js";

const PLUGIN_ID = "audio-interface";
const SMOKE_NOTE = "_audio-interface-smoke.md";
const SMOKE_BODY = "# Ansage\n\nGuten Tag, Sie erreichen die Mailbox der Beispiel GmbH. Bitte hinterlassen Sie eine Nachricht.\n";
// Für den Lauf mit der englischen Stimme — eine deutsche Ansage englisch phonemisiert wäre ein
// Ergebnis, das niemand hören will, und der Prüfpunkt soll den echten Weg gehen.
const SMOKE_BODY_EN = "# Greeting\n\nHello, you have reached the mailbox of Example Company. Please leave a message after the tone.\n";
const ASSET_KEY = "audio-interface-asset-base";
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
  const vault = arg("vault", "00_ProtoVault");
  const assets = arg("assets", "");
  const keep = process.argv.includes("--keep");
  const cdp = await Cdp.attach(port, vault);
  let previousBase: unknown = null;
  try {
    // Vorbereitung: Asset-Basis setzen (nur wenn übergeben), Plugin frisch laden.
    previousBase = await cdp.evaluate<unknown>(`return app.loadLocalStorage(${JSON.stringify(ASSET_KEY)});`);
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
      await cdp.evaluate(`app.commands.executeCommandById("${PLUGIN_ID}:export-note-wav"); return true;`);
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
      await cdp.evaluate(`const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; await p.piper.readiness(); await new Promise((r)=>setTimeout(r,200)); app.commands.executeCommandById("${PLUGIN_ID}:export-note-wav"); return true;`);
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
  } finally {
    // Aufräumen: Notiz, WAV, Cache, Asset-Basis auf Vorwert, Settings zurück.
    if (!keep) {
      await cdp.evaluate(`
        for (const p of ["_audio-interface-smoke.md", "_audio-interface-smoke.wav", "_audio-interface-smoke-2.wav"]) { const f = app.vault.getAbstractFileByPath(p); if (f) await app.vault.delete(f); }
        const cache = await caches.open("audio-interface-engines"); for (const k of await cache.keys()) await cache.delete(k);
        app.saveLocalStorage(${JSON.stringify(ASSET_KEY)}, ${JSON.stringify(previousBase ?? null)});
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]; if (p) { p.settings.exportEnabled = false; await p.saveSettings(); }
        return true;`).catch(() => undefined);
      await reloadPlugin(cdp).catch(() => undefined);
    }
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
