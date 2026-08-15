# audio-interface Release 1 — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Obsidian-Desktop-Plugin, das Notizen/Auswahl über Systemstimmen vorliest und — nach Opt-in mit
freigegebenem Download — mit einer deutschen Piper-Stimme als WAV (8 kHz Telefonanlage oder nativ) im Vault ablegt.

**Architecture:** `src/core/` ist pur (kein `obsidian`, kein DOM) und trägt Textaufbereitung, Audio-Mathematik,
Zustandsautomat, Engine-Registry und das Worker-Protokoll; `src/obsidian/` verdrahtet Engines (Systemstimmen,
Piper im Blob-Worker), Asset-Store (Cache API + SHA-256), Exporter, Settings-Tab, Statusleiste, Kommandos.
`src/worker/` ist ein eigener esbuild-Entry, der als **Release-Asset** (nicht in `main.js`) ausgeliefert wird.

**Tech Stack:** TypeScript 5, esbuild, vitest 2, obsidian-kit (vendored: i18n, settings, timeout, settings_walker,
folder-suggest, clock, confirm, obsidian-mock), onnxruntime-web 1.27 (`ort.wasm.bundle.min.mjs` + CPU-WASM),
ephone 1.0.2 (eSpeak-NG-WASM, GPL-3), Piper-Stimme `de_DE-thorsten-medium` (CC0), eslint-plugin-obsidianmd.

**Spec:** `docs/superpowers/specs/2026-08-15-audio-interface-release-1-design.md` ·
**Spike:** `docs/spikes/2026-08-15-piper-im-obsidian-renderer.md`

## Global Constraints

- Plugin-`id`: `audio-interface`; `isDesktopOnly: true`; `minAppVersion: "1.5.0"`; `authorUrl: https://github.com/johannes-kaindl`.
- Lizenz AGPL-3.0-or-later (Nachbar-Plugins; ephone/eSpeak-NG GPL-3 kompatibel).
- Kein `child_process`, kein Node-`fs`, kein `eval`; Vault-Schreiben nur über `app.vault`; kein Netzwerk außer dem
  vom Nutzer per Knopf freigegebenen Asset-Download von `https://github.com/johannes-kaindl/audio-interface/releases/download/<version>/…`.
- `main.js` < 2 MB (Gate `check:bundle`), keine WASM/Modelle im Bundle. Assets sind Release-Dateien.
- `getSettingDefinitions()` ist die einzige Settings-Wahrheit; `display()` nur Walker-Fallback. Bedingte Zeilen werden weggelassen, nicht `visible:false`.
- `src/core/**` importiert weder `obsidian` noch DOM-Globals (Gate `check:pure`).
- UI-Strings über Kit-i18n (`t("…")`), Deutsch + Englisch. Bezeichner Englisch, Kommentare Deutsch.
- Timer nur über injizierten `ClockPort` (Kit) bzw. `window.setTimeout` in der obsidian-Schicht (Linter `prefer-window-timers`).
- Kit-Übernahmen tragen Herkunftsstempel in Zeile 1 (`sync-kit.sh` erzeugt ihn); Übernahmen aus Nachbar-Repos: `// uebernommen aus <repo>/<pfad>, 2026-08-15`.
- ORT im Worker: `numThreads = 1`, `wasmBinary` aus dem Cache, Backend `wasm`.
- Commits klein, Präfixe `feat:`/`test:`/`chore:`/`docs:`; Trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## Dateistruktur

```
audio-interface/
├── manifest.json · package.json · versions.json · CHANGELOG.md · LICENSE · README.md · README.de.md · styles.css
├── esbuild.config.mjs            (zwei Entries: src/main.ts → main.js ; src/worker/piper-worker.ts → dist-assets/piper-worker.js)
├── tsconfig.json · tsconfig.test.json · tsconfig.scripts.json · vitest.config.ts · eslint.config.mjs · eslint.overrides.mjs
├── tools/sync-kit.sh             (Kit vendoren)
├── scripts/                      check-pure.mjs · check-bundle.mjs · check-no-inline-disables.mjs · check-no-abs-paths.mjs · check-no-nul-bytes.mjs · build-assets.mjs · gui-smoke.ts
├── src/
│   ├── main.ts                   Plugin: Kommandos, Wiring, Unload
│   ├── i18n/strings.ts           EN/DE-Wörterbuch
│   ├── core/                     settings-types.ts · speech-text.ts · audio.ts · run-state.ts · engine-manifest.ts · engine-manifest.generated.ts · engines.ts · piper-phonemes.ts · worker-protocol.ts · file-naming.ts
│   ├── worker/piper-worker.ts    Worker-Entry (ORT + ephone + Pipeline)
│   ├── obsidian/                 asset-store.ts · engines/system-speech.ts · engines/piper-engine.ts · speaker.ts · exporter.ts · status-bar.ts · settings-tab.ts
│   └── vendor/kit/ · vendor/kit-obsidian/   (vendored, nie von Hand editieren)
├── tests/                        __mocks__/obsidian.ts · vendor/kit/obsidian-mock.ts · core/*.test.ts · obsidian/*.test.ts
└── docs/                         superpowers/specs · superpowers/plans · spikes · SMOKE.md
```

---

### Task 1: Gerüst, Build, Gates, Kit-Vendoring

**Files:**
- Create: `manifest.json`, `package.json`, `versions.json`, `LICENSE`, `.gitignore`, `esbuild.config.mjs`, `tsconfig.json`, `tsconfig.test.json`, `tsconfig.scripts.json`, `vitest.config.ts`, `styles.css`, `tools/sync-kit.sh`, `scripts/check-pure.mjs`, `scripts/check-bundle.mjs`, `tests/__mocks__/obsidian.ts`, `tests/setup.ts`, `src/main.ts` (Minimal), `src/i18n/strings.ts` (Minimal)
- Copy: `../tools/release-template/eslint.config.mjs`, `../tools/release-template/eslint.overrides.mjs`, `../tools/release-template/scripts/check-no-inline-disables.mjs`, `../tools/release-template/versions.json`, `../tools/release-template/CHANGELOG.md`; `../3d-codeblocks/scripts/check-no-abs-paths.mjs`, `../3d-codeblocks/scripts/check-no-nul-bytes.mjs` (Herkunftsstempel)

**Interfaces:**
- Produces: `npm run gate` (lint · typecheck · typecheck:test · test · check:pure · check:bundle) grün auf leerem Plugin; `src/vendor/kit/{i18n,settings,timeout}.ts`, `src/vendor/kit-obsidian/{settings_walker,folder-suggest,clock,confirm}.ts`, `tests/vendor/kit/obsidian-mock.ts`.

- [ ] **Step 1: manifest.json, package.json, LICENSE, .gitignore**

`manifest.json`:
```json
{
  "id": "audio-interface",
  "name": "Audio Interface",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "Read notes aloud with system voices and export them as WAV with a local, downloadable German voice — no cloud, no account.",
  "author": "Johannes Kaindl",
  "authorUrl": "https://github.com/johannes-kaindl",
  "fundingUrl": "",
  "isDesktopOnly": true
}
```

`package.json` (Scripts wie 3d-codeblocks, plus `assets`):
```json
{
  "name": "audio-interface",
  "version": "0.1.0",
  "description": "Read notes aloud with system voices and export them as WAV with a local, downloadable German voice — no cloud, no account.",
  "type": "module",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc --noEmit && node esbuild.config.mjs --production",
    "assets": "node scripts/build-assets.mjs",
    "typecheck": "tsc --noEmit",
    "typecheck:test": "tsc -p tsconfig.test.json --noEmit",
    "typecheck:scripts": "tsc -p tsconfig.scripts.json --noEmit",
    "test": "node scripts/check-no-abs-paths.mjs && node scripts/check-no-nul-bytes.mjs && vitest run --passWithNoTests",
    "lint": "node scripts/check-no-inline-disables.mjs && eslint src --max-warnings 0",
    "check:pure": "node scripts/check-pure.mjs",
    "check:bundle": "node esbuild.config.mjs --production && node scripts/check-bundle.mjs",
    "gate": "npm run lint && npm run typecheck && npm run typecheck:test && npm run typecheck:scripts && npm test && npm run check:pure && npm run check:bundle",
    "deploy": "npm run build && cp main.js manifest.json styles.css \"${OBSIDIAN_PLUGIN_DIR:?set OBSIDIAN_PLUGIN_DIR}\"/",
    "smoke:gui": "esbuild scripts/gui-smoke.ts --bundle --platform=node --format=esm --outfile=.gui-smoke.mjs --log-level=warning && node .gui-smoke.mjs",
    "release": "test -f ../tools/release/release.mjs || { echo \"FEHLER: ../tools/release/ fehlt. Dieses Repo muss im Dach-Verzeichnis obsidian-plugins/ neben tools/ liegen.\" >&2; exit 1; }; node ../tools/release/release.mjs",
    "version-bump": "test -f ../tools/release/version-bump.mjs || { echo \"FEHLER: ../tools/release/ fehlt.\" >&2; exit 1; }; node ../tools/release/version-bump.mjs",
    "preflight": "test -f ../tools/release/preflight.mjs || { echo \"FEHLER: ../tools/release/ fehlt.\" >&2; exit 1; }; node ../tools/release/preflight.mjs"
  },
  "keywords": ["obsidian", "obsidian-plugin", "tts", "text-to-speech", "read-aloud", "wav", "piper", "local-first"],
  "author": "Johannes Kaindl",
  "license": "AGPL-3.0-or-later",
  "devDependencies": {
    "@types/node": "^20",
    "esbuild": "^0.23",
    "eslint": "^9",
    "eslint-plugin-obsidianmd": "^0.4.1",
    "obsidian": "latest",
    "typescript": "^5.5",
    "typescript-eslint": "^8",
    "vitest": "^2",
    "onnxruntime-web": "1.27.0",
    "ephone": "1.0.2",
    "ws": "^8"
  }
}
```

