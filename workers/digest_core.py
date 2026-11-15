"""Filings → scored events: the part of the Today brief that both the batch pipeline
(workers/build_digest.py) and the daily cloud job (py/refresh.py, which keeps a COPY of this file)
run. Pure functions over NSE announcement rows; no files, no network, no model.

score = (0.35·M + 0.25·S + 0.30·T) / 0.90. M (materiality) comes from the category, S (surprise) from
the numbers or the kind of change, T (thesis relevance) is added by the caller. The bucket follows from
the score; results, M&A, litigation and pledging are never folded.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime

from classify import MATERIALITY, classify, regulatory

KMP_RE = re.compile(r"\b(managing director|md\b|chief executive|ceo|chief financial|cfo|"
                    r"whole[- ]time director|executive director|chairman|chairperson)", re.I)
ROUTINE_MGMT_RE = re.compile(r"independent director|company secretary|compliance officer|"
                             r"senior management personnel|smp\b", re.I)
INFORMED_RE = re.compile(r"^.*?has informed the Exchange (about|regarding|that)\s*", re.I)
NEEDS_YOU, WORTH = 0.65, 0.35
FLOOR = {"results", "M&A", "litigation", "pledging"}   # never below "worth a read"


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



def dedupe_key(sym: str, day: str, subject: str | None) -> str:
    """Company + IST day + subject, lower-cased with punctuation removed: the same disclosure filed on
    NSE and BSE gets the same key."""
    subj = re.sub(r"[^a-z0-9]+", " ", (subject or "").lower()).strip()
    return f"{sym}|{day}|{subj}"



def filing_events(filings: list[dict], names: dict[str, str], sector: dict[str, str | None],
                  results: dict[str, dict]) -> list[dict]:
    """Group a company's filings by category and day into events, with M, S, reasons and a provisional
    score (T not yet applied). `results` maps a symbol to its latest headline numbers (xbrl_results.headline)."""
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
              "related": [{"title": x.get("desc"), "url": x.get("attchmntFile")} for x in rows[1:]],
              # Room for a second exchange: where it came from, and a key that matches the same filing on
              # another exchange (company + day + subject), so adding BSE later is a data change.
              "source_exchange": "NSE", "dedupe_key": dedupe_key(sym, day, lead.get("desc"))}
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
        if cat == "litigation":
            reg = regulatory(text)
            if reg == "severe":
                s = 0.8
                reasons.append("regulator action (warning letter, import alert, OAI or Form 483)")
            elif reg == "outcome":
                s = 0.3
                reasons.append("regulator inspection outcome")
        if cat == "credit_rating" and re.search(r"downgrad", text, re.I):
            m, s = 0.9, 1.0
            reasons.append("credit rating downgrade")
        ev["components"] = {"M": m, "S": round(s, 2), "T": None, "N": None}
        ev["score"] = round((0.35 * m + 0.25 * s) / 0.60, 3)
        ev["reasons"] = reasons or [cat.replace("_", " ")]
        events.append(ev)
    return events


def score(m: float, s: float, t: float) -> float:
    return round((0.35 * m + 0.25 * s + 0.30 * t) / 0.90, 3)


def set_bucket(ev: dict) -> None:
    b = "needs_you" if ev["score"] >= NEEDS_YOU else "worth_a_read" if ev["score"] >= WORTH else "collapsed"
    if ev["category"] in FLOOR and b == "collapsed":
        b = "worth_a_read"
        ev["reasons"].append("always shown: material category")
    ev["bucket"] = b
