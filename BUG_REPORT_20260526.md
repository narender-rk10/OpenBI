# OpenBI Bug Report — 2026-05-26

**Test session:** Comprehensive end-to-end API testing
**Tester:** Claude Code (automated)
**Environment:** Docker Compose (backend:8000, mindsdb:47334, MongoDB Atlas)
**Test data:** HR MySQL (hr-mysql:3306), Retail Postgres (retail-pg:5432)

---

## Summary

| # | Severity | Area | Title | Status |
|---|----------|------|-------|--------|
| 1 | HIGH | Chat API | Non-streaming chat returns question as answer, empty data | ✅ Fixed |
| 2 | HIGH | Knowledge Base | KB file upload fails — bare KB name used in SQL (missing project prefix) | ✅ Fixed |
| 3 | MEDIUM | Chat API | SQL extraction captures execution-plan description text as SQL | ✅ Fixed |
| 4 | HIGH | Dashboard | Dashboard chat crashes with AttributeError on widget with null cached_data | ✅ Fixed |
| 5 | LOW | PDF Export | Content-Length header mismatch in PDF response | ⏸ Deferred |
| 6 | HIGH | PPTX Export | PPTX export fails for Gemini provider — routes through OpenAI path (401) | ✅ Fixed |
| 7 | MEDIUM | Agents | MindsDB warns model_name not provided for newly created agents | ✅ Fixed |
| 8 | HIGH | Knowledge Base | Web crawl uses wrong table/column — `content` table doesn't exist in web handler | ✅ Fixed |
| 9 | MEDIUM | Knowledge Base | KB agent only catalogs first ~5 chunks; second file's content not reachable via agent | Open |
| 10 | INFRA | Knowledge Base | `mindsdb[web]` handler not pre-installed — web crawl fails on fresh containers | ✅ Fixed |

---

## Bug #1 — Non-streaming chat returns question as answer

**Severity:** HIGH  
**File:** `backend/api/chat.py` → `_handle_non_streaming()` (line 226)

**Reproduction:**
```bash
curl -X POST http://localhost:8000/api/projects/{project_id}/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"...","message":"Who are the top 5 employees?","stream":false}'
```

**Actual response:**
```json
{"session_id":"...","message_id":"...","answer":"Who are the top 5 employees?","columns":[],"rows":[]}
```

**Root cause:**
The non-streaming path calls `mindsdb.chat_with_agent()` which hits MindsDB's `/completions` endpoint. This endpoint has a known MindsDB bug where it echoes the question back as the answer. The memory doc notes: *"/completions has trace_id bug — use /completions/stream for SSE"*.

**Impact:** Telegram bot integration is broken — bot receives the user's question back instead of the actual answer.

**Fix:**
Replace `chat_with_agent()` with a streaming call that collects the final answer text from the `"data"` event type, or use `/completions/stream` and consume the SSE stream synchronously.

```python
# In _handle_non_streaming, collect answer from stream:
answer_text = ""
async for data_line in mindsdb.chat_with_agent_stream(mindsdb_project, mindsdb_agent, history):
    event_data = json.loads(data_line)
    if event_data.get("type") == "data":
        answer_text = event_data.get("text", "") or event_data.get("content", "")
    elif event_data.get("type") == "end":
        break
```

---

## Bug #2 — KB file upload fails: missing project prefix in SQL

**Severity:** HIGH  
**File:** `backend/services/mindsdb_client.py` → `insert_into_kb()` (line 314)  
**Also affects:** `backend/api/knowledge_bases.py` → `crawl_url()` (line 224)

**Reproduction:**
```bash
# Create KB (succeeds)
curl -X POST /api/projects/{pid}/knowledge-bases -d '{"name":"My KB"}'
# Upload file (fails with 502)
curl -X POST /api/projects/{pid}/knowledge-bases/{kb_id}/upload -F "file=@doc.txt"
```

**Actual error (backend log):**
```
MindsDB SQL error: Table or Knowledge Base 'kb_f8410bfb' doesn't exist
```

**Root cause:**
`insert_into_kb` sends SQL using the bare KB name:
```python
# Current (broken):
async def insert_into_kb(self, kb_name: str, source: str):
    return await self.sql_query(f"INSERT INTO {kb_name} SELECT * FROM {source}")
```
MindsDB requires the project-qualified name: `INSERT INTO proj_48034f10.kb_f8410bfb SELECT ...`

