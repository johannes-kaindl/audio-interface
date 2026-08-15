# SEED — audio-interface (Obsidian-Plugin für Sprachein- und -ausgabe)

> **Stand überholt (2026-08-15, gleiche Tag-Session):** Die offene Frage unten ist entschieden und
> Release 1 gebaut — verbindlich sind jetzt `docs/superpowers/specs/2026-08-15-audio-interface-release-1-design.md`
> (Entscheidungen § 0), `docs/spikes/2026-08-15-piper-im-obsidian-renderer.md` (Messwerte) und
> `AGENTS.md`. Zwei Korrekturen an den Belegen unten: (1) WASM im Renderer kostet **nicht** die
> Note — `local-voiceover` verliert Passed über Lizenz/`getSettingDefinitions`, nicht über WASM;
> inline gebündelt kostet erst `main.js > 5 MB`. (2) Die Submit-Doku verbietet **keine weiteren
> Release-Assets**; der Installer holt nur die drei Dateien. Der Text bleibt als Herkunft stehen.

**Stand 2026-08-15.** Erarbeitet in einer Brainstorming-Session im Repo
`../../audio-ui` (Code-Workspace) (Python/MLX-Kern). Dieses Dokument ist der Übergabepunkt:
Es hält fest, was **belegt** ist, was **entschieden** ist und was **offen** bleibt — damit
die nächste Session nicht neu recherchiert, sondern weiterentscheidet.

Kein Code, keine Struktur außer diesem Dokument und `tools/scorecard.py`. Das Repo ist initialisiert,
aber ohne Remote — der Zuschnitt ist selbst noch offen (siehe § Die offene Frage).

---

## Worum es geht

Mit eigenen Programmen sprechen, statt zu tippen — und sich vorlesen lassen. Der Stack dafür
existiert bereits lokal und ist vermessen:

| Ort | Was dort liegt |
|---|---|
| `../../audio-ui` (Code-Workspace) | STT-Kern: `capture` · `endpointing` · `stt`. Parakeet TDT 0.6b v3, deutschfähig, WER 3,8 %, RTF 0,02. Endpointing mit `silero-vad`, 800 ms Nachlaufstille, Segment 0,61 s nach Sprechende. |
| `$SHARED/40_Tools/TTS` | TTS-Labor: Qwen3-TTS auf Apple Silicon. `voicelab/` mit Stimmen-Registry, Personas, Voice Cloning, Markdown-Aufbereitung, PCM-Export. |

**Der konkrete erste Anlass** ist kein Chatbot, sondern ein Alltagsfall: Telefon-Mailbox-Ansagen
als Text schreiben, vertonen und als 8-kHz-WAV fürs 3CX-System exportieren. Die Notiz dazu:
`80_Arbeit/00_Inbox/Telefon Mailbox Ansagen.md` — vier Ansagen, WAVs bereits von Hand erzeugt.

---

## Was in dieser Session belegt wurde

Alles hier ist **gemessen oder im Wortlaut nachgelesen**, nicht vermutet.

### 1. Die Store-Policy verbietet das Selbst-Installieren — sonst wenig

Aus `obsidianmd/obsidian-developer-docs`, Wortlaut:

- Verboten: *„Install or update themselves **or their dependencies**."* → Ein Plugin darf den
  Python-Stack nicht einrichten. Es darf ihn nur **vorfinden**.
- Erlaubt, aber offenlegungspflichtig im README: Netzwerknutzung (mit Nennung der Dienste und
  Begründung), Zugriff auf Dateien außerhalb des Vaults.
- Node-/Electron-APIs sind erlaubt, verlangen aber `isDesktopOnly: true`.
- Pflicht: `LICENSE`, `README.md`, `manifest.json`; Release enthält **nur** `main.js`,
  `manifest.json`, `styles.css`.

### 2. Es gibt öffentliche Scorecards — und eine Rangfolge

Jede Plugin-Seite auf `community.obsidian.md/plugins/<id>` trägt zwei Noten (**Health**,
**Review**) samt Volltext aller Befunde. `tools/scorecard.py` liest sie aus (kanonisch im Skill `obsidian-store-recherche`, diese Kopie
ist die Vendoring-Fassung des Repos):

```bash
python3 tools/scorecard.py vault-retrieval note-reader-cosyvoice
```

Empirisch belegte Review-Skala (aufsteigend):

    Risks  →  Caution  →  Satisfactory  →  Passed

Belege: `dataview` = Risks · `templater-obsidian`, `ollama`, `local-gpt` = Caution ·
`note-reader-cosyvoice`, `offline-whisper`, `local-dictation`, `local-voiceover`, `vault-crews`,
`obsidian-tts`, `apple-tts`, `say` = Satisfactory · **`vault-retrieval`, `transmute` = Passed**.

