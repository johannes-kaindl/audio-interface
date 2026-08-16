# Aufnahme-Vertrag — README-Bilder

Dieser Ordner hält die Bilder, die `README.md` und `README.de.md` einbetten. Diese Datei ist der
**Vertrag** dafür: welche Bilder es gibt, was jedes zeigen muss, in welcher Klasse es steht — und
wie man sie reproduzierbar neu aufnimmt. Geprüft wird er automatisch: `readme_lint.py`
(Workspace-Werkzeug, `npm run shots:check`) gleicht Vertrag ↔ Dateien ↔ README-Einbettungen ab.

## Status

Stand 2026-08-16: siehe Tabelle unten (Spalte *Stand*). Aufgenommen mit `npm run shots` gegen
Obsidian 1.13.7, englische Oberfläche, helles Theme. **Mit 0.3.0 (zweite Stimme) sind `settings.png`
und `download.png` überholt** — der Export-Bereich hat jetzt die Zeile *Voice for export*, und bei
englischer Oberfläche ist *Piper · LJSpeech (en_US, medium)* vorgewählt.

## Konventionen

**Beispieldaten sind generisch und englisch** — keine echten Namen, Firmen oder Nummern; Beispiel-Inhalte auf Englisch, weil README.md die kanonische Fassung ist (deutsche Beispiel-Inhalte für die deutsche README wären zulässig, sind aber nicht nötig).

Verbindlich ist der workspace-weite Bild-Standard (`_docs/readme/readme-spec.json`, Block `images`):
Aufnahme bei 1200 px Breite; `hero`/`feature` mit `width="820"`, `detail` als Vorschaubild
`width="380"` (unter `thumbs/`) verlinkt auf die Vollauflösung; Einbettung immer per `<img>`, absolute
Raw-URLs (`https://git.jkaindl.de/jkaindl/audio-interface/raw/branch/main/docs/images/<name>`),
Alt-Text Pflicht; PNG ≤ 400 KB, Ordner ≤ 5 MB. **Aufnahmesprache Englisch** — README.md ist die
kanonische Fassung, README.de.md bettet dieselben Bilder ein.

## Die Bilder

| Datei | Klasse | Referenziert von | Muss zeigen | Stand |
|---|---|---|---|---|
| `hero.png` | hero | `README.md`, `README.de.md` (Kopf) | Die Notiz **Mailbox greeting** in der Lesefläche: Überschrift, ein generischer englischer Ansagetext (Beispielfirma, keine echten Namen) mit einer Hervorhebung, darunter der eingebettete Audio-Player der Datei **Mailbox greeting.wav** — vorlesen und vertonen an einem Gegenstand. Ruhiges Bild, keine Seitenleisten, keine Palette. | ✅ |
| `command-palette.png` | feature | `README.md` (Usage) | Die Befehlspalette, gefiltert auf **Audio Interface**, mit allen sechs Kommandos lesbar: **Read note aloud**, **Read selection aloud**, **Pause / resume reading**, **Stop reading / cancel export**, **Export note as WAV**, **Export selection as WAV**. | ✅ |
| `settings.png` | feature | `README.md` (Configuration) | Der Einstellungen-Tab mit den drei Gruppen **Read aloud**, **Voice-over & export**, **Local service**; Export eingeschaltet, die Zeile **Voice for export** mit der Auswahl beider Stimmen und darunter die Engine-Zeile der gewählten Stimme im Zustand **Ready (version …)** mit **Remove**. | ⚠️ neu aufnehmen (0.3.0) |
| `download.png` | detail | `README.md` (WAV export is an opt-in) | Nur die Engine-Zeile der gewählten Stimme (englische Oberfläche → **Piper · LJSpeech (en_US, medium)**) vor dem Download: Beschreibung mit Größe, Quelle und Lizenzen, Knopf **Download (…)**. Zeigt, dass nichts ohne Klick geladen wird. | ⚠️ neu aufnehmen (0.3.0) |
| `status-bar.png` | detail | `README.md` (Usage) | Rechter Teil der Statusleiste während des Vorlesens mit dem Eintrag **Reading 1/3** (Klick = Stopp). | ✅ |

## Reproduktion

```bash
export STAGING_VAULTS_DIR="…"        # Verzeichnis der Aufnahme-Vaults (nicht im Repo, s. check-no-abs-paths)
npm run build && npm run shots -- --setup
# Obsidian neu starten (Debug-Port), Aufnahme-Vault öffnen, Sprache Englisch:
osascript -e 'quit app "Obsidian"'; open -a Obsidian --args --remote-debugging-port=9222
# Assets für settings.png von einem lokalen Server (Layout <base>/<version>/<datei>, CORS *) — s. docs/SMOKE.md
npm run shots -- --assets http://127.0.0.1:8765/assets
npm run shots:check
```

Der Vault entsteht unter `$STAGING_VAULTS_DIR/audio-interface`; sein Inhalt kommt vollständig aus
`fixture/` (Notizen, Vault-Konfiguration mit nur diesem Plugin, `make-audio.mjs` erzeugt die
eingebettete WAV — eine kurze Sinus-Sequenz im 8-kHz-Mono-Format des Exports; im Bild ist nur der
Player zu sehen, das Fixture bleibt so klein). `settings.png` und `download.png` entstehen im
Einstellungen-Fenster (eigenes Fenster in Obsidian ≥ 1.13); der Treiber leert dafür den Engine-Cache,
schaltet Export ein, lädt die Assets vom lokalen Server und stellt danach den Auslieferungszustand
wieder her.

## UI-Strings (verbatim aus `src/i18n/strings.ts`, EN)

Kommandos: `Read note aloud` · `Read selection aloud` · `Pause / resume reading` · `Stop reading /
cancel export` · `Export note as WAV` · `Export selection as WAV`. Settings-Gruppen: `Read aloud` ·
`Voice-over & export` · `Local service`. Stimmenwahl: `Voice for export`, Einträge
`Piper · LJSpeech (en_US, medium) · …` / `Piper · Thorsten (de_DE, medium) · …` (Größe oder
`downloaded`). Engine-Zeile: `Download ({0})` · `Ready (version {0}, {1})` · `Remove`.
Statusleiste: `Reading {0}/{1}`.