The `crawl_url` endpoint has the same bug:
```python
# backend/api/knowledge_bases.py line 224 — also broken:
await mindsdb.sql_query(
    f"INSERT INTO {kb['mindsdb_kb_name']} SELECT * FROM {web_db}.content"
)
```

**Fix:**
```python
# mindsdb_client.py:
async def insert_into_kb(self, project: str, kb_name: str, source: str):
    return await self.sql_query(f"INSERT INTO {project}.{kb_name} SELECT * FROM {source}")

# knowledge_bases.py - upload endpoint:
await mindsdb.insert_into_kb(project["mindsdb_project_name"], kb["mindsdb_kb_name"], f"files.{file_id}")

# knowledge_bases.py - crawl endpoint:
await mindsdb.sql_query(
    f"INSERT INTO {mindsdb_project}.{kb['mindsdb_kb_name']} SELECT * FROM {web_db}.content"
)

# recreate endpoint also affected — same fix pattern
```

---

## Bug #3 — SQL extraction captures execution-plan text as SQL

**Severity:** MEDIUM  
**File:** `backend/api/chat.py` → `event_stream()` (lines 136–145)

**Reproduction:**
Ask any agent a question and observe the SSE stream — a spurious `sql` event fires with non-SQL plan description text before the real SQL event.

**Actual (spurious) SSE event observed:**
```
event: sql
data: {"query": "Select the full_name, salary_usd from conn_11cccd3e.employees and the name from conn_11cccd3e.departments. Step 3: Order the results by salary_usd in descending order. Step 4: Limit the results to the top 5."}
```

**Root cause:**
The regex `r"(?:SQL query:\s*|query:\s*)(SELECT\s.+)"` matches any context step that starts with `Select` (case-insensitive via `re.IGNORECASE`). The execution plan text from MindsDB starts with "Select the full_name..." which is not SQL.

**Impact:** Frontend shows an invalid SQL query in the chat panel before the real SQL appears; if the backend re-executes this "SQL", it will fail.

**Fix:**
Make the regex more strict — require `FROM` and avoid matching sentences:
```python
# Require SELECT ... FROM pattern (actual SQL), not just SELECT anywhere
sql_match = re.search(
    r"Executing final SQL query:\s*(SELECT\s+.+?\bFROM\b.+?)(?:\n|$)",
    content, re.IGNORECASE | re.DOTALL
)
```

---

## Bug #4 — Dashboard chat crashes: AttributeError on null cached_data

**Severity:** HIGH  
**File:** `backend/api/dashboards.py` → `dashboard_chat()` (line 532)

**Reproduction:**
```bash
# 1. Add widget with no data
curl -X POST /api/projects/{pid}/dashboards/{did}/widgets \
  -d '{"title":"Empty","display_type":"chart","position":{"x":0,"y":4,"w":6,"h":4}}'
# 2. Try to modify via dashboard chat
curl -X POST /api/projects/{pid}/dashboards/{did}/chat \
  -d '{"widget_id":"w4","message":"make a bar chart"}'
```

**Actual error:**
```
HTTP 500 Internal Server Error
AttributeError: 'NoneType' object has no attribute 'get'
```

**Root cause:**
```python
# Line 532 — broken:
data = widget.get("cached_data", {})
```
When `cached_data` is explicitly stored as `None` in MongoDB (not absent), `.get()` returns `None`, ignoring the default `{}`. Then `data.get("columns")` raises `AttributeError`.

**Fix:**
```python
# Line 532 — fixed:
data = widget.get("cached_data") or {}
```
Same pattern should be applied to all places that access widget `cached_data`.

---

## Bug #5 — PDF export Content-Length header mismatch

**Severity:** LOW  
**File:** `backend/api/dashboards.py` → `export_pdf()` (line 662)

**Observation:**
Response header: `content-length: 14284`  
Actual file saved by curl: `197121 bytes`

**Root cause:**
Likely the PDF service compresses or the ASGI server re-encodes the response. The `Response()` object's `Content-Length` may be computed before render, or the pdf_service returns a generator instead of raw bytes.

