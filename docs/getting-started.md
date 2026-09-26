# Getting started

This walks you from the install to your first note read aloud, and then to a WAV file of it — a mailbox greeting, say. Reading aloud needs nothing but the plugin. The WAV export is an opt-in that downloads one voice, about 76 MB. Audio Interface is desktop-only.

## 1. Install

Follow the [Install section of the README](https://github.com/johannes-kaindl/audio-interface/blob/main/README.md#install) and enable the plugin under *Settings* → *Community plugins*.

## 2. Read a note aloud

Open any note and click the ribbon icon **Read note aloud** (the audio-lines icon), or run the command **Read note aloud** from the command palette. The status bar item at the bottom right shows **Reading 1/5** and so on; click it to stop.

To read only a passage, select it first and run **Read selection aloud**. **Pause / resume reading** and **Stop reading / cancel export** are commands as well.

Frontmatter, code blocks, images, embeds and comments are skipped; you hear the text. With **Voice** left on *Automatic*, the first German system voice speaks. If none is listed, see [Troubleshooting](troubleshooting.md#no-system-voices-found).

## 3. Turn it into a WAV file

1. Open *Settings* → *Audio Interface* → **Voice-over & export** and switch on **Enable WAV export**. Nothing is downloaded yet.
2. Under **Voice for export** pick *Piper · LJSpeech (en_US)* or *Piper · Thorsten (de_DE)*.
3. Press **Download** in the voice row below. The button shows the size, the row then counts *Downloading …/… MB…* and ends at **Ready · v…**.
4. Open a note and run **Export note as WAV**. A notice tells you where the file went: **WAV saved: … (… s, … Hz)**.

You should now find the `.wav` next to your note — or in your **Target folder**, if you set one. The default **Output profile** is *Phone system — 8 kHz mono*, which is what phone-system mailboxes such as 3CX expect; choose *Native (voice sample rate)* for the voice's own quality.

## Where next

- **Insert link into note** adds `![[file.wav]]` at the cursor after every export, so the note carries an audio player.
- **Read aloud with the downloaded voice** uses the Piper voice instead of the system voice for reading.
- Turn audio files into text with **Transcribe audio** — an optional companion program is needed; the README explains what is sent where.
- Something went differently? See [Troubleshooting](troubleshooting.md).
