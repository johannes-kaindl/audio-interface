#!/usr/bin/env python3
"""Liest die Obsidian-Community-Scorecard eines Plugins aus der gerenderten Seite."""
import re, sys, json, urllib.request

STUFEN = ("pass", "info", "low", "medium", "high", "critical")

def hole(plugin_id: str) -> str:
    req = urllib.request.Request(
        f"https://community.obsidian.md/plugins/{plugin_id}",
        headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"},
    )
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")

def scorecard(html: str) -> dict:
    # Die Noten stehen als <span>-Paare hinter den Überschriften Health/Review.
    noten = {}
    for feld in ("Health", "Review"):
        m = re.search(rf'>{feld}</span><span class="text-([a-z]+)-\d+">([^<]+)</span>', html)
        if m:
            noten[feld] = {"note": m.group(2), "farbe": m.group(1)}
    # Die Kurztexte neben den Noten enthalten Inline-Markup und lassen sich nicht
    # verlaesslich per Regex fassen — nur der Befund-Zaehler wird uebernommen.
    zusammenfassung = {}
    m = re.search(r'>(\d+ issues? found[^<]*)<', html) or re.search(r'>(No issues found[^<]*)<', html)
    if m:
        zusammenfassung["Review"] = m.group(1)
    # Befunde tragen React-Keys der Form  "<stufe>:<n>:<Text>"
    befunde = {s: [] for s in STUFEN}
    muster = rf'\\"({"|".join(STUFEN)}):\d+:(.*?)\\",'
    for stufe, text in re.findall(muster, html):
        text = text.replace('\\"', '"').replace("\\\\", "\\").strip()
        if text and text not in befunde[stufe]:
            befunde[stufe].append(text)
    return {"noten": noten, "zusammenfassung": zusammenfassung,
            "befunde": {k: v for k, v in befunde.items() if v}}

if __name__ == "__main__":
    for pid in sys.argv[1:]:
        d = scorecard(hole(pid))
        print(f"\n{'='*90}\n{pid}\n{'='*90}")
        print(json.dumps(d, ensure_ascii=False, indent=2))
