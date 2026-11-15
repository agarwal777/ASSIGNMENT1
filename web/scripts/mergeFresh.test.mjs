import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeFresh } from "./merge-fresh.mjs";

function files() {
  const series = [];
  for (let i = 0; i < 25; i++) series.push([`2026-10-${String(i + 1).padStart(2, "0")}`, 100, 1000]);
  return {
    digest: { events: [{ id: "AAA-results-2026-11-14", kind: "filing", at: "2026-11-14T10:00:00+05:30", dedupe_key: "AAA|2026-11-14|outcome", symbol: "AAA" },
      { id: "AAA-move-2026-10-25", kind: "move", at: "2026-10-25T15:30:00+05:30", symbol: "AAA" }] },
    moves: { window_start: "2026-10-01", alerts_from: "2026-10-01", names: { AAA: "Aaa Ltd" }, sector: { AAA: "X" },
      series: { AAA: series }, filed_days: { AAA: [] }, filed_at: { AAA: [] } },
    prices: { AAA: series.map(([d, c]) => [d, c]) },
    companies: { companies: { AAA: { price: { close: 100, day_change: 0, as_of: "2026-10-25" }, recent_filings: [], needs_you: false } } },
  };
}

test("fresh filings are added once; duplicates by id or dedupe key are skipped", () => {
  const f = files();
  const ev = (id, key, bucket = "needs_you") => ({ id, kind: "filing", symbol: "AAA", at: "2026-11-16T09:00:00+05:30",
    dedupe_key: key, title: "T", summary: "S", url: "u", bucket, score: 0.8 });
  const r = mergeFresh(f, [ev("AAA-results-2026-11-14", "x"), ev("AAA-other-2026-11-14", "AAA|2026-11-14|outcome"), ev("AAA-capex-2026-11-16", "AAA|2026-11-16|capex")], []);
  assert.equal(r.events, 1);
  assert.equal(f.digest.events[0].id, "AAA-capex-2026-11-16");            // newest first
  assert.equal(f.companies.companies.AAA.needs_you, true);
  assert.equal(f.companies.companies.AAA.recent_filings[0].id, "AAA-capex-2026-11-16");
});

test("fresh prices extend the series, update the price, and a 3x-volume day becomes a move", () => {
  const f = files();
  const r = mergeFresh(f, [], [{ symbol: "AAA", day: "2026-10-26", close: 101, volume: 3000 },
                               { symbol: "AAA", day: "2026-10-25", close: 100, volume: 1000 }]);   // already present
  assert.equal(r.prices, 1);
  assert.deepEqual(f.companies.companies.AAA.price, { close: 101, day_change: 1, as_of: "2026-10-26" });
  assert.equal(r.moves, 1);
  assert.ok(f.digest.events.some((e) => e.id === "AAA-move-2026-10-26" && e.fresh));
});
