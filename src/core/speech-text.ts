// Markdown → Sprech-Chunks. Pur.
// Regeln orientiert an voicelab/markdown.py (40_Tools/TTS, `strip_markdown`/`chunk`) — dort als
// Python-Fassung; hier neu geschrieben, weil das Ergebnis Chunks MIT Pausen sind, kein Fließtext.

export interface SpeechChunk {
  text: string;
  /** Stille nach diesem Chunk (Piper: Samples; Systemstimme: Timer zwischen Utterances). */
  pauseAfterMs: number;
}

export const PAUSE_MS = { sentence: 250, paragraph: 600, heading: 900 } as const;

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const FENCE = /```[\s\S]*?```/g;
const COMMENT = /%%[\s\S]*?%%/g;
const HTML_TAG = /<\/?[a-zA-Z][^>]*>/g;
const EMBED = /!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g;
const WIKILINK = /\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
const MDLINK = /\[([^\]]*)\]\([^)]*\)/g;
const HRULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const CALLOUT = /^\s*>\s*\[!([^\]]+)\][+-]?\s*(.*)$/;
const QUOTE_MARK = /^\s*>\s?/;
const LIST = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function inline(s: string): string {
  const out = s
    .replace(EMBED, "")
    .replace(WIKILINK, (_m, target: string, alias?: string) => {
      const name = target.split("/").pop() ?? target;
      return (alias ?? name).trim();
    })
    .replace(MDLINK, "$1")
    .replace(HTML_TAG, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^\w])\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1$2")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
  return out.replace(/\s+/g, " ").trim();
}

/** Abkürzungen, nach denen trotz Punkt + Großbuchstabe kein Satzende liegt (deutsch/englisch, klein). */
const ABBREVIATIONS = new Set([
  "dr", "prof", "hr", "fr", "frau", "herr", "nr", "no", "z.b", "bzw", "ca", "evtl", "ggf", "usw", "u.a", "str", "st",
  "tel", "abs", "art", "bd", "d.h", "etc", "vs", "inkl", "exkl", "max", "min", "mr", "mrs", "ms", "e.g", "i.e", "vgl", "sog",
]);

function endsWithAbbreviation(piece: string): boolean {
  const m = piece.match(/([\p{L}.]+)\.$/u);
  if (!m) return false;
  const word = m[1].toLowerCase();
  return ABBREVIATIONS.has(word) || /^\p{L}$/u.test(word); // Initialen wie „J."
}

/** Satzgrenzen: Satzzeichen, dann Leerraum, dann Großbuchstabe/Ziffer/Anführung. „8.30 Uhr" bleibt
 *  zusammen (kein Leerraum nach dem Punkt), „Dr. Müller" über die Abkürzungsliste. */
export function splitSentences(paragraph: string): string[] {
  const trimmed = paragraph.trim();
  if (!trimmed) return [];
  const pieces = trimmed
    .split(/(?<=[.!?…])\s+(?=[A-ZÄÖÜ0-9„"'“(\[])/u)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const piece of pieces) {
    const prev = out[out.length - 1];
    if (prev !== undefined && endsWithAbbreviation(prev)) out[out.length - 1] = `${prev} ${piece}`;
    else out.push(piece);
  }
  return out;
}

export function prepareSpeech(markdown: string): SpeechChunk[] {
  const body = markdown.replace(FRONTMATTER, "").replace(FENCE, "").replace(COMMENT, "");
  const chunks: SpeechChunk[] = [];
  let para: string[] = [];

  const push = (text: string, pauseAfterMs: number): void => {
    if (text) chunks.push({ text, pauseAfterMs });
  };
  const flushPara = (): void => {
    const text = inline(para.join(" "));
    para = [];
    if (!text) return;
    const sentences = splitSentences(text);
    sentences.forEach((s, i) => push(s, i === sentences.length - 1 ? PAUSE_MS.paragraph : PAUSE_MS.sentence));
  };

  for (const raw of body.split(/\r?\n/)) {
    const callout = raw.match(CALLOUT);
    if (callout) {
      flushPara();
      push(inline(callout[2]) || callout[1].trim(), PAUSE_MS.heading);
      continue;
    }
    const line = raw.replace(QUOTE_MARK, "");
    if (line.trim() === "" || HRULE.test(line)) {
      flushPara();
      continue;
    }
    const h = line.match(HEADING);
    if (h) {
      flushPara();
      push(inline(h[2]), PAUSE_MS.heading);
      continue;
    }
    if (TABLE_SEP.test(line)) continue;
    if (TABLE_ROW.test(line)) {
      flushPara();
      const cells = line.split("|").map((c) => inline(c)).filter(Boolean);
      push(cells.join(", "), PAUSE_MS.sentence);
      continue;
    }
    const li = line.match(LIST);
    if (li) {
      flushPara();
      push(inline(li[1]), PAUSE_MS.sentence);
      continue;
    }
    para.push(line);
  }
  flushPara();
  return chunks;
}
