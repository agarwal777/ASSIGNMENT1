"""The one door to a language model. Every call goes through `call()`, which:

  * refuses payloads that contain investor-network fields (privacy by construction)
  * caches by sha256(model + prompt), so a document is processed once
  * asks for JSON and validates it; one retry on invalid output, then gives up loudly
  * logs model, task, tokens and cache hits to seed/llm_calls.jsonl (reported in the writeup)

Provider: Gemini API, free tier. On the free tier Google may use content to improve its
products, so only public documents (exchange filings, transcripts) may be sent here.
Key: GEMINI_API_KEY in finn/.env.local (never committed). Model: MODEL_SMALL (default flash-lite).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "seed" / "llm_cache"
LOG = ROOT / "seed" / "llm_calls.jsonl"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Field names from the private vault. If any appears in a payload, the call is refused.
NETWORK_FIELDS = re.compile(r"\b(contact_id|display_name|closeness|last_contacted|contact_stints|"
                            r"org_canonical|network_overlaps)\b")


def _env() -> dict[str, str]:
    env = dict(os.environ)
    f = ROOT / ".env.local"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return env


class PrivacyError(RuntimeError):
    pass


def call(task: str, prompt: str, schema: dict, model: str | None = None, retries: int = 3) -> dict:
    if NETWORK_FIELDS.search(prompt):
        raise PrivacyError(f"refused: payload for '{task}' contains investor-network fields")
    env = _env()
    model = model or env.get("MODEL_SMALL") or "gemini-3.5-flash-lite"
    key = env.get("GEMINI_API_KEY")
    digest = hashlib.sha256(f"{model}\n{json.dumps(schema, sort_keys=True)}\n{prompt}".encode()).hexdigest()
    cached = CACHE / f"{digest}.json"
    if cached.exists():
        _log(task, model, 0, 0, True)
        return json.loads(cached.read_text(encoding="utf-8"))
    if not key:
        raise RuntimeError("GEMINI_API_KEY missing in finn/.env.local")

    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json",
                             "responseSchema": schema},
    }
    last_err = None
    for attempt in range(retries + 1):
        try:
            r = httpx.post(ENDPOINT.format(model=model), json=body, timeout=float(os.environ.get("LLM_TIMEOUT", "420")),
                           headers={"x-goog-api-key": key, "Content-Type": "application/json"})
        except httpx.TransportError as e:   # timeouts, dropped connections, connect failures
            last_err = f"{type(e).__name__} after up to {os.environ.get('LLM_TIMEOUT', '420')} s"
            continue
        if r.status_code in (429, 500, 503):
            # Rate limit or "model experiencing high demand" (free tier): back off and retry.
            time.sleep(20 * (attempt + 1))
            last_err = f"HTTP {r.status_code} (rate limit or overloaded)"
            continue
        if r.status_code != 200:
            raise RuntimeError(f"Gemini HTTP {r.status_code}: {r.text[:300]}")
        data = r.json()
        usage = data.get("usageMetadata", {})
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            out = json.loads(text)
        except (KeyError, IndexError, json.JSONDecodeError) as e:
            last_err = f"invalid JSON from model: {e}"
            continue
        _log(task, model, usage.get("promptTokenCount", 0), usage.get("candidatesTokenCount", 0), False)
        CACHE.mkdir(parents=True, exist_ok=True)
        cached.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        return out
    raise RuntimeError(f"{task}: gave up after {retries + 1} attempts: {last_err}")


def _log(task: str, model: str, tin: int, tout: int, hit: bool) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "task": task, "model": model,
                            "tokens_in": tin, "tokens_out": tout, "cache_hit": hit,
                            "cost_inr": 0.0}) + "\n")
