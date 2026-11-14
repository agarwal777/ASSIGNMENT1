# COPY of workers/parsers/xbrl_results.py for the Vercel Python service (its root is py/ and it
# cannot import from workers/). Keep the two in sync; tests run against the workers copy.
"""Deterministic results parser for NSE Integrated Filing (Ind AS) XBRL.

No model touches these numbers. Observed on a real filing (M&M consolidated, Q2 FY27):
  * facts are in plain rupees (unit iso4217:INR); LevelOfRounding is only a display hint
  * one file = current quarter + year-to-date; prior quarters need their own filings
  * share of associates/JVs may sit after tax (M&M) or inside PBT — detected per filing

EBITDA (stated in the UI tooltip and the writeup):
  EBITDA = Profit before exceptional items and tax + Finance costs + D&A − Other income
           − Share of associates/JVs   (only when that share is inside PBT)
Starting from profit *before* exceptional items removes one-offs without guessing their sign.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from xml.etree import ElementTree as ET

CRORE = 10_000_000

# Element local-name → our field. Prefix matches cover long Ind AS names.
ELEMENTS = {
    "RevenueFromOperations": "revenue",
    "OtherIncome": "other_income",
    "FinanceCosts": "finance_costs",
    "DepreciationDepletionAndAmortisationExpense": "dna",
    "ProfitBeforeExceptionalItemsAndTax": "pbe",
    "ExceptionalItemsBeforeTax": "exceptional",
    "ProfitBeforeTax": "pbt",
    "TaxExpense": "tax",
    "ProfitLossForPeriod": "pat",
}
ASSOC_PREFIX = "ShareOfProfitLossOfAssociatesAndJointVentures"
RECONCILE_TOL_CR = 1.0  # ₹1 cr tolerance for rounding in the PAT reconciliation


@dataclass
class QuarterResult:
    period_end: date
    period_label: str           # e.g. Q2FY27
    basis: str                  # consolidated | standalone
    revenue: float | None = None
    other_income: float | None = None
    finance_costs: float | None = None
    dna: float | None = None
    pbe: float | None = None
    exceptional: float | None = None
    pbt: float | None = None
    tax: float | None = None
    pat: float | None = None
    associates: float = 0.0
    associates_in_pbt: bool | None = None
    ebitda: float | None = None
    ebitda_margin_pct: float | None = None
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["period_end"] = self.period_end.isoformat()
        return d


def fy_quarter_label(period_end: date) -> str:
    """Indian fiscal year runs April–March. 30 Sep 2026 → Q2FY27."""
    q = {6: 1, 9: 2, 12: 3, 3: 4}[period_end.month]
    fy = period_end.year + 1 if period_end.month >= 4 else period_end.year
    return f"Q{q}FY{fy % 100:02d}"


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse(xml_bytes: bytes) -> QuarterResult:
    root = ET.fromstring(xml_bytes)

    # Contexts without dimensions, keyed by id → (start, end)
    contexts: dict[str, tuple[date | None, date]] = {}
    for el in root:
        if _local(el.tag) != "context":
            continue
        if any(_local(x.tag) == "explicitMember" for x in el.iter()):
            continue
        start = el.find(".//{*}startDate")
        end = el.find(".//{*}endDate")
        if end is None:
            continue
        contexts[el.get("id")] = (
            date.fromisoformat(start.text) if start is not None else None,
            date.fromisoformat(end.text))

    # The quarter context: duration of roughly three months
    quarter_ids = {cid for cid, (s, e) in contexts.items()
                   if s is not None and 80 <= (e - s).days <= 95}
    if not quarter_ids:
        raise ValueError("no quarterly context found")
    period_end = contexts[next(iter(quarter_ids))][1]

    basis = "consolidated"
    vals: dict[str, float] = {}
    assoc = 0.0
    for el in root:
        name = _local(el.tag)
        if name == "NatureOfReportStandaloneConsolidated" and el.text:
            basis = "consolidated" if "consol" in el.text.lower() else "standalone"
        if el.get("contextRef") not in quarter_ids or el.text is None:
            continue
        try:
            v = float(el.text) / CRORE
        except ValueError:
            continue
        if name in ELEMENTS:
            vals[ELEMENTS[name]] = v
        elif name.startswith(ASSOC_PREFIX):
            assoc += v

    r = QuarterResult(period_end=period_end, period_label=fy_quarter_label(period_end),
                      basis=basis, associates=round(assoc, 2),
                      **{k: round(v, 2) for k, v in vals.items()})

    # Where does the associates line sit? Decide by arithmetic, not by assumption.
    if r.pbt is not None and r.tax is not None and r.pat is not None:
        after_tax = abs(r.pbt - r.tax + r.associates - r.pat) <= RECONCILE_TOL_CR
        inside = abs(r.pbt - r.tax - r.pat) <= RECONCILE_TOL_CR
        if abs(r.associates) <= RECONCILE_TOL_CR:
            # Immaterial: both placements reconcile within rounding; EBITDA moves < ₹1 cr.
            r.associates_in_pbt = False
        elif after_tax and not inside:
            r.associates_in_pbt = False
        elif inside and not after_tax:
            r.associates_in_pbt = True
        else:
            r.warnings.append("PAT does not reconcile with PBT, tax and associates; "
                              "discontinued operations or minority items may be present")

    pbe = r.pbe if r.pbe is not None else r.pbt
    if r.pbe is None:
        r.warnings.append("no profit-before-exceptional line; EBITDA uses PBT")
    needed = (pbe, r.finance_costs, r.dna, r.other_income)
    if all(x is not None for x in needed):
        e = pbe + r.finance_costs + r.dna - r.other_income
        if r.associates_in_pbt:
            e -= r.associates
        r.ebitda = round(e, 2)
        if r.revenue:
            r.ebitda_margin_pct = round(100 * r.ebitda / r.revenue, 2)
    else:
        r.warnings.append("missing a line needed for EBITDA")
    if r.exceptional:
        r.warnings.append(f"exceptional items of ₹{r.exceptional:,.2f} cr this quarter")
    return r


def change(cur: float | None, prev: float | None) -> float | None:
    """Percentage change; None when undefined (missing or prior ≤ 0)."""
    if cur is None or prev is None or prev <= 0:
        return None
    return round(100 * (cur - prev) / prev, 1)


def headline(cur: QuarterResult, prev_q: QuarterResult | None,
             prev_y: QuarterResult | None) -> dict:
    """The four headline numbers with QoQ / YoY. Margins move in basis points."""
    out: dict = {"period": cur.period_label, "basis": cur.basis, "metrics": {}}
    for m in ("revenue", "ebitda", "pbt", "pat"):
        c = getattr(cur, m)
        out["metrics"][m] = {
            "value_cr": c,
            "qoq_pct": change(c, getattr(prev_q, m) if prev_q else None),
            "yoy_pct": change(c, getattr(prev_y, m) if prev_y else None),
        }
    def bps(a, b):
        return None if a is None or b is None else round(100 * (a - b))
    out["ebitda_margin"] = {
        "pct": cur.ebitda_margin_pct,
        "qoq_bps": bps(cur.ebitda_margin_pct, prev_q.ebitda_margin_pct if prev_q else None),
        "yoy_bps": bps(cur.ebitda_margin_pct, prev_y.ebitda_margin_pct if prev_y else None),
    }
    out["warnings"] = cur.warnings
    return out
