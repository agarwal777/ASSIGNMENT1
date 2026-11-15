"""Privacy tests (README §9, §16): no model ever sees the investor's network.

1. The router refuses any payload that carries network fields, before touching the network or a key.
2. The only prompt we send (promise extraction) contains no network field names.
3. Nothing that went to or came back from the model mentions a contact from the demo network.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "workers"))

import llm  # noqa: E402

NETWORK_FIELDS = ["display_name", "closeness", "last_contacted", "contact_stints", "org_canonical",
                  "network_overlaps", "contact_id"]


@pytest.mark.parametrize("field", NETWORK_FIELDS)
def test_router_refuses_network_fields(field, monkeypatch):
    # No key is needed: refusal must happen before any request is built.
    monkeypatch.setattr(llm, "_env", lambda: {})
    with pytest.raises(llm.PrivacyError):
        llm.call("test", f'{{"{field}": "Rohan M."}}', {"type": "object"})


def test_extraction_prompt_has_no_network_fields():
    from extract_promises import PROMPT
    rendered = PROMPT.format(company="X Ltd", filed="2026-11-01", text="[page 1]\nsome transcript")
    assert not llm.NETWORK_FIELDS.search(rendered)


def test_no_contact_name_in_model_traffic():
    names = {r["display_name"] for r in csv.DictReader((ROOT / "seed" / "network.csv").open(encoding="utf-8"))}
    assert names, "demo network missing"
    texts = []
    log = ROOT / "seed" / "llm_calls.jsonl"
    if log.exists():
        texts.append(log.read_text(encoding="utf-8"))
    cache = ROOT / "seed" / "llm_cache"
    if cache.exists():
        texts += [p.read_text(encoding="utf-8") for p in cache.glob("*.json")]
    blob = "\n".join(texts)
    leaked = sorted(n for n in names if n in blob)
    assert not leaked, f"contact names found in model traffic: {leaked}"


def test_typescript_deny_list_matches_python():
    """The live bull-vs-bear route (web/lib/numcheck.ts) must refuse exactly the fields the router refuses."""
    import re
    ts = (ROOT / "web" / "lib" / "numcheck.ts").read_text(encoding="utf-8")
    ts_fields = set(re.search(r"NETWORK_FIELDS\s*=\s*/.b\(([^)]*)\)", ts).group(1).split("|"))  # "/\b(" in TS
    py_fields = set(re.search(r"\(([^)]*)\)", llm.NETWORK_FIELDS.pattern).group(1).split("|"))
    assert ts_fields == py_fields, f"deny-lists differ: {ts_fields ^ py_fields}"
