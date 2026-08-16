/**
 * README-Bilder aufnehmen (Skill readme-shots) — das plugin-spezifische Rezept.
 *
 * Bruecke, Aufnahme-Primitive und Fixture→Vault sind vendored aus 3d-codeblocks
 * (`scripts/lib/{cdp,shot,vault}.ts`); die Bruecke teilt sich dieser Treiber mit dem GUI-Smoke.
 *
 * ```bash
 * export STAGING_VAULTS_DIR="…"                     # Ort der Aufnahme-Vaults
 * npm run build && npm run shots -- --setup         # Vault aus dem Fixture bauen, dann Obsidian neu starten
 * npm run shots -- --assets http://127.0.0.1:8765/assets   # alle Bilder (Assets fuer settings.png vom lokalen Server)
 * npm run shots -- --only hero.png                  # ein Bild nachziehen
 * npm run shots:check                               # Vertrag ↔ Dateien ↔ README
 * ```
 *
 * Aufnahmesprache ist **Englisch** (README.md ist kanonisch): der Treiber setzt Obsidians
 * `language` NICHT selbst — das ist eine App-weite Einstellung, die einen Neustart braucht;
 * `--setup` sagt, was zu tun ist. Er prueft aber vor dem ersten Bild, ob die Oberflaeche
 * englisch ist, und bricht sonst mit Klartext ab.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, env, exit } from "node:process";

import { attachTo, Cdp, openExisting, pollUntil, setAppConfig } from "./lib/cdp.js";
import { boxOf, capture, setWindowSize, withMetrics, writeShot, type Rect, type ShotOptions } from "./lib/shot.js";
import { buildVault, stagingVaultDir } from "./lib/vault.js";

const PLUGIN_ID = "audio-interface";
const REPO_NAME = "audio-interface";
const OUT_DIR = "docs/images";
const CAPTURE_WIDTH = 1200;
const THUMB_WIDTH = 380;
const PADDING = 12;
const FENSTER_BREITE = 1440;
const FENSTER_HOEHE = 900;
const NOTE = "Mailbox greeting.md";
const ASSET_KEY = "audio-interface-asset-base";

interface Shot {
  name: string;
  klasse: "hero" | "feature" | "detail";
  run(cdp: Cdp): Promise<Rect | null>;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Notiz in der Lesefläche, gerendert (Text UND der eingebettete Audio-Player sichtbar). */
async function notizBereit(cdp: Cdp): Promise<boolean> {
  await openExisting(cdp, NOTE, "preview");
  const ok = await pollUntil<boolean>(cdp, `
    const view = [...document.querySelectorAll(".markdown-preview-view")].find((e) => e.getBoundingClientRect().width > 1);
    if (!view) return null;
    const text = view.innerText.trim().length;
    const audio = view.querySelector("audio");
    return text > 100 && audio && audio.getBoundingClientRect().width > 1 ? true : null;
  `, 10_000, 250);
  if (!ok) {
    const diag = await cdp.evaluate<string>(`
      const view = [...document.querySelectorAll(".markdown-preview-view")].find((e) => e.getBoundingClientRect().width > 1);
      return JSON.stringify({ vault: app.vault.getName(), datei: app.workspace.getActiveFile()?.path ?? null,
        leseflaeche: view ? view.innerText.trim().length : -1, audio: !!view?.querySelector("audio"),
        pluginAn: !!app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}] });`);
    console.log(`      · Notiz nicht bereit — ${diag}`);
  }
  return Boolean(ok);
}

/** Rechteck eines Elements ueber eine frei formulierte Suche (fuer Zeilen, die nur ueber ihren Text erreichbar sind). */
async function boxWhere(cdp: Cdp, finder: string, padding = 0): Promise<Rect | null> {
  const raw = await cdp.evaluate<string | null>(`
    const el = (() => { ${finder} })();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height });
  `);
  if (!raw) return null;
  const r = JSON.parse(raw) as Rect;
  return { x: Math.max(0, r.x - padding), y: Math.max(0, r.y - padding), width: r.width + padding * 2, height: r.height + padding * 2 };
}

