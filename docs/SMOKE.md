# GUI-Smoke — audio-interface

Was gegen einen Mock geprüft ist, ist spezifiziert, nicht getestet (CORE-TEST-02). Der Treiber
`scripts/gui-smoke.ts` fährt die Punkte unten gegen ein **laufendes** Obsidian: echte
Systemstimmen, echter Blob-Worker mit ORT-WASM, echte Cache API, echte Vault-Datei.

## Handgriffe (bleiben Handarbeit)

```bash
osascript -e 'quit app "Obsidian"'
open -a Obsidian --args --remote-debugging-port=9222
open "obsidian://open?vault=00_ProtoVault"                     # Test-Vault
OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/audio-interface" npm run deploy
```

Plugin im Test-Vault einmal aktivieren (Community-Plugins). Assets kommen im Smoke von einem
lokalen Server statt von GitHub — so braucht der Smoke kein Release:

```bash
npm run assets                                   # dist-assets/ (Worker, WASM, Stimme, Config)
# Server mit CORS (`Access-Control-Allow-Origin: *`) und Layout <base>/<version>/<datei>, z. B.:
mkdir -p /tmp/ai-assets/assets && ln -sfn "$PWD/dist-assets" /tmp/ai-assets/assets/0.1.0
python3 - <<'PY' &
import http.server, os
os.chdir("/tmp/ai-assets")
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*"); super().end_headers()
http.server.ThreadingHTTPServer(("127.0.0.1", 8765), H).serve_forever()
PY
npm run smoke:gui -- --vault 00_ProtoVault --assets http://127.0.0.1:8765/assets
```

Der Treiber setzt `app.saveLocalStorage("audio-interface-asset-base", <url>)` (das Plugin liest
den Schlüssel beim Laden — nur für Smoke/Entwicklung; ohne Schlüssel gilt das GitHub-Release),
lädt das Plugin neu und stellt am Ende den Vorwert wieder her.

⚠️ **Der Smoke leert den Engine-Cache** (`caches` „audio-interface-engines"), am Anfang und am
Ende. Der Cache ist origin-weit — er gilt für alle Vaults derselben Obsidian-Installation. Die
Assets sind jederzeit neu ladbar; wer die Stimme im Arbeits-Vault behalten will, lädt sie danach
einmal neu.

## Prüfpunkte

| # | Punkt | misst |
|---|---|---|
| 1 | Plugin geladen, 6 Kommandos | `app.commands` |
| 2 | ≥ 1 deutsche Systemstimme | `SystemSpeechEngine.listVoices("de")` nach `waitForVoices` |
| 3 | Vorlesen startet und stoppt | Statusleiste sichtbar → nach `speak-stop` versteckt |
| 4 | Export-Kommando vor Download **nicht** in der Palette | `checkCallback(true) === false` |
| 5 | Settings: Toggle Export → Engine-Zeile mit „Herunterladen (xx MB)" | über `tab.setControlValue`, wie der Nutzer |
| 6 | Download über den Knopf → „Bereit" | Klick im echten Settings-DOM, Poll bis 180 s |
| 7 | Export erzeugt WAV 8 kHz, > 1 s | Datei im Vault, RIFF-Header gelesen; bricht früher ab, wenn ein Fehler-Notice erscheint |
| 8 | Entfernen → wieder „Herunterladen" | Cache geleert, Tab neu gezeichnet |

Ohne `--assets` laufen nur 1–4; 5–8 werden als übersprungen gemeldet.

## Durchläufe

| Datum | Obsidian | Ergebnis | Gegenprobe |
|---|---|---|---|
| 2026-08-16 | 1.13.7, Aufnahme-Vault `audio-interface` (englische Oberfläche), Manifest korrigiert, Cache-Schlüssel basisunabhängig | **8/8 grün** (Export: 103 648 B, 8000 Hz, 6,5 s) | — |
| 2026-08-15 | 1.13.7 / Electron 39.7.0, macOS, 00_ProtoVault | **8/8 grün** (Export: 103 648 B, 8000 Hz, 6,5 s) | eine SHA-256 im generierten Manifest verfälscht → **genau Punkt 7 rot** (Engine `unavailable`, Punkt 6 bleibt grün, weil der Download nicht prüft — die Prüfung sitzt vor dem Instanziieren) |

Zwei Befunde aus dem ersten Lauf, beide im Code festgehalten:

- **Obsidian 1.13 rendert den Settings-Tab aus einem beim `addSettingTab` gecachten
  `settingItems`** und ruft beim Öffnen weder `display()` noch `getSettingDefinitions()` — nur
  `hide()`. Bedingte Zeilen brauchen ein aktives `update()`: nach dem Ladezustand im `onload`,
  bei Zustandsänderungen, und beim Öffnen über den `hide()`-Hook (`settings-tab.ts`).
- **Ein Web Worker im Obsidian-Renderer hat ein `process`-Objekt** (Electron). ephone hält sich
  dann für Node und lädt `node:module`. Im Worker-Bundle wird `globalThis.process` zur Build-Zeit
  auf `undefined` definiert (`esbuild.config.mjs`).

## Nicht automatisiert (Hand-Runde)

Klangqualität und Sprechfluss der Systemstimme bzw. der Piper-Stimme; Verhalten bei
Popout-Fenstern; sehr lange Notizen (> 5 min Audio).
