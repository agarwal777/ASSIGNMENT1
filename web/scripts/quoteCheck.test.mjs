// Run: node --test web/scripts/quoteCheck.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { check } from "../lib/quoteCheck.ts";

const pages = [{ page: 2, text: "Statement of results (₹ in crore)\nRevenue from operations 2,706.57 1,987.10\nThe Board  has approved an interim dividend of ₹ 1.50 per share." }];
const pt = (text, quote, page = 2) => ({ text, quote, page });

test("kept: quote on the page (spacing and case ignored), figures on the page as bare numbers", () => {
  assert.ok(check(pt("Revenue was ₹2,706.57 crore this quarter.", "the board has approved an interim dividend"), pages));
  assert.ok(check(pt("An interim dividend of ₹1.50 per share was approved.", "approved an interim dividend of"), pages));
});

test("dropped: quote not on that page, too short, or a figure the page doesn't contain", () => {
  assert.equal(check(pt("Dividend approved.", "approved an interim dividend of", 3), pages), false);
  assert.equal(check(pt("Dividend approved.", "interim dividend"), pages), false);
  assert.equal(check(pt("Revenue grew 36.2%.", "approved an interim dividend of"), pages), false);
  assert.equal(check(pt("Revenue was ₹2,706.5 crore.", "approved an interim dividend of"), pages), false);  // bare numbers must match as printed
  assert.equal(check(pt("Revenue was ₹706.57 crore.", "approved an interim dividend of"), pages), false);  // not a substring match
});

test("a quote matches even when the PDF's text has broken word spacing", () => {
  const pdf = [{ page: 1, text: "HHFL is in the process of formulating comp r ehensive correc tive action plan" }];
  assert.ok(check(pt("A corrective action plan is being prepared.", "formulating comprehensive corrective action plan", 1), pdf));
});
