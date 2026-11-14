// Run: node --test web/scripts/format.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { inrCr, pct, bps, ratio, period, date, time, formatValue } from "../lib/format.ts";

const M = "−";

test("₹ crore with Indian grouping and the §4.4 decimal rule", () => {
  // §4.4 rule ("none above 1,000 cr") wins over its own example "₹2,628.5 cr"; flagged for review.
  assert.equal(inrCr(2628.5), "₹2,629 cr");
  assert.equal(inrCr(14492.3), "₹14,492 cr");
  assert.equal(inrCr(115740.7), "₹1,15,741 cr");
  assert.equal(inrCr(74.6), "₹74.6 cr");
  assert.equal(inrCr(-82.9), `${M}₹82.9 cr`);
});

test("growth is signed, margins are not", () => {
  assert.equal(pct(12.4), "+12.4%");
  assert.equal(pct(-3.1), `${M}3.1%`);
  assert.equal(pct(17.76, false), "17.8%");
  assert.equal(pct(0), "0.0%");
});

test("bps, ratio, periods", () => {
  assert.equal(bps(-180), `${M}180 bps`);
  assert.equal(bps(1524), "+1,524 bps");
  assert.equal(ratio(2.6), "2.6×");
  assert.equal(period("Q2FY27"), "Q2 FY27");
  assert.equal(period("FY27"), "FY27");
  assert.equal(formatValue("inr_cr", 867.75), "₹867.8 cr");
});

test("dates in IST, year only outside the reference year", () => {
  assert.equal(date("2026-11-05T14:52:00+05:30", "2026-11-06T08:00:00+05:30"), "5 Nov");
  assert.equal(date("2025-11-20T10:00:00+05:30", "2026-11-06T08:00:00+05:30"), "20 Nov 2025");
  assert.equal(time("2026-11-05T14:52:00+05:30"), "14:52");
});
