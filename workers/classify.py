"""Rule-based filing classifier (no model). Categories follow ENAM's reference document.

Order matters: the first matching rule wins, so specific rules come before broad ones.
Rules look at NSE's subject ("desc") first, then the filing text ("attchmntText").
Anything unmatched is `unclassified`; a small model handles only that residue later.
"""
from __future__ import annotations

import re

# (category, regex on desc, optional regex on text that must also match)
RULES: list[tuple[str, str, str | None]] = [
    ("results", r"^integrated filing- financial|financial result", None),
    ("results", r"outcome of board meeting", r"financial result"),
    ("management_change", r"change in management|resignation|appointment|cessation|"
                          r"change in director|re-?appointment|change in key managerial", None),
    ("M&A", r"acquisition|amalgamation|merger|demerger|scheme of arrangement|joint venture|"
            r"disinvestment|sale or disposal", None),
    ("fund_raise", r"qualified institutional placement|preferential issue|rights issue|buy ?back|"
                   r"commercial paper|issue of securities|allotment of securities|"
                   r"non-convertible debentures", None),
    ("litigation", r"litigation|dispute|penalt|regulatory action|show cause|insolvency|"
                   r"order passed|tax demand", None),
    ("insider_trading", r"insider trading|sast|regulation 7\(2\)|regulation 29", None),
    ("pledging", r"pledge|encumbrance", None),
    ("credit_rating", r"credit rating", None),
    ("earnings_call", r"transcript|audio recording|con\. call|conference call|earnings call",
     r"transcript|recording|earnings call|conference call"),
    ("investor_meetings", r"analysts/institutional investor meet|investor presentation", None),
    ("dividend", r"dividend", None),
    ("bonus_split", r"bonus|sub-division|split", None),
    ("capex", r"expansion|capacity|capital expenditure|commissioning|new plant", None),
    ("postal_ballot", r"postal ballot", None),
    ("agm_egm", r"shareholders meeting|annual general meeting|extra-?ordinary general meeting|"
                r"\bagm\b|\begm\b|voting results", None),
    ("press_release", r"press release|bagging/receiving of orders|general updates|updates|"
                      r"clarification", None),
    ("unclassified", r"esop|esos|esps|newspaper publication|trading window|compliance certificate|"
                     r"monitoring agency|statement of deviation|loss of share certificate|"
                     r"record date|certificate under", None),
]
_COMPILED = [(c, re.compile(d, re.I), re.compile(t, re.I) if t else None) for c, d, t in RULES]

# Base materiality per category (README §6.2), used by triage. A heuristic, reported as such.
MATERIALITY = {
    "results": 0.9, "M&A": 0.85, "management_change": 0.8, "litigation": 0.8,
    "fund_raise": 0.7, "credit_rating": 0.6, "pledging": 0.7, "insider_trading": 0.5,
    "capex": 0.7, "press_release": 0.35, "dividend": 0.3, "bonus_split": 0.4,
    "earnings_call": 0.25, "investor_meetings": 0.15, "agm_egm": 0.15,
    "postal_ballot": 0.15, "unclassified": 0.05,
}


def classify(desc: str | None, text: str | None) -> str:
    desc, text = desc or "", text or ""
    for cat, d_re, t_re in _COMPILED:
        if d_re.search(desc) and (t_re is None or t_re.search(text)):
            return cat
    # Subject too generic: fall back to the text for the high-value categories only
    for cat in ("results", "management_change", "M&A", "credit_rating", "litigation"):
        for c, d_re, _ in _COMPILED:
            if c == cat and d_re.search(text):
                return cat
    return "unclassified"
