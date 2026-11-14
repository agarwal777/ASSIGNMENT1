"""B2: fetch the last 5 quarterly XBRL filings per company and build headline numbers.

Five quarters = current, previous (QoQ), same quarter last year (YoY), plus the two in between
for the financial snapshot. Basis per company comes from seed/portfolio.csv (results_basis).
Lenders are skipped. Output: seed/results.json (one headline block per company) and
seed/facts.csv (one row per metric/quarter, with the source XBRL URL).

Usage (from finn/):  workers/.venv/Scripts/python workers/parse_results.py [--symbols M&M VOLTAS]
"""
from __future__ import annotations

import argparse
import csv
import json
import time
from datetime import date, datetime
from pathlib import Path

from parsers.xbrl_results import headline, parse
from probe_sources import HEADERS, NSE, nse_client

SEED = Path("seed")
CACHE = SEED / "xbrl"
QUARTERS = 5


def list_filings(client, symbol: str) -> list[dict]:
    r = client.get(f"{NSE}/api/integrated-filing-results",
                   params={"index": "equities", "symbol": symbol, "period": "Quarterly"})
    r.raise_for_status()
    rows = r.json()
    rows = rows if isinstance(rows, list) else rows.get("data", [])
    out = []
    for x in rows:
        if not x.get("xbrl") or "INDAS" not in x["xbrl"] or not x.get("consolidated"):
            continue  # skips governance filings and non-Ind AS formats
        out.append({"qe": datetime.strptime(x["qe_Date"].title(), "%d-%b-%Y").date(),
                    "basis": "consolidated" if "consol" in x["consolidated"].lower() else "standalone",
                    "xbrl": x["xbrl"], "revised": x.get("revised_Date")})
    return out


def fetch(client, url: str) -> bytes:
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / Path(url).name
    if not p.exists():
        r = client.get(url, headers={**HEADERS, "Accept": "*/*"})
        r.raise_for_status()
        p.write_bytes(r.content)
        time.sleep(1.0)
    return p.read_bytes()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", nargs="*")
    args = ap.parse_args()
    with (SEED / "portfolio.csv").open(encoding="utf-8") as f:
        companies = [c for c in csv.DictReader(f)
                     if not args.symbols or c["symbol"] in args.symbols]

    client = nse_client()
    results, facts = {}, []
    for c in companies:
        sym = c["symbol"]
        if c["is_lender"] == "true":
            print(f"{sym:<11} skipped: lender")
            continue
        want = c.get("results_basis") or "consolidated"
        all_filings = list_filings(client, sym)
        filings = [f for f in all_filings if f["basis"] == want]
        if not filings and want == "consolidated":
            # e.g. a company with no subsidiaries files standalone only
            filings = [f for f in all_filings if f["basis"] == "standalone"]
            want = "standalone"
        # Latest filing per quarter end (a revision supersedes the original)
        by_qe: dict[date, dict] = {}
        for f in filings:
            by_qe.setdefault(f["qe"], f)
        qes = sorted(by_qe, reverse=True)[:QUARTERS]
        parsed = {}
        for qe in qes:
            try:
                parsed[qe] = parse(fetch(client, by_qe[qe]["xbrl"]))
            except Exception as e:
                print(f"{sym:<11} {qe} parse failed: {e}")
        if not parsed:
            print(f"{sym:<11} no {want} XBRL found")
            continue
        if qes[0] not in parsed:
            # Latest quarter not machine-readable (e.g. only a half-year context). Do not fall
            # back to an older quarter on the card: say so instead of showing stale numbers.
            results[sym] = {"period": None, "basis": want, "metrics": {}, "ebitda_margin": {},
                            "warnings": [f"latest results ({qes[0]}) filed, but quarterly numbers "
                                         "are not machine-readable in the XBRL"],
                            "source": by_qe[qes[0]]["xbrl"]}
            print(f"{sym:<11} latest quarter {qes[0]} unparsed; card will say so")
        cur_qe = qes[0]
        prev_q = next((parsed[q] for q in parsed if (cur_qe - q).days in range(85, 100)), None)
        prev_y = next((parsed[q] for q in parsed if (cur_qe - q).days in range(360, 370)), None)
        if cur_qe in parsed:
            h = headline(parsed[cur_qe], prev_q, prev_y)
            h["source"] = by_qe[cur_qe]["xbrl"]
        else:
            h = results[sym]
        results[sym] = h
        for qe, r in parsed.items():
            for m in ("revenue", "ebitda", "pbt", "pat", "other_income", "finance_costs",
                      "dna", "exceptional", "tax", "associates"):
                v = getattr(r, m)
                if v is not None:
                    facts.append({"symbol": sym, "period": r.period_label, "period_end": qe.isoformat(),
                                  "basis": r.basis, "metric": m, "value_cr": v,
                                  "source": by_qe[qe]["xbrl"]})
        m = h["metrics"]
        if not m:
            continue
        print(f"{sym:<11} {h['period']} {want[:4]}  rev ₹{m['revenue']['value_cr']:,} cr "
              f"(YoY {m['revenue']['yoy_pct']}%)  EBITDA margin {h['ebitda_margin']['pct']}% "
              f"(YoY {h['ebitda_margin']['yoy_bps']} bps)  PAT ₹{m['pat']['value_cr']:,} cr"
              + (f"  ⚠ {'; '.join(h['warnings'])}" if h["warnings"] else ""))

    (SEED / "results.json").write_text(json.dumps(results, indent=1), encoding="utf-8")
    with (SEED / "facts.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(facts[0].keys()))
        w.writeheader()
        w.writerows(facts)
    print(f"wrote {len(results)} companies, {len(facts)} facts")


if __name__ == "__main__":
    main()
