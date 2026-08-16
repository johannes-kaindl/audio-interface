// Piper-Eingabe: IPA (aus eSpeak-NG) → Phonem-Ids nach `phoneme_id_map` der Stimme. Pur.
// Schema wie piper-phonemize: BOS `^`, dann je Zeichen (id, PAD `_`), zuletzt EOS `$`.

export interface PiperConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  phoneme_id_map: Record<string, number[]>;
}

/** Welches eSpeak-NG-Sprachpaket eine Piper-Stimme braucht. Der Worker bündelt beide Pakete, lädt
 *  aber nur das eine — die Wahl steckt in der Stimmen-Config (`espeak.voice`), nicht in der Engine:
 *  Piper setzt für en_US-Stimmen mal `en-us`, mal `en` (gemessen 2026-08-16 an ljspeech vs. joe).
 *  `gmw` (West-Germanisch) trägt `de`/`nl`, `en-all` alle englischen Varianten. */
export type LangPackId = "gmw" | "en-all";

export function langPackFor(espeakVoice: string): LangPackId {
  const v = espeakVoice.toLowerCase();
  if (v === "en" || v.startsWith("en-") || v.startsWith("en_")) return "en-all";
  return "gmw";
}

const BOS = "^";
const EOS = "$";
const PAD = "_";

export function ipaToIds(ipa: string, map: Record<string, number[]>): { ids: number[]; unknown: string[] } {
  const ids: number[] = [...(map[BOS] ?? [1])];
  const pad = map[PAD] ?? [0];
  const unknown: string[] = [];
  for (const ch of Array.from(ipa)) {
    const m = map[ch];
    if (!m) {
      if (!unknown.includes(ch)) unknown.push(ch);
      continue;
    }
    ids.push(...m, ...pad);
  }
  ids.push(...(map[EOS] ?? [2]));
  return { ids, unknown };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

/** Prüft die Felder, die der Worker braucht — eine fremde/kaputte Config scheitert hier mit Klartext. */
export function parsePiperConfig(json: unknown): PiperConfig {
  if (!isRecord(json)) throw new Error("piper config: not an object");
  const audio = json.audio;
  const espeak = json.espeak;
  const inference = json.inference;
  const map = json.phoneme_id_map;
  if (!isRecord(audio) || typeof audio.sample_rate !== "number") throw new Error("piper config: audio.sample_rate missing");
  if (!isRecord(espeak) || typeof espeak.voice !== "string") throw new Error("piper config: espeak.voice missing");
  if (!isRecord(inference)) throw new Error("piper config: inference missing");
  const num = (k: string, def: number): number => (typeof inference[k] === "number" ? (inference[k]) : def);
  if (!isRecord(map)) throw new Error("piper config: phoneme_id_map missing");
  const idMap: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(map)) {
    if (Array.isArray(v) && v.every((x) => typeof x === "number")) idMap[k] = v;
  }
  return {
    audio: { sample_rate: audio.sample_rate },
    espeak: { voice: espeak.voice },
    inference: { noise_scale: num("noise_scale", 0.667), length_scale: num("length_scale", 1), noise_w: num("noise_w", 0.8) },
    phoneme_id_map: idMap,
  };
}
