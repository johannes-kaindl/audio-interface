#!/bin/sh
# Vendort Kit-Module byte-identisch aus dem Schwester-Repo obsidian-kit (Dach-AGENTS.md, Kit-first).
# Nie von Hand editieren — Skript neu laufen lassen. Zielordner nach Quellbereich getrennt (Kit-README).
set -e
KIT=../obsidian-kit
SHA=$(git -C "$KIT" rev-parse HEAD); VER=$(git -C "$KIT" describe --tags --abbrev=0); DATE=$(date +%F)
mkdir -p src/vendor/kit src/vendor/kit-obsidian tests/vendor/kit
for f in i18n settings timeout; do
  { printf '%s\n' "// vendored from obsidian-kit, src/pure/$f.ts — do not hand-edit; re-vendor via tools/sync-kit.sh"; cat "$KIT/src/pure/$f.ts"; } > "src/vendor/kit/$f.ts"
done
for f in settings_walker folder-suggest clock confirm; do
  { printf '%s\n' "// vendored from obsidian-kit, src/obsidian/$f.ts — do not hand-edit; re-vendor via tools/sync-kit.sh"; cat "$KIT/src/obsidian/$f.ts"; } > "src/vendor/kit-obsidian/$f.ts"
done
{ printf '%s\n' "// vendored from obsidian-kit, src/testing/obsidian-mock.ts — do not hand-edit; re-vendor via tools/sync-kit.sh"; cat "$KIT/src/testing/obsidian-mock.ts"; } > tests/vendor/kit/obsidian-mock.ts
for d in src/vendor/kit src/vendor/kit-obsidian tests/vendor/kit; do
  printf '{\n  "source": "obsidian-kit",\n  "version": "%s",\n  "sha": "%s",\n  "vendored": "%s"\n}\n' "$VER" "$SHA" "$DATE" > "$d/VENDOR.json"
done
echo "vendored: i18n settings timeout | settings_walker folder-suggest clock confirm | obsidian-mock ($VER)"
