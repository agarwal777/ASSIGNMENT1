"""B5: one record per company for the Portfolio list and the Company page → web/data/companies.json.

Inputs (all already in the snapshot): portfolio.csv, prices.csv, facts.csv, results.json,
web/data/ledger.json, web/data/digest.json, theses.csv (demo investor assumptions, labelled as such).
Everything is deterministic: stances on numeric assumptions are rule checks against reported facts.

Usage (from finn/):  workers/.venv/Scripts/python workers/build_companies.py
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

SEED, WEB = Path("seed"), Path("web/data")

STATUS_TO_STANCE = {"delivered": "supports", "on_track": "supports", "missed": "contradicts",
                    "at_risk": "contradicts", "revised": "neutral", "unverifiable": "insufficient"}


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


def main() -> None:
    portfolio = list(csv.DictReader((SEED / "portfolio.csv").open(encoding="utf-8")))
    digest = json.loads((WEB / "digest.json").read_text(encoding="utf-8"))
    ledger = json.loads((WEB / "ledger.json").read_text(encoding="utf-8"))
    results = json.loads((SEED / "results.json").read_text(encoding="utf-8"))
    names = {}
    for r in json.loads((SEED / "filings" / "recent.json").read_text(encoding="utf-8")):
        names.setdefault(r["symbol"], r.get("sm_name") or r["symbol"])

    prices: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for r in csv.DictReader((SEED / "prices.csv").open(encoding="utf-8")):
        prices[r["symbol"]].append((r["date"], float(r["close"])))

    facts: dict[str, dict[tuple[str, str], float]] = defaultdict(dict)
    period_end: dict[str, dict[str, str]] = defaultdict(dict)
    source_of: dict[str, dict[str, str]] = defaultdict(dict)   # each quarter's own XBRL filing
    for f in csv.DictReader((SEED / "facts.csv").open(encoding="utf-8")):
        facts[f["symbol"]][(f["period"], f["metric"])] = float(f["value_cr"])
        period_end[f["symbol"]][f["period"]] = f["period_end"]
        source_of[f["symbol"]][f["period"]] = f["source"]

    theses = defaultdict(list)
    for t in csv.DictReader((SEED / "theses.csv").open(encoding="utf-8")):
        theses[t["symbol"]].append(t)

    events_by = defaultdict(list)
    for e in digest["events"]:
        events_by[e["symbol"]].append(e)
    as_of = digest["default_as_of"]
    latest = max(e["at"] for e in digest["events"])
    from datetime import datetime, timedelta
    week_start = (datetime.fromisoformat(latest) - timedelta(days=7)).isoformat()

    out = {}
    for c in portfolio:
        sym = c["symbol"]
        fx = facts.get(sym, {})
        periods = sorted(period_end.get(sym, {}), key=lambda p: period_end[sym][p])[-8:]
        quarters = []
        for p in periods:
            rev, ebitda, pat = fx.get((p, "revenue")), fx.get((p, "ebitda")), fx.get((p, "pat"))
            prev = f"Q{p[1]}FY{int(p[-2:]) - 1:02d}"
            prev_rev = fx.get((prev, "revenue"))
            quarters.append({
                "period": p, "revenue": rev, "pat": pat, "source": source_of[sym].get(p),
                "period_end": period_end[sym][p],
                "ebitda_margin": round(100 * ebitda / rev, 2) if rev and ebitda is not None else None,
                "revenue_yoy": round(100 * (rev - prev_rev) / prev_rev, 1) if rev and prev_rev else None,
            })

        series = sorted(prices.get(sym, []))
        price = None
        if len(series) >= 2:
            (d0, p0), (d1, p1) = series[-2], series[-1]
            price = {"close": p1, "day_change": round(100 * (p1 - p0) / p0, 2), "as_of": d1}

        led = ledger.get(sym, {"promises": [], "counts": {}})
        # Management's claims you're tracking: company-level, numerically checkable promises.
        management = [{"id": p["id"], "text": claim_label(p), "deadline": p["deadline_period"],
                       "stance": STATUS_TO_STANCE[p["status"]], "evidence": p["evidence"], "status": p["status"]}
                      for p in sorted(led["promises"], key=lambda p: p["said_at"], reverse=True)
                      if p["status"] != "unverifiable"]
        # A reiterated target is one claim: keep its latest statement (the ledger keeps every one).
        seen, deduped = set(), []
        for m in management:
            if (m["text"], m["deadline"]) not in seen:
                seen.add((m["text"], m["deadline"]))
                deduped.append(m)
        management = deduped[:4]
        # Your assumptions (demo, seeded): rule-checked against year-to-date reported numbers.
        investor = []
        for t in theses.get(sym, []):
            qs = [q for q in fy_quarters(t["deadline"]) if (q, "revenue") in fx]
            stance, evidence = "insufficient", "no reported quarters for this period yet"
            if qs and t["metric"] == "ebitda_margin":
                m = 100 * sum(fx[(q, "ebitda")] for q in qs) / sum(fx[(q, "revenue")] for q in qs)
                ok = m >= float(t["target"]) if t["operator"] == ">=" else m <= float(t["target"])
                stance = "supports" if ok else "contradicts"
                evidence = f"{m:.2f}% year to date ({qs[0]}–{qs[-1]})"
            investor.append({"id": t["id"], "text": t["text"], "deadline": t["deadline"], "stance": stance,
                             "evidence": evidence, "demo": True})

        n = led.get("counts", {})
        ev = sorted(events_by.get(sym, []), key=lambda e: e["at"], reverse=True)
        recent = [{"id": e["id"], "title": e["summary"] or e["title"], "at": e["at"], "tier": e["bucket"],
                   "url": e["url"]} for e in ev if e["kind"] == "filing"][:10]
        # "Needs you" on the Portfolio = a needs-you event in the last 7 days of the snapshot.
        needs = [e for e in ev if e["bucket"] == "needs_you" and e["at"] >= week_start]
        out[sym] = {
            "symbol": sym, "name": names.get(sym, sym), "sector": c["sector"], "role": c["role"],
            "basis": (results.get(sym) or {}).get("basis", c.get("results_basis", "consolidated")),
            "results_source": (results.get(sym) or {}).get("source"),
            "price": price, "quarters": quarters,
            "ledger": led["promises"], "has_ledger": "ledger" in c["role"].split(";"),
            "credibility": {"delivered": n.get("delivered", 0),
                            "resolved": n.get("delivered", 0) + n.get("missed", 0) + n.get("revised", 0)},
            "thesis": {"management": management, "investor": investor},
            "recent_filings": recent,
            "needs_you": bool(needs),
            "last_event": ({"title": (needs or ev)[0]["summary"] or (needs or ev)[0]["title"],
                            "at": (needs or ev)[0]["at"], "tier": (needs or ev)[0]["bucket"]} if ev else None),
        }
    (WEB / "companies.json").write_text(json.dumps({"as_of": as_of, "companies": out}, ensure_ascii=False, indent=1),
                                        encoding="utf-8")
    for sym, c in out.items():
        print(f"{sym:<11} q={len(c['quarters'])} ledger={len(c['ledger']):>2} mgmt={len(c['thesis']['management'])} "
              f"inv={[i['stance'] for i in c['thesis']['investor']]} needs_you={c['needs_you']}")


if __name__ == "__main__":
    main()
