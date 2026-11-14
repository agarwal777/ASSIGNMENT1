"""FINN Python service (Vercel). Health check + on-demand processing for a company we didn't pick.

POST /api/py/ensure_company {"symbol": "DIXON"} streams NDJSON (one JSON object per line):
  {"type":"step","id":"validate|prices|results|transcripts","status":"running|done|failed|skipped","detail":...}
  {"type":"done","mode":"full|reduced","company":{...}}   or   {"type":"error","message":...}
Budget: ~90 s in total; every network call has its own short timeout. Whatever arrives is kept:
a blocked source makes the result "reduced", never an error screen.

Sources are primary only: NSE filings (XBRL results, announcements) and end-of-day prices.
No model runs here: promise extraction stays offline in this prototype (free-tier rate limits).
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterator

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from xbrl_results import headline, parse

app = FastAPI(title="finn-py")
SYMBOLS: dict[str, str] = json.loads((Path(__file__).parent / "nse_symbols.json").read_text(encoding="utf-8"))
NSE = "https://www.nseindia.com"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/130.0 Safari/537.36", "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9", "Referer": f"{NSE}/companies-listing/corporate-filings-announcements"}
BUDGET_S = 90
LENDER = re.compile(r"\b(bank|finance|financial|housing finance|capital|credit|nbfc|insurance)\b", re.I)


@app.get("/api/py/health")
def health() -> dict:
    return {"status": "ok", "python": sys.version.split()[0]}


class EnsureRequest(BaseModel):
    symbol: str


def _line(obj: dict) -> str:
    return json.dumps(obj, ensure_ascii=False) + "\n"


def _prices(symbol: str) -> dict | None:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}.NS"
    r = httpx.get(url, params={"range": "1y", "interval": "1d"}, headers={"User-Agent": UA["User-Agent"]}, timeout=12)
    r.raise_for_status()
    res = r.json()["chart"]["result"][0]
    ts, q = res["timestamp"], res["indicators"]["quote"][0]
    rows = [(datetime.utcfromtimestamp(t).date().isoformat(), c, v) for t, c, v in zip(ts, q["close"], q["volume"]) if c]
    if len(rows) < 2:
        return None
    (d0, c0, _), (d1, c1, _) = rows[-2], rows[-1]
    return {"close": round(c1, 2), "day_change": round(100 * (c1 - c0) / c0, 2), "as_of": d1, "days": len(rows)}


def _nse() -> httpx.Client:
    c = httpx.Client(headers=UA, timeout=12, follow_redirects=True)
    try:
        c.get(NSE)  # session cookies; NSE may refuse this from cloud servers, the API sometimes still answers
    except httpx.HTTPError:
        pass
    return c


def _results(c: httpx.Client, symbol: str, deadline: float) -> tuple[list[dict], str | None, str]:
    r = c.get(f"{NSE}/api/integrated-filing-results", params={"index": "equities", "symbol": symbol, "period": "Quarterly"})
    r.raise_for_status()
    rows = r.json()
    rows = rows if isinstance(rows, list) else rows.get("data", [])
    filings = [x for x in rows if x.get("xbrl") and "INDAS" in x["xbrl"] and x.get("consolidated")]
    basis = "consolidated" if any("consol" in x["consolidated"].lower() for x in filings) else "standalone"
    filings = [x for x in filings if (("consol" in x["consolidated"].lower()) == (basis == "consolidated"))]
    by_qe: dict[str, dict] = {}
    for x in filings:
        by_qe.setdefault(x["qe_Date"], x)
    ordered = sorted(by_qe.items(), key=lambda kv: datetime.strptime(kv[0].title(), "%d-%b-%Y"), reverse=True)[:5]
    parsed = {}
    for qe, x in ordered:
        if time.monotonic() > deadline:
            break
        try:
            xr = c.get(x["xbrl"], headers={**UA, "Accept": "*/*"})
            xr.raise_for_status()
            parsed[qe] = (parse(xr.content), x["xbrl"])
        except Exception:
            continue
    quarters = []
    by_label = {res.period_label: (res, src) for res, src in parsed.values()}
    for label, (res, src) in sorted(by_label.items(), key=lambda kv: kv[1][0].period_end):
        prev = f"Q{label[1]}FY{int(label[-2:]) - 1:02d}"
        prev_rev = by_label.get(prev, (None, None))[0]
        quarters.append({"period": label, "period_end": res.period_end.isoformat(), "revenue": res.revenue,
                         "pat": res.pat, "ebitda_margin": res.ebitda_margin_pct, "source": src,
                         "revenue_yoy": round(100 * (res.revenue - prev_rev.revenue) / prev_rev.revenue, 1)
                         if prev_rev and prev_rev.revenue and res.revenue else None})
    latest = next(iter(parsed.values()))[0] if parsed else None
    return quarters, (headline(latest, None, None)["period"] if latest else None), basis


def _transcripts(c: httpx.Client, symbol: str) -> int:
    end, start = date.today(), date.today() - timedelta(days=400)
    r = c.get(f"{NSE}/api/corporate-announcements", params={
        "index": "equities", "symbol": symbol, "from_date": start.strftime("%d-%m-%Y"), "to_date": end.strftime("%d-%m-%Y")})
    r.raise_for_status()
    rows = r.json()
    rows = rows if isinstance(rows, list) else rows.get("data", [])
    return sum(1 for x in rows if re.search(r"transcript", x.get("attchmntText") or "", re.I))


def ensure(symbol: str) -> Iterator[str]:
    start = time.monotonic()
    deadline = start + BUDGET_S
    sym = symbol.strip().upper()
    if sym not in SYMBOLS:
        yield _line({"type": "error", "message": "unknown_symbol"})
        return
    name = SYMBOLS[sym]
    yield _line({"type": "step", "id": "validate", "status": "done", "detail": name})
    company: dict = {"symbol": sym, "name": name, "price": None, "quarters": [], "basis": None,
                     "transcripts_found": None, "is_lender": bool(LENDER.search(name)), "notes": []}

    yield _line({"type": "step", "id": "prices", "status": "running"})
    try:
        company["price"] = _prices(sym)
        yield _line({"type": "step", "id": "prices", "status": "done" if company["price"] else "failed",
                     "detail": f"{company['price']['days']} trading days" if company["price"] else "no prices"})
    except Exception as e:
        yield _line({"type": "step", "id": "prices", "status": "failed", "detail": type(e).__name__})

    c = _nse()
    if company["is_lender"]:
        company["notes"].append("lender")
        yield _line({"type": "step", "id": "results", "status": "skipped", "detail": "lender"})
    else:
        yield _line({"type": "step", "id": "results", "status": "running"})
        try:
            quarters, latest, basis = _results(c, sym, deadline)
            company.update(quarters=quarters, basis=basis)
            yield _line({"type": "step", "id": "results", "status": "done" if quarters else "failed",
                         "detail": f"{len(quarters)} quarters, latest {latest}" if quarters else "no machine-readable results"})
        except Exception as e:
            company["notes"].append("results_unreachable")
            yield _line({"type": "step", "id": "results", "status": "failed", "detail": type(e).__name__})

    if time.monotonic() < deadline:
        yield _line({"type": "step", "id": "transcripts", "status": "running"})
        try:
            company["transcripts_found"] = _transcripts(c, sym)
            yield _line({"type": "step", "id": "transcripts", "status": "skipped",
                         "detail": f"{company['transcripts_found']} found; promise extraction runs offline"})
        except Exception as e:
            yield _line({"type": "step", "id": "transcripts", "status": "failed", "detail": type(e).__name__})
    else:
        yield _line({"type": "step", "id": "transcripts", "status": "skipped", "detail": "time budget reached"})

    company["elapsed_s"] = round(time.monotonic() - start, 1)
    # No ledger for unseen tickers yet, so the result is always the reduced view.
    yield _line({"type": "done", "mode": "reduced", "company": company})


@app.post("/api/py/ensure_company")
def ensure_company(req: EnsureRequest):
    if not re.fullmatch(r"[A-Za-z0-9&\-]{1,20}", req.symbol.strip()):
        return JSONResponse({"type": "error", "message": "unknown_symbol"}, status_code=400)
    return StreamingResponse(ensure(req.symbol), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
