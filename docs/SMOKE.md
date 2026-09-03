# GUI-Smoke — audio-interface

Was gegen einen Mock geprüft ist, ist spezifiziert, nicht getestet (CORE-TEST-02). Der Treiber
`scripts/gui-smoke.ts` fährt die Punkte unten gegen ein **laufendes** Obsidian: echte
Systemstimmen, echter Blob-Worker mit ORT-WASM, echte Cache API, echte Vault-Datei.

## Handgriffe (bleiben Handarbeit)

⚠️ **Zuerst prüfen, wer sonst an Obsidian hängt.** Obsidian ist Single-Instance — ein
`quit` trifft die Instanz, an der möglicherweise eine andere Session arbeitet, und zerstört
deren Zustand. Der eigene Lauf ist danach sauber grün; der Schaden entsteht woanders und
fällt nicht auf.

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
```

Hört der Port schon, dann **mitnutzen statt neu starten**: ein eigenes Fenster per
`vault-open` über IPC öffnen, dann `attachTo("workspace", port, vault)` — der Vault-Name
wählt, nicht die Reihenfolge. ⚠️ Die Port-Prüfung ersetzt die Frage nicht: sie zeigt aktive
CDP-Treiber, aber nicht, wer ein Fenster offen hält oder auf den Port wartet.

Erst wenn nichts läuft — oder nach Absprache mit dem, der es benutzt — gilt das Rezept unten.

```bash
osascript -e 'quit app "Obsidian"'
open -a Obsidian --args --remote-debugging-port=9222
open "obsidian://open?vault=audio-interface"                   # Staging-Vault
OBSIDIAN_PLUGIN_DIR="$STAGING_VAULTS_DIR/audio-interface/.obsidian/plugins/audio-interface" npm run deploy
```

Plugin im Test-Vault einmal aktivieren (Community-Plugins). Assets kommen im Smoke von einem
lokalen Server statt von GitHub — so braucht der Smoke kein Release:

```bash
npm run assets                                   # dist-assets/ (Worker, WASM, Stimme, Config)
# Server mit CORS (`Access-Control-Allow-Origin: *`) und Layout <base>/<version>/<datei>, z. B.:
# Der Pfad traegt die PLUGIN-Version (assetVersion = manifest.version) — nicht hart eintragen:
V=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
mkdir -p /tmp/ai-assets/assets && ln -sfn "$PWD/dist-assets" "/tmp/ai-assets/assets/$V"
python3 - <<'PY' &
import http.server, os
os.chdir("/tmp/ai-assets")
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*"); super().end_headers()
http.server.ThreadingHTTPServer(("127.0.0.1", 8765), H).serve_forever()
PY
npm run smoke:gui -- --assets http://127.0.0.1:8765/assets
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
| 8 | Stimmenwechsel auf Englisch → nur das Modell fehlt → „Bereit" | `tab.setControlValue("exportEngineId", …)`; der Knopf darf **nicht** die volle Größe nennen (Worker + WASM sind geteilt) |
| 9 | Export mit der englischen Stimme erzeugt WAV 8 kHz, > 1 s | zweite Datei (`…-2.wav`), englischer Ansagetext |
| 10 | Entfernen → wieder „Herunterladen" | Cache geleert, Tab neu gezeichnet |
| 11 | Umschrift **aus**: kein Kontextmenü-Eintrag an einer Audiodatei | `file-menu`-Trigger mit einem Fake-Menü — das Plugin spricht ungefragt nichts an |
| 12 | Umschrift **an**: Eintrag an der Audiodatei, **nicht** an der Notiz | derselbe Trigger für `.webm` und `.md` |
| 13a | *ohne* `--service`: benannte Meldung, **keine** Notiz | Adresse zeigt auf Port 8798, wo garantiert nichts lauscht |
| 13b | *mit* `--service`: echte Umschrift einer **WebM**-Datei legt eine Notiz mit Embed an | der ganze Weg: Renderer dekodiert, 16-kHz-Mono-WAV an den echten Dienst, Notiz im Vault |