/** Wie capture(), aber mit doppelter Pixeldichte — fuer kleine Ausschnitte (Statusleiste, eine
 *  Settings-Zeile), die writeShot sonst von ~400 px auf 1200 px hochrechnen muesste. */
async function captureScharf(cdp: Cdp, clip: Rect): Promise<Buffer> {
  await cdp.send("Page.bringToFront");
  const res = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...clip, scale: 2 } });
  const data = (res.result as { data?: string } | undefined)?.data;
  if (!data) throw new Error("Page.captureScreenshot lieferte kein Bild");
  return Buffer.from(data, "base64");
}

async function paletteSchliessen(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`document.querySelector(".modal-bg")?.click(); await new Promise((r) => setTimeout(r, 200)); return true;`);
}

const SHOTS: Shot[] = [
  {
    name: "hero.png",
    klasse: "hero",
    async run(cdp) {
      if (!(await notizBereit(cdp))) return null;
      // Von der Ueberschrift bis unter den eingebetteten Player, volle Blattbreite: die beiden
      // Faehigkeiten (vorlesen, vertonen) an einem Gegenstand — ohne die leere Flaeche darunter.
      // Lesbare Zeilenlaenge an: der Text steht dann als Spalte, das Bild wird hoeher als ein Streifen.
      const sizer = await boxOf(cdp, ".workspace-leaf.mod-active .markdown-preview-sizer", 0);
      const h1 = await boxOf(cdp, ".workspace-leaf.mod-active .markdown-preview-view h1", 0);
      const audio = await boxOf(cdp, ".workspace-leaf.mod-active .markdown-preview-view audio", 0);
      if (!sizer || !h1 || !audio) return null;
      const top = h1.y - 36;
      return { x: sizer.x - 40, y: top, width: sizer.width + 80, height: audio.y + audio.height + 40 - top };
    },
  },
  {
    name: "command-palette.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await notizBereit(cdp))) return null;
      await cdp.evaluate(`app.commands.executeCommandById("command-palette:open"); return true;`);
      const ok = await pollUntil<boolean>(cdp, `
        const input = document.querySelector(".prompt-input");
        if (!input) return null;
        if (input.value !== "Audio Interface") { input.value = "Audio Interface"; input.dispatchEvent(new Event("input", { bubbles: true })); return null; }
        const items = [...document.querySelectorAll(".prompt-results .suggestion-item")];
        return items.length >= 6 ? true : null;
      `, 6_000, 200);
      if (!ok) {
        console.log("      · Palette zeigt nicht alle sechs Kommandos (Export-Kommandos erscheinen erst mit bereiter Stimme — settings.png zuerst)");
        await paletteSchliessen(cdp);
        return null;
      }
      return boxOf(cdp, ".prompt", PADDING);
    },
  },
  {
    name: "status-bar.png",
    klasse: "detail",
    async run(cdp) {
      if (!(await notizBereit(cdp))) return null;
      await cdp.evaluate(`app.commands.executeCommandById("${PLUGIN_ID}:speak-note"); return true;`);
      const ok = await pollUntil<boolean>(cdp, `
        const el = document.querySelector(".audio-interface-status");
        return el && !el.classList.contains("is-hidden") && el.textContent.trim() ? true : null;`, 6_000, 150);
      if (!ok) return null;
      // Die Statusleiste samt Rand: unser Eintrag und die Ecke, in der er sitzt. Obsidians Sync-Symbol
      // gehoert nicht ins Bild (Fixture schaltet das Core-Plugin aus; zur Laufzeit hier ebenfalls).
      await cdp.evaluate(`const sync = app.internalPlugins?.plugins?.sync; if (sync?.enabled) { await sync.disable(true); await new Promise((r) => setTimeout(r, 300)); } return true;`).catch(() => undefined);
      const bar = await boxOf(cdp, ".status-bar", 0);
      if (!bar) return null;
      // Bis an die Fensterkante — die Leiste sitzt buendig rechts unten; ein Rand darueber hinaus
      // waere leer. Etwas Notiz-Kontext darueber zeigt, WO der Eintrag sitzt.
      const vp = JSON.parse(await cdp.evaluate<string>("return JSON.stringify({ w: window.innerWidth, h: window.innerHeight });")) as { w: number; h: number };
      const x = Math.max(0, bar.x - 300);
      const y = Math.max(0, bar.y - 48);
      return { x, y, width: vp.w - x, height: vp.h - y };
    },
  },
];

