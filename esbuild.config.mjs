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
  // ephone exportiert nur ".", die Lang-Packs liegen aber als Dateien im Paket — Alias statt Subpath.
  alias: { "ephone/lang/gmw.js": "./node_modules/ephone/lang/gmw.js" },
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
