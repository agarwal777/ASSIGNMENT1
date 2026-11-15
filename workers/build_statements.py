"""Balance sheet, cash flow and segment mix per company → web/data/statements.json.

Reads the XBRL results filings already in the snapshot (seed/xbrl/, the same files as the quarter
numbers) and keeps the ones that carry statements: annual (balance sheet at 31 March, full-year cash
flow) and half-year (30 September, April–September). Deterministic; no model.

Usage (from finn/):  workers/.venv/Scripts/python workers/build_statements.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from parsers.xbrl_statements import UnsupportedUnits, parse  # noqa: E402

SEED, WEB = Path("seed"), Path("web/data")


def main() -> None:
    companies = json.loads((WEB / "companies.json").read_text(encoding="utf-8"))["companies"]
    out: dict[str, dict] = {}
    for sym, c in companies.items():
        periods: list[dict] = []
        for q in c["quarters"]:
            url = q.get("source")
            f = SEED / "xbrl" / url.rsplit("/", 1)[-1] if url else None
            if not f or not f.exists():
                continue
            try:
                r = parse(f.read_bytes())
            except (UnsupportedUnits, ValueError) as e:
                print(f"{sym} {q['period']}: skipped ({e})")
                continue
            if r["balance_date"][5:7] not in ("03", "09") or not r["balance"]:
                continue   # Q1/Q3 filings carry no balance sheet
            if r["basis"] != c.get("basis", r["basis"]):
                continue   # keep the basis the quarter numbers use
            r["source"] = url
            r["period"] = q["period"]
            r.pop("elements", None)
            periods.append(r)
        if periods:
            periods.sort(key=lambda p: p["balance_date"])
            out[sym] = {"basis": periods[-1]["basis"], "periods": periods}
        print(f"{sym:<11} {[p['balance_date'] + (' seg' + str(len(p['segments'])) if p['segments'] else '') for p in periods]}")
    (WEB / "statements.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(out)} companies")


if __name__ == "__main__":
    main()
