# Spec: audio-interface — Release 1 (Vorlesen + WAV-Export)

**Datum:** 2026-08-15 · **Status:** entschieden (Brainstorming Johannes/Claude, Session audio-interface) ·
**Vorlauf:** `SEED.md` (Belege zu Store-Policy und Scorecard) · TaskNote
`25_Coding/audio-interface/_Tasks/Bauart entscheiden — Stufenmodell, nativ oder Nachladen.md`

## 0. Entscheidungen, die diese Spec voraussetzt

| Frage | Entscheidung | Begründung (Kurzform) |
|---|---|---|
| Publikum | fremde Store-Nutzer von Anfang an | Johannes selbst hat `40_Tools/TTS` + `tui.py`; der Store-Nutzer hat keinen Python/MLX-Stack |
| Überschrift | der **Workflow** (vorlesen, vertonen/exportieren, später diktieren/duplex) | eine Qualitäts-USP (Cloning, Parakeet) sähe kaum jemand; sie bleibt als optionale Stufe |
| Release 1 | Vorlesen (Systemstimmen, sofort) + WAV-Export als **Opt-in** | Mailbox-Ansagen sind der belegte Anlass; Systemstimmen liefern kein PCM |
| Bauart | **B — ein Plugin**, Engine-Adapter je Fähigkeit, drei Engine-Arten als Freigabe-Modi | siehe § 5; inline gebündeltes ORT kostet `main.js > 5 MB` (local-image-generator 0.4), ein Engine-Plugin (C) kostet zwei Repos + API — beides bleibt Fallback ohne Architekturänderung |
| Nicht in Release 1 | Diktat/STT, Dienst-Engine, Cloning, Personas, Duplex, Mobile | YAGNI; Interface sieht Dienst-Engine vor |
| Qwen3-TTS im Browser | eigenes Repo, später ladbare Engine | ONNX-Exporte existieren (romara-labs, xkos, sivasub987), Browser-Port fehlt; erst Feasibility-Spike |
| Lizenz | AGPL-3.0-or-later (wie Nachbar-Plugins) | eSpeak-NG-Phonemisierer ist GPL-3 → kompatibel |

**Was Passed kostet und was nicht** (aus SEED + local-image-generator-Historie): `child_process`/`fs` = `medium`;
`main.js > 5 MB` = Warning; ORTs `eval` = Recommendation; Netzwerk = `info`; `speechSynthesis`, Vault-API,
Cache API = neutral bzw. `[pass]`. Fehlendes `getSettingDefinitions()` = `medium`.

## 1. Umfang Release 1

**Drin**
- Vorlesen von Notiz oder Auswahl über Systemstimmen (`window.speechSynthesis`): Start/Pause/Weiter/Stopp,
  Stimmwahl, Tempo. Ohne Freigabe.
- Vertonen → WAV (Opt-in): Notiz/Auswahl mit einer ladbaren deutschen Stimme (Piper-Klasse) rendern,
  als WAV im Vault ablegen. Profile: **Telefonanlage 8 kHz mono 16 bit** oder Modell-nativ.
- Markdown-Aufbereitung zu Sprechtext (§ 4).
- Settings deklarativ (`getSettingDefinitions()`) über den Kit-Walker.
- `isDesktopOnly: true`.

**Nicht drin:** siehe § 0.

## 2. Architektur

Zwei Schichten: `src/core/` pur (kein `obsidian`, kein DOM, node-testbar), `src/obsidian/` verdrahtet.

### 2.1 Engine-Interfaces (Fähigkeit TTS)

