#!/usr/bin/env node
// Baut die Release-Assets und schreibt das generierte Manifest (Größe + SHA-256 je Datei).
// Die Prüfsummen landen so in main.js; der Loader vergleicht vor dem Instanziieren (Spec §5).
// Idempotent; Downloads werden unter ~/.cache/audio-interface-assets/<hf-revision>/ gehalten.
//
// Mehrstimmig seit 0.3.0: Worker und ORT-WASM sind GEMEINSAME Assets (eine Kopie im Cache, der
// Schlüssel ist dateibasiert), Modell + Config liegen je Stimme. Die redaktionelle Seite (Label,
// Werks-Tempo, Lizenz-Kurzform) steht in src/core/engine-manifest.ts — hier nur der Bezug.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Revision gepinnt, nicht `main`: rhasspy/piper-voices trainiert Stimmen nach (thorsten am 2026-11-09, Commit cf910fb59f: .onnx 63201294 → 63221984 Bytes,
// .onnx.json 4819 → 5460 Bytes). Mit `main` baute dieselbe Quelle je nach Cache-Alter ein anderes Manifest, und `check:manifest` wurde nur in der frischen CI rot
// (Release 0.8.0, GitHub-Lauf 43612218288). Die Revision ist der letzte Stand VOR dieser Änderung: Größe und SHA-256 aller vier Dateien stimmen mit dem Manifest von
// 0.7.4 überein (gemessen 2026-11-14, Download je Datei). Eine neue Stimmen-Revision ist eine hörbare Entscheidung: Revision heben, `npm run assets`, Manifest committen.
const HF_REVISION = "e7229f7d33a10e145e109b886d661984201ac3c4";
const HF = `https://huggingface.co/rhasspy/piper-voices/resolve/${HF_REVISION}/`;
const VOICES = [
  { voice: "de_DE-thorsten-medium", path: "de/de_DE/thorsten/medium/", license: "Piper voice thorsten (dataset CC0)" },
  { voice: "en_US-ljspeech-medium", path: "en/en_US/ljspeech/medium/", license: "Piper voice ljspeech (dataset public domain)" },
];
// Der Cache-Schlüssel trägt die Revision: eine andere Revision trifft nie die Dateien einer früheren (vorher `<datei>` flach, also eine schwimmende Quelle mit festem Schlüssel).
const cache = join(homedir(), ".cache", "audio-interface-assets", HF_REVISION.slice(0, 12));
mkdirSync(cache, { recursive: true });
mkdirSync("dist-assets", { recursive: true });

execSync("node esbuild.config.mjs --production", { stdio: "inherit" });

const shared = [
  { key: "worker", fileName: "piper-worker.js", src: "dist-assets/piper-worker.js", license: "AGPL-3.0-or-later (enthält ephone/eSpeak-NG GPL-3.0-or-later, onnxruntime-web MIT)" },
  { key: "wasm", fileName: "ort-wasm-simd-threaded.wasm", src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", license: "MIT (onnxruntime-web)" },
];
const perVoice = VOICES.flatMap(({ voice, path, license }) => [
  { key: "model", voice, fileName: `${voice}.onnx`, url: `${HF}${path}${voice}.onnx`, license },
  { key: "modelConfig", voice, fileName: `${voice}.onnx.json`, url: `${HF}${path}${voice}.onnx.json`, license },
]);

for (const f of [...shared, ...perVoice]) {
  const dst = join("dist-assets", f.fileName);
  if (f.url) {
    const cached = join(cache, f.fileName);
    if (!existsSync(cached)) {
      console.log(`lade ${f.url}`);
      const r = await fetch(f.url);
      if (!r.ok) throw new Error(`${f.url}: HTTP ${r.status}`);
      writeFileSync(cached, Buffer.from(await r.arrayBuffer()));
    }
    copyFileSync(cached, dst);
  } else if (f.src !== dst) {
    copyFileSync(f.src, dst);
  }
  const buf = readFileSync(dst);
  f.bytes = statSync(dst).size;
  f.sha256 = createHash("sha256").update(buf).digest("hex");
}

const row = ({ key, fileName, bytes, sha256, license }) => ({ key, fileName, bytes, sha256, license });
const voices = Object.fromEntries(
  VOICES.map(({ voice }) => {
    const cfg = JSON.parse(readFileSync(join("dist-assets", `${voice}.onnx.json`), "utf8"));
    return [voice, { sampleRate: cfg.audio.sample_rate, assets: perVoice.filter((f) => f.voice === voice).map(row) }];
  }),
);
const ts = [
  "// GENERIERT von scripts/build-assets.mjs — nicht von Hand editieren. Größe/SHA-256 der Release-Assets.",
  "// Bewusst OHNE Version: die kommt zur Laufzeit aus manifest.json — sonst aendert jeder Release-Bump",
  "// diese Datei, und check:manifest waere im Release-Lauf immer rot.",
  'import type { AssetFile, VoiceAssets } from "./engine-manifest";',
  "",
  "/** Laufzeit — von allen ladbaren Stimmen geteilt (eine Kopie im Cache). */",
  `export const PIPER_SHARED_ASSETS: AssetFile[] = ${JSON.stringify(shared.map(row), null, 2)};`,
  "",
  "/** Je Stimme: Modell + Config, Abtastrate aus der Config. Schlüssel = Piper-Stimmenname. */",
  `export const PIPER_VOICES: Record<string, VoiceAssets> = ${JSON.stringify(voices, null, 2)};`,
  "",
].join("\n");
writeFileSync("src/core/engine-manifest.generated.ts", ts);
console.log("assets:", [...shared, ...perVoice].map((r) => `${r.fileName} ${r.bytes}`).join(" · "));
