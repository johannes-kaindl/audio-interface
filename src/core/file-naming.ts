// Dateinamen und Vault-Pfade für den Export. Pur.

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

export function joinVaultPath(folder: string, fileName: string): string {
  const f = folder.replace(/^\/+|\/+$/g, "");
  return f === "" ? fileName : `${f}/${fileName}`;
}
