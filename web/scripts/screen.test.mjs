import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_SCREEN, matches, metricsOf, sortRows } from "../lib/screen.ts";

const q = (rows) => rows;
const a = { symbol: "VOLTAS", name: "Voltas Limited", shortName: "Voltas", sector: "Consumer durables",
  quarters: q([["Q2FY26", 2347.8, 3.0], ["Q1FY27", 3900, 6.1], ["Q2FY27", 2707, 4.72]]) };
const b = { symbol: "LUPIN", name: "Lupin Limited", shortName: "Lupin", sector: "Pharma",
  quarters: q([["Q2FY26", 5000, 20.0], ["Q2FY27", 5500, 24.5]]) };
const c = { symbol: "NEW", name: "No Numbers Ltd", shortName: "No Numbers", sector: "Pharma", quarters: [] };

test("latest quarter against the same quarter a year earlier", () => {
  const m = metricsOf(a.quarters);
  assert.equal(m.period, "Q2FY27");
  assert.equal(m.margin, 4.72);
  assert.equal(m.revenueYoy, 15.3);          // (2707 − 2347.8) ÷ 2347.8
  assert.equal(m.marginYoyBps, 172);          // 4.72 − 3.00 = 1.72 pp
  assert.equal(metricsOf([]), null);
  assert.equal(metricsOf([["Q2FY27", 100, 5]]).revenueYoy, null);  // no year-ago quarter
});

test("search, sector and minimums; a missing number fails a minimum", () => {
  assert.ok(matches(a, { ...EMPTY_SCREEN, text: "volt" }));
  assert.ok(matches(b, { ...EMPTY_SCREEN, text: "pharma" }));
  assert.ok(!matches(a, { ...EMPTY_SCREEN, sector: "Pharma" }));
  assert.ok(matches(b, { ...EMPTY_SCREEN, minMargin: 20 }));
  assert.ok(!matches(a, { ...EMPTY_SCREEN, minMargin: 20 }));
  assert.ok(matches(a, { ...EMPTY_SCREEN, minGrowth: 15 }));
  assert.ok(!matches(c, { ...EMPTY_SCREEN, minGrowth: -100 }));
  assert.ok(matches(c, EMPTY_SCREEN));
});

test("sort highest first, companies without the number last", () => {
  assert.deepEqual(sortRows([a, c, b], "margin").map((r) => r.symbol), ["LUPIN", "VOLTAS", "NEW"]);
  assert.deepEqual(sortRows([b, a], "growth").map((r) => r.symbol), ["VOLTAS", "LUPIN"]);
  assert.deepEqual(sortRows([c, a], "default").map((r) => r.symbol), ["NEW", "VOLTAS"]);
});