/** Einstellungen sind in Obsidian ≥ 1.13 ein eigenes Fenster (about:blank). Zwei Bilder in einem
 *  Zug: `download.png` (Zeile vor dem Download) und `settings.png` (Tab mit bereiter Stimme). */
async function settingsBilder(cdp: Cdp, port: number, opts: ShotOptions, assets: string | undefined, nur: string | undefined): Promise<string[]> {
  const out: string[] = [];
  const willDownload = !nur || nur === "download.png";
  const willSettings = !nur || nur === "settings.png";
  if (!willDownload && !willSettings) return out;

  // Auslieferungszustand + Export eingeschaltet, Cache leer → Zeile „Download (…)". Der Toggle laeuft
  // ueber den Tab (setControlValue): Obsidian 1.13 rendert aus gecachten Definitionen, und nur dieser
  // Weg stoesst das update() an — direkt am Plugin gesetzt bliebe die Engine-Zeile unsichtbar.
  await cdp.evaluate(`
    const c = await caches.open("audio-interface-engines"); for (const k of await c.keys()) await c.delete(k);
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    if (p.settings.exportEnabled) { p.settings.exportEnabled = false; await p.saveSettings(); p.piper.setEnabled(false); }
    app.setting.open(); app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 700));
    await app.setting.activeTab.setControlValue("exportEnabled", true);
    await new Promise((r) => setTimeout(r, 900));
    return true;`);
  const fenster = await attachTo("settings", port);
  if (!fenster) return ["settings/download — kein Einstellungen-Fenster gefunden"];
  try {
    await fenster.send("Page.bringToFront");
    await wait(600);
    if (willDownload) {
      const row = await boxWhere(fenster, `
        return [...document.querySelectorAll(".setting-item")].find((e) => /Download \\(/.test(e.textContent) && e.getBoundingClientRect().width > 1);`, 6);
      if (row) out.push(await writeShot(fenster, "download.png", await captureScharf(fenster, row), { ...opts, thumb: true }));
      else out.push("download.png — Engine-Zeile mit Download-Knopf nicht gefunden");
    }
    if (willSettings) {
      if (!assets) {
        out.push("settings.png — uebersprungen (kein --assets; die Zeile „Ready“ braucht die geladenen Assets)");
      } else {
        // Download vom lokalen Server: Asset-Basis nur fuer diesen Schritt setzen, Plugin damit
        // neu laden, laden, Basis wieder entfernen und OHNE sie neu laden — der Cache-Schluessel ist
        // basisunabhaengig, die Zeile zeigt danach die echte Quelle (GitHub-Release), nicht die Smoke-URL.
        await cdp.evaluate(`
          app.setting.close();
          app.saveLocalStorage(${JSON.stringify(ASSET_KEY)}, ${JSON.stringify(assets)});
          await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
          await new Promise((r) => setTimeout(r, 800));
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.exportEnabled = true; await p.saveSettings(); p.piper.setEnabled(true);
          await p.store.download(p.piper.deps.descriptor, () => {}, new AbortController().signal);
          app.saveLocalStorage(${JSON.stringify(ASSET_KEY)}, null);
          await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
          await new Promise((r) => setTimeout(r, 1200));
          const q = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          await q.refreshReadiness();
          app.setting.open(); app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
          await new Promise((r) => setTimeout(r, 1200));
          return true;`);
        await fenster.evaluate("window.close(); return true;").catch(() => undefined);
        fenster.close();
        const fenster2 = await attachTo("settings", port);
        if (!fenster2) { out.push("settings.png — Einstellungen-Fenster nach Neuladen nicht gefunden"); return out; }
        try {
          await fenster2.send("Page.bringToFront");
          await wait(600);
          const bereit = await pollUntil<boolean>(fenster2, `
            const st = document.querySelector(".audio-interface-engine-state"); return st && /Ready|Bereit/.test(st.textContent) ? true : null;`, 15_000, 500);
          if (!bereit) out.push("settings.png — Zustand „Ready“ kam nicht zustande");
          else {
            // Der Tab ist hoeher als das Fenster: Fenster fuer die Aufnahme simuliert hoeher machen.
            const png = await withMetrics(fenster2, 1200, 1700, async () => {
              await wait(400);
              const box = await boxOf(fenster2, ".vertical-tab-content", 0) ?? await boxOf(fenster2, ".modal-content", 0);
              if (!box) throw new Error("kein Inhaltsbereich im Einstellungen-Fenster");
              const inhalt = await boxOf(fenster2, ".vertical-tab-content > *:last-child", 0);
              const clip = { ...box, height: inhalt ? inhalt.y + inhalt.height + 24 - box.y : box.height };
              // 2x aufnehmen: der Inhaltsbereich des Einstellungen-Fensters ist nur ~950 CSS-px breit;
              // bei 1x liefe das Bild unter der Anzeigebreite (readme_lint „image-scale", 2026-08-16).
              return captureScharf(fenster2, clip);
            });
            out.push(await writeShot(fenster2, "settings.png", png, { ...opts, thumb: false }));
          }
        } finally {
          await fenster2.evaluate("window.close(); return true;").catch(() => undefined);
          fenster2.close();
        }
        return out;
      }
    }
  } finally {
    await fenster.evaluate("window.close(); return true;").catch(() => undefined);
    fenster.close();
  }
  return out;
}

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

