// Run: node --test web/scripts/moves.test.mjs
// The device re-scores price/volume moves with the investor's thresholds. With the default
// thresholds it must reproduce exactly what workers/build_digest.py wrote.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { moveEvents, DEFAULT_THRESHOLDS } from "../lib/moves.ts";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf-8"));
const moves = read("../data/moves.json");
const digest = read("../data/digest.json").events.filter((e) => e.kind === "move");
const pick = (e) => ({ id: e.id, category: e.category, at: e.at, move: e.move, volume30d: e.volume30d,
  no_filing_hours: e.no_filing_hours, score: e.score, bucket: e.bucket, reasons: e.reasons, summary: e.summary, components: e.components });
const byId = (a, b) => a.id.localeCompare(b.id);

test("default thresholds reproduce the committed digest moves", () => {
  const mine = moveEvents(moves, DEFAULT_THRESHOLDS).map(pick).sort(byId);
  assert.equal(mine.length, digest.length);
  assert.deepEqual(mine, digest.map(pick).sort(byId));
});

test("raising thresholds only removes moves; lowering adds them", () => {
  const base = moveEvents(moves, DEFAULT_THRESHOLDS).length;
  assert.ok(moveEvents(moves, { volumeMultiple: 3, priceMovePct: 8 }).length < base);
  assert.ok(moveEvents(moves, { volumeMultiple: 1.5, priceMovePct: 3 }).length > base);
});
