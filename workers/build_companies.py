"""B5: one record per company for the Portfolio list and the Company page → web/data/companies.json.

Inputs (all already in the snapshot): portfolio.csv, prices.csv, facts.csv, results.json,
web/data/ledger.json, web/data/digest.json, theses.csv (demo investor assumptions, labelled as such).
Everything is deterministic: stances on numeric assumptions are rule checks against reported facts.

Usage (from finn/):  workers/.venv/Scripts/python workers/build_companies.py
"""
from __future__ import annotations

import csv
import json
import re
from datetime import datetime as _dt
from collections import defaultdict
from pathlib import Path

SEED, WEB = Path("seed"), Path("web/data")

from thesis import thesis_for


RECENT = json.loads(Path("seed/filings/recent.json").read_text(encoding="utf-8"))
TRANSCRIPT = re.compile("transcript", re.I)


def transcripts_on_nse(sym: str, recent: list[dict]) -> dict:
    """Earnings-call transcripts this company filed on NSE in the snapshot (a year of history where we
    pulled it, otherwise the recent window). Shown when there is no ledger: extraction runs offline."""
    hist = Path(f"seed/filings/history_{sym}.json")
    rows = json.loads(hist.read_text(encoding="utf-8")) if hist.exists() else [x for x in recent if x["symbol"] == sym]
    rows = rows if isinstance(rows, list) else rows.get("data", [])
    hits = [x for x in rows if TRANSCRIPT.search((x.get("attchmntText") or "") + x.get("desc", "") + x.get("attchmntFile", ""))]
    window = rows if hist.exists() else recent      # the window searched, not this company's first filing
    since = min((_dt.strptime(x["an_dt"][:11], "%d-%b-%Y") for x in window), default=None)
    return {"count": len(hits), "since": since.date().isoformat() if since else None}


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
        thesis = thesis_for(fx, led, theses.get(sym, []))   # same stances the Today cards use
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
            "transcripts": transcripts_on_nse(sym, RECENT),
            "credibility": {"met": n.get("met", 0), "resolved": n.get("met", 0) + n.get("missed", 0)},
            "thesis": thesis,
            "recent_filings": recent,
            "needs_you": bool(needs),
            "last_event": ({"title": (needs or ev)[0]["summary"] or (needs or ev)[0]["title"],
                            "at": (needs or ev)[0]["at"], "tier": (needs or ev)[0]["bucket"]} if ev else None),
        }
    (WEB / "companies.json").write_text(json.dumps({"as_of": as_of, "companies": out}, ensure_ascii=False, indent=1),
                                        encoding="utf-8")
    write_prices(set(out))
    for sym, c in out.items():
        print(f"{sym:<11} q={len(c['quarters'])} ledger={len(c['ledger']):>2} mgmt={len(c['thesis']['management'])} "
              f"inv={[i['status'] for i in c['thesis']['investor']]} needs_you={c['needs_you']}")


def write_prices(syms: set[str]) -> None:
    """The year of end-of-day closes already in the snapshot, for the Company page's price chart →
    web/data/prices.json ({symbol: [[date, close], …]}). Read only by the server; one company's
    series reaches the browser with its page."""
    series: dict[str, list] = defaultdict(list)
    for r in csv.DictReader((SEED / "prices.csv").open(encoding="utf-8")):
        if r["symbol"] in syms:
            series[r["symbol"]].append([r["date"], round(float(r["close"]), 2)])
    (WEB / "prices.json").write_text(json.dumps({k: sorted(v) for k, v in sorted(series.items())},
                                                separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
