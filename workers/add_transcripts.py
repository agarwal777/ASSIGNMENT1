"""Extend the Promise Ledger: download each company's latest earnings-call transcript filed on NSE (from the
snapshot window, else the filing history already fetched), register it in seed/manifest.json and mark the
company "ledger" in seed/portfolio.csv. Then run extract_promises.py (cached: transcripts already
processed cost nothing).

Usage (from finn/):  workers/.venv/Scripts/python workers/add_transcripts.py
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from probe_sources import HEADERS, nse_client  # noqa: E402

SEED = Path("seed")
TRANSCRIPT = re.compile(r"transcript", re.I)


def when(r: dict) -> datetime:
    return datetime.strptime(r["an_dt"], "%d-%b-%Y %H:%M:%S")


def main() -> None:
    rows = list(csv.DictReader((SEED / "portfolio.csv").open(encoding="utf-8")))
    recent = json.loads((SEED / "filings" / "recent.json").read_text(encoding="utf-8"))
    manifest_path = SEED / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    client = nse_client()
    for row in rows:
        sym, roles = row["symbol"], row["role"].split(";")
        if "ledger" in roles:
            continue
        pool = [r for r in recent if r["symbol"] == sym]
        hist = SEED / "filings" / f"history_{sym}.json"
        if hist.exists():
            pool += json.loads(hist.read_text(encoding="utf-8"))
        tr = [r for r in pool if r.get("attchmntFile") and TRANSCRIPT.search(f"{r.get('attchmntText') or ''} {r.get('desc') or ''}")]
        if not tr:
            print(f"{sym:<11} no transcript filed in the snapshot")
            continue
        r = max(tr, key=when)
        url = r["attchmntFile"]
        if url not in manifest:
            d = SEED / "docs" / sym
            d.mkdir(parents=True, exist_ok=True)
            path = d / f"{when(r).strftime('%d%b%Y')}_transcript_{Path(url).name}"
            resp = client.get(url, headers={**HEADERS, "Accept": "*/*"})
            if resp.status_code != 200 or not resp.content.startswith(b"%PDF"):
                print(f"{sym:<11} download failed (HTTP {resp.status_code})")
                continue
            path.write_bytes(resp.content)
            import pymupdf
            with pymupdf.open(path) as doc:
                pages, chars = len(doc), sum(len(p.get_text()) for p in doc)
            manifest[url] = {"symbol": sym, "kind": "transcript", "path": path.as_posix(), "filed": r["an_dt"],
                             "subject": r.get("desc"), "sha256": hashlib.sha256(resp.content).hexdigest(),
                             "bytes": len(resp.content), "pages": pages, "text_chars": chars}
            manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
            time.sleep(1.5)
        m = manifest[url]
        print(f"{sym:<11} {r['an_dt'][:11]}  {m.get('pages')} pages, {m.get('text_chars')} chars"
              f"{'  (covering letter only?)' if (m.get('text_chars') or 0) < 6000 else ''}")
        row["role"] = ";".join(roles + ["ledger"])
    with (SEED / "portfolio.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()
