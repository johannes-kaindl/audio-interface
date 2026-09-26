# Troubleshooting

Each entry starts with what you see — the wording is the plugin's own English text (a German Obsidian shows the German equivalents) — then the cause and what to do. If yours is not here, see [Getting help](#getting-help).

## Open a Markdown note first

> Open a Markdown note first.

**Cause:** no Markdown note is active — a canvas, an image or an empty tab has the focus.

**Fix:** click into the note and run the command again.

## Select some text first

> Select some text first.

**Cause:** you ran **Read selection aloud** or **Export selection as WAV** without a selection.

**Fix:** select the passage, or use **Read note aloud** / **Export note as WAV** for the whole note.

## Nothing to read

> Nothing to read — the note has no spoken text.

**Cause:** after frontmatter, code blocks, images, embeds and comments are removed, nothing is left to speak.

**Fix:** check that the note has ordinary text; a note that only embeds other notes has none of its own.

## No system voices found

> No system voices found — install one in your operating system.

**Cause:** reading aloud uses the voices of your operating system, and none is installed or visible to Obsidian. If only non-German voices exist, *Automatic* has no German voice to pick.

**Fix:** install a voice in the operating system (macOS: *System Settings → Accessibility → Spoken Content → System voice*), restart Obsidian, and pick it under **Voice**. Or use the downloaded voice: switch on **Read aloud with the downloaded voice**.

## Reading aloud failed

> Reading aloud failed: …

**Cause:** the speech engine reported an error; the text after the colon says which.

**Fix:** try another system voice under **Voice**. If it persists, restart Obsidian and include the message when you [ask for help](#getting-help).

## The export commands are missing

**Cause:** **Export note as WAV** and **Export selection as WAV** appear in the command palette only when export is enabled, the voice is downloaded and ready, a Markdown note is open and no export is running already. The voice condition is on purpose: a listed command that always fails would be worse.

**Fix:** *Settings* → *Audio Interface* → switch on **Enable WAV export**, then press **Download** and wait for **Ready · v…**.

## The downloadable voice is not ready

> The downloadable voice is not ready — check the plugin settings.

**Cause:** you started an export, or reading with the downloaded voice, while the voice is missing, still downloading or unusable.

**Fix:** open the voice row in the settings. It says what to do: **Download**, *Partially downloaded — resume*, or the reason after *Unavailable: …*.

## Unavailable / download stops

> Unavailable: …

> Partially downloaded — resume

**Cause:** the download was interrupted (network, sleep, a closed window), or a file did not match its built-in checksum — in that case the voice is disabled and the message names the file. The files come from this repository's release on the maintainer's Forgejo server; if that server is not reachable, the download cannot start.

**Fix:** press **Retry** or **Download** again — partial downloads resume where they stopped. If the checksum message persists, press **Remove** and download again; if it still persists, [open an issue](#getting-help) with the file name from the message.

## Export failed

> Export failed: …

**Cause:** synthesis or writing the file failed; the text after the colon says which. Frequent reasons: the target folder cannot be created, or the voice was removed during the run.

**Fix:** check **Target folder** (or leave it empty to save next to the note) and that the voice row shows **Ready**, then try again.

## Export cancelled

> Export cancelled.

**Cause:** you ran **Stop reading / cancel export** or clicked the status bar item while the export was running.

**Fix:** none needed; run **Export note as WAV** again. Files that already exist are never overwritten — a new one gets `-2`, `-3` and so on.

## The transcription program is not answering

> The transcription program on this computer is not answering. Start it, or check its address in the plugin settings.

**Cause:** **Turn audio files into text** is on, but nothing listens at **Address of the program** (default `http://127.0.0.1:8765`). The plugin never starts or installs the program itself.

**Fix:** start the companion program ([audio-ui](https://git.jkaindl.de/jkaindl/audio-ui)) on this computer, or correct the address. Only addresses on this computer (`127.0.0.1`, `localhost`, `[::1]`) are accepted; anything else falls back to the default.

> The transcription program is running but not ready yet: …

**Cause:** the program is up but still loading its speech model.

**Fix:** wait a moment and try **Transcribe audio** again.

> Transcription failed: …

**Fix:** the text after the colon names the reason; try the file again and include the message when you [ask for help](#getting-help).

## The "Transcribe audio" entry is missing

**Cause:** the entry appears in the context menu of audio files only when **Turn audio files into text** is switched on; it is off by default.

**Fix:** *Settings* → *Audio Interface* → **Transcribe (speech to text)** → switch it on, then right-click the audio file.

## Getting help

Still stuck? [Open an issue](https://github.com/johannes-kaindl/audio-interface/issues) with your Obsidian version, the plugin version (*Settings* → *Community plugins*), your operating system and what you expected to happen.