```ts
type EngineKind = "builtin" | "loadable" | "service";
type EngineReadiness = "off" | "needs-download" | "loading" | "ready" | "unavailable";

interface SpeechChunk { text: string; pauseAfterMs: number }
interface PcmBuffer { samples: Float32Array; sampleRate: number }   // mono

interface SpeakEngine {                     // Systemstimmen: sprechen, nicht rendern
  kind: "builtin";
  listVoices(): Voice[];
  speak(chunks: SpeechChunk[], opts: SpeakOptions, signal: AbortSignal): Promise<void>;
  pause(): void; resume(): void;
}
interface RenderEngine {                    // ladbar · Dienst: liefern PCM
  kind: "loadable" | "service";
  readiness(): Promise<EngineReadiness>;
  synthesize(chunks: SpeechChunk[], opts: RenderOptions, signal: AbortSignal,
             onProgress: (done: number, total: number) => void): Promise<PcmBuffer>;
}
```

Eine Render-Engine kann auch vorlesen (PCM → `AudioContext`); die Builtin-Engine kann nicht rendern.
Export wird nur angeboten, wenn eine Render-Engine `ready` ist.

### 2.2 Engine-Registry (`core/engines.ts`, pur)

Beschreibungen (`id`, Art, Sprachen, Anzeigename, Größe, Asset-Quelle, SHA-256, Lizenz, Samplerate) +
Auswahlregel: aus Settings + Bereitschaft folgt, welche Engine „vorlesen" und welche „exportieren"
bedient. Keine I/O.

### 2.3 Drei Engine-Arten = drei Freigabe-Modi

| Art | Release 1 | Freigabe | Laufort |
|---|---|---|---|
| eingebaut | Systemstimmen | keine | Renderer, `speechSynthesis` |
| ladbar | eine deutsche Piper-Stimme | Download bestätigen | Web Worker, ORT (WebGPU, WASM-Fallback) |
| Dienst | — (Interface + Zustand vorhanden) | Adresse eintragen | localhost über `requestUrl` |

### 2.4 Datenfluss Export

Notiz → `prepareSpeech()` → `SpeechChunk[]` → Engine → `PcmBuffer` → `concatWithSilence()` →
`resample()` → `encodeWav()` → `vault.createBinary()`. Alle Glieder außer der Engine sind pur.

### 2.5 Langläufer-Zustand

REGISTRY-Zustandsautomat `idle → running(phase, fortschritt) → done | aborted | failed`
(apple-health / obsidian-transmute; hier drittes Exemplar → Kit-reif). Phasen: `preparing`,
`downloading`, `synthesizing`, `encoding`, `writing`. Regeln: Abbruch wird nie von einem
Folgefehler überschrieben; `writing` ist der Punkt ohne Wiederkehr.

## 3. Settings-Modell

Ein Tab, drei Gruppen, deklarativ (Kit-Walker als Fallback < 1.13). Bedingte Zeilen werden
weggelassen, nicht per `visible` versteckt.

**Vorlesen** (immer): Stimme (Dropdown aus `getVoices()`, nach Sprache gefiltert, Default erste
deutsche) · Tempo (Slider 0,5–2,0) · „Vorlesen mit ladbarer Stimme" (Toggle; nur wenn eine ladbare
Engine `ready`).

**Vertonen & Export** (Opt-in-Ort): „WAV-Export aktivieren" (Toggle; lädt nichts) → darunter
Engine-Zeile mit Größe, Quelle, Lizenz, Knopf „Herunterladen (xx MB)" · Zustandszeile
(nicht geladen / Fortschritt + Abbrechen / bereit (Version, Größe) / Fehler + erneut) · „Entfernen"
(Cache-Eintrag löschen) · Ausgabeprofil (Telefonanlage 8 kHz mono · Modell-nativ) · Zielordner
(`FolderSuggest`, leer = neben der Notiz) · Dateinamen-Muster (`{{note}}`, `{{date}}`) · Link in
Notiz einfügen (Toggle).

**Dienst**: Release 1 nur Hinweistext, keine Felder.

Persistenz: `data.json` über Kit-`mergeSettings`. Engine-Bereitschaft wird nie gespeichert,
sondern beim Öffnen des Tabs aus der Cache API gelesen.

