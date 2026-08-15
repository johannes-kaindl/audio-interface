# AGENTS — audio-interface

Obsidian-Plugin: Vorlesen (Systemstimmen) + WAV-Export (ladbare Piper-Stimme). Dach: `../AGENTS.md`
(Kit-first, UI-STANDARD, Store-Regeln) gilt. Spec: `docs/superpowers/specs/2026-08-15-audio-interface-release-1-design.md`,
Spike: `docs/spikes/2026-08-15-piper-im-obsidian-renderer.md`, Smoke: `docs/SMOKE.md`.

## Bauart-Regeln (tragend, gemessen)

- **Kein `child_process`, kein `fs`, kein Inline-WASM.** Die Scorecard bestraft `child_process`/`fs`
  mit `medium`, `main.js > 5 MB` mit einer Warnung (local-image-generator 0.4). Deshalb: Laufzeit +
  Modell sind **Release-Assets**, nicht Bundle-Inhalt (`check:bundle` hält `main.js` < 2 MB).
- **Assets nur nach Klick, nur vom eigenen GitHub-Release, SHA-256 vor dem Instanziieren.** Die
  Prüfsummen stehen in `src/core/engine-manifest.generated.ts` (von `npm run assets` geschrieben —
  nie von Hand). Nach jeder Änderung am Worker (`src/worker/`, `src/core/audio.ts`,
  `src/core/piper-phonemes.ts`) **`npm run assets` laufen lassen und das Manifest mitcommitten**,
  sonst lehnt `main.js` den CI-gebauten Worker ab (`release-assets.yml` prüft `git diff` auf die
  Manifest-Datei).
- **`src/core/` ist pur** (kein `obsidian`, kein DOM — `check:pure`). Engines/Store/Exporter in
  `src/obsidian/` mit injizierten Deps (Store, Worker-Fabrik, Clock, Vault-Port).
- **Settings:** `getSettingDefinitions()` ist die einzige Wahrheit; bedingte Zeilen weglassen, nicht
  `visible:false`. Obsidian 1.13 cacht die Definitionen beim `addSettingTab` und ruft beim Öffnen
  nur `hide()` → `refresh()` dort und nach jeder Zustandsänderung (`update()`).
- **Worker:** `numThreads = 1` (kein crossOriginIsolated), `wasmBinary` aus dem Cache, Backend
  `wasm`; `globalThis.process` im Worker-Bundle wegdefiniert (Electron-Worker hat `process`,
  ephone hielte sich sonst für Node). ephone/eSpeak-NG ist GPL-3 → Plugin AGPL-3.0-or-later.

## Messwerte (Spike 2026-08-15, M5, Obsidian 1.13.7)

Piper thorsten-medium im Renderer, CPU-WASM einfädig: Session ~0,9 s, **RTF 0,17**; WebGPU
RTF 0,05 (nicht genutzt — Kür). Assets: Worker 2,2 MB · ORT-WASM 13,5 MB · Stimme 63,2 MB.
Deutsche Systemstimmen unter macOS: 9.

## Kommandos

```bash
npm run gate                     # lint · typecheck (src/tests/scripts) · tests · check:pure · check:bundle
npm run assets                   # dist-assets/ bauen + Manifest schreiben (Downloads gecacht unter ~/.cache/audio-interface-assets)
npm run smoke:gui -- --vault 00_ProtoVault --assets http://127.0.0.1:8765/assets   # docs/SMOKE.md
npm run release                  # zentrales Tooling ../tools/release/ — Assets lädt release-assets.yml in CI nach
```

## Release-Ablauf (Besonderheit)

`release.yml` (byte-identisch zur Vorlage) legt das GitHub-Release mit dem Trio an;
**`release-assets.yml`** läuft danach (`workflow_run`), baut die vier Assets in CI, verlangt
Byte-Gleichheit der Prüfsummen mit dem committeten Manifest und lädt sie an dasselbe Release.
Vor dem Tag also: `npm run assets` gelaufen, Manifest committet, `manifest.json`-Version = Tag
(die Asset-URL enthält die Version).

## Offen (nach Release 1)

Dienst-Engine (`audio-ui serve`), STT, Qwen3-TTS-Web als eigenes Repo (Feasibility-Spike),
Mobile-Öffnung fürs Vorlesen. Kit-Kandidaten aus diesem Repo: Zustandsautomat (3. Exemplar),
Speech-Text-Aufbereitung, WAV/Resampler, Release-Asset-Loader mit Prüfsumme (REGISTRY-Einträge).
