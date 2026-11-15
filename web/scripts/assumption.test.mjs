// Run: node --test web/scripts/assumption.test.mjs
// The editable assumption is re-checked on the device; it must agree with workers/thesis.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkAssumption } from "../lib/assumption.ts";

const data = JSON.parse(readFileSync(new URL("../data/companies.json", import.meta.url), "utf-8")).companies;
const rows = (sym) => data[sym].quarters.map((q) => ({ period: q.period,
  revenue: q.revenue != null ? { value: q.revenue } : undefined,
  ebitdaMargin: q.ebitda_margin != null ? { value: q.ebitda_margin } : undefined }));

test("demo assumptions match the worker's year-to-date check", () => {
  for (const sym of ["VOLTAS", "M&M", "AUROPHARMA"]) {
    const inv = data[sym].thesis.investor[0];
    const r = checkAssumption({ metric: inv.metric, operator: ">=", target: inv.target_low, deadline: inv.deadline }, rows(sym), "2026-11-14");
    assert.ok(Math.abs(r.claim.actual - inv.actual) <= 0.02, `${sym}: ${r.claim.actual} vs ${inv.actual}`);
    assert.equal(r.status, inv.status, sym);
  }
});

test("an edit changes status at once; a past deadline gives met or missed", () => {
  const q = rows("VOLTAS");
  assert.equal(checkAssumption({ metric: "ebitda_margin", operator: ">=", target: 5, deadline: "FY27" }, q, "2026-11-14").status, "on_track");
  assert.equal(checkAssumption({ metric: "ebitda_margin", operator: "<=", target: 5, deadline: "FY27" }, q, "2026-11-14").status, "behind");
  assert.ok(["met", "missed"].includes(checkAssumption({ metric: "ebitda_margin", operator: ">=", target: 5, deadline: "FY26" }, q, "2026-11-14").status));
  assert.equal(checkAssumption({ metric: "revenue_growth", operator: ">=", target: 10, deadline: "FY28" }, q, "2026-11-14").status, "cant_check");
});
