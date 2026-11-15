"""B5: promised vs delivered. Deterministic status for each extracted promise (no model).

Checkable today (company-level, from XBRL facts): ebitda_margin, revenue_growth, pat_growth,
for a quarter (QnFYyy), a half (HnFYyy) or a fiscal year (FYyy).
  met / missed         the period is complete and actual is at or above / below the bottom of the target
  on_track / behind    the period is in progress; year-to-date actual is at or above / below the bottom
  All checkable metrics are higher-is-better (margin, growth), so beating the top of a guided range is
  delivery, not a shortfall; the evidence says "above the guided range" when it happens.
  (revised_by)         set when a later call gave a different target; the outcome is still judged
  cant_check           segment-level, non-financial (capacity, dates) or data not available
"A single number" targets count as met when actual ≥ target (growth, margin) — stated in the UI.

Output: web/data/ledger.json (per company: promises with status + evidence, credibility line).
Usage (from finn/):  workers/.venv/Scripts/python workers/ledger.py
"""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

SEED = Path("seed")
OUT = Path("web/data/ledger.json")
CHECKABLE = {"ebitda_margin", "revenue_growth", "pat_growth"}
QUARTER_RE = re.compile(r"^Q([1-4])FY(\d{2})$")
HALF_RE = re.compile(r"^H([12])FY(\d{2})$")
YEAR_RE = re.compile(r"^FY(\d{2})$")


def quarters_in(period: str) -> list[str] | None:
    if m := QUARTER_RE.match(period):
        return [period]
    if m := HALF_RE.match(period):
        h, fy = int(m[1]), m[2]
        return [f"Q{q}FY{fy}" for q in ((1, 2) if h == 1 else (3, 4))]
    if m := YEAR_RE.match(period):
        return [f"Q{q}FY{m[1]}" for q in (1, 2, 3, 4)]
    return None


def prior_year(q: str) -> str:
    m = QUARTER_RE.match(q)
    return f"Q{m[1]}FY{int(m[2]) - 1:02d}"


def actual(metric: str, qs: list[str], facts: dict[tuple[str, str], float]) -> tuple[float | None, list[str]]:
    """Actual over the quarters we have (all of qs, or the leading YTD subset). Returns (value, quarters used)."""
    have = [q for q in qs if (q, "revenue") in facts]
    if not have:
        return None, []
    if metric == "ebitda_margin":
        rev = sum(facts[(q, "revenue")] for q in have)
        ebitda = sum(facts.get((q, "ebitda"), 0) for q in have)
        return (round(100 * ebitda / rev, 2) if rev else None), have
    base = "revenue" if metric == "revenue_growth" else "pat"
    prev = [prior_year(q) for q in have]
    if any((p, base) not in facts for p in prev):
        return None, have
    cur, old = sum(facts[(q, base)] for q in have), sum(facts[(p, base)] for p in prev)
    return (round(100 * (cur - old) / old, 1) if old > 0 else None), have


def judge(p: dict, facts: dict, latest: str) -> tuple[str, str]:
    if p["metric"] not in CHECKABLE:
        return "cant_check", "not a reported financial line (checked by hand or in later calls)"
    if p.get("scope", "company").lower() not in ("company", "overall", "consolidated", "standalone"):
        return "cant_check", f"segment-level ({p['scope']}): segment numbers not parsed yet"
    qs = quarters_in(p["deadline_period"])
    if not qs:
        return "cant_check", f"no checkable period ({p['deadline_period']})"
    lo, hi = p.get("target_low"), p.get("target_high")
    if lo is None and hi is None:
        return "cant_check", "no numeric target"
    # Margin and growth targets are percentages; an amount (₹ crore, US$, "1.2x") is a different promise.
    unit = (p.get("unit") or "").lower()
    if not re.search(r"percent|%|per cent|bps|basis", unit) or max(abs(lo or 0), abs(hi or 0)) > 100:
        return "cant_check", f"the target is stated as {p.get('unit') or 'an amount'}, not a percentage"
    lo = lo if lo is not None else hi
    val, used = actual(p["metric"], qs, facts)
    if val is None:
        return "cant_check", "financials for this period not in the snapshot"
    complete = len(used) == len(qs)
    inside = val >= lo                    # higher is better for every checkable metric
    above = hi is not None and hi != lo and val > hi
    span = f"{used[0]}–{used[-1]}" if len(used) > 1 else used[0]
    unit = "%" if p["metric"] == "ebitda_margin" else "% YoY"
    evidence = f"actual {val}{unit} ({'full period' if complete else 'year to date ' + span})" + (", above the guided range" if above else "")
    p["actual"], p["quarters_reported"], p["quarters_total"] = val, len(used), len(qs)   # for the bullet chart
    if complete:
        return ("met" if inside else "missed"), evidence
    return ("on_track" if inside else "behind"), evidence


def main() -> None:
    raw = json.loads((SEED / "promises.json").read_text(encoding="utf-8"))["promises"]
    facts_by: dict[str, dict] = defaultdict(dict)
    latest: dict[str, str] = {}
    for f in csv.DictReader((SEED / "facts.csv").open(encoding="utf-8")):
        facts_by[f["symbol"]][(f["period"], f["metric"])] = float(f["value_cr"])
        latest[f["symbol"]] = max(latest.get(f["symbol"], ""), f["period_end"])

    # Revisions: a later statement on the same metric, scope and period with a different target.
    groups = defaultdict(list)
    for p in raw:
        groups[(p["symbol"], p["metric"], p.get("scope", "company").lower(), p["deadline_period"])].append(p)
    for g in groups.values():
        g.sort(key=lambda x: x["said_at"])
        for a, b in zip(g, g[1:]):
            if (a.get("target_low"), a.get("target_high")) != (b.get("target_low"), b.get("target_high")) \
                    and b["said_at"] > a["said_at"]:
                a["revised_by"] = b["id"]

    out: dict[str, dict] = {}
    for p in raw:
        # A revised promise keeps its own outcome; the revision shows in the ledger history (revised_by).
        p["status"], p["evidence"] = judge(p, facts_by[p["symbol"]], latest.get(p["symbol"], ""))
        c = out.setdefault(p["symbol"], {"promises": []})
        c["promises"].append(p)
    for sym, c in out.items():
        n = defaultdict(int)
        for p in c["promises"]:
            n[p["status"]] += 1
        resolved = n["met"] + n["missed"]
        c["counts"] = dict(n)
        c["credibility"] = (f"Met {n['met']} of {resolved} checkable promises in the last 4 quarters"
                            if resolved else "No promise from the last 4 quarters can be checked against reported numbers yet")
        c["promises"].sort(key=lambda p: (p["said_at"], p["metric"]))
        print(f"{sym:<11} {dict(n)}  → {c['credibility']}")
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
