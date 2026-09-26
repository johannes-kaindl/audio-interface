#!/bin/sh
# Vendort Kit-Module byte-identisch aus dem Schwester-Repo obsidian-kit (Dach-AGENTS.md, Kit-first).
# Nie von Hand editieren — Skript neu laufen lassen. Zielordner nach Quellbereich getrennt (Kit-README).
#
# Gelesen wird aus einer festen Ref (KIT_REF), nicht aus dem Arbeitsstand des Nachbar-Repos:
# obsidian-kit laeuft weiter (0.28.0 hat die pure-Teilmenge nach code-kit verschoben), und ein
# `cat` aus dessen Arbeitsverzeichnis liefert je nach dessen HEAD etwas anderes oder gar nichts.
# `git show <ref>:<pfad>` ist reproduzierbar und stoert keine parallele Session im Nachbar-Repo.
set -e
KIT=../obsidian-kit
KIT_REF=${KIT_REF:-0.27.0}
# Zweiter Pin, Absicht: help-setting.ts (Hilfe-Zeile, UI-STANDARD 8) kam mit Kit 0.43.0 und haengt an
# keinem anderen Modul — alle uebrigen Module bleiben auf KIT_REF.
KIT_HELP_REF=${KIT_HELP_REF:-0.43.0}
HELP_SHA=$(git -C "$KIT" rev-parse --short "$KIT_HELP_REF^{commit}")
HELP_VER=$(git -C "$KIT" describe --tags --abbrev=0 "$KIT_HELP_REF")
SHA=$(git -C "$KIT" rev-parse "$KIT_REF^{commit}")
VER=$(git -C "$KIT" describe --tags --abbrev=0 "$KIT_REF")
DATE=$(date +%F)
mkdir -p src/vendor/kit src/vendor/kit-obsidian tests/vendor/kit
for f in i18n timeout run-state cache-download settings_schema num vault-path; do
  { printf '%s\n' "// vendored from obsidian-kit, src/pure/$f.ts — do not hand-edit; re-vendor via tools/sync-kit.sh"; git -C "$KIT" show "$KIT_REF:src/pure/$f.ts"; } > "src/vendor/kit/$f.ts"
done
for f in settings_walker folder-suggest clock confirm; do
  { printf '%s\n' "// vendored from obsidian-kit, src/obsidian/$f.ts — do not hand-edit; re-vendor via tools/sync-kit.sh"; git -C "$KIT" show "$KIT_REF:src/obsidian/$f.ts"; } > "src/vendor/kit-obsidian/$f.ts"
done
tmp=src/vendor/kit-obsidian/help-setting.ts.tmp
{ printf '%s\n' "// vendored from obsidian-kit@$HELP_VER, src/obsidian/help-setting.ts — do not hand-edit; re-vendor via tools/sync-kit.sh"; git -C "$KIT" show "$KIT_HELP_REF:src/obsidian/help-setting.ts"; } > "$tmp" && mv "$tmp" src/vendor/kit-obsidian/help-setting.ts
{ printf '%s\n' "// vendored from obsidian-kit, src/testing/obsidian-mock.ts — do not hand-edit; re-vendor via tools/sync-kit.sh"; git -C "$KIT" show "$KIT_REF:src/testing/obsidian-mock.ts"; } > tests/vendor/kit/obsidian-mock.ts
for d in src/vendor/kit src/vendor/kit-obsidian tests/vendor/kit; do
  printf '{\n  "source": "obsidian-kit",\n  "version": "%s",\n  "sha": "%s",\n  "vendored": "%s"\n}\n' "$VER" "$SHA" "$DATE" > "$d/VENDOR.json"
done
printf '{\n  "source": "obsidian-kit",\n  "version": "%s",\n  "sha": "%s",\n  "vendored": "%s",\n  "help-setting.ts": "Kit %s (%s), eigener Pin KIT_HELP_REF"\n}\n' "$VER" "$SHA" "$DATE" "$HELP_VER" "$HELP_SHA" > src/vendor/kit-obsidian/VENDOR.json
echo "vendored: i18n timeout run-state cache-download settings_schema num vault-path | settings_walker folder-suggest clock confirm | obsidian-mock ($VER)"