**Die Regel dahinter:** `info`-Befunde kosten die Bestnote **nicht** (`vault-retrieval` hat
mehrere und steht auf Passed). Schon **ein** `medium` drückt auf Satisfactory.

### 3. Damit ist die Bauart eine Rechnung, kein Geschmack

| Was das Plugin tut | Was die Scorecard daraus macht |
|---|---|
| `child_process` (Prozess starten, CLI rufen) | **`[medium] Shell Execution`** — kostet immer die Bestnote |
| Node-`fs` außerhalb des Vaults | **`[medium] Direct Filesystem Access`** |
| `fetch`/WebSocket auf `127.0.0.1` | **nichts** — `vault-crews` spricht LM Studio an und bekommt `[pass] No suspicious network patterns found`; bei `vault-retrieval` nur `[info] Number of network request calls`, Note trotzdem Passed |
| `vault.read` / `vault.create` | **`[pass]`-Zeilen** — die Vault-API wird belohnt |
| `window.speechSynthesis` | nichts — `apple-tts` und `obsidian-tts` tragen keine Bauart-Warnung |

Folge, die nicht intuitiv ist: **Ein laufender Dienst auf localhost ist scorecard-sauberer als
ein Prozess, den das Plugin selbst startet.** Wer `say` aufruft (`1yx/obsidian-plugin-say`),
zahlt dafür; wer über HTTP mit einem fremden Prozess spricht, nicht.

### 4. Wie andere es lösen (vier echte Muster)

| Plugin | Bauart | Note |
|---|---|---|
| `note-reader-cosyvoice` | installiert **nichts**; Nutzer richtet CosyVoice selbst ein, Plugin ruft ein Wrapper-Script: Text via `-InputPath`, WAV via `-OutputPath`, `-Speed`, Exitcode ≠ 0 = Fehler | Satisfactory (`fs` + `child_process`) |
| `offline-whisper` | lädt `whisper.cpp`-Binary + Modelle beim ersten Gebrauch, WASM auf Mobile | Satisfactory |
| `local-dictation` / *Speech Kit* | Setup-Wizard installiert „native engine" + Modellkatalog; streamendes Diktat, Read-aloud, Übersetzung | Satisfactory |
| `local-voiceover` | reines TypeScript, ONNX Runtime Web, WebGPU mit WASM-Fallback | Satisfactory |

`local-voiceover` ist zugleich der Beleg gegen den nativen Weg: **9,36 M Parameter, Englisch,
eine feste Stimme.** Das ist der Preis dafür, ohne fremde Laufzeit auszukommen.

### 5. Der Swift/ObjC++-Brückenweg ist auf Obsidian verstellt

Geprüft nach dem Hinweis auf `electronjs.org/docs/latest/tutorial/native-code-and-electron-swift-macos`:

1. **Berechtigung fehlt in der Host-App.** Obsidian 1.12.4 führt in `Info.plist`
   `NSMicrophoneUsageDescription` und `NSAudioCaptureUsageDescription`, aber **kein**
   `NSSpeechRecognitionUsageDescription`. Ohne diesen Schlüssel beendet TCC den Prozess, sobald
   `SFSpeechRecognizer` die Erlaubnis anfordert — Absturz statt Dialog. Ein Plugin kann das
   `Info.plist` der App nicht ergänzen.
2. **Nicht auslieferbar.** Ein `.node`-Addon darf weder im Release liegen (nur drei Dateien
   erlaubt) noch nachgeladen werden (Dependency-Klausel).
3. **Zerbrechlich.** Obsidian läuft hier auf **Electron 39.7.0**; ein node-gyp-Addon ist gegen
   diese ABI gebaut und bricht bei jedem Sprung einer sich selbst aktualisierenden App.

Außerhalb des Stores bliebe der Weg machbar — er kaufte aber node-gyp-Pflege ein, um eine
Engine zu erreichen, die schwächer ist als das bereits gemessene Parakeet.

### 6. Ein Nebenfund mit Entwurfsfolgen

`NSMicrophoneUsageDescription` **ist** gesetzt. Das Plugin darf also im Renderer per
`getUserMedia` aufnehmen — mit Gerätewahl, ohne zweiten Berechtigungsdialog für einen
Python-Prozess. Daraus folgt eine echte Entwurfsfrage: **Wer hält das Mikrofon — das Plugin
(und schickt Frames über die Leitung) oder der Dienst (und hört selbst)?**

---

## Wohin die Session gelaufen ist

Aus „Daemon oder natives TypeScript?" ist ein **Stufenmodell** geworden — nativ für das, was der
Renderer ohnehin kann, ein Dienst für alles, was ein Modell braucht:

| Stufe | Voraussetzung | Funktionen | Scorecard-Kosten |
|---|---|---|---|
| **0 — Vanilla** | keine | Notiz/Auswahl vorlesen über Systemstimmen (`window.speechSynthesis`), WAV-Export über die Vault-API | keine |
| **1 — Stack läuft** | Nutzer installiert `audio-ui` und startet es (How-To) | Qwen3-TTS mit Voice Cloning, Personas, 8-kHz-Export; Diktat über Parakeet + VAD | keine |

