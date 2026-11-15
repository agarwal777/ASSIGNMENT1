// Run: node --test web/scripts/numcheck.test.mjs
// The bull-vs-bear number check and deny-list (web/lib/numcheck.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { figuresIn, unsupported, NETWORK_FIELDS } from "../lib/numcheck.ts";

// Evidence lines as web/lib/bullbear.ts builds them (formatValue output, with the Unicode minus).
const Q2 = "Q2 FY27 results filed on the exchange: revenue ₹10,263 cr (+23.9% YoY), EBITDA margin 21.0%, profit after tax ₹1,124 cr.";
const LEDGER = 'CFO on the 2026-05-27 earnings call: "We expect EBITDA margins to sustain and progressively improve to north of 21%" Checked against reported numbers: Behind (actual 20.79% (year to date Q1FY27–Q2FY27)).';
const RANGE = 'CFO on the 2026-02-16 earnings call: "EBITDA margin target of mostly on the higher side of 20% to 21% for FY26." Checked: Met (actual 20.23% (full period)).';
const VOLTAS = "Q4 FY26 results filed on the exchange: revenue ₹3,412 cr (−2.5% YoY), EBITDA margin 4.5%.";

test("figures: rupees in crore, percentages, ranges, bps; years and quarter labels are not figures", () => {
  assert.deepEqual(figuresIn("revenue ₹10,263 cr in Q2 FY27, up 23.9% in 2026").map((f) => [f.kind, f.value]),
    [["inr_cr", 10263], ["pct", 23.9]]);
  assert.deepEqual(figuresIn("between 20-21% for FY26").map((f) => f.value), [20, 21]);
  assert.deepEqual(figuresIn("margin fell 311 bps").map((f) => [f.kind, f.value]), [["bps", 311]]);
  assert.deepEqual(figuresIn("10,263 crore").map((f) => [f.kind, f.value]), [["inr_cr", 10263]]);
  assert.deepEqual(figuresIn("₹1.2 lakh crore").map((f) => [f.kind, f.value]), [["inr_cr", 120000]]);
});

test("real sentences from the Aurobindo run pass", () => {
  assert.deepEqual(unsupported("Revenue reached 10,263 crore with 23.9% year-over-year growth.", [Q2]), []);
  assert.deepEqual(unsupported("The company fell behind its target of margins north of 21%, at 20.79% year to date.", [LEDGER]), []);
  assert.deepEqual(unsupported("It met its FY26 target of 20% to 21%, delivering 20.23%.", [RANGE]), []);
});

test("rounding follows the sentence; signs are carried by words", () => {
  assert.deepEqual(unsupported("Margin was about 21%.", [Q2]), []);          // 21.0 rounds to 21
  assert.deepEqual(unsupported("Revenue fell 2.5% in Q4 FY26.", [VOLTAS]), []); // −2.5% in evidence
  assert.equal(unsupported("Margin was 21.04%.", [Q2]).length, 1);             // more precise than the evidence
});

test("numbers not in the cited evidence are caught, including computed ones", () => {
  assert.equal(unsupported("Revenue was ₹10,500 crore.", [Q2]).length, 1);
  assert.equal(unsupported("Margin improved 120 bps.", [Q2]).length, 1);      // a computed difference
  assert.equal(unsupported("Profit after tax was ₹1,124 cr.", [LEDGER]).length, 1); // right number, wrong citation
});

test("deny-list refuses private-vault field names and matches workers/llm.py", () => {
  assert.ok(NETWORK_FIELDS.test('{"display_name": "Rohan M."}'));
  assert.ok(!NETWORK_FIELDS.test("Q2 FY27 revenue ₹10,263 cr"));
});
