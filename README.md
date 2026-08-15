# Audio Interface

Read your notes aloud and turn them into WAV files — locally, with no cloud, no account, no
Python. *([Deutsche Fassung](README.de.md))*

## What it does

- **Read aloud** the current note or selection with the voices installed on your computer.
  Start, pause/resume, stop from the command palette, the ribbon icon or the status bar. Works
  immediately after installing — nothing to set up.
- **Export as WAV** with a downloadable German voice (Piper, *Thorsten*, medium quality). Choose
  the **phone-system profile** (8 kHz mono 16 bit — what PBX mailboxes such as 3CX expect) or the
  voice's native 22.05 kHz. Files land next to the note or in a folder of your choice and are
  never overwritten.
- Optionally read aloud with the downloaded voice instead of the system voice.

Markdown is turned into speech text first: frontmatter, code blocks, images/embeds and comments
are skipped; links speak their display text; headings, lists, tables and callouts are spoken
with natural pauses.

## WAV export is an opt-in — what gets downloaded, and from where

Out of the box the plugin only reads aloud and downloads **nothing**. WAV export needs a voice
that can produce audio data; system voices cannot. To enable it:

1. Settings → *Voice-over & export* → **Enable WAV export**.
2. Press **Download**. Only then does the plugin fetch these files — **once, from this
   repository's GitHub release** (`https://github.com/johannes-kaindl/audio-interface/releases`),
   no other server is contacted:

| File | Size | What it is | License |
|---|---|---|---|
| `piper-worker.js` | ≈ 2 MB | Synthesis worker (Piper pipeline, eSpeak-NG phonemizer as WASM) | AGPL-3.0-or-later; contains ephone/eSpeak-NG (GPL-3.0-or-later), onnxruntime-web (MIT) |
| `ort-wasm-simd-threaded.wasm` | ≈ 13 MB | ONNX Runtime Web (CPU) | MIT |
| `de_DE-thorsten-medium.onnx` + `.json` | ≈ 60 MB | Piper voice *Thorsten* (German, 22.05 kHz) | dataset CC0 |

- Every file is checked against a **SHA-256 checksum embedded in the plugin** before it is used;
  a mismatch disables the voice and tells you which file failed.
- The files are stored in the browser cache of the Obsidian app, **outside your vault** — they
  are never synced and never appear in your files. **Remove** deletes them again from the settings.
- The download runs only after your click and can be cancelled; partial downloads resume.

Nothing else touches the network. There is no telemetry.

## Commands

| Command | |
|---|---|
| Read note aloud / Read selection aloud | system voice or, if enabled, the downloaded voice |
| Pause / resume reading · Stop | also: click the status bar item |
| Export note as WAV / Export selection as WAV | shown only when the downloaded voice is ready |

## Requirements

Desktop only (Obsidian ≥ 1.8.7). Reading aloud uses the operating system's voices — install a
German voice in your OS if none is listed. Export needs ~80 MB free disk space for the voice.

## Roadmap

Dictation (speech-to-text) and connecting to a local speech service for higher-quality voices
are planned for later releases; the settings already reserve a place for it.

## Development

```bash
npm install
npm run gate          # lint · typecheck · tests · purity · bundle-size
npm run assets        # builds dist-assets/ and regenerates the checksum manifest
npm run smoke:gui -- --vault <vault> --assets http://127.0.0.1:8765   # see docs/SMOKE.md
```

Licensed under AGPL-3.0-or-later. Third-party components: onnxruntime-web (MIT), ephone/eSpeak-NG
(GPL-3.0-or-later), Piper voice *Thorsten* (dataset CC0).
