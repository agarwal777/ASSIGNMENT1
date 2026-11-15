"""Hardening step 3: refuse lines not in rupees; never guess the sign of exceptional items;
keep the Vercel function's parser copy identical to this one."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "workers"))

from parsers.xbrl_results import UnsupportedUnits, parse  # noqa: E402


def _xml(facts: dict[str, float], measure: str = "iso4217:INR", declare: bool = True) -> bytes:
    unit = f'<xbrli:unit id="U"><xbrli:measure>{measure}</xbrli:measure></xbrli:unit>' if declare else ""
    body = "".join(f'<x:{k} contextRef="OneD" unitRef="U" decimals="-5">{int(v * 1e7)}</x:{k}>' for k, v in facts.items())
    return (f'<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:x="http://example/x">'
            f'<xbrli:context id="OneD"><xbrli:entity/><xbrli:period><xbrli:startDate>2026-07-01</xbrli:startDate>'
            f'<xbrli:endDate>2026-09-30</xbrli:endDate></xbrli:period></xbrli:context>{unit}{body}</xbrli:xbrl>').encode()


BASE = {"RevenueFromOperations": 1000, "OtherIncome": 20, "FinanceCosts": 30,
        "DepreciationDepletionAndAmortisationExpense": 50, "TaxExpense": 50, "ProfitLossForPeriod": 150}


def test_rupees_with_negative_decimals_are_read():
    r = parse(_xml({**BASE, "ProfitBeforeExceptionalItemsAndTax": 200, "ProfitBeforeTax": 200}))
    assert r.revenue == 1000 and r.ebitda == 260   # 200 + 30 + 50 − 20


@pytest.mark.parametrize("measure", ["iso4217:USD", "xbrli:pure"])
def test_line_not_in_rupees_is_refused(measure):
    with pytest.raises(UnsupportedUnits):
        parse(_xml({**BASE, "ProfitBeforeTax": 200}, measure=measure))


def test_undeclared_unit_is_refused():
    with pytest.raises(UnsupportedUnits):
        parse(_xml({**BASE, "ProfitBeforeTax": 200}, declare=False))


def test_no_pbe_line_and_no_exceptional_items_uses_pbt():
    r = parse(_xml({**BASE, "ProfitBeforeTax": 200}))
    assert r.ebitda == 260
    assert any("uses PBT" in w for w in r.warnings)


def test_no_pbe_line_with_exceptional_items_leaves_ebitda_out():
    # Without the before-exceptional line we can't tell whether ₹40 cr was a gain or a loss.
    r = parse(_xml({**BASE, "ProfitBeforeTax": 240, "ExceptionalItemsBeforeTax": 40}))
    assert r.ebitda is None and r.ebitda_margin_pct is None
    assert any("EBITDA not computed" in w for w in r.warnings)


def test_vercel_copy_is_identical_below_its_header():
    src = (ROOT / "workers" / "parsers" / "xbrl_results.py").read_text(encoding="utf-8").splitlines()
    copy = (ROOT / "py" / "xbrl_results.py").read_text(encoding="utf-8").splitlines()
    assert copy[0].startswith("# COPY"), "py/xbrl_results.py must keep its two-line COPY header"
    assert copy[2:] == src, "py/xbrl_results.py has drifted from workers/parsers/xbrl_results.py"
