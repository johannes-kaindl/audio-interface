# Audio Interface

Notizen vorlesen lassen und als WAV-Datei vertonen — lokal, ohne Cloud, ohne Konto, ohne
Python. *([English version](README.md))*

## Was es tut

- **Vorlesen** der aktuellen Notiz oder Auswahl mit den Stimmen deines Rechners. Start,
  Pause/Weiter, Stopp über die Befehlspalette, das Ribbon-Symbol oder die Statusleiste. Läuft
  direkt nach der Installation — nichts einzurichten.
- **Als WAV exportieren** mit einer ladbaren deutschen Stimme (Piper, *Thorsten*, mittlere
  Qualität). Profil **Telefonanlage** (8 kHz mono 16 bit — das erwarten Mailboxen wie 3CX)
  oder die native Abtastrate der Stimme (22,05 kHz). Dateien landen neben der Notiz oder in
  einem Ordner deiner Wahl und werden nie überschrieben.
- Wahlweise mit der geladenen Stimme statt der Systemstimme vorlesen.

Markdown wird vorher zu Sprechtext: Frontmatter, Codeblöcke, Bilder/Embeds und Kommentare
fallen weg; Links sprechen ihren Anzeigetext; Überschriften, Listen, Tabellen und Callouts
werden mit natürlichen Pausen gesprochen.

## Der WAV-Export ist ein Opt-in — was geladen wird, und woher

Nach der Installation kann das Plugin nur vorlesen und lädt **nichts**. Für den Export braucht
es eine Stimme, die Audiodaten liefert; Systemstimmen können das nicht. So schaltest du ihn frei:

1. Einstellungen → *Vertonen & Export* → **WAV-Export aktivieren**.
2. **Herunterladen** drücken. Erst dann holt das Plugin diese Dateien — **einmalig, vom
   GitHub-Release dieses Repos** (`https://github.com/johannes-kaindl/audio-interface/releases`),
   kein anderer Server wird angesprochen:

| Datei | Größe | Was das ist | Lizenz |
|---|---|---|---|
| `piper-worker.js` | ≈ 2 MB | Synthese-Worker (Piper-Pipeline, eSpeak-NG-Phonemisierer als WASM) | AGPL-3.0-or-later; enthält ephone/eSpeak-NG (GPL-3.0-or-later), onnxruntime-web (MIT) |
| `ort-wasm-simd-threaded.wasm` | ≈ 13 MB | ONNX Runtime Web (CPU) | MIT |
| `de_DE-thorsten-medium.onnx` + `.json` | ≈ 60 MB | Piper-Stimme *Thorsten* (Deutsch, 22,05 kHz) | Datensatz CC0 |

- Jede Datei wird vor der Nutzung gegen eine **im Plugin eingebettete SHA-256-Prüfsumme**
  geprüft; bei Abweichung bleibt die Stimme aus, und die Meldung nennt die Datei.
- Ablage im Browser-Cache der Obsidian-App, **außerhalb deines Vaults** — nie synchronisiert,
  nie in deinen Dateien sichtbar. **Entfernen** löscht sie wieder aus den Einstellungen.
- Der Download läuft nur nach deinem Klick, kann abgebrochen werden, Teilstände werden
  fortgesetzt.

Sonst berührt nichts das Netz. Es gibt keine Telemetrie.

## Befehle

| Befehl | |
|---|---|
| Notiz vorlesen / Auswahl vorlesen | Systemstimme oder, wenn eingeschaltet, die geladene Stimme |
| Vorlesen pausieren/fortsetzen · Stoppen | auch: Klick auf die Statusleiste |
| Notiz als WAV vertonen / Auswahl als WAV vertonen | erscheinen erst, wenn die geladene Stimme bereit ist |

## Voraussetzungen

Nur Desktop (Obsidian ≥ 1.8.7). Vorlesen nutzt die Stimmen des Betriebssystems — fehlt eine
deutsche, im System eine installieren. Der Export braucht ~80 MB freien Platz für die Stimme.

## Ausblick

Diktat (Sprache zu Text) und die Anbindung eines lokalen Sprachdienstes für hochwertigere
Stimmen sind für spätere Releases vorgesehen; die Einstellungen halten den Platz schon frei.

## Entwicklung

```bash
npm install
npm run gate          # lint · typecheck · tests · purity · bundle-size
npm run assets        # baut dist-assets/ und schreibt das Prüfsummen-Manifest neu
npm run smoke:gui -- --vault <vault> --assets http://127.0.0.1:8765   # siehe docs/SMOKE.md
```

Lizenz AGPL-3.0-or-later. Fremdkomponenten: onnxruntime-web (MIT), ephone/eSpeak-NG
(GPL-3.0-or-later), Piper-Stimme *Thorsten* (Datensatz CC0).