```ts
interface AudioInterfaceSettings {
  speakVoiceUri: string;            // "" = Auto (erste deutsche)
  speakRate: number;                // 0.5–2.0
  speakWithLoadable: boolean;
  exportEnabled: boolean;
  exportEngineId: string;           // Release 1: eine feste Id
  exportProfile: "phone-8k" | "native";
  exportFolder: string;             // "" = neben der Notiz
  exportFilePattern: string;        // "{{note}}"
  exportInsertLink: boolean;
}
```

## 4. Vorlesen und Export-Pipeline

**Kommandos:** Notiz vorlesen · Auswahl vorlesen · Pause/Weiter · Stopp · Notiz als WAV vertonen ·
Auswahl als WAV vertonen. Export-Kommandos per `checkCallback` ausgeblendet, solange keine
Render-Engine `ready` ist. **Statusleiste:** ein Eintrag (▶ / ⏸ / Rendern 40 % / Download
12/38 MB); Klick = Stopp/Abbruch.

**`prepareSpeech(markdown, opts) → SpeechChunk[]`** (`core/speech-text.ts`): Frontmatter weg;
Überschrift = eigener Chunk, lange Pause; Wikilinks/MD-Links → Anzeigetext; Bilder/Embeds/Codeblöcke
weg; Inline-Code bleibt Text; Listen: Marker weg, je Punkt ein Chunk, kurze Pause; Tabellen zeilenweise,
Zellen mit Komma; Callouts: Marker weg, Titel wird Satz; `**`/`*`/`==`/`~~` nackt; Absatz = Chunk;
Sätze innerhalb eines Absatzes trennen (Utterance-Grenzen). Pausen als Konstanten:
Satz 250 ms · Absatz 600 ms · Überschrift 900 ms. Regeln aus `40_Tools/TTS/voicelab/`
(Markdown-Aufbereitung) übernehmen, wo passend — mit Herkunftsvermerk.

**Vorlesen (builtin):** je Chunk (Satz) eine `SpeechSynthesisUtterance`, sequentielle Queue,
`AbortSignal` → `speechSynthesis.cancel()`. Chrome/Electron kappt lange Utterances nach ~15 s —
daher Satzgrenzen. Stimmenliste kann beim ersten Zugriff leer sein (`voiceschanged` abwarten).

**Export:** 1 `prepareSpeech` → 2 Engine chunkweise (Fortschritt = Chunks) → 3
`concatWithSilence` → 4 Profil Telefonanlage: `resample` mit FIR-Tiefpass (pur, eigener Code;
kein `OfflineAudioContext`, weil DOM) → Mono 16 bit → 5 `encodeWav` (RIFF/PCM) →
6 `vault.createBinary`; bei Kollision Suffix `-2`, `-3` … (nie überschreiben) → 7 optional Link an
Cursor bzw. Notizende. `Notice` mit Pfad; Fehlschlag: `Notice` mit Grund.

## 5. Ladbare Engine: Asset-Loader, Cache, Worker

**Grundsatz:** Der Loader ist ein Detail *hinter* dem Engine-Interface. Kippt der Store die
Auslegung, wechselt nur der Bezugsweg (inline = A, Engine-Plugin = C).

**Asset = ein versioniertes Paket unseres eigenen GitHub-Release** (Tag = Plugin-Version), z. B.
`engine-piper-de-<voice>-<ver>.tar` bzw. Einzeldateien: ORT-WASM (+ JS-Glue als Worker-Datei),
Phonemisierer-WASM (eSpeak-NG-Frontend), Modell-ONNX + `config.json`. Die Submit-Doku verbietet
weitere Release-Assets nicht; der Installer holt nur `main.js`/`manifest.json`/`styles.css`.

