"""Price / volume alerts on end-of-day data. Defaults follow the brief; thresholds are user settings.

  volume alert:  today's volume > volume_multiple × average of the previous 20 sessions
  price alert:   |close-to-close return| > price_move_pct
An alert is "unexplained" when the company filed nothing between the previous trading session
and the alert day (inclusive), so weekend and holiday filings count.

Usage (from finn/):  workers/.venv/Scripts/python workers/alerts.py
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

SEED = Path("seed")


@dataclass(frozen=True)
class Thresholds:
    volume_multiple: float = 2.0
    price_move_pct: float = 5.0
    lookback: int = 20


def detect(series: list[dict], t: Thresholds = Thresholds()) -> list[dict]:
    """series: [{'date': date, 'close': float, 'volume': int}] sorted by date ascending."""
    out = []
    for i in range(t.lookback, len(series)):
        today, prev = series[i], series[i - 1]
        window = [s["volume"] for s in series[i - t.lookback:i]]
        avg = sum(window) / len(window)
        vol_x = today["volume"] / avg if avg > 0 else None
        ret = 100 * (today["close"] - prev["close"]) / prev["close"] if prev["close"] else None
        reasons = []
        if vol_x is not None and vol_x > t.volume_multiple:
            reasons.append(f"volume {vol_x:.1f}× its {t.lookback}-day average")
        if ret is not None and abs(ret) > t.price_move_pct:
            reasons.append(f"price {ret:+.1f}% on the day")
        if reasons:
            out.append({"date": today["date"], "prev_session": prev["date"],
                        "volume_multiple": round(vol_x, 2) if vol_x else None,
                        "return_pct": round(ret, 2) if ret is not None else None, "reasons": reasons})
    return out


def _filing_dates() -> dict[str, set[date]]:
    dates: dict[str, set[date]] = defaultdict(set)
    for p in (SEED / "filings").glob("*.json"):
        for r in json.loads(p.read_text(encoding="utf-8")):
            raw = (r.get("an_dt") or "")[:11]
            try:
                dates[r["symbol"]].add(datetime.strptime(raw, "%d-%b-%Y").date())
            except (ValueError, KeyError):
                pass
    return dates


def main() -> None:
    series: dict[str, list[dict]] = defaultdict(list)
    with (SEED / "prices.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            series[r["symbol"]].append({"date": date.fromisoformat(r["date"]),
                                        "close": float(r["close"]), "volume": int(r["volume"])})
    filed = _filing_dates()
    # Only judge "unexplained" where we actually hold the filing feed; elsewhere it is unknown.
    window_start = min((d for ds in filed.values() for d in ds), default=None)
    alerts = []
    for sym, s in series.items():
        s.sort(key=lambda x: x["date"])
        for a in detect(s):
            d, prev = a["date"], a.pop("prev_session")
            a["symbol"] = sym
            # A filing explains the move if it landed between the previous session and today,
            # inclusive: after-hours on the previous session, over a weekend or holiday, or today.
            span = {prev + timedelta(days=k) for k in range((d - prev).days + 1)}
            covered = window_start is not None and prev >= window_start
            a["unexplained"] = (not (span & filed.get(sym, set()))) if covered else None
            a["date"] = d.isoformat()
            alerts.append(a)
    alerts.sort(key=lambda a: a["date"], reverse=True)
    (SEED / "alerts.json").write_text(json.dumps(alerts, indent=1), encoding="utf-8")
    recent = [a for a in alerts if a["date"] >= "2026-10-31"]
    print(f"{len(alerts)} alerts in 1y; {len(recent)} since 31 Oct "
          f"({sum(bool(a['unexplained']) for a in recent)} with no filing since the previous session)")
    for a in recent[:15]:
        print(f"{a['date']} {a['symbol']:<11} {'UNEXPLAINED ' if a['unexplained'] else ''}"
              f"{'; '.join(a['reasons'])}")


if __name__ == "__main__":
    main()
