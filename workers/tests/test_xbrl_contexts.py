"""Older-format XBRL labels the year-to-date context with the quarter's dates; the quarter must win."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parsers.xbrl_results import parse  # noqa: E402

XML = b"""<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:in-bse-fin="http://www.bseindia.com/xbrl/fin/2020-03-31/in-bse-fin">
  <xbrli:context id="OneD"><xbrli:entity/><xbrli:period><xbrli:startDate>2024-10-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:context id="FourD"><xbrli:entity/><xbrli:period><xbrli:startDate>2024-10-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate></xbrli:period></xbrli:context>
  <in-bse-fin:RevenueFromOperations contextRef="OneD">33689100000</in-bse-fin:RevenueFromOperations>
  <in-bse-fin:RevenueFromOperations contextRef="FourD">99991700000</in-bse-fin:RevenueFromOperations>
  <in-bse-fin:ProfitBeforeTax contextRef="OneD">7400000000</in-bse-fin:ProfitBeforeTax>
  <in-bse-fin:ProfitBeforeTax contextRef="FourD">22000000000</in-bse-fin:ProfitBeforeTax>
</xbrli:xbrl>"""


def test_quarter_context_wins_over_ytd_with_same_dates():
    r = parse(XML)
    assert r.period_label == "Q3FY25"
    assert r.revenue == 3368.91      # the quarter, not 9,999.17 (nine months)
    assert r.pbt == 740.0
