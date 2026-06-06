"""Knowledge Base routes — CRUD, file upload, web crawl."""

import io
import re
from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.deps import get_current_project, get_current_user, get_db
from backend.core.security import decrypt_api_key
from backend.services.mindsdb_client import MindsDBError, mindsdb

router = APIRouter(prefix="/api/projects/{project_id}/knowledge-bases")


def _chunk_text(text: str, chunk_size: int = 500) -> list[dict]:
    """Split text into chunks on paragraph boundaries, targeting chunk_size chars."""
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    if not paragraphs:
        paragraphs = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]

    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if current and len(current) + len(para) + 2 > chunk_size:
            chunks.append(current.strip())
            current = para
        else:
            current = (current + "\n\n" + para) if current else para
    if current.strip():
        chunks.append(current.strip())

    return [
        {"index": i, "text": c, "length": len(c), "words": len(c.split())}
        for i, c in enumerate(chunks)
    ]


async def _extract_text(file_bytes: bytes, filename: str) -> tuple[str, dict]:
    """Return (text, metadata) for the given file bytes."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    metadata: dict = {"ext": ext}

    if ext == "pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(file_bytes))
            pages_text = [page.extract_text() or "" for page in reader.pages]
            text = "\n\n".join(pages_text)
            metadata["pages"] = len(reader.pages)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"PDF extraction failed: {exc}")

    elif ext in ("csv", "tsv"):
        try:
            import pandas as pd
            sep = "\t" if ext == "tsv" else ","
            df = pd.read_csv(io.BytesIO(file_bytes), sep=sep)
            text = df.to_string(index=False)
            metadata["rows"] = len(df)
            metadata["columns"] = list(df.columns)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"CSV parsing failed: {exc}")

    elif ext in ("xlsx", "xls"):
        try:
            import pandas as pd
            df = pd.read_excel(io.BytesIO(file_bytes))
            text = df.to_string(index=False)
            metadata["rows"] = len(df)
            metadata["columns"] = list(df.columns)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Excel parsing failed: {exc}")

    elif ext == "parquet":
        try:
            import pandas as pd
            buf = io.BytesIO(file_bytes)
            try:
                df = pd.read_parquet(buf)
            except Exception:
                # pyarrow extension-type conflict (e.g. pandas.period already registered)
                # — retry via pyarrow directly, ignoring pandas metadata
                import pyarrow.parquet as pq
                buf.seek(0)
                df = pq.read_table(buf).to_pandas(ignore_metadata=True)
            text = df.to_string(index=False)
            metadata["rows"] = len(df)
            metadata["columns"] = list(df.columns)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Parquet parsing failed: {exc}")

    elif ext == "json":
        try:
            import json as _json
            parsed = _json.loads(file_bytes.decode("utf-8", errors="replace"))
            text = _json.dumps(parsed, indent=2, ensure_ascii=False)
        except Exception:
            text = file_bytes.decode("utf-8", errors="replace")

    else:
        text = file_bytes.decode("utf-8", errors="replace")

    return text, metadata


class VectorStoreConfig(BaseModel):
    type: str
    params: dict = {}


class KBCreate(BaseModel):
    name: str
    embedding_model: dict | None = None
    reranking_model: dict | None = None
    vector_store: VectorStoreConfig | None = None


class WebCrawlRequest(BaseModel):
    url: str
    recurring: bool = False
    schedule: str | None = None  # e.g. "every 1 day"


def _serialize(kb: dict) -> dict:
    kb = {**kb}
    kb["_id"] = str(kb["_id"])
    kb["project_id"] = str(kb["project_id"])
    kb["created_by"] = str(kb["created_by"])
    return kb


# Vector store types whose packages are installed in Dockerfile.mindsdb.
# Reject anything else early with a clear 400 rather than letting MindsDB
# fail with a cryptic "handler not found" error.
SUPPORTED_VECTOR_STORE_TYPES = {
    "default", "chromadb", "qdrant", "milvus", "pgvector", "lancedb",
    "weaviate", "pinecone", "couchbase",
}

EMBEDDING_DEFAULTS = {
    "gemini": {"provider": "gemini", "model_name": "gemini-embedding-001"},
    "openai": {"provider": "openai", "model_name": "text-embedding-3-small"},
    "anthropic": {"provider": "openai", "model_name": "text-embedding-3-small"},
}


async def _resolve_embedding_model(db: AsyncIOMotorDatabase, override: dict | None = None) -> dict:
    """Build an embedding_model dict using the override or current org settings.

    Raises 400 if the org has no LLM provider/API key configured — there are no
    silent defaults; everything must come from MongoDB."""
    if override:
        return override
    org = await db.organizations.find_one({})
    org_settings = org.get("settings", {}) if org else {}
    provider = org_settings.get("llm_provider")
    api_key = decrypt_api_key(org_settings.get("llm_api_key_encrypted", ""))

    missing = [label for label, val in (("provider", provider), ("API key", api_key)) if not val]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"LLM {', '.join(missing)} not configured. "
                "Set it in Settings → LLM before creating knowledge bases."
            ),
        )

    cfg = EMBEDDING_DEFAULTS.get(provider)
    if not cfg:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No embedding model is registered for provider '{provider}'.",
        )
    return {"provider": cfg["provider"], "model_name": cfg["model_name"], "api_key": api_key}


@router.get("")
async def list_knowledge_bases(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    kbs = await db.knowledge_bases.find({"project_id": ObjectId(project_id)}).to_list(100)
    return [_serialize(kb) for kb in kbs]


@router.post("")
async def create_knowledge_base(
    project_id: str,
    body: KBCreate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    project = await get_current_project(project_id, user, db)
    mindsdb_kb_name = f"kb_{uuid4().hex[:8]}"

    # Ensure project exists in MindsDB (survives container rebuilds)
    await mindsdb.ensure_project(project["mindsdb_project_name"])

    # Validate vector store type against supported set
    if body.vector_store and body.vector_store.type not in SUPPORTED_VECTOR_STORE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Vector store '{body.vector_store.type}' is not supported. "
                f"Supported types: {', '.join(sorted(SUPPORTED_VECTOR_STORE_TYPES - {'default'}))}."
            ),
        )

    # Resolve custom vector store storage (if provided)
    storage: dict | None = None
    stored_vs: dict | None = None
    if body.vector_store and body.vector_store.type != "default":
        vs_db_name = f"vs_{body.vector_store.type}_{uuid4().hex[:6]}"
        try:
            await mindsdb.create_database(vs_db_name, body.vector_store.type, body.vector_store.params)
        except MindsDBError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Vector store connection failed: {e.message}",
            )
        storage = {"database": vs_db_name, "table": mindsdb_kb_name}
        safe_params = {k: v for k, v in body.vector_store.params.items() if k not in ("password", "api_key")}
        stored_vs = {"type": body.vector_store.type, "params": safe_params, "mindsdb_db_name": vs_db_name}

    # Build KB config
    kb_config: dict = {
        "name": mindsdb_kb_name,
        "embedding_model": await _resolve_embedding_model(db, body.embedding_model),
    }
    if storage:
        kb_config["storage"] = storage
    if body.reranking_model:
        kb_config["reranking_model"] = body.reranking_model

    try:
        await mindsdb.create_knowledge_base(project["mindsdb_project_name"], kb_config)
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)

    # Store the resolved config (without API key) in MongoDB
    stored_embedding = {k: v for k, v in kb_config.get("embedding_model", {}).items() if k != "api_key"}

    kb_doc = {
        "project_id": ObjectId(project_id),
        "name": body.name,
        "mindsdb_kb_name": mindsdb_kb_name,
        "embedding_model": stored_embedding,
        "reranking_model": body.reranking_model or {},
        "vector_store": stored_vs,
        "sources": [],
        "created_by": ObjectId(user["_id"]),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    try:
        result = await db.knowledge_bases.insert_one(kb_doc)
    except Exception:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Knowledge base name already exists")

    kb_doc["_id"] = result.inserted_id
    return _serialize(kb_doc)


@router.post("/{kb_id}/upload")
async def upload_file_to_kb(
    project_id: str,
    kb_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    project = await get_current_project(project_id, user, db)
    kb = await db.knowledge_bases.find_one({"_id": ObjectId(kb_id), "project_id": ObjectId(project_id)})
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    file_id = f"file_{uuid4().hex[:8]}"
    file_bytes = await file.read()

    orig_name = file.filename or "upload"
    ext = orig_name.rsplit(".", 1)[-1].lower() if "." in orig_name else ""

    # MindsDB's file handler parses CSV/JSON/Excel/Parquet as structured tables and
    # exposes them with user-defined column names. The KB INSERT then fails because it
    # expects a column called "content" that doesn't exist in the dataset:
    #   "Content columns None not found in dataset: ['product', 'revenue', ...]"
    # Fix: convert structured formats to plain text before uploading so MindsDB sees
    # a .txt file and the KB INSERT works unconditionally.
    #
    # Similarly, MindsDB rejects .md and other plain-text extensions outright
    # ("Not supported format: md") — remap those to .txt as well.
    _STRUCTURED_EXTS = {"csv", "tsv", "json", "xlsx", "xls", "parquet"}
    _TEXT_REMAP_EXTS = {"md", "markdown", "mdown", "mkd", "rst", "log", "text", "rtf"}

    if ext in _STRUCTURED_EXTS:
        text, _ = await _extract_text(file_bytes, orig_name)
        file_bytes = text.encode("utf-8", errors="replace")
        upload_name = f"{file_id}.txt"
    elif ext in _TEXT_REMAP_EXTS:
        upload_name = f"{orig_name}.txt"
    else:
        upload_name = orig_name

    # Upload to MindsDB files
    try:
        await mindsdb.upload_file(file_id, file_bytes, upload_name)
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)

    # Insert into KB
    try:
        await mindsdb.insert_into_kb(project["mindsdb_project_name"], kb["mindsdb_kb_name"], f"files.{file_id}")
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)

    # Update MongoDB
    source = {
        "type": "file",
        "name": file.filename,
        "file_id": file_id,
        "status": "ready",
        "added_at": datetime.now(timezone.utc),
    }
    await db.knowledge_bases.update_one(
        {"_id": ObjectId(kb_id)},
        {"$push": {"sources": source}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )

    return {"status": "processing", "file_id": file_id}


@router.post("/{kb_id}/preview")
async def preview_file_for_kb(
    project_id: str,
    kb_id: str,
    file: UploadFile = File(...),
    chunk_size: int = Query(default=500, ge=100, le=2000),
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Extract text + chunking preview from a file without uploading to MindsDB."""
    await get_current_project(project_id, user, db)

    file_bytes = await file.read()
    filename = file.filename or "upload"
    text, metadata = await _extract_text(file_bytes, filename)

    all_chunks = _chunk_text(text, chunk_size=chunk_size)
    preview_chunks = [
        {**c, "text": c["text"][:600] + ("…" if len(c["text"]) > 600 else "")}
        for c in all_chunks[:30]
    ]

    return {
        "filename": filename,
        "file_size": len(file_bytes),
        "total_chars": len(text),
        "text_preview": text[:3000],
        "chunks": preview_chunks,
        "total_chunks": len(all_chunks),
        "metadata": metadata,
    }


