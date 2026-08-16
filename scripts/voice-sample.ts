// Hörprobe/Gegenprobe einer Piper-Stimme in Node — dieselbe Kette wie der Worker
// (ephone → Phonem-Ids → onnxruntime-web → WAV), nur ohne Obsidian.
//
// Wozu: eine Stimme wird nach Gehör gewählt, nicht nach Lizenztabelle. Das Skript rendert denselben
// Text mit beliebig vielen Kandidaten, damit die Entscheidung an Dateien hängt statt an Erinnerung.
// Es beweist nebenbei, dass Sprachpaket und `espeak.voice` einer Stimme zusammenpassen — der Fehler,
// der sonst erst im Renderer auffällt.
//
//   npm run voice:sample -- <stimme> <ziel.wav> [--dir dist-assets] [--tempo 0.85] [--de]
//
// <stimme> ist der Piper-Dateiname ohne Endung (z. B. en_US-ljspeech-medium); im --dir müssen
// <stimme>.onnx und <stimme>.onnx.json liegen (dist-assets nach `npm run assets`, sonst von
// huggingface.co/rhasspy/piper-voices geladen). --de nimmt den deutschen Beispieltext.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv, env, exit } from "node:process";

import createEphone from "ephone";
import { loadData as loadGmw } from "ephone/lang/gmw.js";
import { loadData as loadEnAll } from "ephone/lang/en-all.js";
import * as ort from "onnxruntime-web/wasm";

import { ipaToIds, langPackFor, parsePiperConfig } from "../src/core/piper-phonemes.js";

const TEXTE = {
  en: [
    "Hello, you have reached the mailbox of Example Company.",
    "Our office hours are Monday to Friday, nine to five.",
    "Please leave your name, your number and a short message after the tone.",
    "We will call you back as soon as possible. Thank you.",
  ],
  de: [
    "Guten Tag, Sie erreichen die Mailbox der Beispielfirma.",
    "Unsere Bürozeiten sind Montag bis Freitag, neun bis siebzehn Uhr.",
    "Bitte hinterlassen Sie Ihren Namen, Ihre Nummer und eine kurze Nachricht nach dem Signalton.",
    "Wir rufen Sie so bald wie möglich zurück. Vielen Dank.",
  ],
};
const PAUSE_S = 0.35;
const LANG_PACKS = { gmw: loadGmw, "en-all": loadEnAll } as const;

const flag = (name: string, def: string): string => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const [voice, outFile] = argv.slice(2).filter((a) => !a.startsWith("--"));
if (!voice || !outFile) { console.error("Aufruf: npm run voice:sample -- <stimme> <ziel.wav> [--dir …] [--tempo …] [--de]"); exit(2); }
const dir = flag("--dir", env.VOICE_DIR ?? "dist-assets");
const tempo = Number(flag("--tempo", "1"));
const saetze = argv.includes("--de") ? TEXTE.de : TEXTE.en;

const cfg = parsePiperConfig(JSON.parse(readFileSync(join(dir, `${voice}.onnx.json`), "utf8")));
ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

const eph = await createEphone({ languages: [async (m: unknown) => LANG_PACKS[langPackFor(cfg.espeak.voice)](m)] });
eph.setVoice(cfg.espeak.voice);
const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(join(dir, `${voice}.onnx`))), { executionProviders: ["wasm"] });

const sr = cfg.audio.sample_rate;
const pause = new Float32Array(Math.round(sr * PAUSE_S));
const teile: Float32Array[] = [];
const t0 = Date.now();
for (const text of saetze) {
  const { ids } = ipaToIds(eph.textToIpa(text), cfg.phoneme_id_map);
  const out = await session.run({
    input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor("float32", Float32Array.from([cfg.inference.noise_scale, cfg.inference.length_scale * tempo, cfg.inference.noise_w]), [3]),
  });
  teile.push(out.output.data as Float32Array, pause);
}
const pcm = new Float32Array(teile.reduce((n: number, p: Float32Array) => n + p.length, 0));
let o = 0; for (const p of teile) { pcm.set(p, o); o += p.length; }

// 16-bit-Mono-WAV, auf 0,95 normalisiert (wie der Export).
const buf = Buffer.alloc(44 + pcm.length * 2);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + pcm.length * 2, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(pcm.length * 2, 40);
let peak = 0; for (const v of pcm) peak = Math.max(peak, Math.abs(v));
const gain = peak > 0 ? 0.95 / peak : 1;
for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm[i] * gain * 32767))), 44 + i * 2);
writeFileSync(outFile, buf);

const s = pcm.length / sr;
console.log(`${voice} · espeak ${cfg.espeak.voice} · Paket ${langPackFor(cfg.espeak.voice)} · ${sr} Hz · Tempo ${tempo} → ${s.toFixed(1)} s in ${((Date.now() - t0) / 1000).toFixed(1)} s (RTF ${(((Date.now() - t0) / 1000) / s).toFixed(2)}) → ${outFile}`);
