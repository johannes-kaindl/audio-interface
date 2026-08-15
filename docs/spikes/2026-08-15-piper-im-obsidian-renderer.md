# Spike: Piper-TTS im Obsidian-Renderer (Spec § 9, Punkte 1–4)

**Datum:** 2026-08-15 · **Umgebung:** Obsidian 1.13.7, Electron 39.7.0 / Chrome 142, macOS, Apple M5 ·
**Werkzeug:** CDP (`--remote-debugging-port=9222`) + `Runtime.evaluate` im Vault-Fenster; Assets von einem
lokalen HTTP-Server (`127.0.0.1:8765`, CORS `*`). Skripte lagen im Session-Scratchpad (Wegwerf).

## Ergebnis in einem Satz

**Piper läuft im Renderer, einfädig auf CPU-WASM mit RTF 0,17 (thorsten-medium) — WebGPU ist Kür.**
Alle Bausteine (Cache API, `crypto.subtle`, Blob-Modul-Worker, `wasmBinary` aus dem Cache) funktionieren.

## Umgebung (Probe 1)

| Merkmal | Befund |
|---|---|
| WebGPU | vorhanden, Adapter `apple / metal-3` |
| Cache API, `crypto.subtle`, `Worker`, `AudioContext` | vorhanden |
| `SharedArrayBuffer` | definiert, aber `crossOriginIsolated=false` → ORT `numThreads=1` |
| `speechSynthesis` | 180 Stimmen, **9 deutsche (de-DE, local)**: Anna, Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley |
| CSP der Seite | nur `style-src` eingeschränkt; `import("http://127.0.0.1…")`, `fetch` localhost, Blob-Worker gehen |

## Assets (gemessen)

| Datei | Bytes | Anmerkung |
|---|---|---|
| `ort.wasm.bundle.min.mjs` (ORT 1.27.0) | 72 799 | Glue inkl. Loader; erwartet `ort-wasm-simd-threaded.wasm` |
| `ort-wasm-simd-threaded.wasm` | 13 479 978 | CPU, SIMD, threaded-fähig |
| `ort-wasm-simd-threaded.jsep.wasm` | 26 827 543 | WebGPU-Variante — für Release 1 **nicht** nötig |
| `ephone.js` (eSpeak-NG-Frontend, GPL-3) | 395 346 | WASM inline; braucht Lang-Pack |
| `lang/gmw.js` (Germanisch, enthält `de`) | 455 551 | Voices im Pack: `de`, `nl` |
| `de_DE-thorsten-medium.onnx` (+ .json) | 63 201 294 | 22,05 kHz, Dataset CC0 |
| `de_DE-eva_k-x_low.onnx` | 20 628 813 | 16 kHz, ältere Qualität, Lizenz „siehe URL" (M-AILABS) |

Paket Release 1 (Empfehlung): ORT-Glue + CPU-WASM + ephone/gmw + thorsten-medium ≈ **78 MB**.

## Inferenz (Probe 2, Haupt-Thread, ein Satz mit 256 Phonem-Ids)

| Stimme | Backend | Session-Aufbau | Inferenz (warm) | Audio | RTF |
|---|---|---|---|---|---|
| eva_k x_low | wasm | 1 389 ms | 1 121 ms | 7,57 s | 0,148 |
| thorsten-medium | wasm | 936 ms | 1 059 ms | 6,18 s | **0,171** |
| eva_k x_low | webgpu | 1 666 ms | 172 ms (1. Lauf 3 274) | 7,73 s | 0,022 |
| thorsten-medium | webgpu | 1 282 ms | 323 ms (1. Lauf 773) | 6,34 s | 0,051 |

Phonemisierung: `ephone.textToIpa` mit Voice `de` lieferte IPA, das **vollständig** auf
`phoneme_id_map` von thorsten-medium abbildete (0 unbekannte Zeichen). Mapping wie piper-phonemize:
`^` · (id, `_`)* · `$`. Heap nach dem Lauf ~530–560 MB (Modell + Tensoren, ohne Release).

Beispiel-Audio: `thorsten-medium-wasm.wav` (Scratchpad, 22,05 kHz, 6,2 s) — Peak 0,36.

## Paketierung (Probe 3): Worker aus Blob, WASM aus dem Cache

Ablauf: Dateien per `fetch` in `caches.open(...)` → `SHA-256` über `crypto.subtle` (13,5 MB in ~90 ms)
→ ORT-Glue als **Blob-Modul** importiert (`import(blobUrl)` im `type:"module"`-Worker) →
`ort.env.wasm.wasmBinary = ArrayBuffer` (kein Pfad, keine relative Auflösung) → Modell als ArrayBuffer
→ Session → Inferenz → `Float32Array` transferiert zurück. **Funktioniert:** Import 10 ms, Session 797 ms,
Inferenz 369 ms für 2,2 s Audio. Cache-Eintrag danach gelöscht.

Folge für den Build: `ephone` + `gmw` + Pipeline-Code werden per esbuild in **eine** Worker-Datei
gebündelt (Asset ~1 MB); zur Laufzeit wird nichts relativ importiert.

## Entscheidungen aus dem Spike

- **Release 1: CPU-WASM only** (`ort.wasm.bundle.min.mjs` + 13,5-MB-WASM). WebGPU spart Zeit, aber
  RTF 0,17 reicht für Export (60 s Ansage ≈ 10 s) — und die 27-MB-Variante entfällt.
- **Stimme: `de_DE-thorsten-medium`** (CC0-Dataset, 22,05 kHz). eva_k ist kleiner, aber Lizenz unklar
  und 16 kHz.
- `numThreads = 1` (kein crossOriginIsolated).
- Session nach dem Export nicht sofort freigeben (Aufbau ~1 s); Freigabe bei Entfernen/Unload/Idle-Timer.

## Nicht gemessen (in die Umsetzung verschoben)

- ephone **innerhalb** des Workers (Probe 3 nutzte vorgemappte Ids) — erwartet ok
  (`ENVIRONMENT_IS_WORKER` wird erkannt); Prüfpunkt im GUI-Smoke.
- 15-s-Kappung langer `SpeechSynthesisUtterance` — Satz-Chunking ist ohnehin gesetzt; Prüfpunkt im GUI-Smoke.
- Alternative ohne eSpeak-NG (Spec § 9.5) — nicht gesichtet; wegen AGPL/GPL-Kompatibilität nicht dringend.
