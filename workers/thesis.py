"""The investor's thesis for a company, checked against reported numbers. Shared by build_digest
(cards, score T) and build_companies (Company page), so both always show the same stance.

Two kinds of item (README §3.2):
  management  company-level, numerically checkable promises from the ledger (status → stance)
  investor    the investor's own assumptions (seed/theses.csv; demo-written, labelled as such)
Stances are rule checks against year-to-date reported facts. No model.
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

SEED, WEB = Path("seed"), Path("web/data")

# One status vocabulary everywhere: on_track · behind · met · missed · cant_check.
# "met"/"missed" only once the deadline has passed; before that a shortfall is "behind".
STATUS_TO_STANCE = {"met": "supports", "on_track": "supports", "missed": "contradicts",
                    "behind": "contradicts", "cant_check": "insufficient"}
SNAPSHOT_DATE = "2026-11-15"


def fy_end(fy: str) -> str:
    """'FY27' → '2027-03-31'."""
    return f"20{fy[-2:]}-03-31"


def status_for(ok: bool | None, deadline: str) -> str:
    if ok is None:
        return "cant_check"
    passed = deadline.startswith("FY") and fy_end(deadline) < SNAPSHOT_DATE
    return ("met" if ok else "missed") if passed else ("on_track" if ok else "behind")
METRIC_LABEL = {"ebitda_margin": "EBITDA margin", "revenue_growth": "Revenue growth", "pat_growth": "Profit growth"}


def claim_label(p: dict) -> str:
    """Short pill text from the extracted target; the verbatim quote stays one tap away in the ledger."""
    lab = METRIC_LABEL.get(p["metric"], p["metric"].replace("_", " ").capitalize())
    lo, hi = p.get("target_low"), p.get("target_high")
    if lo is not None and hi is not None and hi != lo:
        return f"{lab} {lo:g}–{hi:g}%"
    if lo is not None:
        return f"{lab} at least {lo:g}%"
    return lab


def fy_quarters(fy: str) -> list[str]:
    return [f"Q{q}{fy}" for q in (1, 2, 3, 4)]


def load() -> tuple[dict, dict, dict]:
    """facts[symbol][(period, metric)] = value_cr; ledger[symbol] = {...}; theses[symbol] = [rows]."""
    facts: dict[str, dict[tuple[str, str], float]] = defaultdict(dict)
    for f in csv.DictReader((SEED / "facts.csv").open(encoding="utf-8")):
        facts[f["symbol"]][(f["period"], f["metric"])] = float(f["value_cr"])
    ledger = json.loads((WEB / "ledger.json").read_text(encoding="utf-8"))
    theses: dict[str, list[dict]] = defaultdict(list)
    for t in csv.DictReader((SEED / "theses.csv").open(encoding="utf-8")):
        theses[t["symbol"]].append(t)
    return facts, ledger, theses


def ytd_margin(fx: dict, fy: str) -> tuple[float | None, list[str]]:
    qs = [q for q in fy_quarters(fy) if (q, "revenue") in fx and (q, "ebitda") in fx]
    if not qs:
        return None, []
    rev = sum(fx[(q, "revenue")] for q in qs)
    return (round(100 * sum(fx[(q, "ebitda")] for q in qs) / rev, 2) if rev else None), qs


def thesis_for(fx: dict, led: dict, rows: list[dict]) -> dict:
    management = [{"id": p["id"], "text": claim_label(p), "deadline": p["deadline_period"], "metric": p["metric"],
                   "stance": STATUS_TO_STANCE[p["status"]], "evidence": p["evidence"], "status": p["status"],
                   "source": "management", "target_low": p.get("target_low"), "target_high": p.get("target_high"),
                   "actual": p.get("actual"), "quarters_reported": p.get("quarters_reported"),
                   "quarters_total": p.get("quarters_total")}
                  for p in sorted(led.get("promises", []), key=lambda p: p["said_at"], reverse=True)
                  if p["status"] != "cant_check"]
    seen, deduped = set(), []
    for m in management:   # a reiterated target is one claim: keep its latest statement
        if (m["text"], m["deadline"]) not in seen:
            seen.add((m["text"], m["deadline"]))
            deduped.append(m)
    investor = []
    for t in rows:
        ok, evidence, actual, qs = None, "no reported quarters for this period yet", None, []
        if t["metric"] == "ebitda_margin":
            actual, qs = ytd_margin(fx, t["deadline"])
            if actual is not None:
                ok = actual >= float(t["target"]) if t["operator"] == ">=" else actual <= float(t["target"])
                evidence = f"{actual:.2f}% year to date ({qs[0]}–{qs[-1]})"
        status = status_for(ok, t["deadline"])
        investor.append({"id": t["id"], "text": t["text"], "deadline": t["deadline"], "metric": t["metric"],
                         "status": status, "stance": STATUS_TO_STANCE[status], "evidence": evidence, "demo": True,
                         "source": "investor", "target_low": float(t["target"]), "target_high": None,
                         "actual": actual, "quarters_reported": len(qs), "quarters_total": 4})
    return {"management": deduped[:4], "investor": investor}


def promise_check(fx: dict, led: dict, period: str | None) -> dict | None:
    """Management's guidance for this fiscal year on a reported metric, next to the actual so far."""
    if not period:
        return None
    fy = period[-4:]  # "Q2FY27" → "FY27"
    cands = [p for p in led.get("promises", []) if p["metric"] == "ebitda_margin" and p["deadline_period"] == fy
             and (p.get("scope") or "company").lower() in ("company", "overall", "consolidated", "standalone")
             and p.get("target_low") is not None]
    if not cands:
        return None
    p = max(cands, key=lambda x: x["said_at"])   # the most recent statement of the guidance
    actual, qs = ytd_margin(fx, fy)
    if actual is None:
        return None
    lo = float(p["target_low"])
    hi = float(p["target_high"]) if p.get("target_high") is not None else None
    return {"promise_id": p["id"], "guided_low": lo, "guided_high": hi, "unit": "percent", "actual": actual,
            "actual_quarters": qs, "said_at": p["said_at"], "page": p["page"], "source": p["source"],
            "met": actual >= lo and (hi is None or actual <= hi)}
