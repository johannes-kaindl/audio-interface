# Spike: Qwen3-TTS im Obsidian-Renderer (TaskNote „Feasibility-Spike als eigenes Repo")

**Datum:** 2026-08-18/19 · **Umgebung:** Obsidian 1.13.7, Electron 39.7.0 / Chrome 142, macOS,
Apple **M5 Pro**, 69 GB RAM, 18 Kerne · **Werkzeug:** CDP (`--remote-debugging-port=9222`) +
`Runtime.evaluate`; Modelle von einem lokalen HTTP-Server (`127.0.0.1:8765`, CORS `*`, Range).
Skripte lagen im Session-Scratchpad (**Wegwerf**, nach dem Lauf gelöscht). Kein Repo angelegt —
die Frage war eine Messung, kein Bauwerk.

## Ergebnis in einem Satz

**Rot: die Pipeline läuft im Renderer, aber um Faktor ~4,8 zu langsam für Echtzeit — und der
Engpass ist nicht der Talker, sondern der MTP; WebGPU hilft nur dem Vocoder.**

## Die Frage war richtig gestellt, hat aber die falsche Zahl gemessen

Die TaskNote fragte nach **≥ 12 Talker-Schritten/s auf WebGPU**. Beide Hälften gehen daneben:

- Der Talker schafft die 12 — aber auf **CPU-WASM**, nicht auf WebGPU, und nur am Anfang.
- Der Talker ist **nicht der Engpass**. Er stellt ein Viertel der Rechenzeit.

## Messung, je 80-ms-Audioframe (12,5 Hz), ORT-web 1.27.0, `numThreads = 1`

| Stufe | WASM (1 Thread) | WebGPU | bester Weg |
|---|---|---|---|
| Talker `past=100` | **78,1 ms** (12,8 Schritte/s) | 417,5 ms (2,4/s) | WASM |
| Talker `past=300` | 102,2 ms (9,8/s) | – | WASM |
| Talker `past=500` | 123,6 ms (8,1/s) | – | WASM |
| MTP (`code_predictor`, 15 Aufrufe) | **277,3 ms** | 1148,3 ms | WASM |
| Vocoder (64-Frame-Block) | 155,7 ms | **7,5 ms** | **WebGPU** |
| **Summe** (Talker bei `past≈300`) | 535,2 ms | – | **387,0 ms** |
| **RTF** | 6,7 | – | **4,8** |

Ziel für Echtzeit ist 80 ms/Frame. Gemessen: 387 ms in der **besten gemischten** Konfiguration.
Eine 30-s-Ansage kostet damit ~2,4 Minuten Rechenzeit.

## Die drei Gründe, und warum keiner davon Fleiß-behebbar ist

