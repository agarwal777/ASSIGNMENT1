"""B1: find portfolio candidates from the last N days of real NSE announcements.

1. Fetch announcements once and save them raw to seed/raw/ (the snapshot we replay from).
2. Per symbol: did it file results? which demo-worthy events does it have?
3. Drop lenders/insurers by NSE's industry field; rank by how many distinct event
   types a company has, so the demo shows variety. Output: seed/probe/candidates.csv.

No scoring here decides the portfolio — it produces a shortlist for a human to pick from.

Usage (from finn/):  workers/.venv/Scripts/python -I workers/find_candidates.py --days 14
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

from probe_sources import announcements, nse_client

# Subject ("desc") → demo event type. Matching is case-insensitive substring on desc.
EVENT_MAP = {
    "management_change": ("change in management", "resignation", "appointment",
                          "change in director", "cessation"),
    "m_and_a": ("acquisition", "amalgamation", "merger", "scheme of arrangement", "joint venture"),
    "orders": ("bagging/receiving of orders",),
    "credit_rating": ("credit rating",),
    "litigation": ("litigation", "dispute", "penalt", "regulatory action"),
    "capex": ("expansion", "capacity", "capital expenditure"),
    "concall": ("analysts/institutional investor meet", "con. call"),
    "pledge": ("pledge",),
}
# Lenders, insurers and other financials are out of the prototype portfolio.
FINANCIAL_WORDS = ("bank", "finance", "financial services", "nbfc", "insurance",
                   "housing finance", "capital markets", "asset management", "broking",
                   "investment company")


def is_results(row: dict) -> bool:
    desc = (row.get("desc") or "").lower()
    text = (row.get("attchmntText") or "").lower()
    return desc.startswith("integrated filing- financial") or (
        "financial result" in text and ("outcome" in desc or "result" in desc))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    args = ap.parse_args()
    end = date.today()
    start = end - timedelta(days=args.days)

    rows = announcements(nse_client(), start, end)
    raw = Path("seed/raw")
    raw.mkdir(parents=True, exist_ok=True)
    raw_file = raw / f"nse_announcements_{start}_{end}.json"
    raw_file.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"saved {len(rows)} announcements → {raw_file}")

    per: dict[str, dict] = defaultdict(lambda: {"events": defaultdict(int), "n": 0})
    for r in rows:
        sym = r.get("symbol")
        if not sym:
            continue
        p = per[sym]
        p["name"] = r.get("sm_name")
        p["industry"] = r.get("smIndustry") or ""
        p["n"] += 1
        if is_results(r):
            p["results"] = True
            p["xbrl"] = p.get("xbrl") or str(r.get("hasXbrl")).lower() in ("true", "1", "y", "yes")
        desc = (r.get("desc") or "").lower()
        for ev, words in EVENT_MAP.items():
            if any(w in desc for w in words):
                p["events"][ev] += 1

    out_rows = []
    for sym, p in per.items():
        ind = p["industry"].lower()
        if not p.get("results") or any(w in ind for w in FINANCIAL_WORDS):
            continue
        ev = p["events"]
        out_rows.append({
            "symbol": sym, "name": p.get("name"), "industry": p["industry"],
            "xbrl": bool(p.get("xbrl")), "n_filings": p["n"],
            "variety": sum(1 for k in ev if k != "concall"),
            **{k: ev.get(k, 0) for k in EVENT_MAP},
        })
    out_rows.sort(key=lambda x: (-x["variety"], -x["management_change"], -x["n_filings"]))

    out = Path("seed/probe/candidates.csv")
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)
    print(f"{len(out_rows)} non-financial companies filed results; top 40:")
    for r in out_rows[:40]:
        tags = ",".join(k for k in EVENT_MAP if r[k])
        print(f"{r['symbol']:<14} {r['industry'][:28]:<28} xbrl={str(r['xbrl'])[0]} "
              f"filings={r['n_filings']:<3} {tags}")


if __name__ == "__main__":
    main()
