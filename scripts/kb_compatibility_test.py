"""
KB + Vector Store compatibility test.

Strategy: one KB at a time (create → upload each file type → check chunks → delete).
Ascending memory order: default → chromadb → lancedb → pgvector → external cloud stores.
Results written incrementally to docs/KB_COMPATIBILITY.md so progress is saved even
if the script is interrupted mid-run.
"""

import json
import os
import time
from pathlib import Path

import httpx

# ── Config ───────────────────────────────────────────────────────────────────

BASE = "http://localhost:8000"
EMAIL = "admin@openbi.dev"
PASSWORD = "changeme123"
PROJECT_ID = "6a23efc4faae9bff5aab29dd"   # "KB Test" project

FILES_DIR = Path(__file__).parent / "kb_test_files"
REPORT_PATH = Path(__file__).parent.parent / "docs" / "KB_COMPATIBILITY.md"

# Vector stores to test, in ascending memory/complexity order.
# "default" = MindsDB's built-in ChromaDB (no external setup needed).
# Others require an external service — if they fail with a connection error
# that is recorded as SKIP rather than FAIL.
VECTOR_STORES = [
    {"name": "default", "type": "default", "params": {}},
    {"name": "chromadb", "type": "chromadb", "params": {}},
    {"name": "lancedb",  "type": "lancedb",  "params": {}},
    # pgvector, qdrant, milvus, weaviate, pinecone need external services
    # — tested only if env vars are present.
    {"name": "pgvector", "type": "pgvector",
     "params": {"host": os.getenv("PGVECTOR_HOST",""), "port": int(os.getenv("PGVECTOR_PORT","5432")),
                "database": os.getenv("PGVECTOR_DB","openbi"), "user": os.getenv("PGVECTOR_USER","postgres"),
                "password": os.getenv("PGVECTOR_PASSWORD","")},
     "requires_env": "PGVECTOR_HOST"},
    {"name": "qdrant", "type": "qdrant",
     "params": {"url": os.getenv("QDRANT_URL",""), "api_key": os.getenv("QDRANT_API_KEY","")},
     "requires_env": "QDRANT_URL"},
    {"name": "pinecone", "type": "pinecone",
     "params": {"api_key": os.getenv("PINECONE_API_KEY","")},
     "requires_env": "PINECONE_API_KEY"},
    {"name": "milvus", "type": "milvus",
     "params": {"uri": os.getenv("MILVUS_URI",""), "token": os.getenv("MILVUS_TOKEN","")},
     "requires_env": "MILVUS_URI"},
    {"name": "weaviate", "type": "weaviate",
     "params": {"url": os.getenv("WEAVIATE_URL",""), "api_key": os.getenv("WEAVIATE_API_KEY","")},
     "requires_env": "WEAVIATE_URL"},
]

FILE_TYPES = [
    {"label": "txt",  "path": FILES_DIR / "sample.txt",  "content_type": "text/plain"},
    {"label": "md",   "path": FILES_DIR / "sample.md",   "content_type": "text/plain"},
    {"label": "csv",  "path": FILES_DIR / "sample.csv",  "content_type": "text/csv"},
    {"label": "json", "path": FILES_DIR / "sample.json", "content_type": "application/json"},
    {"label": "pdf",  "path": FILES_DIR / "sample.pdf",  "content_type": "application/pdf"},
]

TIMEOUT = httpx.Timeout(180.0)   # KB creation + ingest can be slow

# ── Auth ─────────────────────────────────────────────────────────────────────

