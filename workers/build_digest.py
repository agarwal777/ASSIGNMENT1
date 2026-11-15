"""B3: build web/data/digest.json — every event the Today screen can show, pre-scored.

Events = portfolio filings (classified by rules) + price/volume alerts. Each event gets a score in
[0, 1] with human-readable reason chips, then a bucket. The app only filters by time window; it
never re-scores, so what you see is exactly what this file decided — and why.

Score (README §6.2): 0.35·M + 0.25·S + 0.30·T + 0.10·N.
M, S and T are decided here; the bucket uses (0.35·M + 0.25·S + 0.30·T) / 0.90.
T: 1.0 results behind (or missing) a numeric thesis item · 0.7 results that touch one · 0.4 any other
event about a company you own. N (network) depends on the investor's private contacts, so it is
added on the device (weight 0.10) and only reorders cards within "Needs you". Stated, not hidden.

Usage (from finn/):  workers/.venv/Scripts/python workers/build_digest.py
"""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from alerts import _filing_dates
from classify import classify
from digest_core import filing_events, score, set_bucket, dedupe_key, NEEDS_YOU, WORTH  # noqa: F401
from thesis import load as load_thesis, promise_check, thesis_for

SEED = Path("seed")
OUT = Path("web/data/digest.json")
DEFAULT_AS_OF = "2026-11-06T08:00:00+05:30"   # morning after the busiest filing day (5 Nov)



def load_names() -> dict[str, str]:
    names = {}
    for r in json.loads((SEED / "filings" / "recent.json").read_text(encoding="utf-8")):
        names.setdefault(r["symbol"], r.get("sm_name") or r["symbol"])
    return names



def qkey(q: str) -> tuple[int, int]:
    return int(q[-2:]), int(q[1])


FACT_SRC: dict[tuple[str, str], str] = {}     # (symbol, period) → the XBRL file the period's facts came from
FACTS_RAW: dict[tuple[str, str], dict[str, float]] = defaultdict(dict)
INPUT_METRICS = ("revenue", "ebitda", "pbt", "pat", "exceptional", "finance_costs", "dna", "other_income", "associates")


def load_fact_sources() -> None:
    for r in csv.DictReader((SEED / "facts.csv").open(encoding="utf-8")):
        FACT_SRC[(r["symbol"], r["period"])] = r["source"]
        FACTS_RAW[(r["symbol"], r["period"])][r["metric"]] = float(r["value_cr"])


def prev_q(p: str) -> str:
    q, fy = int(p[1]), int(p[-2:])
    return f"Q4FY{fy - 1:02d}" if q == 1 else f"Q{q - 1}FY{fy:02d}"


def inputs(sym: str, period: str | None) -> dict | None:
    """The reported facts behind a results card's growth and margin numbers, with their XBRL files,
    so the formula sheet can show real inputs. EBITDA's associates placement is decided by arithmetic,
    as in the parser (associates inside PBT when subtracting them reproduces the stored EBITDA)."""
    if not period or not period.startswith("Q"):
        return None
    out: dict = {"periods": {"cur": period, "qoq": prev_q(period), "yoy": f"Q{period[1]}FY{int(period[-2:]) - 1:02d}"},
                 "facts": {}, "sources": {}, "assoc_inside": {}}
    for p in out["periods"].values():
        m = FACTS_RAW.get((sym, p))
        if not m:
            continue
        out["facts"][p] = {k: m[k] for k in INPUT_METRICS if k in m}
        out["sources"][p] = FACT_SRC.get((sym, p))
        base = m.get("pbt", 0) - m.get("exceptional", 0) + m.get("finance_costs", 0) + m.get("dna", 0) - m.get("other_income", 0)
        out["assoc_inside"][p] = "ebitda" in m and abs(base - m["ebitda"]) >= 0.05 and abs(base - m.get("associates", 0) - m["ebitda"]) < 0.05
    return out if period in out["facts"] else None


def compact_quarters(syms: set[str], n: int = 8) -> dict[str, list]:
    out = {}
    for sym in sorted(syms):
        qs = sorted({p for (s_, p) in FACTS_RAW if s_ == sym and len(p) == 6 and p.startswith("Q")}, key=qkey)[-n:]
        rows = []
        for q in qs:
            m = FACTS_RAW[(sym, q)]
            rev, eb = m.get("revenue"), m.get("ebitda")
            rows.append([q, round(rev, 2) if rev is not None else None,
                         round(100 * eb / rev, 2) if rev and eb is not None else None])
        if rows:
            out[sym] = rows
    return out