async function main(): Promise<void> {
  const repoRoot = cwd();
  const outDir = join(repoRoot, OUT_DIR);

  if (argv.includes("--list")) {
    for (const s of SHOTS) console.log(`  ${s.klasse.padEnd(8)} ${s.name}`);
    console.log("  detail   download.png\n  feature  settings.png");
    return;
  }

  if (argv.includes("--setup")) {
    const vaultDir = stagingVaultDir(REPO_NAME);
    console.log(`Aufnahme-Vault: ${vaultDir}`);
    for (const zeile of buildVault({ repoRoot, vaultDir, fixtureDir: join(repoRoot, "docs/images/fixture"), pluginId: PLUGIN_ID })) console.log(`  ${zeile}`);
    console.log(
      "\n⚠️  Obsidian jetzt neu starten und diesen Vault oeffnen (Debug-Port offen):\n" +
      "  osascript -e 'quit app \"Obsidian\"'\n" +
      "  open -a Obsidian --args --remote-debugging-port=9222\n" +
      "Aufnahmesprache Englisch: Settings → General → Language = English (App-weit, braucht Neustart).\n" +
      "Beim ersten Oeffnen fragt Obsidian nach Vertrauen fuer Community-Plugins — bestaetigen.",
    );
    return;
  }

  const port = Number(flag("--port") ?? env.SHOTS_PORT ?? 9222);
  const nur = flag("--only");
  const assets = flag("--assets");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const cdp = await attachTo("workspace", port, REPO_NAME);
  if (!cdp) throw new Error(`Kein Obsidian-Fenster mit dem Vault "${REPO_NAME}" auf Port ${port}. Den Aufnahme-Vault oeffnen: open -a Obsidian "$STAGING_VAULTS_DIR/${REPO_NAME}"`);
  console.log(`Verbunden auf Port ${port}.\n`);
  await cdp.mitschnitt((zeile) => console.log(`      » ${zeile}`));
  await cdp.send("Page.bringToFront");
  await wait(3000);

  const lang = await cdp.evaluate<string>(`return window.localStorage.getItem("language") ?? "en";`);
  if (lang !== "en") throw new Error(`Obsidian laeuft auf "${lang}" — Aufnahmesprache ist Englisch (Settings → General → Language, dann Neustart).`);

  // Sicherstellen, dass keine Asset-Basis eines frueheren Laufs haengt: die Zeilen zeigen die Quelle.
  await cdp.evaluate(`app.saveLocalStorage(${JSON.stringify(ASSET_KEY)}, null); return true;`);

  await setWindowSize(cdp, FENSTER_BREITE, FENSTER_HOEHE);
  await setAppConfig(cdp, "readableLineLength", true);
  await setAppConfig(cdp, "showInlineTitle", false);
  await cdp.evaluate(`
    if (document.querySelector(".workspace-tabs.mod-stacked")) { app.commands.executeCommandById("workspace:toggle-stacked-tabs"); await new Promise((r) => setTimeout(r, 400)); }
    // Linke Seitenleiste zu — der Datei-Explorer ist nicht der Gegenstand.
    if (!app.workspace.leftSplit.collapsed) app.workspace.leftSplit.collapse();
    if (!app.workspace.rightSplit.collapsed) app.workspace.rightSplit.collapse();
    await new Promise((r) => setTimeout(r, 300));
    return true;`);

  let ok = 0;
  let fehlend = 0;
  // Settings-Bilder zuerst: danach ist die Stimme geladen und Export eingeschaltet — die Palette
  // zeigt dann alle sechs Kommandos (die Export-Kommandos sind ohne bereite Stimme ausgeblendet).
  for (const zeile of await settingsBilder(cdp, port, { outDir, captureWidth: CAPTURE_WIDTH, thumbWidth: THUMB_WIDTH }, assets, nur)) {
    const gut = / KB/.test(zeile);
    console.log(`  ${gut ? "✓" : "✗"} ${zeile}`);
    if (gut) ok++; else fehlend++;
  }
  for (const shot of SHOTS) {
    if (nur && shot.name !== nur) continue;
    try {
      const box = await shot.run(cdp);
      // Scharf (2x) fuer alles, was schmaler als die Aufnahmebreite ist — sonst wird hochgerechnet.
      const png = box ? (box.width < CAPTURE_WIDTH ? await captureScharf(cdp, box) : await capture(cdp, box)) : null;
      // Aufraeumen: Palette zu, Vorlesen aus — welcher Zustand zurueckbleibt, darf das naechste Bild nicht bestimmen.
      await paletteSchliessen(cdp);
      await cdp.evaluate(`app.commands.executeCommandById("${PLUGIN_ID}:speak-stop"); return true;`);
      if (!png) { console.log(`  ✗ ${shot.name} — Zustand kam nicht zustande`); fehlend++; continue; }
      console.log(`  ✓ ${await writeShot(cdp, shot.name, png, { outDir, captureWidth: CAPTURE_WIDTH, thumbWidth: THUMB_WIDTH, thumb: shot.klasse === "detail" })}`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${shot.name} — ${(err as Error).message}`);
      fehlend++;
    }
  }
  // Auslieferungszustand: Export aus, Engine-Cache leer, Asset-Basis zurueck.
  await cdp.evaluate(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    if (p) { p.settings.exportEnabled = false; await p.saveSettings(); p.piper.setEnabled(false); }
    const c = await caches.open("audio-interface-engines"); for (const k of await c.keys()) await c.delete(k);
    return true;`).catch(() => undefined);

  if (assets) await cdp.evaluate(`app.saveLocalStorage(${JSON.stringify(ASSET_KEY)}, null); return true;`).catch(() => undefined);
  cdp.close();
  console.log(`\n${ok} Bild(er) geschrieben, ${fehlend} offen.`);
  if (fehlend) exit(1);
}

main().catch((err: Error) => {
  console.error(err.message);
  exit(1);
});
