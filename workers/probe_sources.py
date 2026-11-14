"""B1 probe: can this laptop reach the data sources, and who reported results recently?

Read-only. Writes one JSON summary to seed/probe/ and prints a short report.
Endpoints are NSE's unofficial website JSON APIs; they are not documented and may change,
which is exactly what this probe is meant to find out.

Usage (from finn/):  workers/.venv/Scripts/python -I workers/probe_sources.py --days 14
"""
from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import httpx

NSE = "https://www.nseindia.com"
HEADERS = {
    # A plain browser-like UA; NSE rejects clients without one. No personal data is sent.
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": f"{NSE}/companies-listing/corporate-filings-announcements",
}
RESULT_WORDS = ("financial result", "outcome of board meeting")


def nse_client() -> httpx.Client:
    c = httpx.Client(headers=HEADERS, timeout=30, follow_redirects=True, http2=False)
    r = c.get(NSE)  # sets the session cookies the JSON API expects
    print(f"NSE homepage: HTTP {r.status_code}, cookies: {len(c.cookies)}")
    return c


def announcements(c: httpx.Client, start: date, end: date) -> list[dict]:
    url = f"{NSE}/api/corporate-announcements"
    params = {"index": "equities", "from_date": start.strftime("%d-%m-%Y"),
              "to_date": end.strftime("%d-%m-%Y")}
    r = c.get(url, params=params)
    print(f"Announcements {params['from_date']}..{params['to_date']}: HTTP {r.status_code}, "
          f"{len(r.content) // 1024} KB")
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, list) else data.get("data", [])


def yfinance_check(symbol: str) -> dict:
    import yfinance as yf
    h = yf.Ticker(f"{symbol}.NS").history(period="1mo", auto_adjust=False)
    return {"symbol": symbol, "rows": len(h),
            "last_date": str(h.index[-1].date()) if len(h) else None}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    args = ap.parse_args()
    end = date.today()
    start = end - timedelta(days=args.days)

    report: dict = {"run_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "window": [str(start), str(end)]}
    try:
        c = nse_client()
        rows = announcements(c, start, end)
        report["nse_ok"] = True
        report["n_announcements"] = len(rows)
        report["sample_keys"] = sorted(rows[0].keys()) if rows else []
        subj_key = next((k for k in ("desc", "subject", "attchmntText") if rows and k in rows[0]), None)
        cats = Counter((r.get(subj_key) or "").strip() for r in rows) if subj_key else Counter()
        report["top_subjects"] = cats.most_common(25)
        reporters = sorted({r.get("symbol") for r in rows
                            if subj_key and any(w in (r.get(subj_key) or "").lower() for w in RESULT_WORDS)})
        report["n_result_filers"] = len(reporters)
        report["result_filers"] = reporters
        report["has_xbrl_field"] = any("xbrl" in k.lower() for k in report["sample_keys"])
    except Exception as e:  # report, don't hide
        report["nse_ok"] = False
        report["nse_error"] = f"{type(e).__name__}: {e}"

    try:
        report["yfinance"] = yfinance_check("TCS")
    except Exception as e:
        report["yfinance"] = {"error": f"{type(e).__name__}: {e}"}

    out = Path("seed/probe")
    out.mkdir(parents=True, exist_ok=True)
    (out / "probe_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "result_filers"}, indent=2)[:4000])
    print(f"result filers: {report.get('n_result_filers')} (full list in seed/probe/probe_report.json)")


if __name__ == "__main__":
    main()