def trend(fx: dict, period: str | None, n: int = 5) -> list[dict]:
    """Up to n quarters ending at this results period, for the card's small trend chart."""
    if not period or not period.startswith("Q"):
        return []
    qs = sorted({p for (p, m) in fx if m == "revenue" and len(p) == 6 and p.startswith("Q")}, key=qkey)
    out = []
    for q in [q for q in qs if qkey(q) <= qkey(period)][-n:]:
        rev, eb = fx.get((q, "revenue")), fx.get((q, "ebitda"))
        out.append({"period": q, "revenue": rev, "ebitda_margin": round(100 * eb / rev, 2) if rev and eb is not None else None})
    return out


WEB_DATA = Path("web/data")
MOVES_FROM = "2026-08-15"   # ≥ 20 sessions of lookback + 30 for the volume strip before the 31 Oct window



def write_moves(syms: set[str], filed_at: dict, names: dict, sector: dict) -> None:
    """Inputs for re-scoring price/volume moves on the device with the investor's own thresholds
    (web/lib/moves.ts mirrors alerts.detect and the move scoring above; a test checks they agree)."""
    series: dict[str, list] = defaultdict(list)
    for r in csv.DictReader((SEED / "prices.csv").open(encoding="utf-8")):
        if r["symbol"] in syms and r["date"] >= MOVES_FROM:
            series[r["symbol"]].append([r["date"], float(r["close"]), int(r["volume"])])
    filed = _filing_dates()
    window_start = min((d for ds in filed.values() for d in ds), default=None)
    (WEB_DATA / "moves.json").write_text(json.dumps({
        "window_start": window_start.isoformat() if window_start else None,
        "names": {k: names.get(k, k) for k in sorted(syms)}, "sector": {k: sector.get(k) for k in sorted(syms)},
        "alerts_from": "2026-10-31",
        "series": {k: sorted(v) for k, v in series.items()},
        "filed_days": {k: sorted(d.isoformat() for d in v) for k, v in filed.items() if k in syms},
        "filed_at": {k: sorted(t.isoformat() for t in v) for k, v in filed_at.items()},
    }, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    portfolio = [r for r in csv.DictReader((SEED / "portfolio.csv").open(encoding="utf-8"))
                 if "portfolio" in r["role"]]
    syms = {r["symbol"] for r in portfolio}
    sector = {r["symbol"]: r["sector"] for r in portfolio}
    names = load_names()
    results = json.loads((SEED / "results.json").read_text(encoding="utf-8"))
    alerts = json.loads((SEED / "alerts.json").read_text(encoding="utf-8"))
    filings = [r for r in json.loads((SEED / "filings" / "recent.json").read_text(encoding="utf-8"))
               if r.get("symbol") in syms]

    # For anomaly cards: the 30 sessions up to each day, and hours since the company's last filing.
    series: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for r in csv.DictReader((SEED / "prices.csv").open(encoding="utf-8")):
        series[r["symbol"]].append((r["date"], int(r["volume"])))
    volumes: dict[str, dict[str, list[int]]] = defaultdict(dict)
    for sym, s in series.items():
        s.sort()
        for i, (d, _) in enumerate(s):
            volumes[sym][d] = [v for _, v in s[max(0, i - 29): i + 1]]
    filed_at: dict[str, list[datetime]] = defaultdict(list)
    for r in filings:
        filed_at[r["symbol"]].append(datetime.strptime(r["an_dt"], "%d-%b-%Y %H:%M:%S"))

    def hours_since_filing(sym: str, day: str) -> int | None:
        close = datetime.fromisoformat(day + "T15:30:00")
        before = [t for t in filed_at.get(sym, []) if t <= close]
        return int((close - max(before)).total_seconds() // 3600) if before else None

    events = filing_events(filings, names, sector, results)

    for a in alerts:
        if a["symbol"] not in syms or a["date"] < "2026-10-31":
            continue
        unexplained = a.get("unexplained") is True
        big = abs(a.get("return_pct") or 0) >= 10 or (a.get("volume_multiple") or 0) >= 5
        # A filing may explain a move, but a ±10% day or 5× volume still deserves attention.
        m = 0.6 if unexplained else 0.5 if big else 0.35
        s = min(max((a.get("volume_multiple") or 0) / 4, abs(a.get("return_pct") or 0) / 10), 1)
        reasons = list(a["reasons"]) + (["no filing since the previous session"] if unexplained else [])
        events.append({
            "id": f"{a['symbol']}-move-{a['date']}", "symbol": a["symbol"],
            "name": names.get(a["symbol"], a["symbol"]), "sector": sector.get(a["symbol"]),
            "kind": "move", "category": "unexplained_move" if unexplained else "price_volume",
            "at": a["date"] + "T15:30:00+05:30",   # end-of-day data: stamped at market close
            "title": "Unexplained move" if unexplained else "Price / volume move",
            "summary": "; ".join(a["reasons"]), "url": None, "related": [],
            "move": {k: a.get(k) for k in ("volume_multiple", "return_pct")},
            "volume30d": volumes[a["symbol"]].get(a["date"], []),
            "no_filing_hours": hours_since_filing(a["symbol"], a["date"]),
            "components": {"M": m, "S": round(s, 2), "T": None, "N": None},
            "score": round((0.35 * m + 0.25 * s) / 0.60, 3), "reasons": reasons})

    # Thesis relevance (T): link results to the investor's thesis, add management's own guidance check.
    facts, ledger, theses = load_thesis()
    load_fact_sources()
    for ev in events:
        sym = ev["symbol"]
        fx, led = facts.get(sym, {}), ledger.get(sym, {})
        th = thesis_for(fx, led, theses.get(sym, []))
        t, linked = 0.4, []
        res = ev.get("results")
        if res and res.get("metrics"):
            numeric = [i for i in th["investor"] + th["management"] if i["metric"] in ("ebitda_margin", "revenue_growth")]
            if numeric:
                linked = sorted(numeric, key=lambda i: (i["stance"] != "contradicts", i["source"] != "investor"))
                hit = any(i["stance"] == "contradicts" for i in numeric)
                t = 1.0 if hit else 0.7
                top = linked[0]
                word = "missed" if top["status"] == "missed" else "behind"   # same words as the status pills
                ev["reasons"].insert(0, (f"{word} your assumption" if top["source"] == "investor"
                                         else f"{word} management's guidance") if hit else "touches your thesis")
            ev["trend"] = trend(fx, res.get("period"))
            ev["inputs"] = inputs(sym, res.get("period"))
            pc = promise_check(fx, led, res.get("period"))
            if pc:
                ev["promise_check"] = pc
        # A change at the top is qualitative evidence on any thesis you hold (README §6.2: 0.7).
        if ev["category"] == "management_change" and "top-management change" in ev["reasons"] \
                and (th["investor"] or th["management"]):
            t = 0.7
            ev["reasons"].insert(0, "touches your thesis (leadership)")
        ev["thesis"] = linked[:1]
        m, s_ = ev["components"]["M"], ev["components"]["S"]
        ev["components"]["T"] = t
        ev["score"] = score(m, s_, t)

    for ev in events:
        set_bucket(ev)
    events.sort(key=lambda e: e["at"], reverse=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "default_as_of": DEFAULT_AS_OF,
        "scoring_note": "score = (0.35·materiality + 0.25·surprise + 0.30·thesis) / 0.90; your network adds up to "
                        "0.10 on your device and only reorders cards. Weights are a starting heuristic",
        "events": events,
        # Compact quarters per company, so an edited investor assumption can be re-checked on the device
        # (Today and Portfolio) with the same rule as workers/thesis.py: [period, revenue ₹ cr, EBITDA margin %].
        "quarters": compact_quarters(syms)}, ensure_ascii=False, indent=1), encoding="utf-8")
    write_moves(syms, filed_at, names, sector)
    by = defaultdict(int)
    for e in events:
        by[e["bucket"]] += 1
    print(f"{len(events)} events → {OUT}  ({dict(by)})")
    day = [e for e in events if "2026-11-05T08" <= e["at"] < "2026-11-06T08"]
    print(f"default window (24h to {DEFAULT_AS_OF[:16]}): {len(day)} events")
    for e in sorted(day, key=lambda e: -e["score"])[:12]:
        print(f"  {e['score']:.2f} {e['bucket']:<12} {e['symbol']:<11} {e['category']:<18} "
              f"{'; '.join(e['reasons'])[:70]}")


if __name__ == "__main__":
    main()