def login() -> str:
    r = httpx.post(f"{BASE}/api/auth/login",
                   json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

# ── KB helpers ────────────────────────────────────────────────────────────────

def create_kb(token: str, name: str, vs: dict) -> tuple[bool, str, str]:
    """Returns (ok, kb_id_or_empty, detail)."""
    body: dict = {"name": name}
    if vs["type"] != "default":
        body["vector_store"] = {"type": vs["type"], "params": vs["params"]}
    r = httpx.post(
        f"{BASE}/api/projects/{PROJECT_ID}/knowledge-bases",
        json=body, headers=headers(token), timeout=TIMEOUT,
    )
    if r.status_code == 200:
        return True, r.json()["_id"], "OK"
    return False, "", r.text[:200]


def upload_file(token: str, kb_id: str, ft: dict) -> tuple[bool, str]:
    """Returns (ok, detail)."""
    path: Path = ft["path"]
    if not path.exists():
        return False, f"test file not found: {path}"
    with open(path, "rb") as f:
        r = httpx.post(
            f"{BASE}/api/projects/{PROJECT_ID}/knowledge-bases/{kb_id}/upload",
            files={"file": (path.name, f, ft["content_type"])},
            headers=headers(token), timeout=TIMEOUT,
        )
    if r.status_code == 200:
        return True, "OK"
    return False, r.text[:200]


def get_chunks(token: str, kb_id: str) -> tuple[int, str]:
    """Returns (chunk_count, detail). Polls up to 60s for chunks to appear."""
    for _ in range(6):
        r = httpx.get(
            f"{BASE}/api/projects/{PROJECT_ID}/knowledge-bases/{kb_id}/chunks?limit=10",
            headers=headers(token), timeout=TIMEOUT,
        )
        if r.status_code == 200:
            data = r.json()
            chunks = data.get("chunks", [])
            if chunks:
                return len(chunks), f"{len(chunks)} chunks (total≈{data.get('total',len(chunks))})"
            # 0 chunks yet — wait and retry (MindsDB embeds async)
        time.sleep(10)
    # last attempt
    r = httpx.get(
        f"{BASE}/api/projects/{PROJECT_ID}/knowledge-bases/{kb_id}/chunks?limit=10",
        headers=headers(token), timeout=TIMEOUT,
    )
    if r.status_code == 200:
        chunks = r.json().get("chunks", [])
        return len(chunks), f"{len(chunks)} chunks" if chunks else "0 chunks after 70s wait"
    return 0, r.text[:200]


def delete_kb(token: str, kb_id: str) -> None:
    try:
        httpx.delete(
            f"{BASE}/api/projects/{PROJECT_ID}/knowledge-bases/{kb_id}",
            headers=headers(token), timeout=60,
        )
    except Exception:
        pass

# ── Report helpers ────────────────────────────────────────────────────────────

PASS = "✅"
FAIL = "❌"
SKIP = "⏭️"
WARN = "⚠️"

def icon(ok: bool | None) -> str:
    if ok is True:  return PASS
    if ok is None:  return SKIP
    return FAIL


def write_report(sections: list[str]) -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    header = f"""# KB + Vector Store Compatibility Report

> **Generated**: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}
> **Project**: KB Test (`{PROJECT_ID}`)
> **Embedding**: gemini-embedding-001 (org default)
> **Strategy**: one KB per vector store, tested one file type at a time (ascending memory order)

---

"""
    REPORT_PATH.write_text(header + "\n\n".join(sections), encoding="utf-8")


# ── Main test loop ────────────────────────────────────────────────────────────

def run() -> None:
    print("Logging in...")
    token = login()
    print(f"  token: {token[:20]}...\n")

    sections: list[str] = []

    for vs in VECTOR_STORES:
        vs_name = vs["name"]
        vs_type = vs["type"]
        req_env = vs.get("requires_env")

        print(f"{'='*60}")
        print(f"VECTOR STORE: {vs_name}")
        print(f"{'='*60}")

        # Skip if required env var is absent
        if req_env and not os.getenv(req_env):
            msg = f"## {icon(None)} Vector Store: `{vs_name}`\n\n> **SKIPPED** — `{req_env}` env var not set (external service not configured)\n"
            print(f"  SKIP (no {req_env})\n")
            sections.append(msg)
            write_report(sections)
            continue

        # ── Create KB ──────────────────────────────────────────────────────
        kb_name = f"kb_test_{vs_name}_{int(time.time())%100000}"
        print(f"  Creating KB '{kb_name}'…")
        kb_ok, kb_id, kb_detail = create_kb(token, kb_name, vs)

        if not kb_ok:
            # Connection-refused style errors = external service unavailable
            skip_keywords = ("connection", "refused", "timeout", "not found", "handler")
            is_skip = any(kw in kb_detail.lower() for kw in skip_keywords)
            sym = icon(None) if is_skip else icon(False)
            label = "SKIPPED (service unavailable)" if is_skip else "FAILED"
            msg = (
                f"## {sym} Vector Store: `{vs_name}`\n\n"
                f"> **{label}** — KB creation error:\n> ```\n> {kb_detail}\n> ```\n"
            )
            print(f"  {label}: {kb_detail}\n")
            sections.append(msg)
            write_report(sections)
            continue

        print(f"  KB created: {kb_id}")

        # ── Test each file type one by one ─────────────────────────────────
        file_rows: list[str] = []
        for ft in FILE_TYPES:
            label = ft["label"]
            print(f"    [{vs_name}] upload {label}…", end=" ", flush=True)
            up_ok, up_detail = upload_file(token, kb_id, ft)
            if up_ok:
                print("uploaded, checking chunks...", end=" ", flush=True)
                n_chunks, chunk_detail = get_chunks(token, kb_id)
                chunk_ok = n_chunks > 0
                safe_detail = chunk_detail.replace("≈", "~")
                print(safe_detail)
                file_rows.append(
                    f"| `{label}` | {icon(up_ok)} Upload OK | "
                    f"{icon(chunk_ok)} {chunk_detail} |"
                )
            else:
                print(f"FAILED: {up_detail}")
                file_rows.append(
                    f"| `{label}` | {icon(False)} {up_detail[:80]} | — |"
                )
            # Small pause between uploads to avoid hammering MindsDB
            time.sleep(3)

        # ── Delete KB to free memory before next iteration ─────────────────
        print(f"  Deleting KB {kb_id}…")
        delete_kb(token, kb_id)
        time.sleep(5)   # let MindsDB settle

        # ── Build section for this vector store ────────────────────────────
        all_upload_ok = all(FAIL not in r.split("|")[2] for r in file_rows)
        all_chunk_ok  = all(FAIL not in r.split("|")[3] for r in file_rows)
        overall = icon(all_upload_ok and all_chunk_ok)

        table = (
            "| File type | Upload | Chunks |\n"
            "|-----------|--------|--------|\n"
            + "\n".join(file_rows)
        )
        msg = (
            f"## {overall} Vector Store: `{vs_name}`\n\n"
            f"{table}\n"
        )
        sections.append(msg)
        write_report(sections)
        print()

    print(f"\nReport written to: {REPORT_PATH}")
    print("Done.")


if __name__ == "__main__":
    run()