`LICENSE`: AGPL-3.0 (Kopie aus `../3d-codeblocks/LICENSE`, Kopfzeile auf „audio-interface"). `.gitignore`: `node_modules/`, `main.js`, `dist-assets/`, `.gui-smoke.mjs`, `*.map`.

- [ ] **Step 2: tsconfig / vitest / esbuild (zwei Entries)**

`tsconfig.json`, `tsconfig.test.json` byte-gleich zu 3d-codeblocks (siehe dessen Dateien; `include: ["src/**/*.ts"]`, `lib: ["ES2022","DOM","DOM.Iterable"]`, `types: []`). Zusätzlich `WebWorker`-Typen nur für den Worker-Entry: in `tsconfig.json` unter `include` bleibt `src/**/*.ts`; der Worker nutzt `self` als `DedicatedWorkerGlobalScope` per lokalem `declare const self: DedicatedWorkerGlobalScope;` — dazu `"lib": ["ES2022","DOM","DOM.Iterable","WebWorker"]` **nicht** global (Konflikte). Stattdessen in `src/worker/piper-worker.ts` `/// <reference lib="webworker" />` in Zeile 1.

`tsconfig.scripts.json`:
```json
{ "extends": "./tsconfig.json", "compilerOptions": { "types": ["node"], "module": "ESNext" }, "include": ["scripts/**/*.ts"] }
```

`vitest.config.ts` wie 3d-codeblocks (Alias `obsidian` → `tests/__mocks__/obsidian.ts`, `setupFiles: ["./tests/setup.ts"]`, `environment: "node"`, `globals: true`).

`esbuild.config.mjs`:
```js
// Zwei Bundles: main.js (Plugin) und dist-assets/piper-worker.js (Release-Asset, NICHT im Plugin-Release-Trio).
import esbuild from "esbuild";
const prod = process.argv.includes("--production");
const common = { bundle: true, target: "es2022", sourcemap: prod ? false : "inline", minify: prod, treeShaking: true };
const plugin = await esbuild.context({ ...common, entryPoints: ["src/main.ts"], external: ["obsidian", "electron", "node:*"], format: "cjs", outfile: "main.js" });
const worker = await esbuild.context({ ...common, entryPoints: ["src/worker/piper-worker.ts"], format: "esm", outfile: "dist-assets/piper-worker.js",
  // ephone importiert seine Lang-Packs dynamisch relativ — wir bündeln gmw fest hinein (siehe worker-Entry), Rest fällt weg.
  external: [] });
if (prod) { await plugin.rebuild(); await worker.rebuild(); await plugin.dispose(); await worker.dispose(); }
else { await plugin.watch(); await worker.watch(); console.log("esbuild: watching…"); }
```

- [ ] **Step 3: Gates kopieren/schreiben**

`scripts/check-pure.mjs`: von 3d-codeblocks übernehmen (Herkunftsstempel), `FORBIDDEN` auf `obsidian` reduzieren und **zusätzlich** DOM-Globals verbieten: `/\b(document|window|navigator|caches|Worker|AudioContext|speechSynthesis)\b/` — Ausnahme: `src/core/worker-protocol.ts` darf `Float32Array` (kein DOM). `scripts/check-bundle.mjs`:
```js
import { statSync } from "node:fs";
const max = 2 * 1024 * 1024; const size = statSync("main.js").size;
if (size > max) { console.error(`main.js ist ${size} Bytes (> ${max}) — Assets gehören ins Release, nicht ins Bundle`); process.exit(1); }
console.log(`check:bundle: main.js ${size} Bytes`);
```
`eslint.config.mjs`, `eslint.overrides.mjs`, `scripts/check-no-inline-disables.mjs` **byte-identisch** aus `../tools/release-template/` kopieren. `check-no-abs-paths.mjs`, `check-no-nul-bytes.mjs` aus 3d-codeblocks mit Herkunftsstempel.

- [ ] **Step 4: Kit vendoren**

`tools/sync-kit.sh`:
```sh
#!/bin/sh
# Vendort Kit-Module byte-identisch aus dem Schwester-Repo obsidian-kit. Nie von Hand editieren — Skript neu laufen lassen.
set -e
KIT=../obsidian-kit
SHA=$(git -C "$KIT" rev-parse HEAD); VER=$(git -C "$KIT" describe --tags --abbrev=0); DATE=$(date +%F)
mkdir -p src/vendor/kit src/vendor/kit-obsidian tests/vendor/kit
for f in i18n settings timeout; do
  { printf '%s\n' "// vendored from obsidian-kit, src/pure/$f.ts — do not hand-edit; re-vendor via tools/sync-kit.sh"; cat "$KIT/src/pure/$f.ts"; } > "src/vendor/kit/$f.ts"
done
for f in settings_walker folder-suggest clock confirm; do
  { printf '%s\n' "// vendored from obsidian-kit, src/obsidian/$f.ts — do not hand-edit; re-vendor via tools/sync-kit.sh"; cat "$KIT/src/obsidian/$f.ts"; } > "src/vendor/kit-obsidian/$f.ts"
done
{ printf '%s\n' "// vendored from obsidian-kit, src/testing/obsidian-mock.ts — do not hand-edit; re-vendor via tools/sync-kit.sh"; cat "$KIT/src/testing/obsidian-mock.ts"; } > tests/vendor/kit/obsidian-mock.ts
for d in src/vendor/kit src/vendor/kit-obsidian tests/vendor/kit; do
  printf '{\n  "source": "obsidian-kit",\n  "version": "%s",\n  "sha": "%s",\n  "vendored": "%s"\n}\n' "$VER" "$SHA" "$DATE" > "$d/VENDOR.json"
done
echo "vendored: i18n settings timeout | settings_walker folder-suggest clock confirm | obsidian-mock ($VER)"
```
Ausführen: `sh tools/sync-kit.sh`. Prüfen, ob `settings_walker.ts`/`folder-suggest.ts` untereinander relative Imports haben (`../pure/…`) — dann Pfade im vendorten Stand auf `../kit/…` biegen und die Abweichung in `VENDOR.json` unter `"note"` deklarieren.

`tests/__mocks__/obsidian.ts`: `export * from "../vendor/kit/obsidian-mock";` — plus Overrides, sobald ein Test sie braucht. `tests/setup.ts`: leer bis auf einen Kommentar.

- [ ] **Step 5: Minimal-Plugin und i18n-Skelett**

`src/i18n/strings.ts`:
```ts
import { defineStrings, pickLang, setLang, t } from "../vendor/kit/i18n";
export const EN: Record<string, string> = { "cmd.speakNote": "Read note aloud" };
export const DE: Record<string, string> = { "cmd.speakNote": "Notiz vorlesen" };
export function initI18n(rawLang: string | null | undefined): void { defineStrings({ en: EN, de: DE }); setLang(pickLang(rawLang)); }
export { t };
```
`src/main.ts`:
```ts
import { Plugin } from "obsidian";
import { initI18n, t } from "./i18n/strings";
export default class AudioInterfacePlugin extends Plugin {
  async onload(): Promise<void> {
    initI18n(window.localStorage.getItem("language"));
    this.addCommand({ id: "speak-note", name: t("cmd.speakNote"), callback: () => {} });
  }
}
```

- [ ] **Step 6: Installieren, Gate fahren**

Run: `npm install && npm run gate` — Expected: alle Schritte grün, `main.js` < 50 KB, `vitest` „no tests" toleriert (`--passWithNoTests`).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: Gerüst — Build (main + Worker-Entry), Gates, Kit-Vendoring, Minimal-Plugin"
```

---

### Task 2: Settings-Typen und Normalisierung (pur)

**Files:**
- Create: `src/core/settings-types.ts`, `tests/core/settings-types.test.ts`

**Interfaces:**
- Produces:
```ts
export type ExportProfile = "phone-8k" | "native";
export interface AudioInterfaceSettings { speakVoiceUri: string; speakRate: number; speakWithLoadable: boolean; exportEnabled: boolean; exportEngineId: string; exportProfile: ExportProfile; exportFolder: string; exportFilePattern: string; exportInsertLink: boolean; }
export const DEFAULT_SETTINGS: AudioInterfaceSettings;
export const SPEAK_RATE = { min: 0.5, max: 2, step: 0.1 } as const;
export function normalizeSettings(raw: unknown): AudioInterfaceSettings;   // mergeSettings + Klemmen/Enum-Prüfung
```

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/core/settings-types";
describe("normalizeSettings", () => {
  it("liefert Defaults für null/undefined/Müll", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("x")).toEqual(DEFAULT_SETTINGS);
  });
  it("klemmt speakRate auf 0.5–2 und verwirft NaN/Strings", () => {
    expect(normalizeSettings({ speakRate: 9 }).speakRate).toBe(2);
    expect(normalizeSettings({ speakRate: 0.1 }).speakRate).toBe(0.5);
    expect(normalizeSettings({ speakRate: "1.5" }).speakRate).toBe(DEFAULT_SETTINGS.speakRate);
  });
  it("verwirft unbekannte exportProfile-Werte auf den Default", () => {
    expect(normalizeSettings({ exportProfile: "mp3" }).exportProfile).toBe("phone-8k");
    expect(normalizeSettings({ exportProfile: "native" }).exportProfile).toBe("native");
  });
  it("leeres Dateimuster fällt auf Default zurück", () => {
    expect(normalizeSettings({ exportFilePattern: "   " }).exportFilePattern).toBe("{{note}}");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/core/settings-types.test.ts` — FAIL (Modul fehlt).

- [ ] **Step 3: Implement**

```ts
// Settings-Wahrheit + Normalisierung. Pur. mergeSettings (Kit) macht den Shallow-Merge mit
// Typprüfung; die Bereichs-Klemmen sind plugin-eigen und leben hier.
import { mergeSettings } from "../vendor/kit/settings";
export type ExportProfile = "phone-8k" | "native";
export interface AudioInterfaceSettings { /* wie oben */ }
export const SPEAK_RATE = { min: 0.5, max: 2, step: 0.1 } as const;
export const DEFAULT_SETTINGS: AudioInterfaceSettings = {
  speakVoiceUri: "", speakRate: 1, speakWithLoadable: false, exportEnabled: false,
  exportEngineId: "piper-de-thorsten-medium", exportProfile: "phone-8k", exportFolder: "",
  exportFilePattern: "{{note}}", exportInsertLink: false,
};
const PROFILES: readonly ExportProfile[] = ["phone-8k", "native"];
export function normalizeSettings(raw: unknown): AudioInterfaceSettings {
  const s = mergeSettings(DEFAULT_SETTINGS, raw);
  const rate = typeof s.speakRate === "number" && Number.isFinite(s.speakRate) ? Math.min(SPEAK_RATE.max, Math.max(SPEAK_RATE.min, s.speakRate)) : DEFAULT_SETTINGS.speakRate;
  return { ...s, speakRate: rate,
    exportProfile: PROFILES.includes(s.exportProfile) ? s.exportProfile : DEFAULT_SETTINGS.exportProfile,
    exportFilePattern: s.exportFilePattern.trim() === "" ? DEFAULT_SETTINGS.exportFilePattern : s.exportFilePattern };
}
```
Falls Kit-`mergeSettings` bei Typ-Mismatch den Default nimmt (Zeile 72 REGISTRY: „prüft Feldwerte"), reicht das für `"1.5"`; sonst hier `typeof` prüfen (Test entscheidet).

- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `feat(core): Settings-Typen + Normalisierung`.

---

### Task 3: Markdown → Sprechtext (`prepareSpeech`, pur)

**Files:**
- Create: `src/core/speech-text.ts`, `tests/core/speech-text.test.ts`

**Interfaces:**
- Produces:
```ts
export interface SpeechChunk { text: string; pauseAfterMs: number }
export const PAUSE_MS = { sentence: 250, paragraph: 600, heading: 900 } as const;
export function prepareSpeech(markdown: string): SpeechChunk[];
export function splitSentences(paragraph: string): string[];
```

- [ ] **Step 1: Failing tests** (Tabelle Markdown → Chunks)

```ts
import { describe, expect, it } from "vitest";
import { PAUSE_MS, prepareSpeech, splitSentences } from "../../src/core/speech-text";
const texts = (md: string) => prepareSpeech(md).map((c) => c.text);
describe("prepareSpeech", () => {
  it("entfernt Frontmatter und liefert nichts für Notizen ohne Text", () => {
    expect(prepareSpeech("---\ntitle: x\n---\n")).toEqual([]);
    expect(texts("---\ntitle: x\n---\nHallo Welt.")).toEqual(["Hallo Welt."]);
  });
  it("Überschrift wird eigener Chunk mit langer Pause, Marker weg", () => {
    const c = prepareSpeech("## Ansage\n\nGuten Tag.");
    expect(c[0]).toEqual({ text: "Ansage", pauseAfterMs: PAUSE_MS.heading });
    expect(c[1]).toEqual({ text: "Guten Tag.", pauseAfterMs: PAUSE_MS.paragraph });
  });
  it("Sätze im Absatz: kurze Pause, letzter Satz Absatzpause", () => {
    const c = prepareSpeech("Erster Satz. Zweiter Satz! Dritter?");
    expect(c.map((x) => x.pauseAfterMs)).toEqual([PAUSE_MS.sentence, PAUSE_MS.sentence, PAUSE_MS.paragraph]);
    expect(c.map((x) => x.text)).toEqual(["Erster Satz.", "Zweiter Satz!", "Dritter?"]);
  });
  it("Links → Anzeigetext, Bilder/Embeds/Codeblöcke/Kommentare/HTML weg", () => {
    const md = "Siehe [[Pfad/Notiz#Abschnitt|die Notiz]] und [[Andere]] sowie [Seite](https://x.y).\n\n![[bild.png]]\n\n![alt](a.png)\n\n```js\ncode();\n```\n\n%% geheim %%\n\n<span>tag</span> bleibt.";
    expect(texts(md)).toEqual(["Siehe die Notiz und Andere sowie Seite.", "tag bleibt."]);
  });
  it("Listen: Marker/Checkboxen weg, jeder Punkt ein Chunk", () => {
    expect(texts("- eins\n- [ ] zwei\n1. drei\n* vier")).toEqual(["eins", "zwei", "drei", "vier"]);
    expect(prepareSpeech("- eins\n- zwei")[0].pauseAfterMs).toBe(PAUSE_MS.sentence);
  });
  it("Tabellen: Trennzeile weg, Zellen mit Komma", () => {
    expect(texts("| A | B |\n|---|---|\n| 1 | 2 |")).toEqual(["A, B", "1, 2"]);
  });
  it("Callouts: Marker weg, Titel wird Satz; Blockquote-Zeichen weg", () => {
    expect(texts("> [!info] Wichtig\n> Text hier.")).toEqual(["Wichtig", "Text hier."]);
    expect(texts("> Zitat.")).toEqual(["Zitat."]);
  });
  it("Hervorhebungen und Inline-Code werden nackt, Trennlinien weg", () => {
    expect(texts("**fett** und *kursiv* und ==mark== und ~~weg~~ und `code`\n\n---\n\nEnde.")).toEqual(["fett und kursiv und mark und weg und code", "Ende."]);
  });
  it("Whitespace wird zusammengezogen", () => {
    expect(texts("Ein   Text\nmit Umbruch.")).toEqual(["Ein Text mit Umbruch."]);
  });
});
describe("splitSentences", () => {
  it("trennt an .!? gefolgt von Leerraum, behält Satzzeichen, Abkürzungen mit Punkt+Kleinbuchstabe bleiben", () => {
    expect(splitSentences("Hallo Dr. Müller. Wie geht es? Gut!")).toEqual(["Hallo Dr. Müller.", "Wie geht es?", "Gut!"]);
    expect(splitSentences("Ohne Punkt")).toEqual(["Ohne Punkt"]);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** (Reihenfolge ist tragend)

```ts
export interface SpeechChunk { text: string; pauseAfterMs: number }
export const PAUSE_MS = { sentence: 250, paragraph: 600, heading: 900 } as const;

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const FENCE = /```[\s\S]*?```/g;
const COMMENT = /%%[\s\S]*?%%/g;
const HTML_TAG = /<\/?[a-zA-Z][^>]*>/g;
const EMBED = /!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g;
const WIKILINK = /\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
const MDLINK = /\[([^\]]*)\]\([^)]*\)/g;
const HRULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const CALLOUT = /^>\s*\[!([^\]]+)\][+-]?\s*(.*)$/;
const LIST = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const EMPHASIS = [/\*\*([^*]+)\*\*/g, /__([^_]+)__/g, /(^|[^\w])\*([^*\n]+)\*/g, /(^|[^\w])_([^_\n]+)_/g, /==([^=]+)==/g, /~~([^~]+)~~/g, /`([^`]+)`/g];

function inline(s: string): string {
  let out = s.replace(EMBED, "").replace(WIKILINK, (_m, target: string, alias?: string) => (alias ?? target).trim())
    .replace(MDLINK, "$1").replace(HTML_TAG, "");
  out = out.replace(EMPHASIS[0], "$1").replace(EMPHASIS[1], "$1").replace(EMPHASIS[2], "$1$2").replace(EMPHASIS[3], "$1$2")
    .replace(EMPHASIS[4], "$1").replace(EMPHASIS[5], "$1").replace(EMPHASIS[6], "$1");
  return out.replace(/\s+/g, " ").trim();
}

export function splitSentences(paragraph: string): string[] {
  // Satzende = .!?… gefolgt von Leerraum und Großbuchstabe/Zahl/Anführung — „Dr. Müller" bleibt zusammen.
  const parts = paragraph.split(/(?<=[.!?…])\s+(?=[A-ZÄÖÜ0-9„"'(\[])/u).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : (paragraph.trim() ? [paragraph.trim()] : []);
}

export function prepareSpeech(markdown: string): SpeechChunk[] {
  const body = markdown.replace(FRONTMATTER, "").replace(FENCE, "").replace(COMMENT, "");
  const chunks: SpeechChunk[] = [];
  let para: string[] = [];
  const flushPara = () => {
    const text = inline(para.join(" ")); para = [];
    if (!text) return;
    const sentences = splitSentences(text);
    sentences.forEach((s, i) => chunks.push({ text: s, pauseAfterMs: i === sentences.length - 1 ? PAUSE_MS.paragraph : PAUSE_MS.sentence }));
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/^\s*>\s?/, (m) => (CALLOUT.test(raw) ? m : "")); // Blockquote-Zeichen weg, Callout-Zeile erst unten
    if (line.trim() === "" || HRULE.test(line)) { flushPara(); continue; }
    const callout = raw.match(CALLOUT);
    if (callout) { flushPara(); const title = inline(callout[2] || callout[1]); if (title) chunks.push({ text: title, pauseAfterMs: PAUSE_MS.heading }); continue; }
    const h = line.match(HEADING);
    if (h) { flushPara(); const t = inline(h[2]); if (t) chunks.push({ text: t, pauseAfterMs: PAUSE_MS.heading }); continue; }
    if (TABLE_SEP.test(line)) continue;
    if (line.includes("|") && line.trim().startsWith("|")) { flushPara(); const cells = line.split("|").map((c) => inline(c)).filter(Boolean); if (cells.length) chunks.push({ text: cells.join(", "), pauseAfterMs: PAUSE_MS.sentence }); continue; }
    const li = line.match(LIST);
    if (li) { flushPara(); const t = inline(li[1]); if (t) chunks.push({ text: t, pauseAfterMs: PAUSE_MS.sentence }); continue; }
    para.push(line);
  }
  flushPara();
  return chunks;
}
```
Blockquote-Zeile: `> Zitat.` → Zeichen entfernt, dann normaler Absatz. Callout: `raw` matcht `CALLOUT` (mit `>`), Titel als Überschrift-Chunk; Folgezeilen des Callouts sind normale Zeilen ohne `>`. Tests treiben Feinheiten (Reihenfolge Embed→Wikilink ist wichtig, sonst frisst `WIKILINK` das `![[`).

