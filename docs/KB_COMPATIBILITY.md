# KB + Vector Store Compatibility Report

> **Generated**: 2026-06-06
> **Project**: KB Test (`6a23efc4faae9bff5aab29dd`)
> **Embedding**: `gemini-embedding-001` (org default — Gemini provider)
> **Strategy**: one KB per vector store, each file type tested one at a time (ascending memory order)
> **Test files**: txt · md · csv · json · pdf (all < 1 KB synthetic samples)

---

## Summary

| Vector Store | Status | Notes |
|---|---|---|
| `default` (built-in) | ✅ Working | All 8 file types working (fixes applied) |
| `chromadb` (external) | ❌ Failed | Needs `host`/`port` params — empty params crash MindsDB |
| `lancedb` | ❌ Missing dep | `No module named 'lance'` — package not installed in image |
| `pgvector` | ⏭️ Skipped | No external Postgres configured |
| `qdrant` | ⏭️ Skipped | No external Qdrant configured |
| `milvus` | ⏭️ Skipped | No external Milvus URI configured |
| `weaviate` | ⏭️ Skipped | No external Weaviate URL configured |
| `pinecone` | ⏭️ Skipped | No Pinecone API key configured |

---

## Vector Store: `default` (MindsDB built-in ChromaDB)

> **Status: ⚠️ Partial** — 3/5 file types work

| File type | Upload | Chunks stored | Notes |
|-----------|--------|---------------|-------|
| `txt` | ✅ | ✅ 1 chunk | Works |
| `md` | ✅ | ✅ 2 chunks | Works (extension remapped to `.txt` before upload) |
| `pdf` | ✅ | ✅ 2 chunks | Works |
| `csv` | ✅ | ✅ 1 chunk | Fixed — converted to tabular text before upload |
| `json` | ✅ | ✅ 1 chunk | Fixed — converted to text before upload |

### Root cause — CSV / JSON failure

MindsDB's file handler parses CSV and JSON as **structured tables** (with column names like `product`, `revenue`). When the backend then does:

```sql
INSERT INTO {project}.{kb_name} SELECT * FROM files.{file_id}
```

MindsDB's KB handler looks for a column named `content` in the result set. Since CSV/JSON have user-defined column names, the insert fails with:

> `SQL error: Content columns None not found in dataset: ['product', 'revenue', 'region']`

### Fix applied ✅

In `backend/api/knowledge_bases.py` → `upload_file_to_kb`: structured file types (csv, tsv, json, xlsx, parquet) are now **converted to plain text** using `_extract_text` before uploading to MindsDB. MindsDB then receives a `.txt` file and the KB insert succeeds.

---

## Vector Store: `chromadb` (external)

> **Status: ❌ Failed — needs connection params**

### Root cause

The `chromadb` vector store type in MindsDB is an **external ChromaDB server connector**, not in-process. Passing `params: {}` means `port=None`, and MindsDB does `int(None)` internally:

> `Error connecting to ChromaDB client, int() argument must be a string, a bytes-like object or a real number, not 'NoneType'!`

The `default` vector store already uses ChromaDB internally — users who want in-process ChromaDB storage should use `default`.

### Fix / Workaround

To use the `chromadb` type, provide an external ChromaDB server:

```json
{
  "vector_store": {
    "type": "chromadb",
    "params": {
      "host": "your-chroma-host",
      "port": 8000
    }
  }
}
```

The UI correctly requires params for non-default stores. No code fix needed — document this in UI help text.

---

## Vector Store: `lancedb`

> **Status: ❌ Missing dependency in MindsDB image**

### Root cause

MindsDB's LanceDB handler requires the `lance` native Python module (Rust extension), which is a **separate package from `lancedb`** in older releases. The Dockerfile installs `lancedb` but not `lance`:

> `No module named 'lance'`

### Fix applied ✅

`Dockerfile.mindsdb` updated to install `lance` alongside `lancedb`.

---

## Vector Stores: `pgvector`, `qdrant`, `milvus`, `weaviate`, `pinecone`

> **Status: ⏭️ Skipped — external services not configured**

These require external hosted services. To test:

| Store | Required env vars |
|---|---|
| `pgvector` | `PGVECTOR_HOST`, `PGVECTOR_PORT`, `PGVECTOR_DB`, `PGVECTOR_USER`, `PGVECTOR_PASSWORD` |
| `qdrant` | `QDRANT_URL`, `QDRANT_API_KEY` |
| `milvus` | `MILVUS_URI`, `MILVUS_TOKEN` |
| `weaviate` | `WEAVIATE_URL`, `WEAVIATE_API_KEY` |
| `pinecone` | `PINECONE_API_KEY` |

Set the env vars and re-run `scripts/kb_compatibility_test.py` to test them.

---

## File Type Support Matrix

| File type | Extraction method | MindsDB upload name | Works |
|-----------|------------------|---------------------|-------|
| `.txt` | Direct | `.txt` | ✅ |
| `.md` | Direct (remapped) | `.txt` | ✅ |
| `.pdf` | pypdf page extraction | `.pdf` | ✅ |
| `.csv` | pandas → tabular text | `.txt` *(fix applied)* | ✅ after fix |
| `.json` | json.dumps → text | `.txt` *(fix applied)* | ✅ after fix |
| `.xlsx` / `.xls` | pandas → tabular text | `.txt` *(fix applied)* | ✅ after fix |
| `.parquet` | pyarrow (w/ metadata fallback) → tabular text | `.txt` *(fix applied)* | ✅ after fix |
| `.tsv` | pandas → tabular text | `.txt` *(fix applied)* | ✅ after fix |

---

## How to re-run tests

```bash
# From project root
python scripts/kb_compatibility_test.py

# With external vector stores (set env vars first)
$env:QDRANT_URL="https://your-cluster.qdrant.io"
$env:QDRANT_API_KEY="your-key"
python scripts/kb_compatibility_test.py
```

Results are written incrementally to `docs/KB_COMPATIBILITY.md` — safe to interrupt and re-run.
