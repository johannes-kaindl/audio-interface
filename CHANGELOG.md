# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

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