- [ ] **Step 4: Run** bis PASS; Regexe an den Tests nachschärfen. **Step 5: Commit** `feat(core): prepareSpeech — Markdown zu Sprech-Chunks`.

---

### Task 4: Audio-Mathematik — Stille, Resampling, WAV (pur)

**Files:**
- Create: `src/core/audio.ts`, `tests/core/audio.test.ts`

**Interfaces:**
- Produces:
```ts
export interface PcmBuffer { samples: Float32Array; sampleRate: number }
export function silence(ms: number, sampleRate: number): Float32Array;
export function concatWithSilence(parts: { pcm: PcmBuffer; pauseAfterMs: number }[], sampleRate: number): PcmBuffer;  // wirft bei Samplerate-Mismatch
export function resample(pcm: PcmBuffer, targetRate: number): PcmBuffer;   // windowed-sinc, 32 Taps je Seite; gleiche Rate → Kopie
export function toInt16(samples: Float32Array): Int16Array;                 // clamp ±1
export function encodeWav(pcm: PcmBuffer): Uint8Array;                      // RIFF, PCM 16 bit mono
export function normalizePeak(samples: Float32Array, target?: number): Float32Array; // default 0.9, nur wenn Peak > target
```

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { concatWithSilence, encodeWav, resample, toInt16 } from "../../src/core/audio";
const sine = (f: number, sr: number, sec: number) => Float32Array.from({ length: Math.round(sr * sec) }, (_, i) => Math.sin(2 * Math.PI * f * i / sr));
const dominantHz = (x: Float32Array, sr: number) => { let zc = 0; for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) zc++; return (zc / 2) / (x.length / sr); };
describe("concatWithSilence", () => {
  it("fügt Pausen in Samples ein und wirft bei Raten-Mismatch", () => {
    const a = { samples: new Float32Array(100).fill(0.5), sampleRate: 1000 };
    const out = concatWithSilence([{ pcm: a, pauseAfterMs: 50 }, { pcm: a, pauseAfterMs: 0 }], 1000);
    expect(out.samples.length).toBe(250); expect(out.samples[120]).toBe(0); expect(out.samples[160]).toBe(0.5);
    expect(() => concatWithSilence([{ pcm: { ...a, sampleRate: 2000 }, pauseAfterMs: 0 }], 1000)).toThrow();
  });
});
describe("resample", () => {
  it("22050→8000: Länge stimmt, 400-Hz-Ton bleibt 400 Hz, Amplitude ~1", () => {
    const out = resample({ samples: sine(400, 22050, 1), sampleRate: 22050 }, 8000);
    expect(out.sampleRate).toBe(8000); expect(Math.abs(out.samples.length - 8000)).toBeLessThanOrEqual(1);
    expect(dominantHz(out.samples, 8000)).toBeCloseTo(400, -1);
    let peak = 0; for (const v of out.samples) peak = Math.max(peak, Math.abs(v)); expect(peak).toBeGreaterThan(0.9); expect(peak).toBeLessThan(1.05);
  });
  it("dämpft Anteile über der neuen Nyquist-Grenze (Anti-Aliasing)", () => {
    const out = resample({ samples: sine(6000, 22050, 1), sampleRate: 22050 }, 8000);
    let rms = 0; for (const v of out.samples) rms += v * v; rms = Math.sqrt(rms / out.samples.length);
    expect(rms).toBeLessThan(0.1);
  });
  it("gleiche Rate liefert Kopie", () => { const p = { samples: sine(1, 100, 1), sampleRate: 100 }; const o = resample(p, 100); expect(o.samples).not.toBe(p.samples); expect(o.samples).toEqual(p.samples); });
});
describe("toInt16 / encodeWav", () => {
  it("klemmt und skaliert", () => { expect(Array.from(toInt16(Float32Array.from([0, 1, -1, 2, -2, 0.5])))).toEqual([0, 32767, -32768, 32767, -32768, 16383]); });
  it("schreibt gültigen RIFF-Header (mono 16 bit)", () => {
    const wav = encodeWav({ samples: new Float32Array(10), sampleRate: 8000 });
    const dv = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF"); expect(String.fromCharCode(...wav.subarray(8, 12))).toBe("WAVE");
    expect(dv.getUint16(20, true)).toBe(1); expect(dv.getUint16(22, true)).toBe(1); expect(dv.getUint32(24, true)).toBe(8000);
    expect(dv.getUint32(28, true)).toBe(16000); expect(dv.getUint16(32, true)).toBe(2); expect(dv.getUint16(34, true)).toBe(16);
    expect(dv.getUint32(40, true)).toBe(20); expect(wav.length).toBe(64); expect(dv.getUint32(4, true)).toBe(56);
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**

```ts
export interface PcmBuffer { samples: Float32Array; sampleRate: number }
export function silence(ms: number, sampleRate: number): Float32Array { return new Float32Array(Math.round((ms / 1000) * sampleRate)); }
export function concatWithSilence(parts, sampleRate) {
  const pieces: Float32Array[] = [];
  for (const p of parts) { if (p.pcm.sampleRate !== sampleRate) throw new Error(`sample rate mismatch: ${p.pcm.sampleRate} != ${sampleRate}`); pieces.push(p.pcm.samples); if (p.pauseAfterMs > 0) pieces.push(silence(p.pauseAfterMs, sampleRate)); }
  const total = pieces.reduce((n, a) => n + a.length, 0); const out = new Float32Array(total); let o = 0; for (const a of pieces) { out.set(a, o); o += a.length; }
  return { samples: out, sampleRate };
}
// Windowed-sinc-Resampler (Kaiser/Hann-Fenster, 32 Taps je Seite). Grenzfrequenz = 0,45·min(sr_in, sr_out).
export function resample(pcm: PcmBuffer, targetRate: number): PcmBuffer {
  if (targetRate === pcm.sampleRate) return { samples: Float32Array.from(pcm.samples), sampleRate: targetRate };
  const ratio = pcm.sampleRate / targetRate; const outLen = Math.round(pcm.samples.length / ratio);
  const fc = 0.45 * Math.min(pcm.sampleRate, targetRate) / pcm.sampleRate; // normiert auf Eingangsrate
  const taps = 32; const out = new Float32Array(outLen); const x = pcm.samples;
  for (let n = 0; n < outLen; n++) {
    const center = n * ratio; const i0 = Math.floor(center);
    let acc = 0, wsum = 0;
    for (let i = i0 - taps + 1; i <= i0 + taps; i++) {
      if (i < 0 || i >= x.length) continue;
      const d = center - i; const s = d === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / taps); // Hann
      acc += x[i] * s * w; wsum += s * w;
    }
    out[n] = wsum !== 0 ? acc / wsum * (2 * fc * ratio > 1 ? 1 : 1) : 0; // Normierung über wsum hält Amplitude
  }
  return { samples: out, sampleRate: targetRate };
}
export function toInt16(samples: Float32Array): Int16Array { const o = new Int16Array(samples.length); for (let i = 0; i < samples.length; i++) { const v = Math.max(-1, Math.min(1, samples[i])); o[i] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767); } return o; }
export function encodeWav(pcm: PcmBuffer): Uint8Array {
  const data = toInt16(pcm.samples); const bytes = data.length * 2; const buf = new ArrayBuffer(44 + bytes); const dv = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); dv.setUint32(4, 36 + bytes, true); str(8, "WAVE"); str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, pcm.sampleRate, true); dv.setUint32(28, pcm.sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); str(36, "data"); dv.setUint32(40, bytes, true);
  new Int16Array(buf, 44).set(data); return new Uint8Array(buf);
}
export function normalizePeak(samples: Float32Array, target = 0.9): Float32Array { let peak = 0; for (const v of samples) peak = Math.max(peak, Math.abs(v)); if (peak <= target || peak === 0) return samples; const g = target / peak; return samples.map((v) => v * g); }
```
Die Normierung über `wsum` ist der Trick, mit dem der Amplituden-Test ohne Gain-Faktor besteht; falls der Aliasing-Test wackelt, `taps` auf 48 erhöhen.

- [ ] **Step 4: Run** bis PASS. **Step 5: Commit** `feat(core): PCM-Stille, windowed-sinc-Resampler, WAV-Encoder`.

---

### Task 5: Zustandsautomat für Langläufer (pur, 3. Exemplar)

**Files:**
- Create: `src/core/run-state.ts`, `tests/core/run-state.test.ts`
- Vorlage: `../apple-health/src/core/import-state.ts` (lesen, Regeln übernehmen, Phasen plugin-eigen; Herkunftsstempel `// uebernommen (Muster) aus apple-health/src/core/import-state.ts, 2026-08-15`)

**Interfaces:**
- Produces:
```ts
export type RunPhase = "preparing" | "downloading" | "synthesizing" | "encoding" | "writing";
export type RunState = { kind: "idle" } | { kind: "running"; phase: RunPhase; done: number; total: number } | { kind: "done"; detail: string } | { kind: "aborted" } | { kind: "failed"; message: string };
export const IDLE: RunState;
export function begin(phase: RunPhase): RunState;
export function progress(s: RunState, phase: RunPhase, done: number, total: number): RunState;  // nur aus running
export function abort(s: RunState): RunState;      // running(≠writing) → aborted; sonst unverändert
export function fail(s: RunState, message: string): RunState;  // aborted bleibt aborted
export function finish(s: RunState, detail: string): RunState;
export function isBusy(s: RunState): boolean;
export function canAbort(s: RunState): boolean;
```

- [ ] **Step 1: Failing tests** — Abbruch verweigert in `writing`; Fehler nach Abbruch überschreibt nicht; `progress` außerhalb `running` ist no-op; `isBusy` nur bei running.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement** als reine Übergangsfunktionen (`switch` auf `s.kind`). **Step 4:** PASS. **Step 5: Commit** `feat(core): Zustandsautomat für Download/Export (Abbruch-vor-Fehler, writing ohne Wiederkehr)`.

---

### Task 6: Engine-Manifest, Registry, Phonem-Mapping, Worker-Protokoll, Dateinamen (pur)

**Files:**
- Create: `src/core/engine-manifest.ts`, `src/core/engine-manifest.generated.ts` (Erst-Stand von Hand, später vom Build), `src/core/engines.ts`, `src/core/piper-phonemes.ts`, `src/core/worker-protocol.ts`, `src/core/file-naming.ts`, Tests dazu unter `tests/core/`.

**Interfaces:**
- Produces:
```ts
// engine-manifest.ts
export type AssetKey = "worker" | "wasm" | "model" | "modelConfig";
export interface AssetFile { key: AssetKey; fileName: string; bytes: number; sha256: string; license: string }
export interface EngineDescriptor { id: string; kind: "builtin" | "loadable" | "service"; label: string; lang: "de"; sampleRate: number | null; assets: AssetFile[]; licenseSummary: string }
export const BUILTIN_ENGINE_ID = "system-voices"; export const PIPER_DE_ENGINE_ID = "piper-de-thorsten-medium";
export const RELEASE_BASE_URL = "https://github.com/johannes-kaindl/audio-interface/releases/download";
export function assetUrl(version: string, file: AssetFile): string;   // `${RELEASE_BASE_URL}/${version}/${file.fileName}`
export function totalBytes(e: EngineDescriptor): number;
export function formatBytes(n: number): string;                       // "63,2 MB"
export const ENGINES: EngineDescriptor[];                             // builtin + piper (aus generated)
export function engineById(id: string): EngineDescriptor | undefined;
// engine-manifest.generated.ts (vom Build überschrieben)
export const ASSET_VERSION = "0.1.0"; export const PIPER_DE_ASSETS: AssetFile[]; export const PIPER_DE_SAMPLE_RATE = 22050;
// engines.ts
export type EngineReadiness = "off" | "needs-download" | "loading" | "ready" | "unavailable";
export function exportEngineFor(settings, readiness: Record<string, EngineReadiness>): string | null;   // exportEnabled && readiness[exportEngineId]==="ready" ? id : null
export function speakEngineFor(settings, readiness): string;   // speakWithLoadable && ready → exportEngineId, sonst BUILTIN_ENGINE_ID
// piper-phonemes.ts
export interface PiperConfig { audio: { sample_rate: number }; espeak: { voice: string }; inference: { noise_scale: number; length_scale: number; noise_w: number }; phoneme_id_map: Record<string, number[]> }
export function ipaToIds(ipa: string, map: Record<string, number[]>): { ids: number[]; unknown: string[] };  // ^ (id _)* $ ; unbekannte Zeichen übersprungen und gemeldet
export function parsePiperConfig(json: unknown): PiperConfig;   // wirft mit klarer Meldung bei fehlenden Feldern
// worker-protocol.ts
export type WorkerRequest = { type: "init"; wasm: ArrayBuffer; model: ArrayBuffer; config: PiperConfig } | { type: "synthesize"; id: number; chunks: SpeechChunk[]; lengthScale: number } | { type: "dispose" };
export type WorkerResponse = { type: "ready" } | { type: "progress"; id: number; done: number; total: number } | { type: "result"; id: number; samples: Float32Array; sampleRate: number } | { type: "error"; id: number | null; message: string };
// file-naming.ts
export function renderFileName(pattern: string, ctx: { note: string; date: string }): string;   // {{note}} {{date}}, illegale Zeichen \/:*?"<>| → "-", trim, leer → "audio"
export function withSuffix(base: string, ext: string, exists: (path: string) => boolean): string; // base.ext, base-2.ext, …
export function joinVaultPath(folder: string, fileName: string): string;   // normalisiert //, kein führender /
```

- [ ] **Step 1: Failing tests** je Modul (Beispiele): `ipaToIds("ɡˈuː", map)` → `[1, id(ɡ),0, id(ˈ),0, id(u),0, id(ː),0, 2]`; unbekannt gemeldet; `renderFileName("{{note}} {{date}}", {note:"A/B:C", date:"2026-08-15"})` → `"A-B-C 2026-08-15"`; `withSuffix` mit `exists`-Fake liefert `-2`; `exportEngineFor` liefert `null` bei `exportEnabled=false` oder Readiness ≠ ready; `formatBytes(63201294)` → `"63,2 MB"`; `parsePiperConfig({})` wirft.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement**; `engine-manifest.generated.ts` erst mit den gemessenen Werten aus dem Spike (bytes) und `sha256: ""` als Platzhalter **nur bis Task 8** (Build-Skript füllt sie). **Step 4:** PASS. **Step 5: Commit** `feat(core): Engine-Manifest/Registry, Piper-Phonem-Mapping, Worker-Protokoll, Dateinamen`.

---

### Task 7: Piper-Worker (Bundle-Entry) + Phonemisierung im Worker

**Files:**
- Create: `src/worker/piper-worker.ts`, `src/worker/ephone.d.ts` (Typen für `ephone` + `ephone/lang/gmw.js`), `tests/core/piper-phonemes.test.ts` (schon Task 6), Node-Smoke `scripts/worker-smoke.mjs`

**Interfaces:**
- Consumes: `WorkerRequest`/`WorkerResponse`, `ipaToIds`, `PiperConfig`, `SpeechChunk`.
- Produces: `dist-assets/piper-worker.js` — ESM-Bundle; empfängt `init` (setzt `ort.env.wasm.wasmBinary`, `numThreads=1`, erzeugt Session, initialisiert ephone mit `gmw` und `setVoice(config.espeak.voice)`), `synthesize` (je Chunk: `textToIpa` → `ipaToIds` → Tensoren `input`/`input_lengths`/`scales` → `output` → Float32; nach jedem Chunk `progress`; am Ende `result` mit allen Chunk-Audios **hintereinander inkl. Stille** (`concatWithSilence` aus core, Samplerate aus config)), `dispose` (Session `release()`, `self.close()`).

- [ ] **Step 1: Worker schreiben**

```ts
/// <reference lib="webworker" />
// Piper-TTS im Worker: ORT (CPU-WASM) + eSpeak-NG-Phonemisierung (ephone, GPL-3). Wird als Release-Asset
// ausgeliefert, nie in main.js gebündelt. Läuft aus einer Blob-URL; alle Binärdaten kommen per Nachricht.
import * as ort from "onnxruntime-web/wasm";
import createEphone, { gmw } from "ephone";
import { concatWithSilence } from "../core/audio";
import { ipaToIds } from "../core/piper-phonemes";
import type { WorkerRequest, WorkerResponse } from "../core/worker-protocol";
declare const self: DedicatedWorkerGlobalScope;
const post = (m: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(m, transfer);
let session: ort.InferenceSession | null = null; let eph: Awaited<ReturnType<typeof createEphone>> | null = null; let config: WorkerRequest extends { config: infer C } ? C : never;
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      ort.env.wasm.wasmBinary = msg.wasm; ort.env.wasm.numThreads = 1; ort.env.logLevel = "warning";
      config = msg.config;
      [session, eph] = await Promise.all([ort.InferenceSession.create(msg.model, { executionProviders: ["wasm"] }), createEphone(gmw)]);
      eph.setVoice(config.espeak.voice); post({ type: "ready" }); return;
    }
    if (msg.type === "synthesize") {
      if (!session || !eph) throw new Error("worker not initialised");
      const parts = []; const sr = config.audio.sample_rate;
      for (let i = 0; i < msg.chunks.length; i++) {
        const { ids } = ipaToIds(eph.textToIpa(msg.chunks[i].text), config.phoneme_id_map);
        const feeds = { input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]), input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
          scales: new ort.Tensor("float32", Float32Array.from([config.inference.noise_scale, config.inference.length_scale * msg.lengthScale, config.inference.noise_w]), [3]) };
        const out = await session.run(feeds); parts.push({ pcm: { samples: out.output.data as Float32Array, sampleRate: sr }, pauseAfterMs: msg.chunks[i].pauseAfterMs });
        post({ type: "progress", id: msg.id, done: i + 1, total: msg.chunks.length });
      }
      const all = concatWithSilence(parts, sr); post({ type: "result", id: msg.id, samples: all.samples, sampleRate: sr }, [all.samples.buffer]); return;
    }
    if (msg.type === "dispose") { await session?.release(); session = null; eph = null; self.close(); }
  } catch (err) { post({ type: "error", id: msg.type === "synthesize" ? msg.id : null, message: err instanceof Error ? err.message : String(err) }); }
};
```
`ephone`s `gmw`-Export lädt intern `./lang/gmw.js` per `import()` — esbuild bündelt dynamische relative Imports mit (Ergebnis prüfen: `grep -c FS_createPath dist-assets/piper-worker.js` > 0). Falls esbuild den dynamischen Import nicht auflöst: `import gmwPack from "ephone/lang/gmw.js"` explizit und `createEphone(gmwPack)`.
`src/worker/ephone.d.ts`: `declare module "ephone" { … }` mit den Typen aus `node_modules/ephone/ephone.d.ts` (kopieren), plus `declare module "ephone/lang/gmw.js" { const p: import("ephone").ephoneLanguagePack; export default p; }`.
`onnxruntime-web/wasm`-Import: prüfen, ob das Package `exports["./wasm"]` hat (1.27: ja → `ort.wasm.bundle`-Variante mit inline Glue). Falls der Bundler die `.mjs`-Glue trotzdem extern lässt, stattdessen `import * as ort from "onnxruntime-web/dist/ort.wasm.bundle.min.mjs"` mit lokaler `.d.ts`.

- [ ] **Step 2: Bauen** `node esbuild.config.mjs --production` — Expected: `dist-assets/piper-worker.js` ≈ 0,9–1,2 MB, **enthält keine `.wasm`-Bytes** (`ls -la`), enthält `FS_createPath` (gmw gebündelt).

- [ ] **Step 3: Node-Smoke** `scripts/worker-smoke.mjs`: startet den Bundle in `node:worker_threads`? — Nein: der Bundle setzt `self.onmessage` voraus. Stattdessen im **GUI-Smoke** (Task 15) prüfen. Hier nur: `node -e "import('./dist-assets/piper-worker.js')"` darf keinen Syntaxfehler werfen (Ausführung scheitert an `self` — akzeptiert, wenn die Fehlermeldung `self is not defined` lautet).

- [ ] **Step 4: Commit** `feat(worker): Piper-Worker-Bundle (ORT CPU-WASM + ephone/gmw), Protokoll init/synthesize/dispose`.

---

### Task 8: Asset-Build-Skript und generiertes Manifest

**Files:**
- Create: `scripts/build-assets.mjs`; Modify: `src/core/engine-manifest.generated.ts` (wird geschrieben), `.gitignore` (`dist-assets/`)

**Interfaces:**
- Produces: `dist-assets/` mit `piper-worker.js`, `ort-wasm-simd-threaded.wasm` (aus `node_modules/onnxruntime-web/dist/`), `de_DE-thorsten-medium.onnx`, `de_DE-thorsten-medium.onnx.json` (Download von `https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/…`, im Cache-Ordner `~/.cache/audio-interface-assets/` gehalten), sowie `src/core/engine-manifest.generated.ts` mit `bytes` + `sha256` je Datei und `ASSET_VERSION` = `manifest.json`.version.

- [ ] **Step 1: Skript**

```js
// Baut die Release-Assets und schreibt das generierte Manifest (Größe + SHA-256 je Datei) — die Prüfsummen
// landen so in main.js, der Loader vergleicht vor dem Instanziieren. Idempotent; Downloads gecacht.
import { createHash } from "node:crypto"; import { mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs"; import { join } from "node:path"; import { homedir } from "node:os"; import { execSync } from "node:child_process";
const VOICE = "de_DE-thorsten-medium"; const HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/";
const cache = join(homedir(), ".cache", "audio-interface-assets"); mkdirSync(cache, { recursive: true }); mkdirSync("dist-assets", { recursive: true });
execSync("node esbuild.config.mjs --production", { stdio: "inherit" });
const files = [
  { key: "worker", fileName: "piper-worker.js", src: "dist-assets/piper-worker.js", license: "AGPL-3.0-or-later (enthält ephone/eSpeak-NG GPL-3.0-or-later, onnxruntime-web MIT)" },
  { key: "wasm", fileName: "ort-wasm-simd-threaded.wasm", src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", license: "MIT (onnxruntime-web)" },
  { key: "model", fileName: `${VOICE}.onnx`, url: HF + `${VOICE}.onnx`, license: "Piper voice thorsten (dataset CC0)" },
  { key: "modelConfig", fileName: `${VOICE}.onnx.json`, url: HF + `${VOICE}.onnx.json`, license: "Piper voice thorsten (dataset CC0)" },
];
for (const f of files) {
  const dst = join("dist-assets", f.fileName);
  if (f.url) { const c = join(cache, f.fileName); if (!existsSync(c)) { const r = await fetch(f.url); if (!r.ok) throw new Error(`${f.url}: ${r.status}`); writeFileSync(c, Buffer.from(await r.arrayBuffer())); } copyFileSync(c, dst); }
  else if (f.src !== dst) copyFileSync(f.src, dst);
  const buf = readFileSync(dst); f.bytes = statSync(dst).size; f.sha256 = createHash("sha256").update(buf).digest("hex");
}
const cfg = JSON.parse(readFileSync(join("dist-assets", `${VOICE}.onnx.json`), "utf8")); const version = JSON.parse(readFileSync("manifest.json", "utf8")).version;
const ts = `// GENERIERT von scripts/build-assets.mjs — nicht von Hand editieren. Größe/SHA-256 der Release-Assets.\nimport type { AssetFile } from "./engine-manifest";\nexport const ASSET_VERSION = ${JSON.stringify(version)};\nexport const PIPER_DE_SAMPLE_RATE = ${cfg.audio.sample_rate};\nexport const PIPER_DE_ASSETS: AssetFile[] = ${JSON.stringify(files.map(({ key, fileName, bytes, sha256, license }) => ({ key, fileName, bytes, sha256, license })), null, 2)};\n`;
writeFileSync("src/core/engine-manifest.generated.ts", ts); console.log("assets:", files.map((f) => `${f.fileName} ${f.bytes}`).join(" · "));
```
- [ ] **Step 2: Run** `npm run assets` — Expected: 4 Dateien in `dist-assets/`, Manifest geschrieben, `npm run typecheck` grün, `check:pure` grün (generated importiert nur Typ).
- [ ] **Step 3: Test** `tests/core/engine-manifest.test.ts`: jede `PIPER_DE_ASSETS`-Zeile hat 64-stellige Hex-`sha256` und `bytes > 0`; `assetUrl("0.1.0", f)` endet auf `/0.1.0/<fileName>`.
- [ ] **Step 4: Commit** `chore(assets): Build-Skript für Release-Assets + generiertes Manifest (SHA-256)`.

---

### Task 9: Asset-Store (Cache API + SHA-256, injizierte Deps)

**Files:**
- Create: `src/obsidian/asset-store.ts`, `tests/obsidian/asset-store.test.ts`
- Vorlage: `local-image-generator` Git-History `git -C ../local-image-generator show 05b3c20^:src/obsidian/model-store.ts` (Herkunftsstempel `// uebernommen (Muster) aus local-image-generator/src/obsidian/model-store.ts (Stand vor 05b3c20), 2026-08-15`)

**Interfaces:**
- Consumes: `EngineDescriptor`, `AssetFile`, `assetUrl`, `ASSET_VERSION`.
- Produces:
```ts
export const ASSET_CACHE_NAME = "audio-interface-engines";
export interface CacheLike { match(url: string): Promise<Response | undefined>; put(url: string, res: Response): Promise<void>; delete(url: string): Promise<boolean> }
export interface StoreDeps { openCache(): Promise<CacheLike>; fetchFn(url: string, init?: { signal?: AbortSignal }): Promise<Response>; digest(buf: ArrayBuffer): Promise<string> /* hex sha256 */; assetVersion: string }
export type AssetStatus = "missing" | "partial" | "complete";
export interface DownloadProgress { fileIndex: number; totalFiles: number; fileName: string; receivedBytes: number; totalBytes: number; overallReceived: number; overallTotal: number }
export class AssetStore {
  constructor(deps: StoreDeps);
  status(engine: EngineDescriptor): Promise<AssetStatus>;
  download(engine: EngineDescriptor, onProgress: (p: DownloadProgress) => void, signal: AbortSignal): Promise<void>;  // nur fehlende Dateien; Abbruch → Teilstände dateiweise behalten; unvollständige Datei gelöscht
  verify(engine: EngineDescriptor): Promise<{ ok: true } | { ok: false; fileName: string; expected: string; actual: string }>;   // hasht alle Dateien
  getBuffer(engine: EngineDescriptor, key: AssetKey): Promise<ArrayBuffer>;
  getText(engine: EngineDescriptor, key: AssetKey): Promise<string>;
  remove(engine: EngineDescriptor): Promise<void>;
}
export function realStoreDeps(assetVersion: string): StoreDeps;   // caches.open, activeWindow.fetch, crypto.subtle
```

- [ ] **Step 1: Failing tests** mit In-Memory-`CacheLike` (Map url→bytes) und Fake-`fetchFn`, das `ReadableStream`s in Stücken liefert; Fake-`digest` = echte sha256 über `node:crypto`. Fälle: (a) `status` missing/partial/complete; (b) `download` lädt nur fehlende, meldet Fortschritt monoton bis `overallReceived === overallTotal`; (c) HTTP 404 → wirft, nichts im Cache; (d) Content-Length ≠ empfangen → Datei gelöscht, wirft; (e) `signal.abort()` mitten im Stream → wirft `AbortError`, fertige Dateien bleiben, angefangene weg; (f) `verify` erkennt manipulierte Bytes und nennt Datei + beide Summen; (g) `remove` leert alle vier.
- [ ] **Step 2: Run** FAIL. **Step 3: Implement** nach Vorlage (tee-Streaming, `putDone.catch(() => {})`), Abbruch über `signal` an `fetchFn` und in der Leseschleife (`if (signal.aborted) { reader.cancel(); await cache.delete(url); throw new DOMException("aborted", "AbortError"); }`).
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(obsidian): AssetStore — Cache-API-Download mit Fortschritt, Abbruch, SHA-256-Prüfung`.

---

### Task 10: Systemstimmen-Engine (`speechSynthesis`)

**Files:**
- Create: `src/obsidian/engines/system-speech.ts`, `tests/obsidian/system-speech.test.ts`

**Interfaces:**
- Produces:
```ts
export interface VoiceInfo { uri: string; name: string; lang: string; local: boolean }
export interface SpeakOptions { voiceUri: string; rate: number }
export interface SynthLike { getVoices(): SpeechSynthesisVoice[]; speak(u: SpeechSynthesisUtterance): void; cancel(): void; pause(): void; resume(): void; addEventListener(t: "voiceschanged", f: () => void): void; removeEventListener(t: "voiceschanged", f: () => void): void }
export interface UtteranceFactory { (text: string): SpeechSynthesisUtterance }
export class SystemSpeechEngine {
  readonly kind = "builtin";
  constructor(synth: SynthLike, makeUtterance: UtteranceFactory, clock: ClockPort);
  waitForVoices(timeoutMs?: number): Promise<VoiceInfo[]>;   // löst sofort auf, wenn getVoices() nicht leer; sonst voiceschanged oder Timeout (2000)
  listVoices(langPrefix?: string): VoiceInfo[];
  defaultVoiceUri(langPrefix: string): string | null;         // erste passende, sonst null
  speak(chunks: SpeechChunk[], opts: SpeakOptions, signal: AbortSignal, onChunk?: (i: number) => void): Promise<void>;  // sequentiell; Pausen als setTimeout(clock) zwischen Utterances; Abbruch → cancel()
  pause(): void; resume(): void;
}
```

- [ ] **Step 1: Failing tests** mit Fake-Synth (sammelt Utterances, feuert `onend` per Test-Trigger) und Fake-Clock: (a) `waitForVoices` wartet auf `voiceschanged`; (b) `speak` reiht Chunks nacheinander (2. Utterance erst nach `onend` der 1.), setzt `voice`/`rate`; (c) `pauseAfterMs` erzeugt Clock-Timer; (d) `abort` ruft `cancel()` und lässt `speak` mit `AbortError` verwerfen; (e) `onerror` einer Utterance → Fehler durchgereicht (außer `interrupted`/`canceled`, die als Abbruch gelten).
- [ ] **Step 2:** FAIL. **Step 3: Implement**; Stimmwahl: `voiceUri` leer → `defaultVoiceUri("de")` → sonst erste Stimme. **Step 4:** PASS. **Step 5: Commit** `feat(engine): Systemstimmen über speechSynthesis — Satz-Queue, Pausen, Abbruch`.

---

### Task 11: Piper-Engine (Worker-Host im Renderer)

**Files:**
- Create: `src/obsidian/engines/piper-engine.ts`, `tests/obsidian/piper-engine.test.ts`

**Interfaces:**
- Consumes: `AssetStore`, `EngineDescriptor`, `WorkerRequest`/`WorkerResponse`, `parsePiperConfig`, `ClockPort`, `EngineReadiness`.
- Produces:
```ts
export interface WorkerLike { postMessage(m: unknown, transfer?: Transferable[]): void; terminate(): void; onmessage: ((e: { data: WorkerResponse }) => void) | null; onerror: ((e: { message: string }) => void) | null }
export interface PiperEngineDeps { store: AssetStore; descriptor: EngineDescriptor; makeWorker(source: string): WorkerLike; clock: ClockPort; idleDisposeMs?: number /* 300000 */ }
export interface RenderOptions { lengthScale: number }   // 1 = normal; aus speakRate: lengthScale = 1 / rate
export class PiperEngine {
  readonly kind = "loadable"; readonly id: string;
  constructor(deps: PiperEngineDeps);
  setEnabled(on: boolean): void;                       // Settings-Toggle; off → readiness "off" + dispose
  readiness(): Promise<EngineReadiness>;               // off | needs-download (status≠complete) | loading (Worker startet) | ready | unavailable (Verify/Init fehlgeschlagen; bis dispose())
  lastError(): string | null;
  synthesize(chunks: SpeechChunk[], opts: RenderOptions, signal: AbortSignal, onProgress: (done: number, total: number) => void): Promise<PcmBuffer>;  // startet Worker lazy: verify → getBuffer/Text → Blob-Worker → init → ready
  dispose(): void;                                     // Worker terminieren, Zustand zurück auf needs-download/ready-lazy
}
```
Worker-Start: `verify` (Mismatch → `unavailable`, `lastError` mit Datei/Summen), `source = getText("worker")`, `makeWorker(source)`; Init-Timeout 60 s über `clock`. `synthesize` mit `signal`: `abort` → `terminate()` + Zustand zurück (Neustart beim nächsten Aufruf). Idle-Timer (`clock.setTimeout`) nach letztem Lauf → `dispose()`.

- [ ] **Step 1: Failing tests** mit Fake-Store (in-memory, `verify` steuerbar) und Fake-Worker (protokolliert Nachrichten, antwortet skriptgesteuert): (a) `readiness` je Zustand; (b) erster `synthesize` schickt `init` mit den drei Puffern + Config und wartet auf `ready`, dann `synthesize`; (c) `progress` durchgereicht, `result` → `PcmBuffer`; (d) `error` vom Worker → verwirft, Zustand `unavailable`, `lastError` gesetzt; (e) `abort` → `terminate()`; (f) `verify`-Mismatch → kein Worker gestartet; (g) Idle-Timer → `terminate()`; (h) `setEnabled(false)` → `dispose()` + `off`.
- [ ] **Step 2:** FAIL. **Step 3: Implement**; `realMakeWorker = (src) => new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })), { type: "module" })` in `main.ts` (Blob-URL nach Start `revokeObjectURL`).
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat(engine): PiperEngine — Blob-Worker-Host mit Verify, Init-Timeout, Abbruch, Idle-Dispose`.

