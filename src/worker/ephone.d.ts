// Typen für ephone (eSpeak-NG-WASM-Frontend, GPL-3.0-or-later) — das Paket liefert ephone.d.ts,
// aber keine Typen für die Lang-Packs unter lang/. Deklaration lokal, damit der Worker `gmw` statisch
// binden kann (esbuild bündelt dann genau ein Pack statt der dynamischen Kette).
declare module "ephone/lang/gmw.js" {
  export function loadData(module: unknown): void;
}
