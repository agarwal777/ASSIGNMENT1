// Build step (npm "prebuild"): merge what the daily cloud refresh stored in Supabase (py/refresh.py →
// market_events, market_prices) into the app's JSON, so every prerendered page moves forward.
//
// Runs on Vercel builds (or with FINN_MERGE_FRESH=1); a local build leaves the committed snapshot alone.
// If Supabase can't be reached the snapshot is used unchanged: a deploy never fails because of it.
// Reads with the public anon key: these tables hold public market data only (RLS: select for anyone).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_THRESHOLDS, moveEvents } from "../lib/moves.ts";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const istNoOffset = (iso) => iso.replace(/\+05:30$/, "");

/** Pure merge of fresh events and prices into the snapshot files. Returns what changed. */
export function mergeFresh(files, events, prices) {
  const { digest, moves, prices: closes, companies } = files;
  const have = new Set(digest.events.map((e) => e.id));
  const haveKey = new Set(digest.events.map((e) => e.dedupe_key).filter(Boolean));
  const added = events.filter((e) => !have.has(e.id) && !(e.dedupe_key && haveKey.has(e.dedupe_key)));

  // Prices: extend each company's series (moves.json for portfolio, prices.json for the chart).
  let newPrices = 0;
  for (const p of prices) {
    const day = String(p.day).slice(0, 10);
    const close = Number(p.close), volume = Number(p.volume);
    const chart = closes[p.symbol];
    if (chart && !chart.some(([d]) => d === day)) { chart.push([day, close]); chart.sort((a, b) => a[0].localeCompare(b[0])); newPrices += 1; }
    const s = moves.series[p.symbol];
    if (s && !s.some(([d]) => d === day)) { s.push([day, close, volume]); s.sort((a, b) => a[0].localeCompare(b[0])); }
  }
  // Filing times feed the "unexplained move" rule.
  for (const e of added) {
    if (e.kind !== "filing") continue;
    (moves.filed_at[e.symbol] ??= []).push(istNoOffset(e.at));
    const fd = (moves.filed_days[e.symbol] ??= []);
    if (!fd.includes(e.at.slice(0, 10))) fd.push(e.at.slice(0, 10));
  }

  // New price/volume moves at the default thresholds, for days after the snapshot's own moves.
  const lastMoveDay = digest.events.filter((e) => e.kind === "move").reduce((m, e) => (e.at > m ? e.at : m), "").slice(0, 10);
  const newMoves = moveEvents(moves, DEFAULT_THRESHOLDS)
    .filter((e) => e.at.slice(0, 10) > lastMoveDay && !have.has(e.id))
    .map((e) => ({ ...e, fresh: true }));

  digest.events.push(...added, ...newMoves);
  digest.events.sort((a, b) => b.at.localeCompare(a.at));

  // Company records: latest close and day change, recent filings, needs-you flag, last event.
  for (const [sym, c] of Object.entries(companies.companies)) {
    const s = closes[sym];
    if (s?.length >= 2) {
      const [[d1, c1], [, c0]] = [s.at(-1), s.at(-2)];
      if (!c.price || d1 > c.price.as_of) c.price = { close: c1, day_change: Math.round(((c1 - c0) / c0) * 10000) / 100, as_of: d1 };
    }
    const mine = added.filter((e) => e.symbol === sym && e.kind === "filing");
    if (mine.length) {
      c.recent_filings = [...mine.map((e) => ({ id: e.id, title: e.title, at: e.at, tier: e.bucket, url: e.url })), ...(c.recent_filings ?? [])]
        .sort((a, b) => b.at.localeCompare(a.at));
      const top = [...mine].sort((a, b) => b.score - a.score)[0];
      c.last_event = { title: top.summary || top.title, at: top.at, tier: top.bucket };
      if (mine.some((e) => e.bucket === "needs_you")) c.needs_you = true;
    }
  }
  return { events: added.length, moves: newMoves.length, prices: newPrices };
}

async function fetchRows(url, key, table, query) {
  const r = await fetch(`${url}/rest/v1/${table}?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`${table}: HTTP ${r.status}`);
  return r.json();
}

async function main() {
  if (!process.env.VERCEL && process.env.FINN_MERGE_FRESH !== "1") {
    console.log("merge-fresh: local build, snapshot unchanged (set FINN_MERGE_FRESH=1 to merge)");
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) { console.log("merge-fresh: Supabase not configured, snapshot unchanged"); return; }
  try {
    const [events, prices] = await Promise.all([
      fetchRows(url, key, "market_events", "select=payload&order=at.asc&limit=5000"),
      fetchRows(url, key, "market_prices", "select=symbol,day,close,volume&order=day.asc&limit=20000"),
    ]);
    const read = (f) => JSON.parse(readFileSync(path.join(DATA, f), "utf-8"));
    const files = { digest: read("digest.json"), moves: read("moves.json"), prices: read("prices.json"), companies: read("companies.json") };
    const changed = mergeFresh(files, events.map((r) => r.payload), prices);
    for (const [name, obj] of [["digest.json", files.digest], ["moves.json", files.moves], ["prices.json", files.prices], ["companies.json", files.companies]])
      writeFileSync(path.join(DATA, name), JSON.stringify(obj));
    console.log(`merge-fresh: +${changed.events} filing events, +${changed.moves} moves, +${changed.prices} prices`);
  } catch (e) {
    console.log(`merge-fresh: skipped (${e instanceof Error ? e.message : e}); snapshot unchanged`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
