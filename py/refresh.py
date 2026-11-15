"""Daily cloud refresh (Vercel Cron → GET /api/py/refresh).

Fetches what happened since the committed snapshot and stores it in Supabase, then asks Vercel to rebuild
so the build step (web/scripts/merge-fresh.mjs) merges it into the app's data:

  1. NSE corporate announcements for the window (one bulk call), kept for the portfolio companies, grouped
     and scored by the same code as the batch pipeline (digest_core.py, a COPY of workers/digest_core.py).
     A results filing gets its headline numbers (Revenue, EBITDA, PBT, PAT, QoQ/YoY) from the company's
     XBRL filings, parsed by xbrl_results.py. Thesis relevance T is the batch's base value (0.4, "a company
     you own"): the full thesis check needs the offline ledger, so fresh events are marked "fresh".
  2. End-of-day prices and volumes for every company (Yahoo Finance chart API, in parallel).
  3. Upserts both into Supabase (service key, server only) and logs the run in refresh_runs.
  4. If anything is new, POSTs the project's Deploy Hook.

Every network step has its own timeout and the whole run a budget; a failed source is logged, never fatal.
No model runs here. Security: Vercel sends `Authorization: Bearer <CRON_SECRET>`; anything else gets 401.
"""
from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from digest_core import filing_events, score, set_bucket
from xbrl_results import headline

IST = timezone(timedelta(hours=5, minutes=30))
BUDGET_S = 50
T_BASE = 0.4
COMPANIES = json.loads((Path(__file__).parent / "portfolio.json").read_text(encoding="utf-8"))["companies"]
PORTFOLIO = {c["symbol"] for c in COMPANIES if c["portfolio"]}
NAMES = {c["symbol"]: c["name"] for c in COMPANIES}
SECTOR = {c["symbol"]: c["sector"] for c in COMPANIES}
SNAPSHOT_LAST_DAY = "2026-11-14"   # the committed snapshot runs to here; the first refresh starts after it


