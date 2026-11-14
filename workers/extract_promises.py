"""B5: extract management's measurable promises from concall transcripts (one model call each).

Grounding rules (enforced in code, not just asked for in the prompt):
  * every promise must quote the transcript; quotes not found in the text are dropped and counted
  * the page number is re-derived from where the quote is found, not trusted from the model
  * only the transcript is sent: no news, no other documents, no investor data
Output: seed/promises.json (+ a per-run summary of kept / dropped).

Usage (from finn/):  workers/.venv/Scripts/python workers/extract_promises.py [--one]
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
from datetime import datetime
from pathlib import Path

import pymupdf
from rapidfuzz import fuzz

from llm import call

SEED = Path("seed")
METRICS = ["revenue_growth", "ebitda_margin", "pat_growth", "capex_amount", "capacity",
           "utilisation", "net_debt", "commissioning_date", "order_book", "market_share", "other"]

SCHEMA = {
    "type": "object",
    "properties": {
        "promises": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "statement_verbatim": {"type": "string"},
                    "speaker_role": {"type": "string"},
                    "metric": {"type": "string", "enum": METRICS},
                    "scope": {"type": "string"},
                    "target_low": {"type": "number", "nullable": True},
                    "target_high": {"type": "number", "nullable": True},
                    "unit": {"type": "string"},
                    "deadline_period": {"type": "string"},
                    "hedged": {"type": "boolean"},
                },
                "required": ["statement_verbatim", "speaker_role", "metric", "scope", "unit",
                             "deadline_period", "hedged"],
            },
        }
    },
    "required": ["promises"],
}

PROMPT = """You are extracting management guidance from an Indian listed company's earnings-call transcript.

Return every FORWARD-LOOKING statement BY COMPANY MANAGEMENT that sets a MEASURABLE target for
the company's own business: growth %, EBITDA or operating margin %, PAT growth, capex amount,
capacity, utilisation, net debt, commissioning date, order book or market share.

Rules:
- statement_verbatim: copy the sentence EXACTLY as written in the transcript (max 300 characters). Do not paraphrase.
- Skip analyst questions, past results, industry-wide forecasts not tied to the company, and vague aspirations
  without a number or date.
- scope: "company" if it is the whole company, otherwise the segment or product named (e.g. "tractors", "room ACs").
- target_low / target_high: numbers only (a single number goes in both); null if the target is a date.
- unit: "percent", "INR crore", "units", "date", or similar.
- deadline_period: Indian fiscal periods like "Q3FY27", "H2FY27", "FY27", "FY28"; use "unspecified" if none is given.
  The fiscal year runs April to March; FY27 = April 2026 to March 2027.
- hedged: true if the statement uses words like expect, aim, hope, target, endeavour.
- If there is no measurable guidance, return an empty list.

Transcript ({company}, filed {filed}):
{text}
"""


def page_texts(path: str) -> list[str]:
    with pymupdf.open(path) as d:
        return [p.get_text() for p in d]


def norm(s: str) -> str:
    s = s.lower().replace("’", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"[^a-z0-9%.]+", " ", s).strip()


def locate(quote: str, pages: list[str]) -> tuple[int | None, str]:
    """Return (page, how) where the quote occurs; None if it cannot be found."""
    q = norm(quote)
    if len(q) < 20:
        return None, "too short"
    joined = [norm(p) for p in pages]
    for i, p in enumerate(joined):
        if q in p:
            return i + 1, "exact"
    # Allow line-break / hyphenation noise across a page boundary, but nothing looser.
    for i in range(len(joined)):
        window = joined[i] + " " + (joined[i + 1] if i + 1 < len(joined) else "")
        if fuzz.partial_ratio(q, window) >= 95:
            return i + 1, "near-exact"
    return None, "not found"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--one", action="store_true", help="process a single transcript (API smoke test)")
    args = ap.parse_args()

    names = {}
    for r in json.loads((SEED / "filings" / "recent.json").read_text(encoding="utf-8")):
        names.setdefault(r["symbol"], r.get("sm_name") or r["symbol"])
    ledger = [r["symbol"] for r in csv.DictReader((SEED / "portfolio.csv").open(encoding="utf-8"))
              if "ledger" in r["role"].split(";")]
    manifest = json.loads((SEED / "manifest.json").read_text(encoding="utf-8"))
    docs = sorted([(v["symbol"], v["filed"], url, v["path"]) for url, v in manifest.items()
                   if v["kind"] == "transcript" and v["symbol"] in ledger],
                  key=lambda x: (x[0], datetime.strptime(x[1][:11], "%d-%b-%Y")))
    if args.one:
        docs = docs[:1]

    promises, stats = [], []
    for sym, filed, url, path in docs:
        pages = page_texts(path)
        text = "\n".join(f"[page {i + 1}]\n{t}" for i, t in enumerate(pages))
        said = datetime.strptime(filed[:11], "%d-%b-%Y").date().isoformat()
        prompt = PROMPT.format(company=names.get(sym, sym), filed=said, text=text)
        out = None
        # Default model first (MODEL_SMALL), one fallback (MODEL_FALLBACK) on failure.
        for model in (None, os.environ.get("MODEL_FALLBACK", "gemini-3.8-flash")):
            try:
                out = call(f"promises:{sym}:{said}", prompt, SCHEMA, model=model)
                break
            except RuntimeError as e:
                print(f"{sym:<11} {said}  {model or 'default model'} failed: {e}")
        if out is None:
            stats.append({"symbol": sym, "said_at": said, "kept": 0, "dropped_unverifiable_quote": 0,
                          "failed": True})
            continue
        kept = dropped = 0
        for p in out.get("promises", []):
            for k in ("target_low", "target_high"):   # models sometimes emit Infinity/NaN
                v = p.get(k)
                p[k] = v if isinstance(v, (int, float)) and math.isfinite(v) else None
            page, how = locate(p["statement_verbatim"], pages)
            if page is None:
                dropped += 1
                continue
            kept += 1
            promises.append({**p, "symbol": sym, "said_at": said, "page": page, "match": how,
                             "source": url, "id": f"{sym}-{said}-{kept}"})
        stats.append({"symbol": sym, "said_at": said, "kept": kept, "dropped_unverifiable_quote": dropped})
        print(f"{sym:<11} {said}  kept {kept:>2}  dropped {dropped} (quote not found in transcript)")

    out_path = SEED / ("promises_smoke.json" if args.one else "promises.json")
    out_path.write_text(json.dumps({"promises": promises, "runs": stats}, ensure_ascii=False, indent=1),
                        encoding="utf-8")
    print(f"wrote {len(promises)} promises → {out_path}")


if __name__ == "__main__":
    main()
