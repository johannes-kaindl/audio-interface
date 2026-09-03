// Lädt die Engine-Assets aus `dist-assets/` an ein Forgejo-Release.
//
// Warum es dieses Skript gibt: bis 2026-09-03 tat das die GitHub-Action
// `release-assets.yml`. Nachdem das GitHub-Konto geflaggt wurde, ist sie tot — und
// die Assets waren damit für jeden Nutzer 404. Forgejo ist ohnehin `origin`.
//
// Gemessen am 2026-09-03, damit niemand es erneut prüfen muss: die Instanz nimmt
// `.onnx` als Release-Asset an (ihre `allowed_types` gelten für Releases nicht),
// das Attachment-Limit liegt bei 2048 MB, und Range-Requests beantwortet sie mit 206.
//
//   npm run assets            # erzeugt dist-assets/
//   node scripts/upload-assets.mjs 0.4.0
//
// Der Token kommt aus ~/.forgejo-token und wird nie ausgegeben.
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://git.jkaindl.de/api/v1";
const OWNER = "jkaindl";
const REPO = "audio-interface";
const DIR = "dist-assets";

const tag = process.argv[2];
if (!tag) {
  console.error("Aufruf: node scripts/upload-assets.mjs <tag>   (z. B. 0.4.0)");
  process.exit(2);
}

const token = (await readFile(join(homedir(), ".forgejo-token"), "utf8")).trim();
const auth = { Authorization: `token ${token}` };

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const release = await api(`/repos/${OWNER}/${REPO}/releases/tags/${encodeURIComponent(tag)}`);
console.log(`Release ${tag} (id ${release.id})`);

// Vorhandene gleichnamige Assets weg, sonst legt Forgejo eine zweite Datei mit
// demselben Namen an und der Download-Link wird mehrdeutig.
const existing = await api(`/repos/${OWNER}/${REPO}/releases/${release.id}/assets`);
const byName = new Map(existing.map((a) => [a.name, a]));

const files = (await readdir(DIR)).sort();
if (files.length === 0) throw new Error(`${DIR}/ ist leer — vorher \`npm run assets\` laufen lassen`);

for (const name of files) {
  const path = join(DIR, name);
  const bytes = (await stat(path)).size;
  const old = byName.get(name);
  if (old) {
    await api(`/repos/${OWNER}/${REPO}/releases/${release.id}/assets/${old.id}`, { method: "DELETE" });
    console.log(`  ersetzt: ${name}`);
  }
  const form = new FormData();
  form.append("attachment", new Blob([await readFile(path)]), name);
  await api(`/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, {
    method: "POST",
    body: form,
  });
  console.log(`  ${old ? "neu geladen" : "hochgeladen"}: ${name} (${bytes.toLocaleString("de-DE")} B)`);
}

// Gegenprobe ANONYM, nicht mit Token: der Token verdeckt genau den Fall, um den es
// hier geht — eine Datei, die es gibt, aber die niemand herunterladen kann.
console.log("\nGegenprobe (anonym, ohne Token):");
let bad = 0;
for (const name of files) {
  const url = `https://git.jkaindl.de/${OWNER}/${REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { Range: "bytes=0-99" }, redirect: "follow" });
  const ok = res.status === 200 || res.status === 206;
  if (!ok) bad++;
  console.log(`  ${ok ? "✅" : "❌"} ${name} — HTTP ${res.status}`);
}
if (bad > 0) {
  console.error(`\n${bad} Asset(s) sind anonym NICHT abrufbar — genau der Defekt, der den Umzug ausgelöst hat.`);
  process.exit(1);
}
console.log(`\n${files.length}/${files.length} Assets anonym abrufbar.`);
