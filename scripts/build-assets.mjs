#!/usr/bin/env node
// Baut die Release-Assets und schreibt das generierte Manifest (Größe + SHA-256 je Datei).
// Die Prüfsummen landen so in main.js; der Loader vergleicht vor dem Instanziieren (Spec §5).
// Idempotent; Downloads werden unter ~/.cache/audio-interface-assets/ gehalten.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const VOICE = "de_DE-thorsten-medium";
const HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/";
const cache = join(homedir(), ".cache", "audio-interface-assets");
mkdirSync(cache, { recursive: true });
mkdirSync("dist-assets", { recursive: true });

execSync("node esbuild.config.mjs --production", { stdio: "inherit" });

const files = [
  { key: "worker", fileName: "piper-worker.js", src: "dist-assets/piper-worker.js", license: "AGPL-3.0-or-later (enthält ephone/eSpeak-NG GPL-3.0-or-later, onnxruntime-web MIT)" },
  { key: "wasm", fileName: "ort-wasm-simd-threaded.wasm", src: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", license: "MIT (onnxruntime-web)" },
  { key: "model", fileName: `${VOICE}.onnx`, url: `${HF}${VOICE}.onnx`, license: "Piper voice thorsten (dataset CC0)" },
  { key: "modelConfig", fileName: `${VOICE}.onnx.json`, url: `${HF}${VOICE}.onnx.json`, license: "Piper voice thorsten (dataset CC0)" },
];

for (const f of files) {
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

const cfg = JSON.parse(readFileSync(join("dist-assets", `${VOICE}.onnx.json`), "utf8"));
const rows = files.map(({ key, fileName, bytes, sha256, license }) => ({ key, fileName, bytes, sha256, license }));
const ts = [
  "// GENERIERT von scripts/build-assets.mjs — nicht von Hand editieren. Größe/SHA-256 der Release-Assets.",
  "// Bewusst OHNE Version: die kommt zur Laufzeit aus manifest.json — sonst aendert jeder Release-Bump",
  "// diese Datei, und check:manifest waere im Release-Lauf immer rot.",
  'import type { AssetFile } from "./engine-manifest";',
  `export const PIPER_DE_SAMPLE_RATE = ${cfg.audio.sample_rate};`,
  `export const PIPER_DE_ASSETS: AssetFile[] = ${JSON.stringify(rows, null, 2)};`,
  "",
].join("\n");
writeFileSync("src/core/engine-manifest.generated.ts", ts);
console.log("assets:", rows.map((r) => `${r.fileName} ${r.bytes}`).join(" · "));
