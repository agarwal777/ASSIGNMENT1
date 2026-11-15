"""B2 tests. Run from finn/:  workers/.venv/Scripts/python -m pytest workers/tests -q"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alerts import Thresholds, detect  # noqa: E402
from classify import classify  # noqa: E402
from parsers.xbrl_results import change, fy_quarter_label, headline, parse  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "MM_consolidated_Q2FY27.xml"


# ── fiscal labels ──
@pytest.mark.parametrize("end,label", [
    (date(2026, 9, 30), "Q2FY27"), (date(2026, 6, 30), "Q1FY27"),
    (date(2026, 3, 31), "Q4FY26"), (date(2025, 12, 31), "Q3FY26"),
])
def test_fy_quarter_label(end, label):
    assert fy_quarter_label(end) == label


# ── real filing: M&M consolidated Q2 FY27 (values read from the XBRL instance) ──
@pytest.mark.skipif(not FIXTURE.exists(), reason="fixture missing")
def test_mm_real_filing():
    r = parse(FIXTURE.read_bytes())
    assert r.period_label == "Q2FY27" and r.basis == "consolidated"
    assert r.revenue == 57553.13
    assert r.pbt == 6894.67 and r.tax == 2197.93 and r.pat == 5166.77
    assert r.associates == 470.03
    assert r.associates_in_pbt is False          # PBT − tax + associates = PAT
    # 6,894.67 + 2,681.93 + 1,831.88 − 1,187.02 = 10,221.46
    assert r.ebitda == 10221.46
    assert r.ebitda_margin_pct == 17.76
    assert not [w for w in r.warnings if "reconcile" in w]


# ── synthetic filings: associates inside PBT, exceptional items ──
def _xml(facts: dict[str, float], start="2026-07-01", end="2026-09-30") -> bytes:
    body = "".join(f'<in-bse-fin:{k} contextRef="Q" unitRef="INR" decimals="-5">{int(v * 1e7)}'
                   f'</in-bse-fin:{k}>' for k, v in facts.items())
    return (f'<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" '
            f'xmlns:in-bse-fin="http://example/in-bse-fin">'
            f'<xbrli:context id="Q"><xbrli:entity/><xbrli:period><xbrli:startDate>{start}'
            f'</xbrli:startDate><xbrli:endDate>{end}</xbrli:endDate></xbrli:period></xbrli:context>'
            f'<xbrli:unit id="INR"><xbrli:measure>iso4217:INR</xbrli:measure></xbrli:unit>'
            f'{body}</xbrli:xbrl>').encode()


def test_associates_inside_pbt_are_subtracted():
    r = parse(_xml({"RevenueFromOperations": 1000, "OtherIncome": 20, "FinanceCosts": 30,
                    "DepreciationDepletionAndAmortisationExpense": 50,
                    "ProfitBeforeExceptionalItemsAndTax": 200, "ProfitBeforeTax": 200,
                    "ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod": 10,
                    "TaxExpense": 50, "ProfitLossForPeriod": 150}))
    assert r.associates_in_pbt is True
    assert r.ebitda == 200 + 30 + 50 - 20 - 10   # 250


def test_immaterial_associates_do_not_warn():
    r = parse(_xml({"RevenueFromOperations": 1000, "OtherIncome": 10, "FinanceCosts": 10,
                    "DepreciationDepletionAndAmortisationExpense": 10,
                    "ProfitBeforeExceptionalItemsAndTax": 100, "ProfitBeforeTax": 100,
                    "ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod": 0.3,
                    "TaxExpense": 25, "ProfitLossForPeriod": 75.0}))
    assert not [w for w in r.warnings if "reconcile" in w]


def test_exceptional_loss_does_not_reach_ebitda():
    r = parse(_xml({"RevenueFromOperations": 1000, "OtherIncome": 0, "FinanceCosts": 10,
                    "DepreciationDepletionAndAmortisationExpense": 40,
                    "ProfitBeforeExceptionalItemsAndTax": 150, "ExceptionalItemsBeforeTax": -100,
                    "ProfitBeforeTax": 50, "TaxExpense": 10, "ProfitLossForPeriod": 40}))
    assert r.ebitda == 200                        # built from profit before exceptional items
    assert any("exceptional" in w for w in r.warnings)


def test_change_and_headline():
    assert change(110, 100) == 10.0
    assert change(5, -10) is None and change(None, 1) is None
    a = parse(_xml({"RevenueFromOperations": 1100, "OtherIncome": 0, "FinanceCosts": 0,
                    "DepreciationDepletionAndAmortisationExpense": 0,
                    "ProfitBeforeExceptionalItemsAndTax": 220, "ProfitBeforeTax": 220,
                    "TaxExpense": 55, "ProfitLossForPeriod": 165}))
    b = parse(_xml({"RevenueFromOperations": 1000, "OtherIncome": 0, "FinanceCosts": 0,
                    "DepreciationDepletionAndAmortisationExpense": 0,
                    "ProfitBeforeExceptionalItemsAndTax": 180, "ProfitBeforeTax": 180,
                    "TaxExpense": 45, "ProfitLossForPeriod": 135}, "2025-07-01", "2025-09-30"))
    h = headline(a, None, b)
    assert h["metrics"]["revenue"]["yoy_pct"] == 10.0
    assert h["ebitda_margin"]["yoy_bps"] == 200    # 20.0% vs 18.0%
    assert h["metrics"]["revenue"]["qoq_pct"] is None


# ── classifier ──
@pytest.mark.parametrize("desc,text,cat", [
    ("Integrated Filing- Financial", "", "results"),
    ("Outcome of Board Meeting", "approved the unaudited financial results", "results"),
    ("Outcome of Board Meeting", "approved fund raising by NCDs", "unclassified"),
    ("Change in Management", "", "management_change"),
    ("Resignation of Director/KMP/SMP", "", "management_change"),
    ("Acquisition", "", "M&A"),
    ("Credit Rating", "", "credit_rating"),
    ("Analysts/Institutional Investor Meet/Con. Call Updates", "Transcript of the call", "earnings_call"),
    ("Analysts/Institutional Investor Meet/Con. Call Updates", "schedule of meet", "investor_meetings"),
    ("Bagging/Receiving of orders/contracts", "", "press_release"),
    ("Copy of Newspaper Publication", "", "unclassified"),
    ("ESOP/ESOS/ESPS", "", "unclassified"),
])
def test_classify(desc, text, cat):
    assert classify(desc, text) == cat


# ── alerts ──
def _series(volumes, closes):
    d0 = date(2026, 1, 1)
    return [{"date": d0 + timedelta(days=i), "close": c, "volume": v}
            for i, (v, c) in enumerate(zip(volumes, closes))]


def test_volume_alert_at_brief_default():
    s = _series([100] * 20 + [250], [10.0] * 21)
    a = detect(s)
    assert len(a) == 1 and a[0]["volume_multiple"] == 2.5


def test_no_alert_at_exactly_2x_or_5pct():
    s = _series([100] * 20 + [200], [100.0] * 20 + [105.0])
    assert detect(s) == []


def test_alert_carries_previous_session_across_weekend():
    s = _series([100] * 20 + [300], [10.0] * 21)
    s[-1]["date"] = s[-2]["date"] + timedelta(days=3)   # Friday → Monday
    a = detect(s)
    assert a[0]["prev_session"] == s[-2]["date"]


def test_price_alert_and_custom_threshold():
    s = _series([100] * 21, [100.0] * 20 + [96.0])
    assert detect(s) == []
    a = detect(s, Thresholds(price_move_pct=3.0))
    assert a and a[0]["return_pct"] == -4.0