---

### Task 12: Sprecher (Vorlesen) und Exporter (Ablauf + Vault-Schreiben)

**Files:**
- Create: `src/obsidian/speaker.ts`, `src/obsidian/exporter.ts`, `tests/obsidian/speaker.test.ts`, `tests/obsidian/exporter.test.ts`

**Interfaces:**
- Consumes: `prepareSpeech`, `SystemSpeechEngine`, `PiperEngine`, `concatWithSilence`/`resample`/`encodeWav`/`normalizePeak`, `run-state`, `file-naming`, `AudioInterfaceSettings`.
- Produces:
```ts
// speaker.ts — ein aktiver Sprechvorgang pro Plugin
export interface PcmPlayer { play(pcm: PcmBuffer, signal: AbortSignal): Promise<void>; pause(): void; resume(): void }   // AudioContext-Implementierung in main.ts (AudioBufferSourceNode; pause = ctx.suspend)
export type SpeakerState = { kind: "idle" } | { kind: "speaking"; paused: boolean; engine: "builtin" | "loadable"; done: number; total: number } | { kind: "rendering"; done: number; total: number };
export class Speaker {
  constructor(deps: { system: SystemSpeechEngine; loadable: PiperEngine | null; player: PcmPlayer; onState(s: SpeakerState): void });
  speak(markdown: string, settings: AudioInterfaceSettings, useLoadable: boolean): Promise<void>;   // leer → wirft SpeakerError("empty")
  togglePause(): void; stop(): void; isBusy(): boolean;
}
// exporter.ts
export interface VaultPort { exists(path: string): boolean; createBinary(path: string, data: Uint8Array): Promise<void>; folderExists(path: string): boolean; createFolder(path: string): Promise<void> }
export interface ExportInput { markdown: string; noteBasename: string; noteFolder: string; today: string /* YYYY-MM-DD */ }
export interface ExportResult { path: string; seconds: number; sampleRate: number }
export interface ExportDeps { engine: PiperEngine; vault: VaultPort; settings: AudioInterfaceSettings; onState(s: RunState): void }
export async function runExport(input: ExportInput, deps: ExportDeps, signal: AbortSignal): Promise<ExportResult>;
// Ablauf: begin("preparing") → prepareSpeech (leer → fail("empty")) → progress("synthesizing") via engine → "encoding": Profil phone-8k → resample(8000), normalizePeak → encodeWav → "writing": Zielordner (settings.exportFolder || noteFolder) anlegen falls nötig, Dateiname renderFileName+withSuffix → createBinary → finish. Abbruch vor "writing" → aborted (Datei nie halb).
```

