// Dateinamen für den Export. Pur.
// Die Vault-Pfad-Rechnung liegt seit 2026-08-27 im Kit (src/vendor/kit/vault-path.ts, obsidian-kit
// 0.27.0) und wird hier nur noch re-exportiert — der Name `joinVaultPath` stammt aus dieser Datei und
// ist mit ihr ins Kit gewandert (Modulkopf dort). `renderFileName`/`withSuffix` bleiben lokal: das
// Kit-Modul normalisiert ausdruecklich NUR den Ordner-Anteil und ist kein Ersatz fuers Saeubern.
import { joinVaultPath } from "../vendor/kit/vault-path";

export { joinVaultPath };

const ILLEGAL = /[\\/:*?"<>|#^[\]]/g;

export function renderFileName(pattern: string, ctx: { note: string; date: string }): string {
  const name = pattern
    .replace(/\{\{\s*note\s*\}\}/g, ctx.note)
    .replace(/\{\{\s*date\s*\}\}/g, ctx.date)
    .replace(ILLEGAL, "-")
    .replace(/\s+/g, " ")
    .trim();
  return name === "" ? "audio" : name;
}

/** `base.ext`, sonst `base-2.ext`, `base-3.ext`, … — nie überschreiben. */
export function withSuffix(base: string, ext: string, exists: (path: string) => boolean): string {
  const first = `${base}.${ext}`;
  if (!exists(first)) return first;
  for (let i = 2; i < 10000; i++) {
    const candidate = `${base}-${i}.${ext}`;
    if (!exists(candidate)) return candidate;
  }
  throw new Error("no free file name");
}
