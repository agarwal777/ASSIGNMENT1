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
import os
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterator

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from xbrl_results import UnsupportedUnits, headline, parse

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


def basis_of(label: str | None) -> str | None:
    """NSE's label → basis. "Non-Consolidated" contains "consol", so test for standalone first."""
    v = (label or "").lower()
    if "non" in v or "standalone" in v:
        return "standalone"
    return "consolidated" if "consol" in v else None


QUARTERS = 8   # 8 filings so the latest 4 quarters each have a same-quarter-last-year comparison


def _results(c: httpx.Client, symbol: str, deadline: float, refused: list[str] | None = None) -> tuple[list[dict], str | None, str]:
    """One basis per company: consolidated when the company files it, else standalone. A quarter falls
    back to the other basis only if its preferred filing is missing, and is marked; YoY is computed only
    between quarters of the same basis, so the two are never mixed in one number."""
    by_label, parsed, basis = quarters_by_label(c, symbol, deadline, refused)
    quarters = []
    for label, (res, src, b, fb) in sorted(by_label.items(), key=lambda kv: kv[1][0].period_end):
        prev = by_label.get(f"Q{label[1]}FY{int(label[-2:]) - 1:02d}")
        same = prev is not None and prev[2] == b
        quarters.append({"period": label, "period_end": res.period_end.isoformat(), "revenue": res.revenue,
                         "pat": res.pat, "ebitda_margin": res.ebitda_margin_pct, "source": src,
                         "basis": b, "basis_fallback": fb,
                         "revenue_yoy": round(100 * (res.revenue - prev[0].revenue) / prev[0].revenue, 1)
                         if same and prev[0].revenue and res.revenue else None})
    latest = parsed[0][0] if parsed else None
    return quarters, (headline(latest, None, None)["period"] if latest else None), basis


def quarters_by_label(c: httpx.Client, symbol: str, deadline: float, refused: list[str] | None = None):
    """Parsed quarters keyed by label ("Q2FY27") → (QuarterResult, xbrl url, basis, fell back?), plus the raw
    parsed list (newest first) and the company's basis. Shared by Ask and the daily refresh."""
    r = c.get(f"{NSE}/api/integrated-filing-results", params={"index": "equities", "symbol": symbol, "period": "Quarterly"})
    r.raise_for_status()
    rows = r.json()
    rows = rows if isinstance(rows, list) else rows.get("data", [])
    by_qe: dict[str, dict[str, dict]] = {}
    for x in rows:
        b = basis_of(x.get("consolidated"))
        if x.get("xbrl") and "INDAS" in x["xbrl"] and b:
            by_qe.setdefault(x["qe_Date"], {}).setdefault(b, x)   # newest first in NSE's list: keep the first
    recent = sorted(by_qe, key=lambda qe: datetime.strptime(qe.title(), "%d-%b-%Y"), reverse=True)[:QUARTERS]
    basis = "consolidated" if any("consolidated" in by_qe[qe] for qe in recent) else "standalone"
    other = "standalone" if basis == "consolidated" else "consolidated"

    parsed: list[tuple] = []
    for qe in recent:
        if time.monotonic() > deadline:
            break
        x, fallback = (by_qe[qe][basis], False) if basis in by_qe[qe] else (by_qe[qe][other], True)
        try:
            xr = c.get(x["xbrl"], headers={**UA, "Accept": "*/*"})
            xr.raise_for_status()
            parsed.append((parse(xr.content), x["xbrl"], other if fallback else basis, fallback))
        except UnsupportedUnits:
            # Not in rupees: refused on purpose (never mis-scaled); reported to the user, not hidden.
            if refused is not None:
                refused.append(qe)
            continue
        except Exception:
            continue

    by_label = {res.period_label: (res, src, b, fb) for res, src, b, fb in parsed}

    # Integrated filing only starts mid-2025, so a year-ago quarter may only exist in NSE's older
    # financial-results feed. Fetch just the ones the latest 4 quarters need, same basis first.
    latest4 = sorted(by_label, key=lambda k: by_label[k][0].period_end)[-4:]
    need = {f"Q{k[1]}FY{int(k[-2:]) - 1:02d}" for k in latest4} - set(by_label)
    if need and time.monotonic() < deadline:
        try:
            old = c.get(f"{NSE}/api/corporates-financial-results",
                        params={"index": "equities", "symbol": symbol, "period": "Quarterly"})
            old.raise_for_status()
            orows = old.json()
            orows = orows if isinstance(orows, list) else orows.get("data", [])
            by_end: dict[str, dict[str, dict]] = {}
            for x in orows:
                b = basis_of(x.get("consolidated"))
                if x.get("xbrl") and b and x.get("toDate"):
                    by_end.setdefault(x["toDate"].title(), {}).setdefault(b, x)
            for label in sorted(need):
                if time.monotonic() > deadline:
                    break
                q, fy = int(label[1]), 2000 + int(label[-2:])
                end = {1: f"30-Jun-{fy - 1}", 2: f"30-Sep-{fy - 1}", 3: f"31-Dec-{fy - 1}", 4: f"31-Mar-{fy}"}[q]
                cands = by_end.get(end, {})
                if not cands:
                    continue
                x, fb = (cands[basis], False) if basis in cands else (cands[other], True)
                try:
                    xr = c.get(x["xbrl"], headers={**UA, "Accept": "*/*"})
                    xr.raise_for_status()
                    res = parse(xr.content)
                    if res.period_label == label:
                        by_label[label] = (res, x["xbrl"], other if fb else basis, fb)
                except UnsupportedUnits:
                    if refused is not None:
                        refused.append(label)
                    continue
                except Exception:
                    continue
        except Exception:
            pass

    return by_label, parsed, basis


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
            refused: list[str] = []
            quarters, latest, basis = _results(c, sym, deadline, refused)
            company.update(quarters=quarters, basis=basis)
            yield _line({"type": "step", "id": "results", "status": "done" if quarters else "failed",
                         "detail": (f"{len(quarters)} quarters, latest {latest}"
                                    + (f"; {len(refused)} not in rupees, skipped" if refused else "")) if quarters
                                   else "unsupported_units" if refused else "no machine-readable results"})
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