1. **WebGPU beschleunigt nur den Vocoder — die Transformer macht es 4–5× langsamer.**
   Der Vocoder ist conv-lastig (31 `Conv`, 6 `ConvTranspose`) und gewinnt **20,8×**. Talker und
   MTP verlieren; der Renderer meldet dabei `Invalid BindGroupLayout`/`Invalid ComputePipeline
   "Concat"`, d. h. Knoten fallen auf CPU zurück und werden je Knoten hin- und herkopiert.
   Deckt sich mit dem LiteRT-Befund derselben Modellfamilie („Nothing here is faster on the GPU"),
   ist hier aber **eigenständig im Obsidian-Renderer gemessen** — und differenzierter: pauschal
   stimmt der Satz nicht, für den Vocoder ist die GPU der einzig sinnvolle Weg.
2. **Ein Thread statt 18.** `crossOriginIsolated` ist `false` (bei `hardwareConcurrency: 18`), also
   fährt ORT-web einfädig. Das ist eine Header-Eigenschaft von `app://obsidian.md` — **ein Plugin
   kann sie nicht setzen.** Zum Vergleich: dieselbe Pipeline nativ mit 8 Threads auf einem M4 Max
   erreicht RTF 1,44 — also selbst mit allen Kernen bliebe man über Echtzeit.
3. **Der Export ist für Server gebaut, nicht für Geräte.** fp32, 5,91 GB gesamt; `talker_prefill`
   und `talker_decode` tragen **zweimal dieselben** 1774 MB. Der Talker hat 16451 Knoten, davon
   5942 `Constant` und 1436 `Shape`. Und `talker_decode` nimmt den KV-Cache als **einen** Tensor
   `[28,b,8,seq,128]` entgegen *und* gibt ihn so zurück — bei `past=500` sind das 115 MB, die pro
   Schritt durchgereicht werden. Daher die Skalierung 78 → 102 → 124 ms.

## Was gehen würde — und warum es kein Nachmittag ist

`litert-community/Qwen3-TTS-12Hz-0.6B-Base` (2026-08-12) hat die Optimierungen bereits, aber als
**TFLite**: `mtp_folded_int8` faltet die 15 Aufrufe in **einen** Graphen (~3,6× auf M4 Max),
`codec_partA`/`partB` splittet den Vocoder, `talker_int4` bringt 1,8 GB auf 256 MB. Konversions-
skripte sind offen (`john-rocky/hf-to-litertlm`). Der äquivalente **ONNX**-Export existiert nicht
und müsste selbst gebaut werden. Grob hochgerechnet landet man dann bei RTF ≈ 1,5 — besser, aber
weiterhin nicht Echtzeit. Weitere Beobachtung fürs Protokoll: `text_embedding.npy` (1245 MB) ist ein
**reiner Zeilen-Lookup** und im Browser vermeidbar (Range-Request oder Teil-Export).

## Umgebungsbefunde (nebenbei, aber wiederverwendbar)

| Merkmal | Befund |
|---|---|
| WebGPU-Adapter | `apple` / `metal-3`; `shader-f16`, `subgroups`, `timestamp-query` |
| `maxBufferSize` / `maxStorageBufferBindingSize` | je 4,29 GB — **kein** Bufferlimit-Problem |
| GPU-Allokation am Stück | 5,37 GB ohne OOM |
| größter einzelner `ArrayBuffer` | **2046 MB** (die 1774-MB-Gewichte passen knapp) |
| WASM-Heap | bis 4,0 GB (32-bit-Deckel) |
| 1774 MB über `fetch` von localhost | 1,5–8,9 s |
| Session-Aufbau `talker_decode` | 4,1 s |
| ORT im Proxy-Worker | **scheitert**: `Failed to resolve module specifier 'worker_threads'` — derselbe Electron-Befund wie bei ephone (Worker hat `process`); ohne Bundle-Patch blockiert die Inferenz den Hauptthread so lange, dass **CDP selbst nicht mehr antwortet** |

## Empfehlung

- **Als Echtzeit-/Vorlese-Engine: nein.** Nicht am Fleiß, sondern an Renderer-Einfädigkeit und
  Modellstruktur. Der Dienst-Weg (`audio-ui serve`) bleibt der Weg für Qwen3-TTS-Qualität.
- **Als reine Export-Engine ist es keine klare Absage**, sondern eine Preisfrage: WAV-Export
  verträgt RTF > 1 (Piper liegt bei 0,17, hier wären es ~4,8 → 30-s-Ansage in ~2,4 min). Der Preis
  ist ~2,5 GB Download selbst nach Optimierung, ein Eigen-Export der gefalteten Graphen und ein
  blockierender Renderer, solange der Worker-Weg nicht gelöst ist. Gegenwert wäre Voice Cloning.
  **Das ist eine Produktentscheidung, keine technische mehr.**
- **Kein eigenes Repo `qwen3-tts-web` anlegen**, solange diese Entscheidung offen ist.
- **Wenn es später doch weitergeht**, ist der erste Schritt nicht Code, sondern der **ONNX-Export
  der gefalteten MTP-Variante** — dort liegen 72 % der Rechenzeit.

## Nicht gemessen

- `talker_prefill` (Erstlatenz) und `speaker_encoder` (Cloning-Enrollment).
- Qualität/Korrektheit der Ausgabe — es liefen Dummy-Eingaben; gemessen wurde **Zeit**, nicht Klang.
- Der LiteRT-Weg im Browser (LiteRT.js) — eigene Schiene, hier nicht angefasst.
