import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionsContact, normalizeQuestion } from "../lib/questionGuard.ts";

test("one spelling per question", () => {
  assert.equal(normalizeQuestion("  What did   management PROMISE on margins?? "), "what did management promise on margins");
  assert.equal(normalizeQuestion("What did management promise on margins"), "what did management promise on margins");
});

test("a full name from the network is caught; first names and parts of words are not", () => {
  const names = ["Ananya I.", "Rohan Mehta", "Asha"];
  assert.equal(mentionsContact("Should I ask Ananya I. about Voltas?", names), "Ananya I.");
  assert.equal(mentionsContact("what does rohan mehta think of margins", names), "Rohan Mehta");
  assert.equal(mentionsContact("What did Rohan say?", names), null);          // first name only
  assert.equal(mentionsContact("Is Ashapura a competitor?", names), null);    // single-word name skipped
  assert.equal(mentionsContact("How are margins trending?", names), null);
});
