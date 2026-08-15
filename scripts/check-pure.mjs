// uebernommen (Muster) aus 3d-codeblocks/scripts/check-pure.mjs, 2026-08-15 — angepasst:
// `src/core/` muss frei von obsidian-Importen UND DOM-/Browser-Globals bleiben. Das ist die
// Zusicherung, dass Textaufbereitung, Audio-Mathematik, Zustand und Registry ohne Obsidian und
// ohne Renderer node-testbar sind (Spec §2). Bewusst ein Script statt grep-Einzeiler.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src/core";
const FORBIDDEN_IMPORT = /(?:from|import)\s*\(?\s*["'](obsidian|electron|onnxruntime-web|ephone)(\/[^"']*)?["']/;
const FORBIDDEN_GLOBAL = /\b(document|window|navigator|caches|Worker|AudioContext|speechSynthesis|localStorage|activeWindow|activeDocument)\b/;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const offenders = [];
for (const file of walk(ROOT).filter((f) => f.endsWith(".ts"))) {
  const src = readFileSync(file, "utf8");
  // Kommentare ausblenden — die Regel gilt fuer Code, nicht fuer Text ueber den Code.
  const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (FORBIDDEN_IMPORT.test(code)) offenders.push(`${file}: verbotener Import`);
  if (FORBIDDEN_GLOBAL.test(code)) offenders.push(`${file}: DOM-/Browser-Global`);
}

if (offenders.length > 0) {
  console.error("src/core darf weder obsidian importieren noch DOM-Globals anfassen:");
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}
console.log(`check:pure: ${ROOT} ist frei von obsidian/DOM`);