@router.get("/{kb_id}/chunks")
async def get_kb_chunks(
    project_id: str,
    kb_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return the actual chunks stored in MindsDB's vector DB for this KB."""
    project = await get_current_project(project_id, user, db)
    kb = await db.knowledge_bases.find_one({"_id": ObjectId(kb_id), "project_id": ObjectId(project_id)})
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    mindsdb_project = project["mindsdb_project_name"]
    mindsdb_kb_name = kb["mindsdb_kb_name"]

    try:
        # SELECT * and normalize: the KB column names vary by MindsDB version
        # (older exposes `content`/`id`, newer exposes `chunk_content`/`chunk_id`),
        # so a hardcoded `SELECT id, content, metadata` 502s with a binder error.
        result = await mindsdb.sql_query(
            f"SELECT * FROM {mindsdb_project}.{mindsdb_kb_name} LIMIT {limit}"
        )
        cols = result.get("column_names", [])
        rows = result.get("data", [])
        chunks = []
        for row in rows:
            raw = dict(zip(cols, row))
            chunks.append({
                "id": raw.get("chunk_id") or raw.get("id"),
                "content": raw.get("chunk_content") or raw.get("content") or "",
                "metadata": raw.get("metadata"),
                "relevance": raw.get("relevance"),
            })
        return {"chunks": chunks, "total": len(chunks), "kb_name": kb["name"]}
    except Exception as e:
        err = e.message if hasattr(e, "message") else str(e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=err)


@router.get("/{kb_id}/sources/{file_id}/content")
async def get_source_file_content(
    project_id: str,
    kb_id: str,
    file_id: str,
    limit: int = Query(default=1000, ge=1, le=5000),
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return the original uploaded file's content from MindsDB's file store.

    Unstructured docs (pdf/txt/md) come back as `content`/`metadata`; tabular
    files (csv/xlsx/parquet) come back as their real columns + rows. The frontend
    renders text as a document and tabular files as a grid."""
    kb = await db.knowledge_bases.find_one({"_id": ObjectId(kb_id), "project_id": ObjectId(project_id)})
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    # file_id is server-generated (`file_<hex>`); validate before interpolating.
    if not re.fullmatch(r"file_[a-zA-Z0-9_]+", file_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file id")

    source = next((s for s in kb.get("sources", []) if s.get("file_id") == file_id), None)

    try:
        result = await mindsdb.sql_query(f"SELECT * FROM files.{file_id} LIMIT {limit}")
        cols = result.get("column_names", [])
        rows = result.get("data", [])
        is_document = cols == ["content", "metadata"] or cols == ["content"]
        return {
            "file_id": file_id,
            "name": (source or {}).get("name", file_id),
            "columns": cols,
            "rows": rows,
            "is_document": is_document,
        }
    except Exception as e:
        err = e.message if hasattr(e, "message") else str(e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=err)


@router.post("/{kb_id}/crawl")
async def crawl_url(
    project_id: str,
    kb_id: str,
    body: WebCrawlRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    project = await get_current_project(project_id, user, db)
    kb = await db.knowledge_bases.find_one({"_id": ObjectId(kb_id), "project_id": ObjectId(project_id)})
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    crawl_id = uuid4().hex[:8]
    web_db_name = f"web_crawl_{crawl_id}"

    try:
        await mindsdb.sql_query(
            f"CREATE DATABASE {web_db_name} WITH ENGINE='web', PARAMETERS={{\"url\": \"{body.url}\"}}"
        )
        await mindsdb.sql_query(
            f"INSERT INTO {project['mindsdb_project_name']}.{kb['mindsdb_kb_name']}"
            f" SELECT text_content AS content, url AS metadata"
            f" FROM {web_db_name}.crawler WHERE url = '{body.url}'"
        )
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)

    # If recurring, create MindsDB job
    if body.recurring and body.schedule:
        try:
            await mindsdb.sql_query(
                f"CREATE JOB crawl_job_{crawl_id} AS ("
                f"INSERT INTO {project['mindsdb_project_name']}.{kb['mindsdb_kb_name']}"
                f" SELECT text_content AS content, url AS metadata"
                f" FROM {web_db_name}.crawler WHERE url = '{body.url}'"
                f") EVERY {body.schedule}"
            )
        except MindsDBError:
            pass

    source = {
        "type": "url",
        "url": body.url,
        "crawl_id": crawl_id,
        "status": "ready",
        "added_at": datetime.now(timezone.utc),
    }
    await db.knowledge_bases.update_one(
        {"_id": ObjectId(kb_id)},
        {"$push": {"sources": source}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )

    return {"status": "crawling", "crawl_id": crawl_id}


@router.post("/{kb_id}/recreate")
async def recreate_knowledge_base(
    project_id: str,
    kb_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Drop the KB in MindsDB and recreate it with the current org embedding key,
    re-ingesting every previously tracked source. Use this after rotating the
    LLM API key, since stored embeddings are bound to the key they were created with."""
    project = await get_current_project(project_id, user, db)
    kb = await db.knowledge_bases.find_one({"_id": ObjectId(kb_id), "project_id": ObjectId(project_id)})
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    mindsdb_project = project["mindsdb_project_name"]
    mindsdb_kb_name = kb["mindsdb_kb_name"]

    # Drop the existing KB (best-effort — may not exist if MindsDB was reset)
    try:
        await mindsdb.delete_knowledge_base(mindsdb_project, mindsdb_kb_name)
    except MindsDBError:
        pass

    # Recreate with the current org embedding config
    embedding_model = await _resolve_embedding_model(db)
    kb_config: dict = {"name": mindsdb_kb_name, "embedding_model": embedding_model}
    if kb.get("reranking_model"):
        kb_config["reranking_model"] = kb["reranking_model"]

    # Restore custom vector store storage if previously configured
    stored_vs = kb.get("vector_store")
    if stored_vs and stored_vs.get("mindsdb_db_name"):
        kb_config["storage"] = {"database": stored_vs["mindsdb_db_name"], "table": mindsdb_kb_name}

    try:
        await mindsdb.create_knowledge_base(mindsdb_project, kb_config)
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)

    # Re-ingest each tracked source. File uploads remain in MindsDB's `files`
    # store across KB drops, and crawl databases (`web_crawl_<id>`) are persistent
    # too — so we just point INSERT at them again.
    reingested = 0
    failed: list[dict] = []
    for source in kb.get("sources", []):
        try:
            if source.get("type") == "file" and source.get("file_id"):
                await mindsdb.insert_into_kb(mindsdb_project, mindsdb_kb_name, f"files.{source['file_id']}")
                reingested += 1
            elif source.get("type") == "url" and source.get("crawl_id"):
                web_db = f"web_crawl_{source['crawl_id']}"
                src_url = source.get("url", "")
                await mindsdb.sql_query(
                    f"INSERT INTO {mindsdb_project}.{mindsdb_kb_name}"
                    f" SELECT text_content AS content, url AS metadata"
                    f" FROM {web_db}.crawler WHERE url = '{src_url}'"
                )
                reingested += 1
        except Exception as e:
            err_msg = e.message[:200] if hasattr(e, "message") else str(e)[:200]
            failed.append({"source": source.get("name") or source.get("url"), "error": err_msg})

    stored_embedding = {k: v for k, v in embedding_model.items() if k != "api_key"}
    await db.knowledge_bases.update_one(
        {"_id": ObjectId(kb_id)},
        {"$set": {"embedding_model": stored_embedding, "updated_at": datetime.now(timezone.utc)}},
    )

    return {"status": "recreated", "reingested": reingested, "failed": failed}


@router.delete("/{kb_id}")
async def delete_knowledge_base(
    project_id: str,
    kb_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    project = await get_current_project(project_id, user, db)
    kb = await db.knowledge_bases.find_one({"_id": ObjectId(kb_id), "project_id": ObjectId(project_id)})
    if not kb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")

    try:
        await mindsdb.delete_knowledge_base(project["mindsdb_project_name"], kb["mindsdb_kb_name"])
    except MindsDBError:
        pass

    # Clean up files
    for source in kb.get("sources", []):
        if source.get("type") == "file" and source.get("file_id"):
            try:
                await mindsdb.delete_file(source["file_id"])
            except MindsDBError:
                pass

    await db.knowledge_bases.delete_one({"_id": ObjectId(kb_id)})
    return {"status": "deleted"}