Punkt 8 meldet zwei Zeilen (Wechsel, dann „Bereit"), der Lauf zählt deshalb 11 Prüfungen.
Welche Stimme die „andere" ist, hängt an der Oberflächensprache — der Treiber liest die geladene und
wechselt auf die verbleibende. Ohne `--assets` laufen nur 1–4; 5–10 werden als übersprungen gemeldet. Punkt 8 ist der Prüfpunkt für
die geteilte Laufzeit: er fällt rot aus, sobald die zweite Stimme wieder alles herunterladen will.

## Durchläufe

| Datum | Obsidian | Ergebnis | Gegenprobe |
|---|---|---|---|
| 2026-09-03 (2) | **1.13.7 in einer Zweitinstanz** (eigenes `--user-data-dir`, Port 9411), Staging-Vault, **`--assets https://git.jkaindl.de/jkaindl/audio-interface/releases/download` (echtes Release 0.4.0)** + `--service` | **14/14 grün** — der Pflichtlauf nach dem Release UND der Beleg für den Asset-Umzug: Download 76,2 MB von Forgejo → „Bereit · v0.4.0" → Export 156 404 B/8000 Hz/9,8 s; zweite Stimme 60,3 MB → Export 116 094 B/7,3 s; Entfernen → 75,8 MB; dazu die drei Umschrift-Punkte inkl. echter WebM-Transkription | Vorher anonym gemessen, dass alle sechs Assets abrufbar sind (HTTP 206) — mit Token hätte die Probe genau den Defekt verdeckt, um den es ging. ⚠️ Der Lauf startete auf Port **9334** gegen ein **fremdes** Fenster (`3d-codeblocks`, eine andere Session hatte den Port zuerst): der Vault-Filter der Brücke hat es abgefangen (`Kein Fenster passt zu --vault`). Zweitinstanz-Ports sind nicht automatisch frei — vor dem Start `lsof` fragen |
| 2026-09-03 | **1.12.4 in einer Zweitinstanz** (eigenes `--user-data-dir`, Port 9334 — die reguläre Instanz auf 9222 war von einer fremden Session belegt und blieb unberührt), Staging-Vault, ohne Asset-Server | **8/8 grün mit** laufendem Dienst (`--service http://127.0.0.1:8799`), **9/9 grün ohne** — die neuen Punkte 11–13 für die Umschrift | Beide Lagen einzeln gefahren, weil sie sich ausschliessen: der Offline-Zweig prüft die Meldung, der Online-Zweig die echte Umschrift. Erster Offline-Lauf war wertlos, weil die Ausweich-Adresse auf Port **8799** zeigte — dort lief der Dienst gerade; auf 8798 umgestellt. Vorher am selben Renderer gemessen, dass `decodeAudioData` **webm, m4a und wav** kann (Electron 39.7.0) — das ist die Annahme, auf der die ganze Bauart steht |
| 2026-08-27 | 1.13.7, Aufnahme-Vault, lokaler Asset-Server — **Pflichtlauf nach dem Kit-0.27.0-Vendoring** (der Download-Pfad ist umgebaut: die eigene `tee()`-Leseschleife ist jetzt `streamIntoCache` aus dem Kit) | **11/11 grün** (LJSpeech: Download 76,2 MB → Export 160 862 B/8000 Hz/10,1 s; Wechsel auf Thorsten: Download 60,3 MB → Export 114 608 B/7,2 s; Entfernen → 75,8 MB) | Die Exportgröße streut gegenüber 2026-08-16 (4) um +3 % bzw. −1 %. Geprüft, weil eine unerklärte Abweichung nach einem Umbau kein „grün" ist: Prüftext, Modelle, `tempo`, `speakRate` und `exporter.ts`/`audio.ts` sind seit dem Baseline-Lauf **unverändert** (git), und die drei Läufe derselben Stimme streuen auch untereinander (157 334 / 156 218 / 160 862 B) — in beide Richtungen. Synthese-Varianz in ORT-WASM, kein Signal |
| 2026-08-16 (4) | 1.13.7, Aufnahme-Vault, **`--assets https://github.com/johannes-kaindl/audio-interface/releases/download` (echtes Release 0.3.0)** | **11/11 grün** — der Pflichtlauf nach dem Release: Download 76,2 MB über `requestUrl` → Export 156 218 B/8000 Hz/9,8 s; Wechsel auf die zweite Stimme 60,3 MB → Export 115 722 B/7,2 s | — |
| 2026-08-16 (3) | 1.13.7, Aufnahme-Vault (englische Oberfläche → englische Stimme vorgewählt), lokaler Asset-Server, **zwei Stimmen** | **11/11 grün** (LJSpeech: Download 76,2 MB → Export 157 334 B/8000 Hz/9,8 s; Wechsel auf Thorsten: **Download 60,3 MB** — die geteilte Laufzeit lag schon → Export 120 738 B/7,5 s) | Erstlauf rot an Punkt 8: der Treiber wechselte fest „auf englisch", obwohl bei englischer Oberfläche schon die englische Stimme geladen war — er nimmt jetzt die *andere* Stimme |
| 2026-08-16 (2) | 1.13.7, Aufnahme-Vault, **`--assets https://github.com/johannes-kaindl/audio-interface/releases/download` (echtes Release 0.1.0)** | zuerst **5/8** — Download „Failed to fetch": CORS auf dem GitHub-Redirect, vom lokalen Server (CORS `*`) verdeckt; nach Umstellung auf `requestUrl` **8/8 grün** (Export 99 004 B, 8000 Hz, 6,2 s) | — |
| 2026-08-16 | 1.13.7, Aufnahme-Vault `audio-interface` (englische Oberfläche), Manifest korrigiert, Cache-Schlüssel basisunabhängig | **8/8 grün** (Export: 103 648 B, 8000 Hz, 6,5 s) | — |
| 2026-09-01 | 1.13.7, macOS, Staging-Vault `audio-interface` | **11/11 grün** (de: 156 776 B / 9,8 s · en: 117 394 B / 7,3 s, beide 8000 Hz) | erster Lauf ohne `--vault`: der neue Default (Repo-Name) hat das richtige Fenster gewählt, bei drei fremden Vaults am Port. Notice-Fix separat in beiden Hälften gegengeprobt — eine gesetzte Fremdmeldung („…fehlgeschlagen") wird ohne die Räum-Zeile gefunden, mit ihr nicht |
| 2026-08-15 | 1.13.7 / Electron 39.7.0, macOS, 00_ProtoVault | **8/8 grün** (Export: 103 648 B, 8000 Hz, 6,5 s) | eine SHA-256 im generierten Manifest verfälscht → **genau Punkt 7 rot** (Engine `unavailable`, Punkt 6 bleibt grün, weil der Download nicht prüft — die Prüfung sitzt vor dem Instanziieren) |

Zwei Befunde aus dem ersten Lauf, beide im Code festgehalten:

- **Obsidian 1.13 rendert den Settings-Tab aus einem beim `addSettingTab` gecachten
  `settingItems`** und ruft beim Öffnen weder `display()` noch `getSettingDefinitions()` — nur
  `hide()`. Bedingte Zeilen brauchen ein aktives `update()`: nach dem Ladezustand im `onload`,
  bei Zustandsänderungen, und beim Öffnen über den `hide()`-Hook (`settings-tab.ts`).
- **Ein Web Worker im Obsidian-Renderer hat ein `process`-Objekt** (Electron). ephone hält sich
  dann für Node und lädt `node:module`. Im Worker-Bundle wird `globalThis.process` zur Build-Zeit
  auf `undefined` definiert (`esbuild.config.mjs`).

**Regel seit dem zweiten Lauf:** nach jedem Release den Smoke einmal mit dem **echten** Release als
Quelle fahren (`--assets https://github.com/johannes-kaindl/audio-interface/releases/download`). Der
lokale Server beweist die Pipeline, nicht den Bezugsweg — und genau der schlug fehl.

## Nicht automatisiert (Hand-Runde)

Klangqualität und Sprechfluss der Systemstimme bzw. der Piper-Stimme; Verhalten bei
Popout-Fenstern; sehr lange Notizen (> 5 min Audio).
