# AGENTS — audio-interface

Obsidian-Plugin: Vorlesen (Systemstimmen) + WAV-Export (ladbare Piper-Stimme). Dach: `../AGENTS.md`
(Kit-first, UI-STANDARD, Store-Regeln) gilt. Spec: `docs/superpowers/specs/2026-08-15-audio-interface-release-1-design.md`,
Spikes: `docs/spikes/2026-08-15-piper-im-obsidian-renderer.md` (Piper, gruen) und
`docs/spikes/2026-08-19-qwen3-tts-im-obsidian-renderer.md` (Qwen3-TTS, **rot** — RTF 4,8 statt < 1),
Smoke: `docs/SMOKE.md`.

## Bauart-Regeln (tragend, gemessen)

- **Kein `child_process`, kein `fs`, kein Inline-WASM.** Die Scorecard bestraft `child_process`/`fs`
  mit `medium`, `main.js > 5 MB` mit einer Warnung (local-image-generator 0.4). Deshalb: Laufzeit +
  Modell sind **Release-Assets**, nicht Bundle-Inhalt (`check:bundle` hält `main.js` < 2 MB).
- **Assets nur nach Klick, nur vom eigenen GitHub-Release, SHA-256 vor dem Instanziieren.** Die
  Prüfsummen stehen in `src/core/engine-manifest.generated.ts` (von `npm run assets` geschrieben —
  nie von Hand). Nach jeder Änderung am Worker (`src/worker/`, `src/core/audio.ts`,
  `src/core/piper-phonemes.ts`) **`npm run assets` laufen lassen und das Manifest mitcommitten**,
  sonst lehnt `main.js` den CI-gebauten Worker ab. Zwei Wächter: `npm run check:manifest` im Gate
  (baut die Assets neu, verlangt `git diff --exit-code` auf die Manifest-Datei) und derselbe Diff in
  `release-assets.yml`. **Gemessen 2026-08-16:** ein `git checkout` der generierten Datei nach einer
  Gegenprobe holte den *committeten* — veralteten — Hash zurück; erst der Gate-Schritt fing das.
  Generierte Dateien nie per `checkout` „zurücksetzen", sondern neu generieren.
- **`src/core/` ist pur** (kein `obsidian`, kein DOM — `check:pure`). Engines/Store/Exporter in
  `src/obsidian/` mit injizierten Deps (Store, Worker-Fabrik, Clock, Vault-Port).
- **Mehrstimmig seit 0.3.0 — geteilte Laufzeit, Stimme je Modell.** `build-assets.mjs` kennt die
  Stimmenliste (Bezug, Lizenz) und schreibt `PIPER_SHARED_ASSETS` (Worker + ORT-WASM) plus
  `PIPER_VOICES` (Modell + Config je Stimme); die redaktionelle Seite (Label, Werks-Tempo,
  Lizenz-Kurzform) steht in `engine-manifest.ts`. Eine neue Stimme heißt: Zeile in beiden Listen,
  `npm run assets`, Manifest committen. Der Cache-Schlüssel ist dateibasiert — die zweite Stimme
  lädt deshalb nur ihr Modell, und `AssetStore.remove` lässt die geteilten Dateien liegen, solange
  eine andere Stimme sie braucht. Im Speicher ist immer nur die **gewählte** Engine eingeschaltet.
- **Sprachpakete im Worker:** ephone bekommt genau ein Pack — `gmw` (de/nl) oder `en-all` (alle
  englischen Varianten), gewählt über `langPackFor(config.espeak.voice)`. Nicht `en-us` nehmen:
  Piper setzt für en_US-Stimmen mal `en-us`, mal `en` (ljspeech, kristin), und `en-us` kennt nur
  `en-US`. Beide Packs sind im Worker-Bundle (2,8 MB statt 2,2 MB), geladen wird eines.
  **Eine Stimme wird nach Gehör gewählt, nicht nach Lizenztabelle:** `npm run voice:sample` rendert
  denselben Text mit beliebigen Kandidaten durch dieselbe Kette (ephone → Ids → ORT → WAV) und
  beweist nebenbei, dass Sprachpaket und `espeak.voice` zusammenpassen.
- **Settings:** `getSettingDefinitions()` ist die einzige Wahrheit; bedingte Zeilen weglassen, nicht
  `visible:false`. Obsidian 1.13 cacht die Definitionen beim `addSettingTab` und ruft beim Öffnen
  nur `hide()` → `refresh()` dort und nach jeder Zustandsänderung (`update()`).
