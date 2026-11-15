// Run: node --test web/scripts/override.test.mjs
// An edited assumption is re-checked on Today and Portfolio from the compact quarters in digest.json,
// and on the Company page from companies.json. Every screen must reach the same status and actual.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkAssumption, rowsFromCompact } from "../lib/assumption.ts";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf-8"));
const compact = read("../data/digest.json").quarters;
const companies = read("../data/companies.json").companies;
const full = (sym) => companies[sym].quarters.map((q) => ({ period: q.period,
  revenue: q.revenue != null ? { value: q.revenue } : undefined,
  ebitdaMargin: q.ebitda_margin != null ? { value: q.ebitda_margin } : undefined }));
const DATA_TO = "2026-11-14";
const EDITS = [
  { metric: "ebitda_margin", operator: ">=", target: 5, deadline: "FY27" },
  { metric: "ebitda_margin", operator: "<=", target: 15, deadline: "FY27" },
  { metric: "revenue_growth", operator: ">=", target: 10, deadline: "FY27" },
  { metric: "ebitda_margin", operator: ">=", target: 20, deadline: "FY26" },
];

test("compact quarters give the same result as the Company page, for every company and edit", () => {
  for (const sym of Object.keys(compact)) {
    for (const e of EDITS) {
      const a = checkAssumption(e, rowsFromCompact(compact[sym]), DATA_TO);
      const b = checkAssumption(e, full(sym), DATA_TO);
      assert.equal(a.status, b.status, `${sym} ${JSON.stringify(e)}`);
      assert.equal(a.claim.actual, b.claim.actual, `${sym} ${JSON.stringify(e)}`);
    }
  }
});

test("an edit changes the status every screen shows", () => {
  const rows = rowsFromCompact(compact.VOLTAS);
  assert.equal(checkAssumption({ metric: "ebitda_margin", operator: ">=", target: 6, deadline: "FY27" }, rows, DATA_TO).status, "behind");
  assert.equal(checkAssumption({ metric: "ebitda_margin", operator: ">=", target: 5, deadline: "FY27" }, rows, DATA_TO).status, "on_track");
});
