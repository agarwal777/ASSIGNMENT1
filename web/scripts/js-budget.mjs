// JS budget check (FRONTEND.md §12): gzipped size of the scripts a built route loads.
// Run after `npm run build`:  node scripts/js-budget.mjs today 150
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const route = process.argv[2] ?? "today";
const budgetKb = Number(process.argv[3] ?? 150);
const html = fs.readFileSync(path.join(".next", "server", "app", `${route}.html`), "utf8");
const srcs = [...new Set([...html.matchAll(/\/_next\/(static\/[^"'\s\\]+?\.js)/g)].map((m) => m[1]))];

let raw = 0, gz = 0;
const rows = [];
for (const s of srcs) {
  const p = path.join(".next", s);
  if (!fs.existsSync(p)) continue;
  const b = fs.readFileSync(p);
  const g = zlib.gzipSync(b).length;
  raw += b.length; gz += g;
  rows.push([g, s.split("/").pop()]);
}
rows.sort((a, b) => b[0] - a[0]);
console.log(`/${route}: ${rows.length} chunks, ${(raw / 1024).toFixed(0)} KB raw, ${(gz / 1024).toFixed(1)} KB gzipped (budget ${budgetKb} KB)`);
for (const [g, name] of rows.slice(0, 6)) console.log(`  ${(g / 1024).toFixed(1)} KB  ${name}`);
process.exit(gz / 1024 <= budgetKb ? 0 : 1);