@app.get("/api/py/refresh")
def refresh(request: Request, dry: int = 0):
    """Daily refresh, called by Vercel Cron with `Authorization: Bearer <CRON_SECRET>`. `?dry=1` computes
    without writing, and is allowed only off Vercel (local testing)."""
    import refresh as job
    if dry and not os.environ.get("VERCEL"):
        return job.run(nse_client=_nse, quarters_by_label=quarters_by_label, ua=UA["User-Agent"], write=False)
    secret = os.environ.get("CRON_SECRET")
    if not secret or request.headers.get("authorization") != f"Bearer {secret}":
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return job.run(nse_client=_nse, quarters_by_label=quarters_by_label, ua=UA["User-Agent"])


PDF_HOSTS = {"nsearchives.nseindia.com", "nsearchives.nseindia.in", "archives.nseindia.com", "www.nseindia.com"}
PDF_PAGES, PDF_CHARS = 15, 60_000


@app.get("/api/py/filing-text")
def filing_text(request: Request, url: str):
    """Text of one exchange filing PDF, page by page, for "Explain this filing" (web/app/api/filing-insight).
    Only NSE archive hosts are fetched (no open proxy). On Vercel the caller must send the server's
    `Authorization: Bearer <CRON_SECRET>`, so only FINN's own route can use it. First 15 pages / 60k chars."""
    from urllib.parse import urlparse
    if os.environ.get("VERCEL"):
        secret = os.environ.get("CRON_SECRET")
        if not secret or request.headers.get("authorization") != f"Bearer {secret}":
            return JSONResponse({"error": "unauthorized"}, status_code=401)
    u = urlparse(url)
    if u.scheme != "https" or u.hostname not in PDF_HOSTS or not u.path.lower().endswith(".pdf"):
        return JSONResponse({"error": "not an NSE filing PDF"}, status_code=400)
    import io
    import pypdf
    c = _nse()
    try:
        r = c.get(url, timeout=25)
        r.raise_for_status()
    except httpx.HTTPError as e:
        return JSONResponse({"error": f"could not fetch the filing ({type(e).__name__})"}, status_code=502)
    finally:
        c.close()
    try:
        reader = pypdf.PdfReader(io.BytesIO(r.content))
        pages, total = [], 0
        for i, page in enumerate(reader.pages[:PDF_PAGES]):
            text = re.sub(r"[ \t]+", " ", page.extract_text() or "").strip()
            if total + len(text) > PDF_CHARS:
                text = text[: max(0, PDF_CHARS - total)]
            total += len(text)
            pages.append({"page": i + 1, "text": text})
            if total >= PDF_CHARS:
                break
        return {"pages": pages, "page_count": len(reader.pages)}
    except Exception as e:  # noqa: BLE001 — a damaged or encrypted PDF
        return JSONResponse({"error": f"could not read the PDF ({type(e).__name__})"}, status_code=422)


@app.post("/api/py/ensure_company")
def ensure_company(req: EnsureRequest):
    if not re.fullmatch(r"[A-Za-z0-9&\-]{1,20}", req.symbol.strip()):
        return JSONResponse({"type": "error", "message": "unknown_symbol"}, status_code=400)
    return StreamingResponse(ensure(req.symbol), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
