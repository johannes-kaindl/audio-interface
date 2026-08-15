import { describe, expect, it } from "vitest";
import { PAUSE_MS, prepareSpeech, splitSentences } from "../../src/core/speech-text";

const texts = (md: string) => prepareSpeech(md).map((c) => c.text);

describe("prepareSpeech", () => {
  it("entfernt Frontmatter und liefert nichts für Notizen ohne Text", () => {
    expect(prepareSpeech("---\ntitle: x\n---\n")).toEqual([]);
    expect(prepareSpeech("")).toEqual([]);
    expect(texts("---\ntitle: x\n---\nHallo Welt.")).toEqual(["Hallo Welt."]);
  });
  it("Überschrift wird eigener Chunk mit langer Pause, Marker weg", () => {
    const c = prepareSpeech("## Ansage\n\nGuten Tag.");
    expect(c[0]).toEqual({ text: "Ansage", pauseAfterMs: PAUSE_MS.heading });
    expect(c[1]).toEqual({ text: "Guten Tag.", pauseAfterMs: PAUSE_MS.paragraph });
  });
  it("Sätze im Absatz: kurze Pause, letzter Satz Absatzpause", () => {
    const c = prepareSpeech("Erster Satz. Zweiter Satz! Dritter?");
    expect(c.map((x) => x.text)).toEqual(["Erster Satz.", "Zweiter Satz!", "Dritter?"]);
    expect(c.map((x) => x.pauseAfterMs)).toEqual([PAUSE_MS.sentence, PAUSE_MS.sentence, PAUSE_MS.paragraph]);
  });
  it("Links → Anzeigetext, Bilder/Embeds/Codeblöcke/Kommentare/HTML weg", () => {
    const md = [
      "Siehe [[Pfad/Notiz#Abschnitt|die Notiz]] und [[Andere]] sowie [Seite](https://x.y).",
      "", "![[bild.png]]", "", "![alt](a.png)", "", "```js\ncode();\n```", "", "%% geheim %%", "", "<span>tag</span> bleibt.",
    ].join("\n");
    expect(texts(md)).toEqual(["Siehe die Notiz und Andere sowie Seite.", "tag bleibt."]);
  });
  it("Wikilink mit Pfad ohne Alias spricht nur den Namen", () => {
    expect(texts("[[Ordner/Unter/Name]] hier")).toEqual(["Name hier"]);
  });
  it("Listen: Marker/Checkboxen weg, jeder Punkt ein Chunk mit kurzer Pause", () => {
    expect(texts("- eins\n- [ ] zwei\n1. drei\n* vier\n- [x] fünf")).toEqual(["eins", "zwei", "drei", "vier", "fünf"]);
    expect(prepareSpeech("- eins\n- zwei")[0].pauseAfterMs).toBe(PAUSE_MS.sentence);
  });
  it("Tabellen: Trennzeile weg, Zellen mit Komma", () => {
    expect(texts("| A | B |\n|---|---|\n| 1 | 2 |")).toEqual(["A, B", "1, 2"]);
  });
  it("Callouts: Marker weg, Titel wird Überschrift; Blockquote-Zeichen weg", () => {
    const c = prepareSpeech("> [!info] Wichtig\n> Text hier.");
    expect(c.map((x) => x.text)).toEqual(["Wichtig", "Text hier."]);
    expect(c[0].pauseAfterMs).toBe(PAUSE_MS.heading);
    expect(texts("> [!warning]\n> Nur Text.")).toEqual(["warning", "Nur Text."]);
    expect(texts("> Zitat.")).toEqual(["Zitat."]);
  });
  it("Hervorhebungen und Inline-Code werden nackt, Trennlinien weg", () => {
    expect(texts("**fett** und *kursiv* und ==mark== und ~~weg~~ und `code`\n\n---\n\nEnde.")).toEqual([
      "fett und kursiv und mark und weg und code",
      "Ende.",
    ]);
    expect(texts("__stark__ und _leise_")).toEqual(["stark und leise"]);
    expect(texts("snake_case bleibt_ganz")).toEqual(["snake_case bleibt_ganz"]);
  });
  it("Whitespace wird zusammengezogen, Zeilenumbruch im Absatz ist ein Leerzeichen", () => {
    expect(texts("Ein   Text\nmit Umbruch.")).toEqual(["Ein Text mit Umbruch."]);
  });
  it("Absätze ohne Satzzeichen bleiben ein Chunk mit Absatzpause", () => {
    expect(prepareSpeech("Nur Worte ohne Punkt")).toEqual([{ text: "Nur Worte ohne Punkt", pauseAfterMs: PAUSE_MS.paragraph }]);
  });
});

describe("splitSentences", () => {
  it("trennt an .!? vor Leerraum + Großbuchstabe/Zahl, behält Satzzeichen", () => {
    expect(splitSentences("Hallo Dr. Müller. Wie geht es? Gut!")).toEqual(["Hallo Dr. Müller.", "Wie geht es?", "Gut!"]);
    expect(splitSentences("Ohne Punkt")).toEqual(["Ohne Punkt"]);
    expect(splitSentences("Um 8.30 Uhr los. Dann Ende.")).toEqual(["Um 8.30 Uhr los.", "Dann Ende."]);
    expect(splitSentences("")).toEqual([]);
  });
});
