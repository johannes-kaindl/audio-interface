# Audio Interface

> [🇬🇧 English](https://github.com/johannes-kaindl/audio-interface/blob/main/README.md) · 🇩🇪 Deutsch

**Notizen vorlesen lassen und als WAV-Datei vertonen — lokal, ohne Cloud, ohne Konto, ohne Python.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/johannes-kaindl/audio-interface/blob/main/LICENSE)
[![Doku: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](https://github.com/johannes-kaindl/audio-interface/blob/main/LICENSE-DOCS)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/audio-interface?label=release)](https://github.com/johannes-kaindl/audio-interface/releases)
[![Obsidian](https://img.shields.io/badge/obsidian-1.8.7%2B%20·%20desktop-7c3aed)](https://obsidian.md)

Vorlesen funktioniert sofort nach der Installation, mit den Stimmen, die auf deinem Rechner schon
da sind. Eine Notiz als WAV zu vertonen — etwa eine Mailbox-Ansage für die Telefonanlage — ist ein
bewusstes Opt-in: du schaltest es ein, drückst *Herunterladen*, und erst dann kommt eine Stimme
(deutsch oder englisch) auf die Platte.

<p align="center"><img src="https://raw.githubusercontent.com/johannes-kaindl/audio-interface/main/docs/images/hero.png" width="820" alt="Eine Notiz mit dem Titel Mailbox greeting in der Leseansicht: drei kurze Absätze einer generischen Telefonansage (englisch), darunter der eingebettete Audio-Player der exportierten WAV-Datei"></p>

## Features

- **Vorlesen** der aktuellen Notiz oder Auswahl mit den Systemstimmen — Start, Pause/Weiter und
  Stopp über die Befehlspalette, das Ribbon-Symbol oder die Statusleiste. Nichts einzurichten.
- **Als WAV exportieren** mit einer ladbaren Stimme — **deutsch** (Piper, *Thorsten*) oder
  **englisch** (Piper, *LJSpeech*), mittlere Qualität, in den Einstellungen umschaltbar.
  Profil **Telefonanlage** (8 kHz mono 16 bit — das erwarten Mailboxen wie 3CX) oder die native
  Abtastrate der Stimme (22,05 kHz). Dateien landen neben der Notiz oder in einem Ordner deiner Wahl
  und werden nie überschrieben.
- **Mit der geladenen Stimme vorlesen** statt mit der Systemstimme, sobald sie da ist.
- **Sprechfertiger Text:** Frontmatter, Codeblöcke, Bilder/Embeds und Kommentare fallen weg; Links
  sprechen ihren Anzeigetext; Überschriften, Listen, Tabellen und Callouts werden mit natürlichen
  Pausen gelesen.
- **Ehrliche Netznutzung:** ein Download, vom Release dieses Repos, nur nach deinem Klick, gegen
  Prüfsummen verifiziert, wieder entfernbar — siehe [Funktionsweise](#funktionsweise).

## Voraussetzungen

- **Obsidian 1.8.7 oder neuer, Desktop** (macOS, Windows, Linux). `isDesktopOnly` ist gesetzt —
  Synthese-Worker und der Browser-Cache, in dem die Stimme liegt, sind auf Mobilgeräten nicht
  verlässlich.
- **Vorlesen** nutzt die Stimmen des Betriebssystems. Fehlt eine deutsche, im System eine
  installieren (macOS: Systemeinstellungen → Bedienungshilfen → Gesprochene Inhalte → Systemstimme).
- **WAV-Export** braucht rund 80 MB freien Platz für die erste Stimme samt Laufzeit; eine zweite
  Stimme kostet noch etwa 60 MB, weil die Laufzeit geteilt wird.

## Installation

Quelle: [git.jkaindl.de/jkaindl/audio-interface](https://git.jkaindl.de/jkaindl/audio-interface)

> **Hinweis (2026-09-03):** Audio Interface ist derzeit **nicht im Community-Plugins-Browser gelistet**. Das GitHub-Konto, das den Mirror gehostet hat, war nicht verfügbar, wodurch auch der Store-Eintrag verschwunden ist. Das Plugin selbst wird gepflegt, Releases erscheinen auf Forgejo.
>
> Betroffen waren auch die **ladbaren Stimmen** — sie wurden von diesem Konto geholt und scheiterten mit 404. Seit 0.4.0 kommen sie aus dem Forgejo-Release, das Herunterladen funktioniert also wieder. Eine schon geladene Stimme lief die ganze Zeit weiter: der Cache liegt außerhalb deines Vaults.

### Mit AnySource Sideloader (empfohlen)

[AnySource Sideloader](https://git.jkaindl.de/jkaindl/anysource-sideloader) installiert und aktualisiert Plugins von jeder Git-Forge, unabhängig vom Community Store.

1. AnySource Sideloader installieren und aktivieren. (Seine eigene Erstinstallation ist manuell — die Unabhängigkeit vom Store ist ja der Punkt —, muss aber nur einmal geschehen.)
2. Dieses Repository als Quelle eintragen: `https://git.jkaindl.de/jkaindl/audio-interface`
3. Audio Interface installieren und aktivieren.

### Manuell

`main.js`, `manifest.json` und `styles.css` aus dem [letzten Forgejo-Release](https://git.jkaindl.de/jkaindl/audio-interface/releases/latest) nach `<vault>/.obsidian/plugins/audio-interface/` legen, dann das Plugin aktivieren.

Releases ab 0.4.0 enthalten auch `checksums.sha256`, damit du das Heruntergeladene prüfen kannst: `shasum -a 256 -c checksums.sha256`.

### Über den Community-Plugins-Browser

Wieder möglich, sobald der Store-Eintrag zurückkehrt: Einstellungen → Community-Plugins → Durchsuchen → „Audio Interface“.

### Aus dem Quellcode

```bash
git clone https://git.jkaindl.de/jkaindl/audio-interface
cd audio-interface && npm install && npm run build
# main.js manifest.json styles.css → <vault>/.obsidian/plugins/audio-interface/
```

## Verwendung

1. Notiz öffnen und **Notiz vorlesen** ausführen (Befehlspalette oder Ribbon-Symbol). Für einen
   Teil zuerst Text markieren und **Auswahl vorlesen** nehmen.
2. **Vorlesen pausieren / fortsetzen** und **Vorlesen stoppen / Export abbrechen** sind ebenfalls
   Befehle — oder ein Klick auf den Statusleisten-Eintrag, der den Fortschritt anzeigt.
3. Für den Export: WAV-Export in den Einstellungen einschalten und die Stimme laden (siehe unten).
   Die Befehle **Notiz als WAV vertonen** und **Auswahl als WAV vertonen** erscheinen in der Palette,
   sobald die Stimme bereit ist. Die Datei landet neben der Notiz (oder im Zielordner); ein Hinweis
   nennt den Pfad.

<img src="https://raw.githubusercontent.com/johannes-kaindl/audio-interface/main/docs/images/command-palette.png" width="820" alt="Die Befehlspalette gefiltert auf Audio Interface mit allen sechs Befehlen (englische Oberfläche): Notiz vorlesen, Notiz als WAV vertonen, Auswahl vorlesen, Pause/Weiter, Auswahl als WAV vertonen, Stoppen">

| | |
|---|---|
| <a href="https://raw.githubusercontent.com/johannes-kaindl/audio-interface/main/docs/images/status-bar.png"><img src="https://raw.githubusercontent.com/johannes-kaindl/audio-interface/main/docs/images/thumbs/status-bar.png" width="380" alt="Die Obsidian-Statusleiste unten rechts mit dem Eintrag Reading 1/5, während eine Notiz vorgelesen wird"></a> | Der Statusleisten-Eintrag zeigt, was gerade passiert — *Vorlesen 1/5*, *Rendern 2/9*, *Lade 12/78 MB* — und ein Klick stoppt es. |

### Konfiguration

| Einstellung | Wirkung | Standard |
|---|---|---|
| Stimme | Welche Systemstimme vorliest; *Automatisch* nimmt die erste deutsche | Automatisch |
| Tempo | Sprechtempo fürs Vorlesen (0,5×–2×) | 1,0× |
| Mit der geladenen Stimme vorlesen | Piper-Stimme statt Systemstimme fürs Vorlesen (erscheint erst, wenn die Stimme bereit ist) | aus |
| WAV-Export aktivieren | Blendet die Stimmen-Zeile und die Export-Felder ein — lädt selbst nichts | aus |
| Stimme für den Export | Welche ladbare Stimme spricht: *Piper · Thorsten (de_DE)* oder *Piper · LJSpeech (en_US)*. Jeder Eintrag nennt, was er noch kostet, oder *geladen* | folgt der Oberflächensprache von Obsidian |
| Piper · … (die gewählte Stimme) | Die Stimmen-Zeile: Größe, Quelle, Lizenzen, mit **Herunterladen** / **Abbrechen** / **Entfernen** | nicht geladen |
| Ausgabeprofil | *Telefonanlage — 8 kHz mono* oder *Nativ (Abtastrate der Stimme)* | Telefonanlage |
| Zielordner | Vault-Ordner für die WAV-Dateien; leer = neben der Notiz | leer |
| Dateinamen-Muster | `{{note}}` und `{{date}}` werden ersetzt; vorhandene Dateien bekommen `-2`, `-3`, … | `{{note}}` |
| Link in die Notiz einfügen | Nach erfolgreichem Export `![[datei.wav]]` am Cursor einfügen | aus |

<img src="https://raw.githubusercontent.com/johannes-kaindl/audio-interface/main/docs/images/settings.png" width="820" alt="Der Einstellungen-Tab (englische Oberfläche) mit drei Gruppen: Vorlesen, Vertonen und Export mit der Auswahl Stimme für den Export (Piper LJSpeech, als geladen markiert), darunter die Stimmen-Zeile im Zustand Bereit mit dem Knopf Entfernen, sowie Lokaler Dienst">

## Funktionsweise

**Vorlesen** nutzt die Sprachsynthese des Browsers in Obsidian — die Stimmen deines Betriebssystems,
satzweise, mit Pausen aus der Struktur der Notiz. Dabei entstehen keine Audiodaten; deshalb können
Systemstimmen auch keine Datei exportieren.

**Der WAV-Export ist ein Opt-in.** Nach der Installation lädt das Plugin **nichts**. Schaltest du
den Export ein und drückst **Herunterladen**, holt es diese Dateien **einmalig vom Forgejo-Release
dieses Repos** (`https://git.jkaindl.de/jkaindl/audio-interface/releases`); kein anderer
Server wird angesprochen:

| Datei | Größe | Was das ist | Lizenz |
|---|---|---|---|
| `piper-worker.js` | ≈ 3 MB | Synthese-Worker (Piper-Pipeline, eSpeak-NG-Phonemisierer als WASM, deutsches + englisches Wörterbuch) | AGPL-3.0-or-later; enthält ephone/eSpeak-NG (GPL-3.0-or-later), onnxruntime-web (MIT) |
| `ort-wasm-simd-threaded.wasm` | ≈ 13 MB | ONNX Runtime Web (CPU) | MIT |
| `de_DE-thorsten-medium.onnx` + `.json` | ≈ 60 MB | Piper-Stimme *Thorsten* (Deutsch, 22,05 kHz) | Datensatz CC0 |
| `en_US-ljspeech-medium.onnx` + `.json` | ≈ 61 MB | Piper-Stimme *LJSpeech* (Englisch, 22,05 kHz) | Datensatz gemeinfrei |

Geladen wird nur die gewählte Stimme — die ersten beiden Dateien sind geteilt, eine zweite Stimme
kostet deshalb nur noch ihr Modell.

<table><tr>
<td><a href="https://raw.githubusercontent.com/johannes-kaindl/audio-interface/main/docs/images/download.png"><img src="https://raw.githubusercontent.com/johannes-kaindl/audio-interface/main/docs/images/thumbs/download.png" width="380" alt="Die Stimmen-Zeile in den Einstellungen vor dem Download: Name Piper LJSpeech (en_US, medium), Beschreibung mit Größe, Quelle und Lizenzen, Knopf Download 76.2 MB"></a></td>
<td>Jede Datei wird vor der Nutzung gegen eine <b>im Plugin eingebettete SHA-256-Prüfsumme</b> geprüft; bei Abweichung bleibt die Stimme aus, und die Meldung nennt die Datei. Die Dateien liegen im Browser-Cache der Obsidian-App, <b>außerhalb deines Vaults</b> — nie synchronisiert, nie in deinen Dateien — und <b>Entfernen</b> löscht sie wieder. Der Download lässt sich abbrechen; Teilstände werden fortgesetzt.</td>
</tr></table>

Die Synthese läuft dann in einem Web Worker in Obsidian (ONNX Runtime, CPU); das Ergebnis wird auf
das gewählte Profil umgetastet, als 16-bit-WAV kodiert und über Obsidians Vault-API geschrieben.
Es gibt keine Telemetrie und keinen weiteren Netzzugriff. Architektur und Messwerte:
[`AGENTS.md`](AGENTS.md).

## Ausblick

Diktat (Sprache zu Text) und die Anbindung eines lokalen Sprachdienstes für hochwertigere Stimmen
sind für spätere Releases vorgesehen; die Einstellungen halten den Platz schon frei.

## Mitwirken

Issues und Pull Requests auf [git.jkaindl.de](https://git.jkaindl.de/jkaindl/audio-interface).
Testgetrieben (`npm run gate`); größere Features über brainstorm → spec → plan → TDD
(`docs/superpowers/`). Siehe [`AGENTS.md`](AGENTS.md).

## Dokumentation

- [Dokumentations-Index](https://github.com/johannes-kaindl/audio-interface/blob/main/docs/README.md) (Englisch)
- [Getting started](https://github.com/johannes-kaindl/audio-interface/blob/main/docs/getting-started.md) — vom Vorlesen zur WAV-Datei
- [Troubleshooting](https://github.com/johannes-kaindl/audio-interface/blob/main/docs/troubleshooting.md) — die Meldungen, die auftreten können, was sie bedeuten und was zu tun ist

## Lizenz

- **Code:** AGPL-3.0-or-later ([`LICENSE`](https://github.com/johannes-kaindl/audio-interface/blob/main/LICENSE)).
- **Dokumentation:** CC BY-SA 4.0 ([`LICENSE-DOCS`](https://github.com/johannes-kaindl/audio-interface/blob/main/LICENSE-DOCS)).
- **Fremdkomponenten:** onnxruntime-web (MIT), ephone/eSpeak-NG (GPL-3.0-or-later), Piper-Stimmen
  *Thorsten* (Datensatz CC0) und *LJSpeech* (Datensatz gemeinfrei) — als Release-Assets
  ausgeliefert, siehe Tabelle oben.

Copyright © 2026 Johannes Kaindl.