# ── Supabase REST (service role: server only) ─────────────────────────────────────────────────────
def _sb() -> tuple[str, dict] | None:
    url, key = os.environ.get("NEXT_PUBLIC_SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    return url.rstrip("/") + "/rest/v1", {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _last_window_end(base: str, h: dict) -> str | None:
    r = httpx.get(f"{base}/refresh_runs", headers=h, timeout=10,
                  params={"select": "window_to", "ok": "eq.true", "order": "window_to.desc", "limit": "1"})
    r.raise_for_status()
    rows = r.json()
    return rows[0]["window_to"] if rows else None


def _existing_ids(base: str, h: dict, since: str) -> set[str]:
    r = httpx.get(f"{base}/market_events", headers=h, timeout=10, params={"select": "id", "at": f"gte.{since}T00:00:00+05:30"})
    r.raise_for_status()
    return {x["id"] for x in r.json()}


def _upsert(base: str, h: dict, table: str, rows: list[dict], conflict: str) -> None:
    if not rows:
        return
    r = httpx.post(f"{base}/{table}", headers={**h, "Prefer": "resolution=merge-duplicates,return=minimal"},
                   params={"on_conflict": conflict}, content=json.dumps(rows), timeout=20)
    r.raise_for_status()


# ── sources ─────────────────────────────────────────────────────────────────────────────────────────
def _announcements(c: httpx.Client, nse: str, start: datetime, end: datetime) -> list[dict]:
    r = c.get(f"{nse}/api/corporate-announcements",
              params={"index": "equities", "from_date": start.strftime("%d-%m-%Y"), "to_date": end.strftime("%d-%m-%Y")})
    r.raise_for_status()
    rows = r.json()
    rows = rows if isinstance(rows, list) else rows.get("data", [])
    return [x for x in rows if x.get("symbol") in PORTFOLIO and x.get("an_dt")]


def _prices(symbol: str, ua: str) -> list[dict]:
    r = httpx.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}.NS",
                  params={"range": "1mo", "interval": "1d"}, headers={"User-Agent": ua}, timeout=12)
    r.raise_for_status()
    res = r.json()["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    out = []
    for t, close, vol in zip(res["timestamp"], q["close"], q["volume"]):
        if close is None or vol is None:
            continue
        day = datetime.fromtimestamp(t, IST).date().isoformat()
        out.append({"symbol": symbol, "day": day, "close": round(float(close), 2), "volume": int(vol)})
    return out


def _results_block(c: httpx.Client, symbol: str, deadline: float, quarters_by_label) -> dict | None:
    """Headline numbers for the latest quarter, with QoQ and YoY from the company's own XBRL filings."""
    by_label, _, _ = quarters_by_label(c, symbol, deadline)
    if not by_label:
        return None
    latest = max(by_label, key=lambda k: by_label[k][0].period_end)
    cur, src, basis, _ = by_label[latest]
    q, fy = int(latest[1]), int(latest[-2:])
    prev_q = by_label.get(f"Q4FY{fy - 1:02d}" if q == 1 else f"Q{q - 1}FY{fy:02d}")
    prev_y = by_label.get(f"Q{q}FY{fy - 1:02d}")
    h = headline(cur, prev_q[0] if prev_q and prev_q[2] == basis else None, prev_y[0] if prev_y and prev_y[2] == basis else None)
    h["source"] = src
    return h


# ── the run ─────────────────────────────────────────────────────────────────────────────────────────
def run(*, nse_client, quarters_by_label, ua: str, write: bool = True, today: datetime | None = None) -> dict:
    t0 = time.monotonic()
    started = datetime.now(timezone.utc).isoformat()
    deadline = t0 + BUDGET_S
    now = today or datetime.now(IST)
    sb = _sb() if write else None
    if write and not sb:
        return {"ok": False, "error": "Supabase is not configured on this server"}
    base, h = sb if sb else (None, None)

    last = (_last_window_end(base, h) if base else None) or SNAPSHOT_LAST_DAY
    start = datetime.fromisoformat(last).replace(tzinfo=IST) + timedelta(days=1)
    start = min(start, now - timedelta(days=1))             # always look at least at yesterday and today
    notes: list[str] = []

    # 1. filings → events
    events: list[dict] = []
    filings_ok = False
    try:
        c = nse_client()             # already opened (it fetched NSE's cookies); closed below
        try:
            rows = _announcements(c, "https://www.nseindia.com", start, now)
            results: dict[str, dict] = {}
            for sym in sorted({r["symbol"] for r in rows if "result" in (r.get("desc") or "").lower()
                               or "financial results" in (r.get("attchmntText") or "").lower()}):
                if time.monotonic() > deadline - 15:
                    notes.append(f"results for {sym} skipped: time budget")
                    continue
                try:
                    block = _results_block(c, sym, deadline - 10, quarters_by_label)
                    if block and block.get("metrics"):
                        results[sym] = block
                except Exception as e:  # noqa: BLE001 — one company's results never stop the run
                    notes.append(f"results for {sym}: {type(e).__name__}")
        finally:
            c.close()
        events = filing_events(rows, NAMES, SECTOR, results)
        for ev in events:
            m, s = ev["components"]["M"], ev["components"]["S"]
            ev["components"]["T"] = T_BASE
            ev["score"] = score(m, s, T_BASE)
            ev["thesis"] = []
            ev["fresh"] = True          # scored without the offline thesis check
            set_bucket(ev)
        filings_ok = True
    except Exception as e:  # noqa: BLE001
        notes.append(f"NSE announcements failed: {type(e).__name__}: {e}"[:300])

    # 2. prices, in parallel
    prices: list[dict] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_prices, c["symbol"], ua): c["symbol"] for c in COMPANIES}
        for f, sym in futures.items():
            try:
                prices += f.result(timeout=max(1, deadline - time.monotonic()))
            except Exception as e:  # noqa: BLE001
                notes.append(f"prices for {sym}: {type(e).__name__}")
    prices = [p for p in prices if p["day"] > SNAPSHOT_LAST_DAY]

    # A run whose filings fetch failed is logged as not OK, so the next run retries the same days.
    summary = {"ok": filings_ok, "window_from": start.date().isoformat(), "window_to": now.date().isoformat(),
               "events": len(events), "prices": len(prices), "notes": notes,
               "event_ids": [e["id"] for e in events], "seconds": round(time.monotonic() - t0, 1)}
    if not write:
        summary["preview"] = events          # dry run: everything it would store
        return summary

    # 3. store, log, and 4. rebuild if anything is new
    try:
        known = _existing_ids(base, h, start.date().isoformat())
        _upsert(base, h, "market_events", [{"id": e["id"], "symbol": e["symbol"], "at": e["at"], "payload": e} for e in events], "id")
        _upsert(base, h, "market_prices", prices, "symbol,day")
        new = [e["id"] for e in events if e["id"] not in known]
        hook = os.environ.get("DEPLOY_HOOK_URL")
        if not (new or prices):
            deploy = "nothing new"
        elif not hook:
            deploy = "no hook"
        else:
            try:
                httpx.post(hook, timeout=10).raise_for_status()
                deploy = "triggered"
            except Exception as e:  # noqa: BLE001
                deploy = f"failed: {type(e).__name__}"
        summary.update({"new_events": len(new), "deploy": deploy})
    except Exception as e:  # noqa: BLE001
        summary.update({"ok": False, "error": f"{type(e).__name__}: {e}"[:300]})  # retried next run
        deploy = "not reached"

    try:
        httpx.post(f"{base}/refresh_runs", headers={**h, "Prefer": "return=minimal"}, timeout=10, content=json.dumps({
            "started_at": started, "finished_at": datetime.now(timezone.utc).isoformat(), "ok": summary["ok"],
            "window_from": summary["window_from"], "window_to": summary["window_to"],
            "events": len(events), "prices": len(prices), "deploy": summary.get("deploy", deploy),
            "notes": "; ".join(notes)[:2000] or None})).raise_for_status()
    except Exception:  # noqa: BLE001 — the run's own log failing is reported in the response only
        summary["notes"].append("could not write refresh_runs")
    return summary
