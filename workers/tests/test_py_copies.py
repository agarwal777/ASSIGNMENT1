"""The daily cloud job (py/) runs copies of the batch scoring code; they must not drift."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_cloud_job_copies_match_the_batch_code():
    for name in ("classify", "digest_core"):
        src = (ROOT / "workers" / f"{name}.py").read_text(encoding="utf-8").splitlines()
        copy = (ROOT / "py" / f"{name}.py").read_text(encoding="utf-8").splitlines()
        assert copy[0].startswith("# COPY"), f"py/{name}.py must keep its two-line COPY header"
        assert copy[2:] == src, f"py/{name}.py has drifted from workers/{name}.py"
