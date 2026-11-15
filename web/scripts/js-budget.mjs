// JS budget check (FRONTEND.md §12): gzipped size of the scripts a built route loads, split into the
// baseline every page pays (the chunks the bare 404 page loads: React, Next's runtime) and what the
// route adds on top. Run after `npm run build`:  npm run budget   (or: node scripts/js-budget.mjs today 150)
// Exits 1 when the route's total is over the budget.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const route = process.argv[2] ?? "today";
const budgetKb = Number(process.argv[3] ?? 150);

const chunksOf = (page) => {
  const html = fs.readFileSync(path.join(".next", "server", "app", `${page}.html`), "utf8");
  return new Set([...html.matchAll(/\/_next\/(static\/[^"'\s\\]+?\.js)/g)].map((m) => m[1]));
};
const gz = (s) => { const p = path.join(".next", s); return fs.existsSync(p) ? zlib.gzipSync(fs.readFileSync(p)).length : 0; };
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

const base = chunksOf("_not-found");
const rows = [...chunksOf(route)].map((s) => [gz(s), s.split("/").pop(), base.has(s)]).filter(([g]) => g > 0).sort((a, b) => b[0] - a[0]);
const total = rows.reduce((t, [g]) => t + g, 0);
const shared = rows.filter(([, , b]) => b).reduce((t, [g]) => t + g, 0);

console.log(`/${route}: ${kb(total)} gzipped in ${rows.length} chunks (budget ${budgetKb} KB)`);
console.log(`  ${kb(shared)}  baseline every page loads (framework and root layout: what the bare 404 page loads)`);
console.log(`  ${kb(total - shared)}  this route adds (app code, icons, bundled snapshot data)`);
for (const [g, name, b] of rows.filter(([, , b]) => !b).slice(0, 6)) console.log(`    ${kb(g)}  ${name}${b ? "" : ""}`);
const over = total / 1024 > budgetKb;
if (over) console.log(`  over budget by ${kb(total - budgetKb * 1024)}`);
process.exit(over ? 1 : 0);
