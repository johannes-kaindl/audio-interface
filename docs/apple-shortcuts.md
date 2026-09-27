# Set up the Apple Shortcut (mobile transcription and spoken-word files)

How-to. For the concept behind it, the shared setup guide, and the exact shortcut names and versions, see [uplink.jkaindl.de/apple-shortcuts](https://uplink.jkaindl.de/apple-shortcuts) — this page only covers the plugin-specific settings.

On iOS/iPadOS there is no local companion program, so the two Apple Shortcuts are the only way to transcribe audio or turn text into a spoken-word file on mobile. They also work on the desktop, as a second option next to the local `audio-ui` program and the downloaded voice.

## Get the shortcuts

Follow the shared guide above — it lists the current shortcut names, an iCloud link to import them directly, and a copy-paste prompt if you'd rather build them yourself in the Shortcuts app.

## Turn on the shortcut backend

**Transcription:** *Settings* → *Audio Interface* → **Transcribe (speech to text)** → **Backend** → **Apple Shortcut (works on mobile)**. Check **Shortcut name** matches the name in the Shortcuts app exactly (default `Transcribe Audio (Obsidian)`).

**Spoken-word files:** *Settings* → *Audio Interface* → **Spoken-word file (Apple Shortcut)** → switch on **Enable spoken-word file via Shortcut**. Check **Shortcut name** (default `Speak Text (Obsidian)`) and, optionally, a **Target folder**.

## Use it

- **Transcription:** right-click an audio file → **Transcribe audio**, same as with the local program.
- **Spoken-word file:** run **Save note as spoken-word file (Shortcut)** or **Save selection as spoken-word file (Shortcut)** from the command palette.

Both switch to the Shortcuts app for a moment and back — this is the only way an Obsidian plugin can reach these on-device capabilities (no streaming, no background processing). "Reduce Motion" in iOS Accessibility settings shortens that switch noticeably.

## Limits worth knowing

- **First use of transcription downloads a speech model.** The very first run needs network access once; after that it works fully offline.
- **The shortcut chooses the file extension**, not the plugin — a spoken-word file may be saved as `.caf` rather than `.m4a` or `.wav`. This is expected.
- **A deleted or broken shortcut never answers.** After the timeout (default 120 seconds, adjustable in the settings), the plugin gives up and shows an error — see [Troubleshooting](troubleshooting.md#the-shortcut-does-not-answer).
- **No streaming, no cancel mid-run.** Stopping only discards the result once it arrives; the shortcut itself keeps running until it finishes or times out.
