"""Balance sheet, cash flow and segments from a synthetic Integrated Filing (contexts as observed)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parsers.xbrl_statements import UnsupportedUnits, parse  # noqa: E402

CR = 10_000_000


def filing(unit_measure: str = "iso4217:INR") -> bytes:
    def ctx(cid, period, seg=None):
        scen = (f'<xbrli:scenario><xbrldi:explicitMember dimension="in-capmkt:ReportableSegmentsAxis">'
                f'in-capmkt:{seg}</xbrldi:explicitMember></xbrli:scenario>') if seg else ""
        return (f'<xbrli:context id="{cid}"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier>'
                f'</xbrli:entity><xbrli:period>{period}</xbrli:period>{scen}</xbrli:context>')
    q = "<xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate>"
    y = "<xbrli:startDate>2025-04-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate>"
    fact = lambda n, c, v: f'<in-capmkt:{n} contextRef="{c}" unitRef="INR" decimals="-5">{int(v * CR)}</in-capmkt:{n}>'
    text = lambda n, c, v: f'<in-capmkt:{n} contextRef="{c}">{v}</in-capmkt:{n}>'
    body = "".join([
        ctx("OneI", "<xbrli:instant>2026-03-31</xbrli:instant>"), ctx("PY_I", "<xbrli:instant>2025-03-31</xbrli:instant>"),
        ctx("OneD", q), ctx("FourD", y),
        ctx("OneReportable1D", q, "ReportableSegments1Member"), ctx("FourReportable1D", y, "ReportableSegments1Member"),
        ctx("FourReportable2D", y, "ReportableSegments2Member"),
        f'<xbrli:unit id="INR"><xbrli:measure>{unit_measure}</xbrli:measure></xbrli:unit>',
        text("NatureOfReportStandaloneConsolidated", "OneD", "Consolidated"),
        fact("BorrowingsNoncurrent", "OneI", 300), fact("BorrowingsCurrent", "OneI", 200), fact("CashAndCashEquivalents", "OneI", 150),
        fact("BorrowingsNoncurrent", "PY_I", 999),          # prior year-end: must not be picked
        fact("EquityAttributableToOwnersOfParent", "OneI", 1000),
        fact("CashFlowsFromUsedInOperatingActivities", "FourD", 120), fact("ProfitLossForPeriod", "FourD", 100),
        fact("PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "FourD", -40),
        fact("RevenueFromOperations", "FourD", 2000), fact("RevenueFromOperations", "OneD", 600),
        text("DescriptionOfReportableSegment", "FourReportable1D", "Segment - A ( Cooling )"),
        text("DescriptionOfReportableSegment", "FourReportable2D", "Segment - B ( Projects )"),
        fact("SegmentRevenue", "OneReportable1D", 450), fact("SegmentRevenue", "FourReportable1D", 1500),
        fact("SegmentRevenue", "FourReportable2D", 500),
    ])
    return (f'<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" '
            f'xmlns:in-capmkt="http://www.sebi.gov.in/xbrl/in-capmkt">{body}</xbrli:xbrl>').encode()


def test_year_end_balance_full_year_flow_and_segments():
    r = parse(filing())
    assert r["basis"] == "consolidated"
    assert r["balance_date"] == "2026-03-31" and (r["flow_from"], r["flow_to"]) == ("2025-04-01", "2026-03-31")
    assert r["balance"] == {"borrowings_noncurrent": 300, "borrowings_current": 200, "cash": 150, "equity_owners": 1000}
    assert r["flow"]["cfo"] == 120 and r["flow"]["pat"] == 100 and r["flow"]["revenue"] == 2000
    assert r["flow"]["capex"] == 40            # cash paid, whatever sign it was filed with
    assert r["segments"] == [
        {"name": "Segment - A ( Cooling )", "revenue_q": 450, "revenue_ytd": 1500},
        {"name": "Segment - B ( Projects )", "revenue_q": None, "revenue_ytd": 500},
    ]


def test_non_rupee_units_are_refused():
    with pytest.raises(UnsupportedUnits):
        parse(filing("iso4217:USD"))
