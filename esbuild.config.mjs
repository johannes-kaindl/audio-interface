// Zwei Bundles (PROF-TS-02): main.js (Plugin; obsidian/electron extern) und
// dist-assets/piper-worker.js (Release-Asset — bewusst NICHT in main.js, Spec §5).
import esbuild from "esbuild";

const prod = process.argv.includes("--production");
const common = {
  bundle: true,
  target: "es2022",
  sourcemap: prod ? false : "inline",
  minify: prod,
  treeShaking: true,
};

const plugin = await esbuild.context({
  ...common,
  entryPoints: ["src/main.ts"],
  external: ["obsidian", "electron", "node:*"],
  format: "cjs",
  outfile: "main.js",
});

const worker = await esbuild.context({
  ...common,
  entryPoints: ["src/worker/piper-worker.ts"],
  format: "esm",
  platform: "browser",
  // ephone hat einen Node-Zweig (createRequire) — im Worker nie erreicht, aber der Bundler muss den
  // Import auflösen können; node:* bleibt extern.
  external: ["node:*"],
  // Gemessen (Obsidian 1.13.7 / Electron 39): auch ein Web Worker im Renderer hat ein `process`-Objekt
  // (nodeIntegrationInWorker). ephone prueft `globalThis.process?.versions?.node` und haelt sich dann
  // fuer Node → `import("node:module")` scheitert. Zur Build-Zeit wegdefinieren; der Worker ist Browser.
  define: { "globalThis.process": "undefined" },
  // ephone exportiert nur ".", die Lang-Packs liegen aber als Dateien im Paket — Alias statt Subpath.
  alias: {
    "ephone/lang/gmw.js": "./node_modules/ephone/lang/gmw.js",
    "ephone/lang/en-all.js": "./node_modules/ephone/lang/en-all.js",
  },
  outfile: "dist-assets/piper-worker.js",
});

if (prod) {
  await plugin.rebuild();
  await worker.rebuild();
  await plugin.dispose();
  await worker.dispose();
} else {
  await plugin.watch();
  await worker.watch();
  console.log("esbuild: watching…");
}
