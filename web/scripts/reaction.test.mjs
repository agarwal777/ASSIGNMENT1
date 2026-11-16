// Run: node --test web/scripts/reaction.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { filedAtFromXbrl, pastReactions, reactionTo } from "../lib/reaction.ts";

// Mon 2 – Fri 13 Nov, trading days only.
const closes = [["2026-11-02", 100], ["2026-11-03", 102], ["2026-11-04", 101], ["2026-11-05", 99], ["2026-11-06", 104],
  ["2026-11-09", 105], ["2026-11-10", 110], ["2026-11-11", 108], ["2026-11-12", 107], ["2026-11-13", 112]];

test("a filing after 15:30 reacts the next trading day; the base is that day's close", () => {
  const r = reactionTo("2026-11-03T18:00:00+05:30", closes);
  assert.deepEqual(r.base, { day: "2026-11-03", close: 102 });
  assert.deepEqual(r.day1, { day: "2026-11-04", pct: -1 });
  assert.deepEqual(r.day5, { day: "2026-11-10", pct: 7.8 });
  assert.deepEqual(r.latest, { day: "2026-11-13", pct: 9.8, tradingDays: 8 });
});

test("a filing during market hours counts from the same day; a weekend filing from Monday", () => {
  assert.equal(reactionTo("2026-11-03T10:00:00+05:30", closes).base.day, "2026-11-02");
  const sat = reactionTo("2026-11-07T11:00:00+05:30", closes);
  assert.equal(sat.base.day, "2026-11-06");
  assert.equal(sat.day1.day, "2026-11-09");
  assert.deepEqual(sat.day5, { day: "2026-11-13", pct: 7.7 });   // 9, 10, 11, 12, 13 Nov: the fifth close
});

test("no trading day after the filing yet: base only", () => {
  const r = reactionTo("2026-11-13T19:00:00+05:30", closes);
  assert.equal(r.base.day, "2026-11-13");
  assert.equal(r.day1, null);
  assert.equal(r.latest, null);
});

test("NSE XBRL file names carry the filing time", () => {
  assert.equal(filedAtFromXbrl("https://x/INTEGRATED_FILING_INDAS_1755186_06112026085901_WEB.xml"), "2026-11-06T08:59:01+05:30");
  assert.equal(filedAtFromXbrl("https://x/other.pdf"), null);
});

test("past reactions: earlier filings only, with a full five-day window", () => {
  const past = pastReactions(["2026-11-02T17:00:00+05:30", "2026-11-09T17:00:00+05:30", "2026-11-03T17:00:00+05:30"], closes, "2026-11-12T10:00:00+05:30");
  assert.deepEqual(past.map((r) => r.at), ["2026-11-03T17:00:00+05:30", "2026-11-02T17:00:00+05:30"]);
});
