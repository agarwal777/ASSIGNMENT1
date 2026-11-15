"""Balance sheet, cash flow and segment revenue from NSE Integrated Filing (Ind AS) XBRL.

Deterministic; no model. The annual (Q4) results filing carries the audited balance sheet at 31 March
and the full-year cash-flow statement; the half-year (Q2) filing carries them at 30 September and for
April–September. Both carry reportable-segment revenue for the quarter and the year to date.

Contexts (observed on Voltas FY25 and M&M FY27 filings):
  * balance sheet: an instant context with no dimensions ("OneI" = the period end)
  * cash flow and year-to-date P&L: the longest duration context with no dimensions ("FourD" / "TwoD")
  * segments: duration contexts with a ReportableSegmentsAxis member; names from DescriptionOfReportableSegment
Values are plain rupees (unit iso4217:INR) and are converted to ₹ crore; a line in any other unit is
refused, as in xbrl_results.py.
"""
from __future__ import annotations

from datetime import date
from xml.etree import ElementTree as ET

CRORE = 10_000_000

BALANCE = {
    "Assets": "total_assets", "Equity": "equity", "EquityAttributableToOwnersOfParent": "equity_owners",
    "BorrowingsNoncurrent": "borrowings_noncurrent", "BorrowingsCurrent": "borrowings_current",
    "CashAndCashEquivalents": "cash", "BankBalanceOtherThanCashAndCashEquivalents": "bank_balances",
    "Inventories": "inventories", "TradeReceivablesCurrent": "receivables", "TradePayablesCurrent": "payables",
    "CurrentAssets": "current_assets", "CurrentLiabilities": "current_liabilities",
}
FLOWS = {
    "CashFlowsFromUsedInOperatingActivities": "cfo", "CashFlowsFromUsedInInvestingActivities": "cfi",
    "CashFlowsFromUsedInFinancingActivities": "cff",
    "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities": "capex",
    "RevenueFromOperations": "revenue", "ProfitLossForPeriod": "pat",
}


class UnsupportedUnits(ValueError):
    """A line this parser reads is not in Indian rupees: refuse rather than mis-scale it."""


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse(xml_bytes: bytes) -> dict:
    root = ET.fromstring(xml_bytes)
    instants: dict[str, date] = {}
    durations: dict[str, tuple[date, date]] = {}
    segment_ctx: dict[str, tuple[str, date, date]] = {}   # id → (segment member, start, end)
    for el in root:
        if _local(el.tag) != "context":
            continue
        members = [x for x in el.iter() if _local(x.tag) == "explicitMember"]
        inst, start, end = el.find(".//{*}instant"), el.find(".//{*}startDate"), el.find(".//{*}endDate")
        if members:
            seg = [m.text for m in members if m.get("dimension", "").endswith("ReportableSegmentsAxis") and m.text]
            if len(members) == 1 and seg and start is not None and end is not None:
                segment_ctx[el.get("id")] = (seg[0].split(":")[-1], date.fromisoformat(start.text), date.fromisoformat(end.text))
            continue
        if inst is not None:
            instants[el.get("id")] = date.fromisoformat(inst.text)
        elif start is not None and end is not None:
            durations[el.get("id")] = (date.fromisoformat(start.text), date.fromisoformat(end.text))
    if not instants or not durations:
        raise ValueError("no balance-sheet or duration context")

    units: dict[str, str] = {}
    for el in root:
        if _local(el.tag) == "unit":
            ms = [m.text.strip() for m in el.iter() if _local(m.tag) == "measure" and m.text]
            units[el.get("id")] = ms[0] if len(ms) == 1 else "/".join(ms)

    # The balance-sheet date is the latest instant; the cash-flow period the longest duration ending on it.
    bs_date = max(instants.values())
    bs_ids = {cid for cid, d in instants.items() if d == bs_date}
    ytd = max((d for d in durations.values() if d[1] == bs_date), key=lambda d: (d[1] - d[0]).days, default=None)
    if ytd is None:
        raise ValueError("no duration ending on the balance-sheet date")
    ytd_ids = {cid for cid, d in durations.items() if d == ytd}

    basis = "consolidated"
    bal: dict[str, float] = {}
    flow: dict[str, float] = {}
    seg_names: dict[str, str] = {}
    seg_rev: dict[tuple[str, str], float] = {}   # (member, "q" | "ytd") → ₹ cr
    elements: dict[str, str] = {}

    def value(el) -> float | None:
        measure = units.get(el.get("unitRef"), "")
        if measure.split(":")[-1].upper() != "INR":
            raise UnsupportedUnits(f"{_local(el.tag)} is reported in {measure or 'an undeclared unit'}, not INR")
        try:
            return float(el.text) / CRORE
        except (TypeError, ValueError):
            return None

    for el in root:
        name, ctx = _local(el.tag), el.get("contextRef")
        if name == "NatureOfReportStandaloneConsolidated" and el.text:
            basis = "consolidated" if "consol" in el.text.lower() else "standalone"
        if el.text is None or ctx is None:
            continue
        if name in BALANCE and ctx in bs_ids:
            v = value(el)
            if v is not None:
                bal[BALANCE[name]] = round(v, 2)
                elements[BALANCE[name]] = name
        elif name in FLOWS and ctx in ytd_ids:
            v = value(el)
            if v is not None:
                flow[FLOWS[name]] = round(v, 2)
                elements[FLOWS[name]] = name
        elif ctx in segment_ctx:
            member, s, e = segment_ctx[ctx]
            if e != bs_date:
                continue
            if name == "DescriptionOfReportableSegment":
                seg_names[member] = " ".join(el.text.split())
            elif name == "SegmentRevenue":
                v = value(el)
                if v is not None:
                    seg_rev[(member, "ytd" if (s, e) == ytd else "q")] = round(v, 2)

    if "capex" in flow:
        flow["capex"] = abs(flow["capex"])   # filers report the outflow with either sign; it is cash paid
    segments = [{"name": seg_names.get(m, m), "revenue_q": seg_rev.get((m, "q")), "revenue_ytd": seg_rev.get((m, "ytd"))}
                for m in sorted({m for m, _ in seg_rev}, key=lambda x: (len(x), x))]
    return {
        "basis": basis, "balance_date": bs_date.isoformat(), "balance": bal,
        "flow_from": ytd[0].isoformat(), "flow_to": ytd[1].isoformat(), "flow": flow,
        "segments": segments, "elements": elements,
    }