**Integrität:** `main.js` trägt für jede Asset-Datei die **SHA-256** (Manifest in
`core/engine-manifest.ts`, generiert vom Build). Vor dem Instanziieren wird gehasht
(`crypto.subtle.digest`); Mismatch = `unavailable` + Fehlertext, Cache-Eintrag verworfen.
Damit läuft kein Byte, das nicht zum Release passt.

**Ablage:** Cache API (`caches.open("audio-interface-engines")`), außerhalb des Vaults, nie gesynct.
Muster: `local-image-generator` `ModelStore` (Git-History vor 05b3c20; REGISTRY-Zeile „Große
Modell-Gewichte zur Laufzeit laden"): fetch-Streaming mit `body.tee()`, Fortschritt je Byte,
Datei-Granularität beim Retry, `putDone.catch`. Übernahme mit Herkunftsstempel.

**Netzwerk-Offenlegung (README, Pflicht):** genau eine Quelle (`github.com/<owner>/audio-interface/releases`),
nur nach Klick auf „Herunterladen", was geladen wird, wie groß, Lizenz je Datei.

**Ausführung:** Web Worker (aus einem Blob des geladenen Glue + `ort.env.wasm.wasmBinary` bzw. Pfad
auf den Cache-Blob), Backend WebGPU mit WASM-Fallback (WebGPU läuft im Obsidian-Renderer — belegt
durch local-image-generator 0.4). ORT-Muster: `ort-host.ts` (Git-History) — WASM-Variante muss zum
Glue passen; Feed-Dtypes an `inputMetadata` anpassen; Session freigeben (`release()`) bei Entfernen/
Unload. Der Worker meldet Fortschritt je Chunk; `AbortSignal` → Worker terminieren.

**Piper-Pipeline im Worker:** Text → Phoneme (eSpeak-NG-WASM, `de`) → Phonem-Ids (aus `config.json`)
→ ONNX (`input`, `input_lengths`, `scales`) → Float32 @ 22,05 kHz → zurück an den Renderer.

## 6. Fehlerfälle

| Fall | Verhalten |
|---|---|
| keine deutsche Systemstimme | Fallback erste Stimme; Hinweis in Settings („keine deutsche Stimme installiert") |
| `getVoices()` leer | auf `voiceschanged` warten (max. 2 s), sonst Hinweis |
| Download offline / 404 / abgebrochen | Zustand `failed`/`aborted`, „erneut versuchen"; Teilstände dateiweise behalten |
| Prüfsumme falsch | Datei verwerfen, `unavailable`, Fehlertext mit erwarteter/erhaltener Summe |
| WebGPU fehlt | still WASM-Backend; Hinweis „läuft ohne GPU, langsamer" in der Zustandszeile |
| Worker stirbt / ORT-Init hängt | Timeout 60 s → `failed`, Engine `unavailable` bis Neustart |
| Zieldatei existiert | Suffix, nie überschreiben |
| Notiz leer / nur Frontmatter | `Notice` „nichts zu sprechen", kein Lauf |
| Abbruch während `writing` | verweigert; Lauf endet regulär |
| Plugin-Unload während Lauf | `AbortSignal`, Worker terminieren, `speechSynthesis.cancel()`, Statusleiste räumen |

## 7. Tests

- **vitest + Kit-Obsidian-Mock** (`obsidian-plugin-test-pattern`). Pur getestet: `prepareSpeech`
  (Tabelle Markdown → Chunks, inkl. Frontmatter, Links, Listen, Tabellen, Callouts, Sätze/Pausen),
  `concatWithSilence`, `resample` (Frequenztreue an Sinus, Länge, Aliasing-Dämpfung),
  `encodeWav` (Header-Felder, Bytelänge), Dateinamen-Muster + Kollisions-Suffix, Engine-Registry-
  Auswahlregel, Zustandsautomat (Abbruch-vor-Fehler, Commit-Phase), Manifest-Prüfsummen-Vergleich.
- **Obsidian-Schicht** mit Mock: Kommandos-Sichtbarkeit (`checkCallback`), Settings-Definitionen
  (Zeilen je Zustand), Loader mit injiziertem `fetch`/`caches` (Fortschritt, Retry, Hash-Mismatch).
- **GUI-Smoke** (Skill `gui-smoke-setup`, CDP gegen laufendes Obsidian): Plugin lädt, Kommandos
  vorhanden, Vorlesen startet/stoppt, Settings-Tab rendert alle Zeilen, Export-Kommando erscheint erst
  nach Download, ein Export erzeugt eine WAV mit erwarteter Länge/Samplerate.
- **Gate:** `lint` (obsidianmd-Scanner-Spiegel aus dem release-template) · `typecheck` · `test` ·
  `check:bundle` (main.js < 2 MB — Schutz gegen unabsichtliches Inline-Bundling).

## 8. Repo, Infra, Kit

- Eigenständiges Repo `obsidian-plugins/audio-interface`, Kit per git-Tag-Dependency; Release-Infra
  über Skill `plugin-release-setup` (release-template, zentrale `release.mjs`). **Ergänzung:**
  `release.mjs` muss zusätzlich die Engine-Assets hochladen (oder ein Nachlauf-Skript) — Klärung mit
  dem zentralen Tooling, nicht als lokale Kopie lösen.
- Kit-Übernahmen (mit Herkunftsstempel): Settings-Walker, `mergeSettings`, `FolderSuggest`,
  `confirmAction`, `withTimeout`, `ClockPort`; ModelStore/ORT-Host aus local-image-generator-History
  (Kit-Bewertung, da 2. Exemplar); Zustandsautomat aus apple-health/transmute (3. Exemplar).
- Kein eigenes Kit-Modul in Release 1. REGISTRY-Einträge nach Abschluss: Speech-Text-Aufbereitung,
  WAV-Encoder/Resampler, Release-Asset-Loader mit Prüfsumme.
- `authorUrl` = `https://github.com/johannes-kaindl`. `manifest.json`: `isDesktopOnly: true`,
  `minAppVersion` wie Nachbarn (Kit-Walker erlaubt < 1.13).
- Sprache: Doku/Kommentare/UI-Strings Deutsch + Englisch (Kit-i18n), Bezeichner Englisch.

## 9. Spikes vor der Umsetzung (zeitlich begrenzt, Ergebnis in `docs/spikes/`)

1. **Piper im Obsidian-Renderer:** ORT-web + eSpeak-NG-WASM + `de_DE`-Stimme in einem Worker laden,
   einen Satz rendern; Backend (WebGPU/WASM), Latenz, Speicher, Asset-Größen je Datei messen.
   Kandidaten-Stimmen und ihre Lizenzen listen (thorsten, kerstin, eva_k …).
2. **Asset-Paketierung:** ORT-Glue als Worker-Datei aus dem Cache instanziierbar? (Blob-URL,
   `importScripts` vs. Module-Worker; CSP des Renderers.)
3. **Cache API + `crypto.subtle`** unter `app://obsidian.md` verfügbar (erwartet ja; ModelStore-Präzedenz).
4. **`speechSynthesis` in Electron 39:** deutsche Stimmen sichtbar, `voiceschanged`-Verhalten,
   15-s-Kappung reproduzieren.
5. **Alternative ohne eSpeak-NG** kurz sichten (Modell mit eigenem Text-Encoder, deutschfähig) —
   nur notieren, nicht bauen.

## 10. Offen (bewusst nach Release 1)

- Dienst-Vertrag `audio-ui serve` (gehört `audio-ui`); Client hier in Release 2.
- STT im Renderer (Whisper-Klasse) und Parakeet über Dienst — Spike separat.
- Qwen3-TTS-Web als eigenes Repo (Feasibility-Spike: Talker-Latenz ≥ 12 Schritte/s per WebGPU).
- Mobile-Öffnung für Vorlesen.