- **Downloads über `requestUrl`, nie `fetch`:** der Renderer (`app://obsidian.md`) scheitert per CORS
  am `github.com`-Redirect der Release-Assets (gemessen 2026-08-16, „Failed to fetch"); der lokale
  Smoke-Server mit `Access-Control-Allow-Origin: *` verdeckt das. Preis: kein Byte-Streaming
  (Fortschritt je Datei, Abbruch zwischen Dateien), deshalb Zeitlimit je Datei. Nach jedem Release den
  Smoke einmal gegen das echte Release fahren.
- **Worker:** `numThreads = 1` (kein crossOriginIsolated), `wasmBinary` aus dem Cache, Backend
  `wasm`; `globalThis.process` im Worker-Bundle wegdefiniert (Electron-Worker hat `process`,
  ephone hielte sich sonst für Node). ephone/eSpeak-NG ist GPL-3 → Plugin AGPL-3.0-or-later.
- **WebGPU ist im Renderer kein pauschaler Beschleuniger — je Graph messen.** Gemessen 2026-08-19
  am Qwen3-TTS-Graphen: derselbe ORT-web-Lauf ist auf WebGPU beim conv-lastigen Vocoder **20,8× schneller**,
  bei den beiden Transformern aber **4–5× langsamer** (mit `Invalid ComputePipeline "Concat"`-Meldungen,
  d. h. Rückfall auf CPU je Knoten). Für Piper war CPU-WASM deshalb die richtige Wahl — aber aus
  Bequemlichkeit, nicht aus Messung. Wer eine zweite Engine erwägt, misst **pro Teilgraph**, nicht pro Modell.
  Zweiter Befund aus demselben Lauf: `ort.env.wasm.proxy = true` ist hier **nicht** nutzbar
  (`Failed to resolve module specifier 'worker_threads'`) — derselbe Electron-Grund wie bei ephone.

## Store-Scorecard (gemessen 2026-08-16, Release 0.3.0)

**Health `Excellent` · Review `Passed`** — die Bestnote, mit der gewählten Bauart. Keine `low`/`medium`/`high`-Befunde.
`pass`: Attestierung für `main.js` und `styles.css`, `No suspicious network patterns found`,
keine verwundbaren Abhängigkeiten, keine Obfuskation und **`Build reproduced the release main.js byte-for-byte`**
— der Scanner baut den Tag nach; ein von Hand nachgebessertes `main.js` im Release verlöre das.
`info` (kostet die Note nicht): `Release contains extra unsupported files` (die sechs Engine-Assets),
`Plugin references unrecognized WASM files` (ORT-WASM), `License AGPL-3.0 is a copyleft license`,
`Malware scan not available`. Die vorab erwartete Zeile `Number of network request calls` erschien
**nicht** — der Opt-in-Download über `requestUrl` fällt dem Scanner nicht als Netzverhalten auf.
Nachlesen: `python3 tools/scorecard.py audio-interface`.

## Messwerte (Spike 2026-08-15, M5, Obsidian 1.13.7)

Piper thorsten-medium im Renderer, CPU-WASM einfädig: Session ~0,9 s, **RTF 0,17**; WebGPU
RTF 0,05 (nicht genutzt — Kür). Assets: Worker 2,8 MB (seit 0.3.0, zwei Sprachpakete) ·
ORT-WASM 13,5 MB · Stimme 63,2 MB (de) bzw. 63,5 MB (en). Deutsche Systemstimmen unter macOS: 9.
LJSpeech in derselben Kette (Node-Gegenprobe 2026-08-16): RTF 0,17.

## Kommandos

```bash
npm run gate                     # lint · typecheck (src/tests/scripts) · tests · check:pure · check:bundle
npm run assets                   # dist-assets/ bauen + Manifest schreiben (Downloads gecacht unter ~/.cache/audio-interface-assets)
npm run smoke:gui -- --vault 00_ProtoVault --assets http://127.0.0.1:8765/assets   # docs/SMOKE.md
npm run voice:sample -- en_US-ljspeech-medium probe.wav [--dir …] [--tempo 0.9] [--de]  # Hörprobe in Node
npm run release                  # zentrales Tooling ../tools/release/ — Assets lädt release-assets.yml in CI nach
```

## Release-Ablauf (Besonderheit)

`release.yml` (byte-identisch zur Vorlage) legt das GitHub-Release mit dem Trio an;
**`release-assets.yml`** läuft danach (`workflow_run`), baut die sechs Assets in CI, verlangt
Byte-Gleichheit der Prüfsummen mit dem committeten Manifest und lädt sie an dasselbe Release.
Vor dem Tag also: `npm run assets` gelaufen, Manifest committet, `manifest.json`-Version = Tag
(die Asset-URL enthält die Version).

## Offen (nach Release 1)

Dienst-Engine (`audio-ui serve`), STT, Qwen3-TTS-Web als eigenes Repo (Feasibility-Spike),
Mobile-Öffnung fürs Vorlesen. Kit-Kandidaten aus diesem Repo: Zustandsautomat (3. Exemplar),
Speech-Text-Aufbereitung, WAV/Resampler, Release-Asset-Loader mit Prüfsumme (REGISTRY-Einträge).
