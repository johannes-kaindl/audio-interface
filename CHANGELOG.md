# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Added

- **A second downloadable voice: English** (Piper *LJSpeech*, en_US, medium, dataset public domain)
  next to the German *Thorsten*. A new setting **Voice for export** switches between them; it also
  applies to reading aloud with the downloaded voice.
- On first start the voice follows Obsidian's display language (English UI → English voice). A
  choice you have made is never overwritten.

### Changed

- Worker and ONNX runtime are now **shared between voices**: a second voice downloads only its
  model (≈ 60 MB instead of ≈ 75 MB), the voice list shows what each one still costs, and
  **Remove** keeps the shared runtime as long as another voice needs it.
- The synthesis worker carries both eSpeak-NG dictionaries (English and German), ≈ 2.8 MB instead
  of ≈ 2.2 MB; only the one the selected voice needs is loaded at runtime.

## [0.2.0] — 2026-08-16

### Changed

- Factory tempo of the Piper voice is now 0.85× (`length_scale`) for export and for reading aloud
  with the downloaded voice — chosen by listening test; the *Rate* setting still scales relative to it.

## [0.1.1] — 2026-08-16

### Fixed

- The voice download from the GitHub release failed inside Obsidian (`Failed to fetch`): the
  renderer's `fetch` is blocked by CORS on GitHub's redirect. Downloads now go through Obsidian's
  `requestUrl` (per-file timeout 15 min). Progress advances per file rather than per byte, and
  cancelling takes effect between files.
- Cache keys of the downloaded assets no longer depend on the download URL (version + file name),
  so a different source (mirror, local server) never hides an existing download.

### Changed

- Settings: the engine row says “Ready · v0.1.0” instead of repeating the size; the decimal
  separator of sizes follows the UI language.

## [0.1.0] — 2026-08-16

### Added

- Read notes or the current selection aloud with the system voices (`speechSynthesis`):
  start, pause/resume, stop, voice and rate settings, status bar item, ribbon icon.
- WAV export as an **opt-in**: enable it in the settings, then press *Download* to fetch the
  German Piper voice (`de_DE-thorsten-medium`) plus its runtime (ONNX Runtime WASM, eSpeak-NG
  phonemizer) from this repository's GitHub release — nothing is downloaded before that click.
  Assets are verified against SHA-256 checksums embedded in `main.js`, kept in the browser
  cache outside the vault, and can be removed again from the settings.
- Output profiles: *phone system* (8 kHz mono 16 bit, e.g. for 3CX mailboxes) or the voice's
  native 22.05 kHz; target folder, file-name pattern (`{{note}}`, `{{date}}`), optional link
  insertion; files are never overwritten (`-2`, `-3` suffixes).
- Optionally read aloud with the downloaded voice instead of the system voice.
- Markdown is turned into speech text before synthesis: frontmatter, code blocks, embeds and
  comments are dropped; links speak their display text; headings, lists, tables and callouts
  become chunks with natural pauses.