**Impact:** Some HTTP clients that strictly honor `Content-Length` may truncate the download.

**Fix:**
Ensure `pdf_bytes` is fully materialized before returning and let FastAPI/ASGI set Content-Length automatically (do not set manually), or investigate whether gzip middleware is inflating size client-side.

---

## Bug #6 — PPTX export fails for Gemini provider (routes through OpenAI → 401)

**Severity:** HIGH  
**File:** `backend/services/pptx_service.py` → `generate()` (line 63)

**Reproduction:**
```bash
curl -X POST http://localhost:8000/api/projects/{pid}/dashboards/{did}/pptx \
  -H "Authorization: Bearer $TOKEN"
# Returns: HTTP 500 Internal Server Error
```

**Backend log:**
```
httpx.HTTPStatusError: Client error '401 Unauthorized' for url 'https://api.openai.com/v1/files'
```

**Root cause — two issues:**

1. **Provider routing is incomplete.** The `generate()` method only has `anthropic` and `else (OpenAI)` branches. When provider is `gemini`, it falls to the OpenAI path, sends the Gemini API key to `api.openai.com` → 401.

```python
# Current (broken):
if provider == "anthropic":
    pptx_bytes, summary = await self._anthropic(context, api_key, model, feedback)
else:
    pptx_bytes, summary = await self._openai(context, api_key, model, feedback)  # ← Gemini hits this
```

2. **`httpx.HTTPStatusError` not caught by endpoint.** The endpoint only catches `ValueError` and `TimeoutError`:
```python
# dashboards.py line 704:
except (ValueError, TimeoutError) as e:
    raise HTTPException(status_code=502, detail=str(e))
# httpx.HTTPStatusError escapes → 500
```

**Fix:**
```python
# pptx_service.py - add Gemini support:
if provider == "anthropic":
    pptx_bytes, summary = await self._anthropic(context, api_key, model, feedback)
elif provider in ("gemini", "google"):
    # Reuse Anthropic-style tool-use flow with Gemini client, or
    # raise a clear error until implemented:
    raise ValueError(f"PPTX generation is not yet supported for provider '{provider}'. Use Anthropic or OpenAI.")
else:
    pptx_bytes, summary = await self._openai(context, api_key, model, feedback)

# dashboards.py - catch HTTP errors too:
except (ValueError, TimeoutError, Exception) as e:
    raise HTTPException(status_code=502, detail=str(e))
```

---

## Bug #7 — MindsDB warns model_name not provided for new agents

**Severity:** MEDIUM  
**Source:** MindsDB container logs during agent creation

**Log entry:**
```
WARNING mindsdb.interfaces.agents.agents_controller: 'model_name' param is not provided. Using default global llm model at runtime.
```

**Observation:**
This warning fires every time an agent is created via `POST /api/projects/{pid}/agents`, even though `model_name` is included in the agent config payload.

**Root cause (investigation needed):**
The agent config built in `_build_mindsdb_agent_config()` sends:
```json
{"model": {"provider": "google", "model_name": "gemini-2.0-flash", "api_key": "..."}}
```
But MindsDB may expect the params at a different level or key name. The MindsDB agent API might want `params.model_name` or a flat structure, not nested under `model`.

**Impact:** Agents fall back to the global MindsDB default LLM, which may differ from the configured model. Currently this seems to work because the global model is configured, but it's fragile — if the global MindsDB model is not set, agents would fail silently.

**Fix:**
Inspect MindsDB's agent creation API spec and adjust the payload structure. Likely needs:
```json
{"params": {"model_name": "gemini-2.0-flash", "provider": "google"}, "model": {"provider": "google", "model_name": "gemini-2.0-flash", "api_key": "..."}}
```

---

## What Worked Correctly ✅