Das Plugin fällt still auf Stufe 0 zurück, wenn niemand antwortet — kein Fehler, weniger
Funktionen. Und es bleibt policy-ehrlich: Es installiert nichts, es findet vor.

**Wichtig für STT:** Für Stufe 0 gibt es kein Gegenstück. `webkitSpeechRecognition` ist in
Electron nicht brauchbar, und unter 136 durchgesehenen Audio-Plugins löst **keines** STT ohne
Cloud-API, WASM-Modell oder nativen Prozess. Vorlesen geht ohne Setup, Diktieren nicht.

---

## Die offene Frage (hier geht es weiter)

> **„Ich will eigentlich nicht, dass man sich zusätzlich ein zweites Programm installieren muss
> und es jedes Mal anwerfen muss, wenn man das Plugin nutzt — das macht den Vorteil eines
> Plugins (Ease of Use, kein Kontextwechsel) kaputt."** — Johannes, 2026-08-15

Der Einwand trifft die Empfehlung an ihrer schwächsten Stelle. Teilweise auflösbar:

- **„Jedes Mal anwerfen"** ist auflösbar. Ein LaunchAgent startet den Dienst beim Login; danach
  ist er einfach da. Reibung entsteht nur einmal, bei der Einrichtung.
- **„Installieren"** ist **nicht** auflösbar. Wer den Stack nie einrichtet, bekommt Parakeet und
  Qwen3-TTS nie — die Policy verbietet dem Plugin, ihn selbst zu holen.

Drei Auflösungen stehen zur Wahl, entschieden ist keine:

1. **Stufenmodell wie oben** — Stufe 0 als vollwertiges, sofort nutzbares Produkt; Stufe 1 für
   die, die mehr wollen. Die Reibung trifft nur den, der die Qualität will.
2. **Alles nativ (WASM/ONNX)** — kein zweites Programm, aber kein Cloning, keine Personas,
   schwächere Erkennung. Das `local-voiceover`-Los.
3. **Nachladen wie `offline-whisper`/Speech Kit** — beide sind gelistet, tragen aber die
   Konsequenzen (`fs`, Setup-Wizard) und kommen über Satisfactory nicht hinaus.

**Daran hängt unmittelbar der Modulzuschnitt und die Repo-Grenze:**

- Bleibt der Python-Kern in `audio-ui` und wird hier nur ein TS-Client gebaut?
- Wo lebt der Dienst — als Betriebsart von `audio-ui` (`serve`) oder als eigenes Repo?
- Ist dieses Repo ein Plugin, oder ein Plugin **plus** Kit-Modul (der Workspace hat mit
  `obsidian-kit` eine eigene Extraktions-Schwelle, s. `../AGENTS.md`)?
- Trägt derselbe Zuschnitt später `koda-agent` und die Duplex-Schleife mit Unterbrechen?

---

## Was beim Weiterarbeiten gilt

- **`../AGENTS.md` ist verbindlich** — Kit-first (erst `REGISTRY.md` und `obsidian-kit/README.md`
  prüfen), `UI-STANDARD.md` vor jeder UI-Arbeit, eigenständiges Git-Repo statt Monorepo.
- **`getSettingDefinitions()` von Anfang an implementieren.** Fehlt es, gibt es
  `[medium] This PluginSettingTab does not implement getSettingDefinitions()` — genau daran
  hängt `vault-crews` auf Satisfactory (in der KIT-MATRIX bereits als Befund geführt).
- **Dateien über die Vault-API schreiben, nie über `fs`.** Kostet sonst ein `medium`, bringt so
  sogar `[pass]`-Zeilen.
- **Den Dienst nicht aus dem Plugin starten.** Ein einziger `child_process`-Aufruf kostet die
  Bestnote — auch ein gut gemeinter „Auto-Start"-Knopf.
- **Messwerte gehören in die AGENTS.md des jeweiligen Repos, Konzeptwissen in den Vault.**
- Sprache in Doku, Kommentaren, Ausgaben: Deutsch. Code-Bezeichner Englisch.

## Verwandte Orte

| Ort | Rolle |
|---|---|
| `../../audio-ui` | Python/MLX-Kern, Messwerte, `AGENTS.md` mit allen STT-Zahlen |
| `$SHARED/40_Tools/TTS` | `voicelab/` — Stimmen, Personas, Cloning, PCM-Export |
| `../koda-agent` | späterer Konsument der Duplex-Schleife |
| Cockpit `audio-ui` | `obsidian://open?vault=10_Pallas&file=25_Coding%2Faudio-ui%2Faudio-ui` |
| TaskNote | `25_Coding/audio-ui/_Tasks/Sprachgrenze — Daemon oder native TypeScript-Implementierung.md` |