- [ ] **Step 1: Failing tests** — Speaker: (a) leerer Text wirft; (b) builtin-Pfad ruft `system.speak` mit Chunks aus `prepareSpeech`; (c) loadable-Pfad: `rendering`-Zustände, dann `player.play`; (d) `stop` bricht Signal ab; Exporter (Fake-Engine liefert 1 s Sinus @ 22050, Fake-Vault): (a) Zustandsfolge `preparing→synthesizing→encoding→writing→done`; (b) phone-8k → WAV-Header 8000 Hz; native → 22050; (c) Kollision → `-2`; (d) Zielordner wird angelegt; (e) leerer Text → `failed` mit `"empty"`; (f) Abbruch während synthesizing → `aborted`, kein `createBinary`; (g) Fehler nach Abbruch überschreibt `aborted` nicht.
- [ ] **Step 2:** FAIL. **Step 3: Implement.** **Step 4:** PASS. **Step 5: Commit** `feat(obsidian): Speaker (Vorlesen builtin/loadable) und Exporter (Pipeline bis Vault-Datei)`.

---

### Task 13: i18n-Strings und Settings-Tab (deklarativ + Walker, Engine-Zeile als Hatch)

**Files:**
- Modify: `src/i18n/strings.ts` (alle Schlüssel EN/DE); Create: `src/obsidian/settings-tab.ts`, `tests/obsidian/settings-tab.test.ts`

