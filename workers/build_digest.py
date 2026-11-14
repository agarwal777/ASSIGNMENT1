"""B3: build web/data/digest.json — every event the Today screen can show, pre-scored.

Events = portfolio filings (classified by rules) + price/volume alerts. Each event gets a score in
[0, 1] with human-readable reason chips, then a bucket. The app only filters by time window; it
never re-scores, so what you see is exactly what this file decided — and why.

Score (README §6.2): 0.35·M + 0.25·S + 0.30·T + 0.10·N.
T (thesis relevance) and N (network bonus) arrive with the ledger and network blocks. Until then
the score is renormalised over the parts that exist: (0.35·M + 0.25·S) / 0.60. Stated, not hidden.

Usage (from finn/):  workers/.venv/Scripts/python workers/build_digest.py
"""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from classify import MATERIALITY, classify

SEED = Path("seed")
OUT = Path("web/data/digest.json")
DEFAULT_AS_OF = "2026-11-06T08:00:00+05:30"   # morning after the busiest filing day (5 Nov)

KMP_RE = re.compile(r"\b(managing director|md\b|chief executive|ceo|chief financial|cfo|"
                    r"whole[- ]time director|executive director|chairman|chairperson)", re.I)
ROUTINE_MGMT_RE = re.compile(r"independent director|company secretary|compliance officer|"
                             r"senior management personnel|smp\b", re.I)
INFORMED_RE = re.compile(r"^.*?has informed the Exchange (about|regarding|that)\s*", re.I)
NEEDS_YOU, WORTH = 0.65, 0.35
FLOOR = {"results", "M&A", "litigation", "pledging"}   # never below "worth a read"


def load_names() -> dict[str, str]:
    names = {}
    for r in json.loads((SEED / "filings" / "recent.json").read_text(encoding="utf-8")):
        names.setdefault(r["symbol"], r.get("sm_name") or r["symbol"])
    return names


def summary(text: str) -> str:
    """NSE's own one-line description, minus the boilerplate prefix. No model involved."""
    s = INFORMED_RE.sub("", (text or "").strip())
    s = re.sub(r"\s+", " ", s)
    return (s[:1].upper() + s[1:]) if s else ""


def surprise_results(h: dict) -> tuple[float, list[str]]:
    m, em = h.get("metrics", {}), h.get("ebitda_margin", {})
    reasons, s = [], 0.0
    yoy_bps = em.get("yoy_bps")
    rev_yoy = (m.get("revenue") or {}).get("yoy_pct")
    pat_yoy = (m.get("pat") or {}).get("yoy_pct")
    if yoy_bps is not None and abs(yoy_bps) >= 150:
        s = max(s, min(abs(yoy_bps) / 500, 1))
        reasons.append(f"EBITDA margin {yoy_bps:+} bps YoY")
    if rev_yoy is not None and (rev_yoy < 0 or rev_yoy > 25):
        s = max(s, min(abs(rev_yoy) / 40, 1))
        reasons.append(f"revenue {rev_yoy:+}% YoY")
    if pat_yoy is not None and abs(pat_yoy) >= 30:
        s = max(s, min(abs(pat_yoy) / 60, 1))
        reasons.append(f"PAT {pat_yoy:+}% YoY")
    return s, reasons   # parser warnings are shown on the card as notes, not repeated as chips


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

    # Group same company + category + day: results day brings an outcome, a press release,
    # a newspaper ad and a deck — one card, not four.
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in filings:
        when = datetime.strptime(r["an_dt"], "%d-%b-%Y %H:%M:%S")
        cat = classify(r.get("desc"), r.get("attchmntText"))
        groups[(r["symbol"], cat, when.date())].append({**r, "_when": when, "_cat": cat})

    events = []
    for (sym, cat, day), rows in groups.items():
        rows.sort(key=lambda x: x["_when"])
        lead = rows[0]
        if cat == "management_change":
            # Lead with the most senior change in the group (an MD/CEO beats a chairman or director).
            for pat in (r"managing director|chief executive|\bceo\b", r"chief financial|\bcfo\b", KMP_RE.pattern):
                hit = next((x for x in rows if re.search(pat, x.get("attchmntText") or "", re.I)), None)
                if hit:
                    lead = hit
                    break
            rows = [lead] + [x for x in rows if x is not lead]
        text = " ".join(x.get("attchmntText") or "" for x in rows)
        m, reasons, s = MATERIALITY.get(cat, 0.05), [], 0.0
        ev = {"id": f"{sym}-{cat}-{day}", "symbol": sym, "name": names.get(sym, sym),
              "sector": sector.get(sym), "kind": "filing", "category": cat,
              "at": lead["_when"].isoformat() + "+05:30", "title": lead.get("desc"),
              "summary": summary(lead.get("attchmntText")), "url": lead.get("attchmntFile"),
              "related": [{"title": x.get("desc"), "url": x.get("attchmntFile")} for x in rows[1:]]}
        if cat == "management_change":
            if re.search(r"re-?appointment|continuation|redesignat", text, re.I) \
                    and not re.search(r"(?<!re-)(?<!re)appointment of", text, re.I):
                m = 0.35   # same person, same seat: continuity, not news
                reasons.append("re-appointment (continuity)")
            elif KMP_RE.search(text):
                m, s = 0.85, 0.5   # a change at the top is itself the surprise
                reasons.append("top-management change")
            elif ROUTINE_MGMT_RE.search(text):
                m = 0.3
                reasons.append("board / secretarial change")
        if cat == "results" and sym in results and results[sym].get("metrics"):
            ev["results"] = results[sym]
            s, rs = surprise_results(results[sym])
            reasons += rs
        elif cat == "results":
            reasons.append("numbers not machine-readable in the filing")
        if cat == "credit_rating" and re.search(r"downgrad", text, re.I):
            m, s = 0.9, 1.0
            reasons.append("credit rating downgrade")
        ev["components"] = {"M": m, "S": round(s, 2), "T": None, "N": None}
        ev["score"] = round((0.35 * m + 0.25 * s) / 0.60, 3)
        ev["reasons"] = reasons or [cat.replace("_", " ")]
        events.append(ev)

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
            "components": {"M": m, "S": round(s, 2), "T": None, "N": None},
            "score": round((0.35 * m + 0.25 * s) / 0.60, 3), "reasons": reasons})

    for ev in events:
        b = "needs_you" if ev["score"] >= NEEDS_YOU else "worth_a_read" if ev["score"] >= WORTH else "collapsed"
        if ev["category"] in FLOOR and b == "collapsed":
            b = "worth_a_read"
            ev["reasons"].append("always shown: material category")
        ev["bucket"] = b
    events.sort(key=lambda e: e["at"], reverse=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "default_as_of": DEFAULT_AS_OF,
        "scoring_note": "score = (0.35·materiality + 0.25·surprise) / 0.60 until thesis and "
                        "network signals exist; weights are a starting heuristic",
        "events": events}, ensure_ascii=False, indent=1), encoding="utf-8")
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
