"""FINN Python service. B0: health check only.

Vercel Services forwards the original path, so routes keep the /api/py prefix.
"""
import sys

from fastapi import FastAPI

app = FastAPI(title="finn-py")


@app.get("/api/py/health")
def health() -> dict:
    return {"status": "ok", "python": sys.version.split()[0]}
