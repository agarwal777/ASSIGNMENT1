import { test } from "node:test";
import assert from "node:assert/strict";
import { distinctLabels, documentName } from "../lib/sourceLabels.ts";

const base = "https://nsearchives.nseindia.in/corporate/";

test("document names read from NSE file names", () => {
  assert.equal(documentName(base + "VOLTAS_RB_06112026165511_01_Financial_Results_signed.pdf"), "Financial Results");
  assert.equal(documentName(base + "VOLTAS_RB_06112026165554_02SE_Directorssigned.pdf"), "Directors");
  assert.equal(documentName(base + "VOLTAS_RB_06112026165629_03_Auditor_appointment_signed.pdf"), "Auditor appointment");
  assert.equal(documentName(base + "X_RB_06112026165629_1.pdf"), "");
});

test("only colliding labels change; a nameless one is numbered", () => {
  const at = "2026-11-06T16:55:00+05:30";
  const out = distinctLabels([
    { documentId: base + "VOLTAS_RB_06112026165511_01_Financial_Results_signed.pdf", label: "VOLTAS: Outcome of Board Meeting", publishedAt: at },
    { documentId: base + "VOLTAS_RB_06112026165554_02SE_Directorssigned.pdf", label: "VOLTAS: Outcome of Board Meeting", publishedAt: at },
    { documentId: base + "X_RB_06112026165629_1.pdf", label: "VOLTAS: Outcome of Board Meeting", publishedAt: at },
    { documentId: base + "other.pdf", label: "VOLTAS: Press Release", publishedAt: at },
  ]).map((s) => s.label);
  assert.deepEqual(out, [
    "VOLTAS: Outcome of Board Meeting (Financial Results)",
    "VOLTAS: Outcome of Board Meeting (Directors)",
    "VOLTAS: Outcome of Board Meeting (document 3)",
    "VOLTAS: Press Release",
  ]);
  assert.equal(new Set(out).size, out.length);
});
