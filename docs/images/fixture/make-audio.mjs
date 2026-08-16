#!/usr/bin/env node
// Erzeugt die Audio-Datei, die die Fixture-Notiz einbettet: eine kurze, leise Sinus-Sequenz als
// 8-kHz-Mono-WAV (dasselbe Format, das der Export mit Profil „Telefonanlage" schreibt). Kein
// Sprach-Audio — im Bild ist nur der Player zu sehen; das Fixture bleibt so klein und diffbar.
// Aufruf: node make-audio.mjs <vault-dir>
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const vault = process.argv[2];
if (!vault) throw new Error("Vault-Verzeichnis fehlt");
const rate = 8000;
const seconds = 6.5;
const n = Math.round(rate * seconds);
const pcm = new Int16Array(n);
for (let i = 0; i < n; i++) {
  const t = i / rate;
  const env = Math.min(1, t * 4, (seconds - t) * 4);
  pcm[i] = Math.round(0.2 * 32767 * env * Math.sin(2 * Math.PI * (220 + 40 * Math.sin(t)) * t));
}
const buf = Buffer.alloc(44 + n * 2);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
Buffer.from(pcm.buffer).copy(buf, 44);
const out = join(vault, "Mailbox greeting.wav");
writeFileSync(out, buf);
console.log(`${out} (${buf.length} B, ${rate} Hz, ${seconds} s)`);
