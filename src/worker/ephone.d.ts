// Typen für ephone (eSpeak-NG-WASM-Frontend, GPL-3.0-or-later) — das Paket liefert ephone.d.ts,
// aber keine Typen für die Lang-Packs unter lang/. Deklaration lokal, damit der Worker die
// gebrauchten Packs statisch binden kann (esbuild bündelt dann genau diese statt der dynamischen
// Kette): `gmw` trägt de/nl, `en-all` alle englischen Varianten.
declare module "ephone/lang/gmw.js" {
  export function loadData(module: unknown): void;
}

declare module "ephone/lang/en-all.js" {
  export function loadData(module: unknown): void;
}
