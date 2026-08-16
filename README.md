# Audio Interface

> 🇬🇧 English · [🇩🇪 Deutsch](README.de.md)

**Read your notes aloud and turn them into WAV files — locally, with no cloud, no account, no Python.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/audio-interface?gitea_url=https%3A%2F%2Fgit.jkaindl.de&label=release)](https://git.jkaindl.de/jkaindl/audio-interface/releases)
[![Obsidian](https://img.shields.io/badge/obsidian-1.8.7%2B%20·%20desktop-7c3aed)](https://obsidian.md)

Reading aloud works the moment you install the plugin, with the voices already on your computer.
Exporting a note as a WAV file — say, a mailbox greeting for your phone system — is a deliberate
opt-in: you enable it, you press *Download*, and only then does a voice (English or German) arrive
on your disk.

<p align="center"><img src="https://git.jkaindl.de/jkaindl/audio-interface/raw/branch/main/docs/images/hero.png" width="820" alt="A note titled Mailbox greeting in reading view: three short paragraphs of a generic phone greeting and, below them, the embedded audio player of the exported WAV file"></p>

## Features

- **Read aloud** the current note or selection with your system voices — start, pause/resume and
  stop from the command palette, the ribbon icon or the status bar. Nothing to set up.
- **Export as WAV** with a downloadable voice — **English** (Piper, *LJSpeech*) or **German**
  (Piper, *Thorsten*), medium quality, switchable in the settings. Choose the
  **phone-system profile** (8 kHz mono 16 bit — what PBX mailboxes such as 3CX expect) or the
  voice's native 22.05 kHz. Files land next to the note or in a folder of your choice and are never
  overwritten.
- **Read aloud with the downloaded voice** instead of the system voice, once it is there.
- **Speech-ready text:** frontmatter, code blocks, images/embeds and comments are skipped; links
  speak their display text; headings, lists, tables and callouts are read with natural pauses.
- **Honest network use:** one download, from this repository's release, only after your click,
  verified against checksums, removable again — see [How it works](#how-it-works).

## Requirements

- **Obsidian 1.8.7 or newer, desktop** (macOS, Windows, Linux). `isDesktopOnly` is set — the
  synthesis worker and the browser cache the voice lives in are not reliable on mobile.
- **Reading aloud** uses the voices of your operating system. If no German voice is listed, install
  one in the OS (macOS: System Settings → Accessibility → Spoken Content → System voice).
- **WAV export** needs about 80 MB of free disk space for the first voice and its runtime; a second
  voice adds about 60 MB, because the runtime is shared.

## Install

### Community Plugins
The plugin has been submitted to the Obsidian community directory; once listed:
Settings → Community plugins → Browse → search “Audio Interface”.

### Manual
Copy `main.js`, `manifest.json` and `styles.css` from the
[latest release](https://git.jkaindl.de/jkaindl/audio-interface/releases) into
`<vault>/.obsidian/plugins/audio-interface/`, then enable the plugin.

### BRAT (beta)
Add the GitHub mirror `johannes-kaindl/audio-interface` in
[BRAT](https://github.com/TfTHacker/obsidian42-brat).

### From source
```bash
git clone https://git.jkaindl.de/jkaindl/audio-interface
cd audio-interface && npm install && npm run build
# main.js manifest.json styles.css → <vault>/.obsidian/plugins/audio-interface/
```

## Usage

1. Open a note and run **Read note aloud** (command palette, or the ribbon icon). Select some text
   first and use **Read selection aloud** for just that part.
2. **Pause / resume reading** and **Stop reading / cancel export** are commands too — or click the
   status bar item, which shows the progress while the plugin speaks.
3. To export: enable WAV export in the settings and download the voice (see below). The commands
   **Export note as WAV** and **Export selection as WAV** appear in the palette as soon as the voice
   is ready. The file is written next to the note (or into your target folder), and a notice tells
   you where.

<img src="https://git.jkaindl.de/jkaindl/audio-interface/raw/branch/main/docs/images/command-palette.png" width="820" alt="The command palette filtered to Audio Interface, listing all six commands: read note aloud, export note as WAV, read selection aloud, pause / resume reading, export selection as WAV, stop reading / cancel export">

| | |
|---|---|
| <a href="https://git.jkaindl.de/jkaindl/audio-interface/raw/branch/main/docs/images/status-bar.png"><img src="https://git.jkaindl.de/jkaindl/audio-interface/raw/branch/main/docs/images/thumbs/status-bar.png" width="380" alt="The Obsidian status bar in the lower right corner showing the entry Reading 1/5 while a note is read aloud"></a> | The status bar item shows what is happening — *Reading 1/5*, *Rendering 2/9*, *Downloading 12/78 MB* — and a click stops it. |

### Configuration

| Setting | What it does | Default |
|---|---|---|
| Voice | Which system voice reads aloud; *Automatic* picks the first German one | Automatic |
| Rate | Speech rate for reading aloud (0.5×–2×) | 1.0× |
| Read aloud with the downloaded voice | Use the Piper voice instead of the system voice for reading aloud (only shown once the voice is ready) | off |
| Enable WAV export | Reveals the voice row and the export settings — downloads nothing by itself | off |
| Voice for export | Which downloadable voice speaks: *Piper · LJSpeech (en_US)* or *Piper · Thorsten (de_DE)*. Each entry shows what it still costs to download, or *downloaded* | follows Obsidian's display language |
| Piper · … (the selected voice) | The voice row: size, source and licenses, with **Download** / **Cancel** / **Remove** | not downloaded |
| Output profile | *Phone system — 8 kHz mono* or *Native (voice sample rate)* | Phone system |
| Target folder | Vault folder for the WAV files; empty = next to the note | empty |
| File name pattern | `{{note}}` and `{{date}}` are replaced; existing files get `-2`, `-3`, … | `{{note}}` |
| Insert link into note | Append `![[file.wav]]` at the cursor after a successful export | off |

<img src="https://git.jkaindl.de/jkaindl/audio-interface/raw/branch/main/docs/images/settings.png" width="820" alt="The plugin settings tab with three groups: Read aloud (voice, rate, read aloud with the downloaded voice), Voice-over and export (enable WAV export, the Piper Thorsten voice row marked Ready with a Remove button, output profile, target folder, file name pattern, insert link into note) and Local service">

## How it works

**Reading aloud** uses the browser's speech synthesis inside Obsidian — your operating system's
voices, sentence by sentence, with pauses derived from the note's structure. No audio data is
produced, which is also why system voices cannot export a file.

**WAV export is an opt-in.** Out of the box the plugin downloads **nothing**. When you enable export
and press **Download**, it fetches these files **once, from this repository's GitHub release**
(`https://github.com/johannes-kaindl/audio-interface/releases`); no other server is contacted:

| File | Size | What it is | License |
|---|---|---|---|
| `piper-worker.js` | ≈ 3 MB | Synthesis worker (Piper pipeline, eSpeak-NG phonemizer as WASM, English + German dictionaries) | AGPL-3.0-or-later; contains ephone/eSpeak-NG (GPL-3.0-or-later), onnxruntime-web (MIT) |
| `ort-wasm-simd-threaded.wasm` | ≈ 13 MB | ONNX Runtime Web (CPU) | MIT |
| `en_US-ljspeech-medium.onnx` + `.json` | ≈ 61 MB | Piper voice *LJSpeech* (English, 22.05 kHz) | dataset public domain |
| `de_DE-thorsten-medium.onnx` + `.json` | ≈ 60 MB | Piper voice *Thorsten* (German, 22.05 kHz) | dataset CC0 |

Only the voice you selected is fetched — the first two files are shared, so a second voice costs
just its model.

<table><tr>
<td><a href="https://git.jkaindl.de/jkaindl/audio-interface/raw/branch/main/docs/images/download.png"><img src="https://git.jkaindl.de/jkaindl/audio-interface/raw/branch/main/docs/images/thumbs/download.png" width="380" alt="The voice row in the settings before the download: name Piper Thorsten, a description with size, source and licenses, and a Download button showing 75.2 MB"></a></td>
<td>Every file is checked against a <b>SHA-256 checksum embedded in the plugin</b> before it is used; a mismatch disables the voice and names the file. The files live in the browser cache of the Obsidian app, <b>outside your vault</b> — never synced, never in your files — and <b>Remove</b> deletes them again. The download can be cancelled; partial downloads resume.</td>
</tr></table>

Synthesis then runs in a Web Worker inside Obsidian (ONNX Runtime, CPU), the result is resampled
to the chosen profile, encoded as 16-bit WAV and written through Obsidian's vault API. There is no
telemetry and no other network access. Architecture and measurements: [`AGENTS.md`](AGENTS.md).

## Roadmap

Dictation (speech-to-text) and connecting to a local speech service for higher-quality voices are
planned for later releases; the settings already reserve a place for it.

## Contributing

Issues and pull requests on [git.jkaindl.de](https://git.jkaindl.de/jkaindl/audio-interface).
Test-driven (`npm run gate`); larger features via brainstorm → spec → plan → TDD
(`docs/superpowers/`). See [`AGENTS.md`](AGENTS.md).

## License

- **Code:** AGPL-3.0-or-later ([`LICENSE`](LICENSE)).
- **Third-party:** onnxruntime-web (MIT), ephone/eSpeak-NG (GPL-3.0-or-later), Piper voices
  *LJSpeech* (dataset public domain) and *Thorsten* (dataset CC0) — shipped as release assets, see
  the table above.

Copyright © 2026 Johannes Kaindl.
