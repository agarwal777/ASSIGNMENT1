"""Triage evaluation (README §16): FINN's buckets against a human's blind material / not-material labels.

Input: eval/labels_to_fill.csv (the labeller fills material_yes_no with y/n; FINN's bucket is not on
the sheet) + eval/sample_key.json (row → event id) + web/data/digest.json (FINN's bucket).
FINN "says material" when it shows the filing: needs_you or worth_a_read (folded = not material).
The weights were not tuned on these labels; they were fixed before the labels existed.

Usage (from finn/):  workers/.venv/Scripts/python eval/score_triage.py
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

E = Path("eval")
labels = list(csv.DictReader((E / "labels_to_fill.csv").open(encoding="utf-8-sig")))
key = json.loads((E / "sample_key.json").read_text(encoding="utf-8"))
events = json.loads(Path("web/data/digest.json").read_text(encoding="utf-8"))["events"]
bucket = {e["id"]: e["bucket"] for e in events}
# Event ids include the category, so a re-classified filing gets a new id; its NSE link doesn't change.
by_link = {u: e["bucket"] for e in events for u in [e.get("url")] + [x["url"] for x in e.get("related", [])] if u}

rows = []
for r in labels:
    lab = (r["material_yes_no"] or "").strip().lower()[:1]
    if lab not in ("y", "n"):
        continue
    rows.append((lab == "y", by_link.get(r["link"]) or bucket[key[r["n"]]], r))
if not rows:
    raise SystemExit("No labels yet: fill material_yes_no with y or n in eval/labels_to_fill.csv")


def report(name: str, says_material) -> list[str]:
    tp = sum(1 for m, b, _ in rows if m and says_material(b))
    fp = sum(1 for m, b, _ in rows if not m and says_material(b))
    fn = sum(1 for m, b, _ in rows if m and not says_material(b))
    tn = sum(1 for m, b, _ in rows if not m and not says_material(b))
    p = tp / (tp + fp) if tp + fp else float("nan")
    rc = tp / (tp + fn) if tp + fn else float("nan")
    return [f"**{name}**: precision {p:.2f} ({tp}/{tp + fp}), recall {rc:.2f} ({tp}/{tp + fn})",
            "", "| | labelled material | labelled not material |", "|---|---|---|",
            f"| FINN shows it | {tp} | {fp} |", f"| FINN folds / doesn't flag | {fn} | {tn} |", ""]


out = [f"# Triage evaluation\n\nn = {len(rows)} filings labelled blind (FINN's bucket hidden), sampled with a fixed "
       f"seed across FINN's three buckets.\n",
       "Blind run (before any rule changes): shown precision 0.54 (14/26), recall 0.67 (14/21); needs-you precision "
       "0.46 (6/13), recall 0.29 (6/21). The figures below re-run the current rules; regulator actions became material "
       "after item #33 was seen, so they are not blind for that item.\n"]
out += report("Shown (needs you + worth a read) vs folded", lambda b: b in ("needs_you", "worth_a_read"))
out += report("Needs you only", lambda b: b == "needs_you")
misses = [(m, b, r) for m, b, r in rows if m != (b in ("needs_you", "worth_a_read"))]
out.append("## Disagreements\n")
out += [f"- #{r['n']} {r['company']}: *{r['nse_subject']}* → labelled {'material' if m else 'not material'}, FINN {b.replace('_', ' ')}"
        for m, b, r in misses] or ["- none"]
(E / "triage_results.md").write_text("\n".join(out) + "\n", encoding="utf-8")
print("\n".join(out))
