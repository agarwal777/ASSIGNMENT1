"""Incoming executives' careers from their appointment filings → web/data/executives.json.

For every management-change filing in the digest: download the filing (NSE, public), read its text,
and ask the model (workers/llm.py: cached, network deny-list, logged) for each person being
appointed or re-appointed, with their career as stints. Every stint must come with the exact
sentence it was taken from; a stint whose sentence is not found word for word in the PDF is
dropped, and a person whose name is not in the PDF is dropped. Cessations are skipped.

The two Voltas entries transcribed by hand earlier are kept as they are.

Usage (from finn/):  workers/.venv/Scripts/python workers/extract_executives.py
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import llm  # noqa: E402
from extract_promises import locate, norm, page_texts  # noqa: E402
from probe_sources import HEADERS, nse_client  # noqa: E402

SEED, WEB = Path("seed"), Path("web/data")
FUNCTIONS = ["general_management", "finance", "operations", "engineering", "sales", "marketing", "strategy",
             "technology", "regulatory", "quality", "r_and_d", "supply_chain", "procurement", "legal", "hr",
             "education", "public_service", "other"]

SCHEMA = {
    "type": "object",
    "properties": {"people": {"type": "array", "items": {"type": "object", "properties": {
        "name": {"type": "string"},
        "change": {"type": "string", "enum": ["appointed", "reappointed", "ceased", "other"]},
        "title": {"type": "string"},
        "effective": {"type": "string", "description": "YYYY-MM-DD if the filing states it, else empty"},
        "din": {"type": "string"},
        "profile_quote": {"type": "string", "description": "one sentence copied exactly from the brief profile"},
        "stints": {"type": "array", "items": {"type": "object", "properties": {
            "org": {"type": "string"}, "role": {"type": "string"},
            "function": {"type": "string", "enum": FUNCTIONS},
            "start": {"type": "string", "description": "4-digit year if stated, else empty"},
            "end": {"type": "string", "description": "4-digit year if stated, else empty (empty also means current)"},
            "current": {"type": "boolean"},
            "quote": {"type": "string", "description": "the exact words from the filing this stint is taken from"},
        }, "required": ["org", "function", "quote", "current"]}},
    }, "required": ["name", "change", "stints"]}}},
    "required": ["people"],
}

PROMPT = """You read an Indian listed company's exchange filing about a change in its directors or
management. List each person the filing APPOINTS or RE-APPOINTS (also list people who cease, with change
"ceased" and no stints).

For each appointee, take their career ONLY from this filing (usually a "brief profile" or Annexure):
- one stint per organisation they worked at or studied at (function "education" for degrees), with role,
  the start and end YEAR only if the filing states them, and current=true if they are still there;
- "quote": copy the exact words from the filing that state that stint (one sentence or clause, verbatim);
- "profile_quote": one verbatim sentence that best introduces the person.
Do not add anything the filing does not say. No outside knowledge. If the filing gives no career, return
the person with no stints.

Filing ({symbol}, filed {filed}):
{text}
"""


def download(sym: str, url: str, client) -> Path | None:
    d = SEED / "docs" / sym
    d.mkdir(parents=True, exist_ok=True)
    existing = list(d.glob(f"*{Path(url).name}"))
    if existing:
        return existing[0]
    r = client.get(url, headers={**HEADERS, "Accept": "*/*"})
    if r.status_code != 200 or not r.content.startswith(b"%PDF"):
        print(f"{sym}: download failed (HTTP {r.status_code})")
        return None
    path = d / f"appointment_{Path(url).name}"
    path.write_bytes(r.content)
    time.sleep(1.5)
    return path


def slug(name: str) -> str:
    n = re.sub(r"^(mr|mrs|ms|dr|shri|smt|sri)\.?\s+", "", name.strip(), flags=re.I)
    return re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-"), n


def main() -> None:
    digest = json.loads((WEB / "digest.json").read_text(encoding="utf-8"))
    ex_path = WEB / "executives.json"
    data = json.loads(ex_path.read_text(encoding="utf-8"))
    kept = [e for e in data["executives"] if e.get("company") == "VOLTAS"]   # hand-transcribed, already verified
    done_events = {ev for e in kept for ev in e["events"]}
    out = list(kept)
    client = nse_client()
    report = []
    for e in digest["events"]:
        if e["category"] != "management_change" or e["id"] in done_events or not e.get("url"):
            continue
        sym = e["symbol"]
        pdf = download(sym, e["url"], client)
        if not pdf:
            report.append((e["id"], "download failed"))
            continue
        pages = page_texts(str(pdf))
        text = "\n".join(pages)
        if len(text.strip()) < 200:
            report.append((e["id"], "no text layer"))
            continue
        try:
            res = llm.call(f"executives:{sym}", PROMPT.format(symbol=sym, filed=e["at"][:10], text=text[:60000]), SCHEMA)
        except Exception as err:  # noqa: BLE001 — report and continue with the next filing
            report.append((e["id"], f"model failed: {err}"))
            continue
        added = 0
        for p in res.get("people", []):
            if p.get("change") not in ("appointed", "reappointed"):
                continue
            pid, clean = slug(p["name"])
            if norm(clean) not in norm(text):
                report.append((e["id"], f"dropped {p['name']}: name not in the filing"))
                continue
            stints, dropped = [], 0
            for s in p.get("stints", []):
                page, how = locate(s.get("quote", ""), pages)
                if page is None:
                    dropped += 1
                    continue
                yr = lambda v: v if re.fullmatch(r"(19|20)\d\d", v or "") else None
                stints.append({"org": s["org"].strip(), "role": (s.get("role") or "").strip() or None,
                               "function": s["function"], "start": yr(s.get("start")),
                               "end": None if s.get("current") else yr(s.get("end")),
                               "quote": s["quote"].strip(), "page": page})
            pq = p.get("profile_quote") or ""
            entry = {"id": pid, "name": clean, "din": p.get("din") or None, "company": sym,
                     "role": p.get("title") or "Appointee", "title": p.get("title") or None,
                     "effective": p.get("effective") if re.fullmatch(r"\d{4}-\d{2}-\d{2}", p.get("effective") or "") else None,
                     "profile_quote": pq if pq and locate(pq, pages)[0] else None,
                     "events": [e["id"]], "source": e["url"], "extracted": True, "stints": stints}
            prev = next((x for x in out if x["id"] == pid and x["company"] == sym), None)
            if prev:
                prev["events"] = sorted(set(prev["events"]) | {e["id"]})
            else:
                out.append(entry)
            added += 1
            report.append((e["id"], f"{clean}: {len(stints)} stints kept, {dropped} dropped (quote not found)"))
        if not added:
            report.append((e["id"], "no appointee in the filing"))

    data["_note"] = ("Public data: executives named in exchange filings. Voltas entries were transcribed by hand; the "
                     "others are extracted by workers/extract_executives.py from each appointment filing, keeping a stint "
                     "only if its source sentence is found word for word in the PDF. Years only: filings give no months.")
    data["executives"] = out
    ex_path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    for r in report:
        print(*r, sep="  ")
    print(f"wrote {len(out)} executives")


if __name__ == "__main__":
    main()