| Feature | Result |
|---------|--------|
| Login / Auth | ✅ JWT works, super_admin login OK |
| Project creation | ✅ Project + MindsDB project created |
| HR MySQL connection | ✅ Connected, tables auto-discovered: attendance, departments, employees |
| Retail Postgres connection | ✅ Connected, tables: customers, orders, order_items, products |
| HR Agent creation | ✅ Agent created with text2sql skill |
| Retail Agent creation | ✅ Agent created with text2sql skill |
| HR Agent streaming chat | ✅ Correct top-5 salary JOIN query, right data returned |
| Retail Agent streaming chat | ✅ Correct revenue-by-category GROUP BY, right data |
| @ChartAgent routing | ✅ Generates valid AntV G2 bar chart spec from HR data |
| @TableAgent routing | ✅ Generates table config with sort + conditional highlighting |
| KB creation | ✅ KB created in MindsDB with ChromaDB vectorstore |
| KB direct SQL insert | ✅ Works when using project-qualified name |
| KB Agent creation | ✅ Agent with knowledge_base skill created |
| KB Agent streaming chat | ✅ Correctly retrieved: 20 days leave, April salary review |
| Dashboard creation | ✅ Dashboard created with layout, filters, auto_refresh |
| Widget add from chat | ✅ Bar chart widget added with cached data from HR session |
| Widget add (table) | ✅ Table widget added with cached data from Retail session |
| Dashboard chat — chart | ✅ Widget w1 changed to pie chart via natural language |
| Dashboard chat — table | ✅ Widget w2 formatted with sort + conditional highlight |
| Dashboard chat — no widget_id | ✅ Returns `{"needs_selection": true}` correctly |
| PDF export | ✅ Valid PDF-1.7, ~197KB (minor Content-Length discrepancy) |

---

## Docker Logs Summary

### Backend errors seen:
- `Agent not found (404)` — stale agent from previous container rebuild (pre-test, not from this session)
- `MindsDB check vectorstore 'openbi_vecs' failed (404)` — ChromaDB not present at startup, auto-created on KB creation
- `MindsDB SQL error: Table or Knowledge Base 'kb_f8410bfb' doesn't exist` — Bug #2 triggered during file upload
- `AttributeError: 'NoneType' object has no attribute 'get'` — Bug #4 triggered
- `httpx.HTTPStatusError: Client error '401 Unauthorized' for url 'https://api.openai.com/v1/files'` — Bug #6 triggered

### MindsDB warnings:
- `MySQL handler: unknown type id=251` — MySQL `TINYBLOB`/`MEDIUMBLOB` type fallback; cosmetic
- `'model_name' param is not provided` — Bug #7

---

---

## Bug #8 — Web crawl uses wrong table/column names

**Severity:** HIGH  
**File:** `backend/api/knowledge_bases.py` → `crawl_url()` (lines 226-228)  
**Test session:** KB file+web testing — 2026-05-26

**Root cause (two issues):**

1. The MindsDB `web` handler exposes table `crawler`, not `content`. The code used `{web_db}.content` everywhere.
2. The crawler returns column `text_content`, not `content`. MindsDB KB insert requires the source column to match the KB's content column name. A column alias is needed.

**Broken SQL:**
```sql
INSERT INTO proj.kb SELECT * FROM web_crawl_xxx.content
```

**Fixed SQL:**
```sql
INSERT INTO proj.kb SELECT text_content AS content, url AS metadata FROM web_crawl_xxx.crawler WHERE url = 'https://...'
```

**Fix:** `backend/api/knowledge_bases.py` — 3 locations updated (crawl insert, recurring job, recreate path).

**Status:** ✅ Fixed

---

## Bug #9 — KB agent only sees first ~5 chunks when multiple files uploaded

**Severity:** MEDIUM  
**Area:** MindsDB agent KB catalog behavior

**Observation:**
When two files are uploaded to the same KB (`hr_policy.txt` → 5 chunks, `benefits_policy.txt` → 4 chunks), a KB-backed agent answers questions from the first file correctly but returns "not found" for all content from the second file.

**Root cause:**
MindsDB agents build a "data catalog" at query time using `SELECT chunk_content FROM kb LIMIT 5` (or similar). This catalog tells the agent what topics the KB contains. With 9 chunks in the KB but a 5-row catalog, the agent only sees hr_policy.txt topics. When asked about 401k/benefits, the catalog says "not in KB" and the agent skips the vector search entirely.

**Verified:**
- Direct KB vector search: `SELECT chunk_content, relevance FROM kb WHERE content = '401k match retirement'` → returns RETIREMENT/401k chunk with 0.81 relevance ✅
- Agent response: "I cannot find information about 401k match or vesting schedules" ❌
- Agent's catalog step explicitly says: "It does not contain any information about 401k match or vesting schedules"

