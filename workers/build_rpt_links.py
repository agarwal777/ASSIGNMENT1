"""Sourced supplier and customer links from related-party transaction filings → web/data/rpt_links.json.

A listed company files its related-party transactions with the exchanges every six months (SEBI LODR
Reg. 23(9)). Each row names the transacting party, the counterparty, their relationship, the type of
transaction and its value. A row where the listed company itself *purchases goods or services* makes the
counterparty a sourced supplier; a *sale of goods or services* makes it a sourced customer. Every link
keeps the filing, the page and the row's text. Deterministic; no model. Within-group links only: outside
suppliers are not related parties, so they never appear here.

Usage (from finn/):  workers/.venv/Scripts/python workers/build_rpt_links.py
"""
from __future__ import annotations

import json
from datetime import datetime
import re
from collections import defaultdict
from pathlib import Path

import pymupdf

SEED, WEB = Path("seed"), Path("web/data")
# The listed entity's name as it appears in the table, per symbol (rows by subsidiaries are skipped).
ENTITY = {"M&M": r"MAHINDRA\s+AND\s+MAHINDRA\s+LIMITED"}
REL = r"(Subsidiary|Associate|Joint [Vv]enture|Related party|Key [Mm]anagerial|Promoter|Relative|Enterprise|Entities|Fellow|Holding|Post[- ]employment|Trust|Director)"
TYPES = {"purchase": "supplier", "sale": "customer"}


def rows_of(text: str, entity: str):
    """Yield (counterparty, relationship, kind, value_cr, row_text) for rows where `entity` itself transacts."""
    starts = [m.start() for m in re.finditer(r"(?m)^\d+\s+[A-Z]", text)]
    for i, s in enumerate(starts):
        row = text[s: starts[i + 1] if i + 1 < len(starts) else len(text)]
        m = re.match(rf"\d+\s+{entity}\s*\n(.+?)\n{REL}", row, re.S)
        if not m:
            continue
        counterparty = " ".join(m.group(1).split())
        t = re.search(r"\n(Purchase|Sale) of goods or\s*\n?\s*services", row, re.I)
        if not t:
            continue
        value = re.search(r"services\s*\n\s*([\d,]+\.\d+)", row[t.end():], re.I)
        yield counterparty, TYPES[t.group(1).lower()], float(value.group(1).replace(",", "")) if value else None, " ".join(row.split())[:400]


def title(name: str) -> str:
    keep = {"AND": "and", "OF": "of", "LTD.": "Ltd.", "LIMITED": "Limited", "CO.,": "Co.,", "(UPTO": "(up to"}
    return " ".join(keep.get(w, w.capitalize() if w.isupper() and len(w) > 3 else w) for w in name.split())


def main() -> None:
    out: dict[str, dict] = {}
    recent = json.loads((SEED / "filings" / "recent.json").read_text(encoding="utf-8"))
    for r in recent:
        sym = r["symbol"]
        if sym not in ENTITY or "related party" not in (r.get("desc") or "").lower():
            continue
        pdf = next((SEED / "docs" / sym).glob(f"*{Path(r['attchmntFile']).name}"), None)
        if not pdf:
            print(f"{sym}: filing not downloaded ({r['attchmntFile']})")
            continue
        pages = [p.get_text() for p in pymupdf.open(pdf)]
        links: dict[tuple[str, str], dict] = {}
        for pno, text in enumerate(pages, 1):
            for cp, kind, value, row in rows_of(text, ENTITY[sym]):
                key = (cp, kind)
                cur = links.setdefault(key, {"org": title(cp), "org_raw": cp, "kind": kind, "value_cr": 0.0,
                                             "rows": 0, "page": pno, "quote": row})
                cur["rows"] += 1
                cur["value_cr"] = round(cur["value_cr"] + (value or 0), 2)
        by_kind = defaultdict(list)
        for v in sorted(links.values(), key=lambda x: -x["value_cr"]):
            by_kind[v["kind"]].append(v)
        filed = datetime.strptime(r["an_dt"], "%d-%b-%Y %H:%M:%S").isoformat() + "+05:30"
        out[sym] = {"source": r["attchmntFile"], "filed": filed, "period": "half year ended 30 September 2026",
                    "suppliers": by_kind["supplier"], "customers": by_kind["customer"]}
        print(f"{sym}: {len(by_kind['supplier'])} suppliers, {len(by_kind['customer'])} customers (related parties)")
    # Full rows (with the row text) stay in the snapshot; the app gets organisation, kind, page and value.
    (SEED / "rpt_links_full.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    slim = {s: {**v, "suppliers": [{k: x[k] for k in ("org", "page", "value_cr")} for x in v["suppliers"]],
                "customers": [{k: x[k] for k in ("org", "page", "value_cr")} for x in v["customers"]]} for s, v in out.items()}
    (WEB / "rpt_links.json").write_text(json.dumps(slim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