**Interfaces:**
- Consumes: `renderSettingDefinitions`, `settingBodyHost`, `refreshSettingsTab` (Kit), `FolderSuggest`, `confirmAction`, `AssetStore`, `PiperEngine`, `SystemSpeechEngine`, `formatBytes`, `totalBytes`, `assetUrl`.
- Produces: `class AudioInterfaceSettingTab extends PluginSettingTab` mit `getSettingDefinitions()`, `getControlValue`, `setControlValue`, `display()` (Walker-Fallback), `refresh()`; Host-Interface, das `main.ts` erfüllt:
```ts
export interface SettingsHost { settings: AudioInterfaceSettings; saveSettings(): Promise<void>; system: SystemSpeechEngine; piper: PiperEngine; store: AssetStore; startDownload(): Promise<void>; abortDownload(): void; removeAssets(): Promise<void>; downloadState(): RunState; onSettingsChanged(key: keyof AudioInterfaceSettings): void }
```
Zeilen (Reihenfolge = Spec § 3): Gruppe **Vorlesen**: `speakVoiceUri` (dropdown aus `system.listVoices("de")` + alle anderen darunter, `""` = „Automatisch (erste deutsche)"), `speakRate` (slider 0.5–2 step 0.1), `speakWithLoadable` (toggle, **nur wenn** `piper.readiness()==="ready"` — Readiness wird beim `display()`/`refresh()` asynchron gelesen und in einem Feld gehalten). Gruppe **Vertonen & Export**: `exportEnabled` (toggle) → wenn true: Engine-Zeile als `render`-Hatch (Name der Stimme, `formatBytes(totalBytes)`, Quelle `RELEASE_BASE_URL`, Lizenz; Knopf „Herunterladen (63,2 MB)" bzw. Fortschritt + „Abbrechen" bzw. „Bereit (Version)" + „Entfernen" (mit `confirmAction`) bzw. Fehlertext + „Erneut versuchen"), `exportProfile` (dropdown), `exportFolder` (text + FolderSuggest via Hatch), `exportFilePattern` (text), `exportInsertLink` (toggle). Gruppe **Dienst**: eine Zeile ohne Control (`desc` = Hinweistext).
Beim Einschalten von `exportEnabled` **kein** Download; beim Ausschalten `piper.setEnabled(false)`.

