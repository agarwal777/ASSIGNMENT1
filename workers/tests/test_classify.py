"""Regulator actions are material: litigation/regulatory, never routine (fix 5)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from classify import classify, regulatory  # noqa: E402

APITORIA = ("Aurobindo Pharma Limited has informed the Exchange that Apitoria Unit 2, an API manufacturing facility "
            "of Apitoria Pharma Private Limited., a subsidiary of the Company, receives Establishment Inspection Report "
            "from US FDA with classification as  Voluntary Action Indicated")


def test_apitoria_vai_is_regulatory_not_routine():
    assert classify("General Updates", APITORIA) == "litigation"
    assert regulatory(APITORIA) == "outcome"


def test_lannett_fda_inspection_classification():
    t = ("Aurobindo Pharma Limited has informed the Exchange about Classification of US FDA Inspection at Lannett "
         "Company LLC, a wholly owned subsidiary of Aurobindo Pharma USA, Inc.")
    assert classify("General Updates", t) == "litigation"


def test_severe_outcomes():
    for t in ("Company receives Warning Letter from USFDA for its Unit VII",
              "US FDA issues Form 483 with 5 observations at the Halol facility",
              "USFDA has placed the facility under Import Alert 66-40",
              "Inspection classified as Official Action Indicated (OAI) by the US FDA"):
        assert classify("General Updates", t) == "litigation", t
        assert regulatory(t) == "severe", t


def test_approvals_and_launches_are_not_regulator_actions():
    t = 'Lupin Limited has informed the Exchange regarding a press release titled "Lupin Receives U.S. FDA Approval for Amifampridine Tablets".'
    assert classify("Press Release", t) == "press_release"
    assert regulatory(t) is None


def test_results_still_win():
    assert classify("Outcome of Board Meeting", "approved the financial results; US FDA inspection update in the press release") == "results"
