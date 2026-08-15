// main.js muss klein bleiben: WASM, Modelle und der Worker sind Release-Assets, kein Bundle-Inhalt
// (Spec §5; local-image-generator 0.4 bekam fuer >5 MB die Store-Warnung). Grenze bewusst eng.
import { statSync } from "node:fs";
const max = 2 * 1024 * 1024;
const size = statSync("main.js").size;
if (size > max) {
  console.error(`check:bundle: main.js ist ${size} Bytes (> ${max}) — Assets gehoeren ins Release, nicht ins Bundle`);
  process.exit(1);
}
console.log(`check:bundle: main.js ${size} Bytes`);