- [ ] **Step 1: Failing tests** (Kit-Mock): (a) `exportEnabled=false` → keine Engine-Zeile, keine Export-Felder; (b) `=true` und Status `missing` → Zeile mit „Herunterladen" und Größe; (c) `complete` → „Entfernen"; (d) `speakWithLoadable`-Zeile nur bei ready; (e) `setControlValue("speakRate", 5)` klemmt über `normalizeSettings`; (f) `display()` rendert alle Zeilen über den Walker (Zeilenzahl je Zustand).
- [ ] **Step 2:** FAIL. **Step 3: Implement** (Muster `../3d-codeblocks/src/obsidian/settings.ts` + Hatch-Muster `../paperless-storage/src/obsidian/settings-tab.ts`). **Step 4:** PASS. **Step 5: Commit** `feat(settings): deklarativer Tab mit Opt-in-Download-Zeile, Walker-Fallback, i18n de/en`.

---

### Task 14: main.ts — Wiring, Kommandos, Statusleiste, Unload

**Files:**
- Modify: `src/main.ts`; Create: `src/obsidian/status-bar.ts`, `tests/obsidian/main.test.ts`, `tests/obsidian/status-bar.test.ts`; Modify: `styles.css` (Statusleisten-Klassen `.audio-interface-status`, Settings-Zeile `.audio-interface-engine-row`, nur Theme-Variablen)