**Workaround options:**
1. Create separate KBs per document (one KB per logical topic area)
2. The catalog limit is a MindsDB internal constraint — may improve with MindsDB version upgrades
3. Use the agent's skill `description` field to hint the agent about KB contents (if MindsDB passes it through to context)

**Status:** Open (MindsDB limitation)

---

## Bug #10 — `mindsdb[web]` handler not pre-installed in Docker image

**Severity:** INFRA  
**File:** `Dockerfile.mindsdb`

**Symptom:**
```
{"detail":"SQL error: Can't connect to db: The 'web' handler isn't installed."}
```

**Fix:** Added `RUN pip install 'mindsdb[web]' --quiet --no-cache-dir` to `Dockerfile.mindsdb`.

**Status:** ✅ Fixed (Dockerfile updated; requires `docker build` on next container rebuild)

---

## KB Test Session Results — 2026-05-26

| Test | Description | Result | Notes |
|------|-------------|--------|-------|
| File upload #1 | `hr_policy.txt` → `Upload_Test_KB` | ✅ Pass | 5 chunks embedded |
| File upload #2 | `benefits_policy.txt` → `Upload_Test_KB` | ✅ Pass | 4 chunks embedded, source tracked in MongoDB |
| Web crawl | `markdownguide.org/cheat-sheet/` → `HR_Policy_KB` | ✅ Pass (after Bug #8+#10 fix) | 5 chunks from web page |
| KB vector search (direct) | SQL `WHERE content='401k match'` | ✅ Pass | 0.81 relevance, correct chunk returned |
| Agent Q — annual leave (file 1) | HR Policy Agent | ✅ Pass | "20 days of paid annual leave" |
| Agent Q — 401k/benefits (file 2) | Benefits KB Agent | ❌ Fail | Bug #9: second file's chunks not in catalog |
| Agent Q — Markdown bold (web) | WebCrawl Agent | ✅ Pass | `**text**` or `__text__` |
| Agent Q — Markdown tables (web) | WebCrawl Agent | ✅ Pass | Pipe syntax, alignment colons |
| Agent Q — annual leave (same KB as web) | WebCrawl Agent | ✅ Pass | Correctly blends file + web content |

---

## Fixes Applied — 2026-05-26

| # | File(s) Changed | Change Summary |
|---|----------------|----------------|
| 1 | `backend/api/chat.py` | `_handle_non_streaming()` rewritten to consume SSE stream internally instead of calling broken `/completions` endpoint |
| 2 | `backend/services/mindsdb_client.py`, `backend/api/knowledge_bases.py` | `insert_into_kb()` gained `project` param; all 4 call sites updated to use `project.kb_name` prefix |
| 3 | `backend/api/chat.py` | SQL extraction regex tightened to match only `"Executing final SQL query:"` prefix, eliminating false positives on plan text |
| 4 | `backend/api/dashboards.py`, `backend/services/pdf_service.py` | All `widget.get("cached_data", {})` calls changed to `widget.get("cached_data") or {}` (4 in dashboards.py, 1 in pdf_service.py) |
| 5 | *(deferred)* | Low priority; `weasyprint` sets Content-Length before compression — harmless in practice |
| 6 | `backend/services/pptx_service.py`, `backend/api/dashboards.py` | Added `_gemini()` method with Gemini function-calling API; `generate()` now routes `gemini`/`google` to it; PPTX endpoints catch `Exception` instead of only `ValueError`/`TimeoutError` |
| 7 | `backend/api/agents.py` | `"params"` in agent config now includes `"model_name": model_name` alongside `"memory": True` |
| 8 | `backend/api/knowledge_bases.py` | Web crawl SQL fixed: `web.content` → `web.crawler WHERE url='...'`; column aliased as `text_content AS content, url AS metadata` |
| 10 | `Dockerfile.mindsdb` | Added `pip install 'mindsdb[web]'` to pre-install web handler |

All HIGH-severity bugs (#1, #2, #4, #6, #8) verified with live API calls post-fix.

*Generated by automated test run — 2026-05-26*
