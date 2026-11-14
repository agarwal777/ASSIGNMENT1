"""B1: build the demo snapshot for the companies in seed/portfolio.csv.

Steps (each can be run alone; downloads are cached, so re-runs are cheap):
  --prices       1 year of EOD close/volume from yfinance + market cap  → seed/prices.csv, seed/market_caps.csv
  --filings      filter the saved 14-day NSE feed to our companies      → seed/filings/recent.json
  --history      13 months of announcements per ledger/appointment co.  → seed/filings/history_<SYM>.json
  --docs         download key PDFs (latest results per company, the appointment filings,
                 last 4 concall transcripts per ledger company)          → seed/docs/<SYM>/*.pdf
All sources are primary (NSE filings) except prices (Yahoo). Every download is recorded in
seed/manifest.json with URL, sha256, bytes, pages and text-layer size (0 chars → scanned PDF).

Usage (from finn/):  workers/.venv/Scripts/python workers/build_snapshot.py --all
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
from datetime import date, timedelta
from pathlib import Path

from probe_sources import HEADERS, NSE, nse_client

SEED = Path("seed")
RAW_FEED = sorted((SEED / "raw").glob("nse_announcements_*.json"))
PAUSE_S = 1.0  # be polite to NSE: one request per second

TRANSCRIPT_RE = re.compile(r"transcript", re.I)
RESULTS_RE = re.compile(r"financial result", re.I)


def load_portfolio() -> list[dict]:
    with (SEED / "portfolio.csv").open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def roles(c: dict) -> set[str]:
    return set(c["role"].split(";"))


# ── prices ──────────────────────────────────────────────────────────────
def step_prices(companies: list[dict]) -> None:
    import yfinance as yf
    rows, caps = [], []
    for c in companies:
        t = yf.Ticker(f"{c['symbol']}.NS")
        h = t.history(period="1y", auto_adjust=False)
        for d, r in h.iterrows():
            rows.append({"symbol": c["symbol"], "date": d.date().isoformat(),
                         "close": round(float(r["Close"]), 2), "volume": int(r["Volume"])})
        try:
            mc = t.fast_info.get("market_cap")
        except Exception:
            mc = None
        caps.append({"symbol": c["symbol"], "market_cap_cr": round(mc / 1e7) if mc else "",
                     "size_guess": c["size_guess"], "days": len(h)})
        print(f"prices {c['symbol']:<11} {len(h)} days, mcap ₹{caps[-1]['market_cap_cr']} cr")
    _write_csv(SEED / "prices.csv", rows)
    _write_csv(SEED / "market_caps.csv", caps)


# ── filings ─────────────────────────────────────────────────────────────
def step_filings(companies: list[dict]) -> None:
    syms = {c["symbol"] for c in companies}
    feed = json.loads(RAW_FEED[-1].read_text(encoding="utf-8"))
    keep = [r for r in feed if r.get("symbol") in syms]
    out = SEED / "filings"
    out.mkdir(parents=True, exist_ok=True)
    (out / "recent.json").write_text(json.dumps(keep, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"filings: kept {len(keep)} of {len(feed)} from {RAW_FEED[-1].name}")


def step_history(companies: list[dict], client) -> None:
    end = date.today()
    start = end - timedelta(days=400)  # ~13 months: covers 4 quarterly calls
    out = SEED / "filings"
    out.mkdir(parents=True, exist_ok=True)
    for c in companies:
        if not roles(c) & {"ledger", "appointment", "appointment_backup"}:
            continue
        r = client.get(f"{NSE}/api/corporate-announcements",
                       params={"index": "equities", "symbol": c["symbol"],
                               "from_date": start.strftime("%d-%m-%Y"),
                               "to_date": end.strftime("%d-%m-%Y")})
        r.raise_for_status()
        rows = r.json()
        rows = rows if isinstance(rows, list) else rows.get("data", [])
        (out / f"history_{c['symbol']}.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        n_tr = sum(1 for x in rows if TRANSCRIPT_RE.search(x.get("attchmntText") or ""))
        print(f"history {c['symbol']:<11} {len(rows)} filings, {n_tr} mention a transcript")
        time.sleep(PAUSE_S)


# ── documents ───────────────────────────────────────────────────────────
def pick_docs(companies: list[dict]) -> list[tuple[str, str, dict]]:
    """Return (symbol, kind, filing) for every PDF we want."""
    recent = json.loads((SEED / "filings" / "recent.json").read_text(encoding="utf-8"))
    picks: list[tuple[str, str, dict]] = []
    for c in companies:
        sym = c["symbol"]
        mine = [r for r in recent if r.get("symbol") == sym and r.get("attchmntFile")]
        # The statements live in the board-meeting outcome filing, not in press releases,
        # newspaper ads or call notices that merely mention results. Prefer the largest one.
        res = [r for r in mine if RESULTS_RE.search(r.get("attchmntText") or "")
               and re.search(r"outcome of board meeting|financial result|integrated filing",
                             r.get("desc") or "", re.I)]
        if res:
            picks.append((sym, "results", max(res, key=_size_kb)))
        if roles(c) & {"appointment", "appointment_backup"}:
            for r in mine:
                if re.search(r"appointment|change in management", r.get("desc") or "", re.I):
                    picks.append((sym, "appointment", r))
        if "ledger" in roles(c):
            hist_file = SEED / "filings" / f"history_{sym}.json"
            if hist_file.exists():
                hist = json.loads(hist_file.read_text(encoding="utf-8"))
                tr = [r for r in hist if r.get("attchmntFile")
                      and TRANSCRIPT_RE.search(r.get("attchmntText") or "")]
                picks += [(sym, "transcript", r) for r in tr[:4]]
    return picks


def step_docs(companies: list[dict], client) -> None:
    manifest_path = SEED / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    for sym, kind, r in pick_docs(companies):
        url = r["attchmntFile"]
        if url in manifest:
            continue
        d = (SEED / "docs" / sym)
        d.mkdir(parents=True, exist_ok=True)
        stamp = re.sub(r"\W", "", (r.get("an_dt") or r.get("sort_date") or "")[:11])
        path = d / f"{stamp}_{kind}_{Path(url).name}"
        resp = client.get(url, headers={**HEADERS, "Accept": "*/*"})
        if resp.status_code != 200:
            print(f"docs {sym:<11} {kind:<11} HTTP {resp.status_code} {url}")
            continue
        path.write_bytes(resp.content)
        manifest[url] = {"symbol": sym, "kind": kind, "path": path.as_posix(),
                         "filed": r.get("an_dt"), "subject": r.get("desc"),
                         "sha256": hashlib.sha256(resp.content).hexdigest(),
                         "bytes": len(resp.content), **_pdf_stats(path)}
        m = manifest[url]
        print(f"docs {sym:<11} {kind:<11} {m['bytes'] // 1024:>5} KB, {m.get('pages')} pages, "
              f"{m.get('text_chars')} chars{'  ← NO TEXT LAYER' if m.get('text_chars') == 0 else ''}")
        manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
        time.sleep(PAUSE_S)


def _size_kb(r: dict) -> float:
    s = (r.get("fileSize") or r.get("attFileSize") or "0").upper()
    n = float(re.sub(r"[^\d.]", "", s) or 0)
    return n * 1024 if "MB" in s else n


def _pdf_stats(path: Path) -> dict:
    if path.suffix.lower() != ".pdf":
        return {"pages": None, "text_chars": None}
    try:
        import fitz  # PyMuPDF
        with fitz.open(path) as doc:
            return {"pages": doc.page_count,
                    "text_chars": sum(len(p.get_text()) for p in doc)}
    except Exception as e:
        return {"pages": None, "text_chars": None, "pdf_error": str(e)[:200]}


def _write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows → {path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    for s in ("prices", "filings", "history", "docs", "all"):
        ap.add_argument(f"--{s}", action="store_true")
    a = ap.parse_args()
    companies = load_portfolio()
    client = nse_client() if (a.all or a.history or a.docs) else None
    if a.all or a.prices:
        step_prices(companies)
    if a.all or a.filings:
        step_filings(companies)
    if a.all or a.history:
        step_history(companies, client)
    if a.all or a.docs:
        step_docs(companies, client)


if __name__ == "__main__":
    main()
