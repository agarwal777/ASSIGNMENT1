"""Promise status rules: higher-is-better targets, and amounts that are not percentages."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ledger import judge  # noqa: E402

# Two reported quarters of FY27 (year to date): revenue ₹1,000 cr and EBITDA ₹279.1 cr → margin 27.91%.
FACTS = {("Q1FY27", "revenue"): 500.0, ("Q1FY27", "ebitda"): 140.0,
         ("Q2FY27", "revenue"): 500.0, ("Q2FY27", "ebitda"): 139.1}


def promise(**kw):
    p = {"metric": "ebitda_margin", "scope": "company", "deadline_period": "FY27", "unit": "percent",
         "target_low": 24, "target_high": 25}
    p.update(kw)
    return p


def test_above_the_guided_range_is_on_track_not_behind():
    status, evidence = judge(promise(), FACTS, "Q2FY27")
    assert status == "on_track"
    assert "27.91%" in evidence and "above the guided range" in evidence


def test_inside_and_below_the_range():
    assert judge(promise(target_low=27, target_high=28), FACTS, "Q2FY27")[0] == "on_track"
    assert judge(promise(target_low=29, target_high=30), FACTS, "Q2FY27")[0] == "behind"


def test_an_amount_is_not_judged_as_a_percentage():
    status, why = judge(promise(metric="revenue_growth", unit="INR crore", target_low=4100, target_high=4100), FACTS, "Q2FY27")
    assert status == "cant_check" and "INR crore" in why
    assert judge(promise(unit="multiplier", target_low=1.2, target_high=1.3), FACTS, "Q2FY27")[0] == "cant_check"