**Interfaces:**
- Produces: Kommandos `speak-note`, `speak-selection`, `speak-toggle-pause`, `speak-stop`, `export-note-wav`, `export-selection-wav` (Export mit `checkCallback`: nur wenn `exportEngineFor(settings, readiness)` ≠ null und ein Markdown-View aktiv); Ribbon-Icon „audio-lines" (Notiz vorlesen); Statusleisten-Item mit Text je `SpeakerState`/`RunState` und Klick = Stopp/Abbruch; `SettingsHost`-Implementierung; `PcmPlayer` über `AudioContext`; `AssetStore` mit `realStoreDeps(ASSET_VERSION)`; `PiperEngine` mit `realMakeWorker`; `onunload`: `speaker.stop()`, `piper.dispose()`, `audioContext.close()`.
Auswahl: `editor.getSelection()`, leer → `Notice t("notice.noSelection")`. Notiz-Text: `app.vault.cachedRead(file)`. Ergebnis-Notice `t("notice.exported", path)`; Link einfügen: `editor.replaceSelection` bzw. ans Ende `vault.process`. `VaultPort` über `app.vault.getAbstractFileByPath` / `createBinary` / `createFolder`.

- [ ] **Step 1: Failing tests** (Kit-Mock, `createObsidianMock`): (a) sechs Kommandos registriert; (b) `export-note-wav` `checkCallback` false ohne ready-Engine, true mit; (c) `onunload` ruft `dispose`/`stop`; (d) Statusleiste zeigt „Rendern 2/5" bei `running synthesizing`; Klick ruft `abort`.
- [ ] **Step 2:** FAIL. **Step 3: Implement.** **Step 4:** PASS + `npm run gate` grün. **Step 5: Commit** `feat: Plugin-Wiring — Kommandos, Statusleiste, Ribbon, Unload`.

---

### Task 15: README (Offenlegung), CHANGELOG, GUI-Smoke, Release-Infra

**Files:**
- Create: `README.md`, `README.de.md`, `docs/SMOKE.md`, `scripts/gui-smoke.ts` (CDP-Brücke aus `../3d-codeblocks/scripts/gui-smoke.ts` unverändert, Prüfpunkte neu), `.github/workflows/release.yml` (byte-identisch aus `../tools/release-template/`); Modify: `CHANGELOG.md` (`[Unreleased]` → Release-1-Punkte)

- [ ] **Step 1: README** (EN, DE gespiegelt) mit Abschnitten: What it does · Read aloud (no setup) · WAV export (opt-in download: **exactly what is downloaded, from where — `github.com/johannes-kaindl/audio-interface/releases` — sizes, licenses, stored in the browser cache outside your vault, never synced, removable in settings**) · Phone-system profile (8 kHz) · Privacy (no telemetry, no other network) · Licenses (AGPL-3.0; ephone/eSpeak-NG GPL-3; onnxruntime MIT; voice CC0) · Roadmap (dictation, local service). Das ist die **Pflicht-Offenlegung** der Store-Policy.
- [ ] **Step 2: GUI-Smoke-Prüfpunkte** (gegen laufendes Obsidian mit `--remote-debugging-port=9222`, Plugin per `npm run deploy` in ein Test-Vault; Assets für den Smoke von einem lokalen Server: Env `AUDIO_INTERFACE_ASSET_BASE=http://127.0.0.1:8765` überschreibt `RELEASE_BASE_URL` — nur wenn gesetzt, im Code als `plugin.assetBaseUrl` mit Default): (1) Plugin geladen, 6 Kommandos; (2) Systemstimmen ≥ 1 deutsche; (3) `speak-note` startet und `speak-stop` beendet (Statusleiste); (4) Export-Kommando **nicht** in der Palette vor Download; (5) Settings-Tab: Toggle Export → Zeile mit „Herunterladen"; (6) Download über den Knopf → Zustand „Bereit"; (7) `export-note-wav` erzeugt Datei, RIFF-Header 8000 Hz, Länge > 1 s; (8) Entfernen → Zustand „Herunterladen". Ergebnis in `docs/SMOKE.md` mit Datum/Version festhalten. **Gegenprobe:** eine Prüfsumme im generierten Manifest verfälschen, deployen → Punkt 6/7 muss rot werden („Prüfsumme falsch").
- [ ] **Step 3: Release-Infra** per Skill `plugin-release-setup` (release.yml vendoren, `versions.json`, Remotes Forgejo `origin` + `github`). **Zusatz für dieses Repo:** `release.mjs` lädt nur das Trio hoch — die vier Asset-Dateien müssen als **weitere Release-Assets** an denselben Tag: Klärung mit dem zentralen Tooling (`../tools/release/`), Option: `gh release upload <tag> dist-assets/*` als dokumentierter Nachlauf in `README`-Maintainer-Abschnitt/`AGENTS.md`, bis das Tooling einen `extraAssets`-Hook hat. Remote-Anlage/Auth bleibt bei Johannes.
- [ ] **Step 4: AGENTS.md** des Repos: Messwerte (Spike), Bauart-Regeln (kein Inline-WASM, Assets = Release, `numThreads=1`), Smoke-Handgriff, Asset-Nachlauf beim Release.
- [ ] **Step 5: Commit** `docs: README mit Netzwerk-Offenlegung, SMOKE, AGENTS; chore: release.yml`.

---

## Self-Review (ausgeführt beim Schreiben)

- **Spec-Abdeckung:** § 1 Umfang → T10/T12/T14; § 2 Interfaces → T6/T10/T11; § 2.5 Zustand → T5; § 3 Settings → T2/T13; § 4 Pipeline → T3/T4/T12; § 5 Loader/Worker → T7/T8/T9/T11; § 6 Fehlerfälle → T9 (Download), T10 (Stimmen), T11 (Verify/Init/Timeout), T12 (Kollision/leer/Abbruch), T14 (Unload); § 7 Tests → je Task + T15 Smoke/Gate; § 8 Repo/Kit → T1/T15; § 9 Spikes → erledigt (`docs/spikes`), Rest in T15-Smoke.
- **Typen konsistent:** `SpeechChunk`/`PcmBuffer` aus core; `EngineReadiness` aus `engines.ts`; `RunState` aus `run-state.ts`; `AssetStore`-Deps injiziert; `PiperEngine.synthesize` liefert `PcmBuffer` mit `sampleRate` aus Config.
- **Offen bewusst:** Release-Asset-Upload im zentralen Tooling (T15 Schritt 3) — Entscheidung des Dachs, nicht dieses Repos.
