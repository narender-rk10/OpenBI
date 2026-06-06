# OpenBI — Full Project History

Last updated: 2026-06-02 (session 6 — KB embed batch fix + source connection test matrix)

---

## Session 6 (2026-06-01/02) — KB embedding batch fix, axios timeout, source connection test matrix

Branch `feat/openbi-enhancements`. Three threads: a KB-ingestion crash fix, a couple
of small UX/limit changes, and a (partial) sweep testing data-source + KB connectors.

### 1. KB embedding → Vertex AI batch overflow (root-cause fix)
KB ingestion of any source producing >100 chunks failed with
`litellm.BadRequestError: VertexAIException 400 - BatchEmbedContentsRequest.requests:
at most 100 requests can be in one batch` (provider `gemini-embedding-001` → Vertex).
- **Root cause** (MindsDB 26.0.1 source): `mindsdb/interfaces/knowledge_base/llm_client.py`
  decorates `LLMClient.embeddings()` with `@run_in_batches(1000)` — 1000 inputs per embed
  call. Fine for OpenAI (~2048), but Vertex caps `BatchEmbedContents` at 100. The insert
  path only auto-batches by **rows** (`MAX_INSERT_BATCH_SIZE=50_000`), not by chunks.
- **Fix**: made the embed batch env-configurable (no MindsDB config knob exists).
  `Dockerfile.mindsdb` now does `ENV KB_EMBED_BATCH_SIZE=50` + a `sed` patch rewriting
  `@run_in_batches(1000)` → `@run_in_batches(int(os.getenv("KB_EMBED_BATCH_SIZE","50")))`
  (located via `find`, guarded by `grep` so a MindsDB upgrade that moves the code fails the
  build loudly). Same patch applied live to the running container + restart (decorator binds
  at import time).
- An initial app-side pre-chunking attempt in `knowledge_bases.py` was **reverted** — it
  bypassed MindsDB's native chunker/overlap and wouldn't cover crawl JOBs / agent ingestion.

### 2. Small changes
- **Embed batch = 50** per request (above).
- **Axios timeout** `frontend/src/lib/api.ts`: `30_000` → `120_000`. The 30s cap was
  aborting slow connection-tests / KB ingestion / exports mid-flight and surfacing a spurious
  "timeout". The connection-test UI already shows loaders (`testing`/`creating` spinners).

### 3. Source connection test matrix → `docs/SOURCE_CONNECTION_TRACKER.md`
Harness: run a source's Docker image → attach to `openbi_openbi-network` →
`POST mindsdb:47334/api/databases/status` (same call as the UI **Test** button) → record →
tear down. One image at a time (8 GB RAM machine). **~45 of 90+ sources need real
accounts/credentials (all SaaS, cloud DW, cloud storage, Pinecone) and can't be self-hosted.**
- **12 PASS**: postgres, mysql, mongodb, mariadb, cockroachdb, **clickhouse (native port
  9000, not 8123)**, supabase, materialize, timescaledb, web (REST), hackernews, mediawiki.
- **Catalog/packaging bugs found**:
  - `clickhouse` catalog default port `8123` is wrong → must be `9000` (native protocol).
  - `minio` and `ftp` engines **don't exist in MindsDB** — invalid catalog entries.
  - `requirements-mindsdb.txt` has wrong/missing handler deps: crate needs
    `sqlalchemy-cratedb`, influxdb needs `influxdb_client_3`, surrealdb needs `pysurrealdb`,
    questdb needs `questdb` — all 🔧 pending a one-shot image rebuild + re-test.
- **Still pending**: Elasticsearch/Solr/Trino/DynamoDB, heavy DBs (mssql, oracle, cassandra,
  scylladb, druid, vertica, db2, starrocks, yugabyte), KB file types (9), vector stores.
- **Op note**: a 1.5 GB Yugabyte pull OOM-killed the Docker engine (8 GB host, ~1 GB free
  with full stack up). Recovery needed a full Docker Desktop kill + `wsl --shutdown` + relaunch.
  Continuing with **MindsDB-only** running (rest of stack stopped) to free VM headroom.

---

## Session 5 (2026-05-31) — PPTX export switched to Presenton Docker API

The dashboard **Export → PPTX** action was still producing decks from the stale
AI **python-pptx** path (`PPTXChatModal` → `POST /pptx/session` →
`pptx_service.generate_with_spec()` → Anthropic/Gemini/OpenAI). The Presenton
iframe flow (`PPTXEditor.tsx` + `/pptx/presenton` endpoints) existed but was
unreachable — `pptxEditorOpen` was never set. Per request, PPTX now goes through
**Presenton exclusively** (generate in iframe + download), and the old path was
**removed entirely**.

Changes:
- **Frontend** `DashboardViewPage.tsx`: Export → PPTX now opens `PPTXEditor`
  (`setPptxEditorOpen(true)`); removed `PPTXChatModal` import/state/render.
  Deleted `components/dashboard/PPTXChatModal.tsx`.
- **Backend** `api/dashboards.py`: removed `POST /pptx`, `POST /pptx/edit`,
  `POST /pptx/session`, `GET /pptx-exports`, `GET /pptx-exports/{id}/download`
  and the `PPTXEditRequest`/`PPTXSessionRequest` schemas. Kept the Presenton
  trio: `GET/POST /pptx/presenton` and `GET /pptx/presenton/{pid}/download`.
- **Backend** `services/pptx_service.py`: removed `generate()`,
  `generate_with_spec()`, `_anthropic/_gemini/_openai`, `_render_spec` +
  python-pptx helpers, `_SLIDE_TOOL`, and dead `import io`/`_ANTHROPIC_API`/
  `_OPENAI_API`. Kept the `presenton_*` methods + `_org_llm`/`_dashboard_context`.
- **Telegram** `bot.py` `_send_pptx`: re-pointed from the deleted `/pptx` to the
  Presenton generate→download flow (`POST /pptx/presenton` then
  `GET /pptx/presenton/{pid}/download`).
- Verified: `py_compile` on all three backend files, `tsc --noEmit` clean, and
  greps confirm no remaining references to the removed endpoints/symbols.

---

## Session 4 (2026-05-31) — Enhancement pass `feat/openbi-enhancements`

Branch `feat/openbi-enhancements` off `main`. Snapshot commit `bae29aa` preserves
all prior uncommitted work as a rollback point; 12 commits on top. Each chunk was
typecheck (`tsc --noEmit -p frontend/tsconfig.app.json`) / `py_compile` verified.
Docker stack was NOT runnable during the session (Docker Desktop engine wedged),
so stack-dependent items were written + compile-verified, not click-tested.

**IMPORTANT stack correction** (older sections below are stale): the frontend is
**Tailwind v4 + Radix UI (shadcn-style) + AntV G2 (charts) + AntV S2 (tables) +
@antv/t8**, NOT Ant Design. Scheduling is **APScheduler in-process** (Celery/Redis
removed). **Templates feature is fully removed.** PDF capture is **client-side
html2canvas+jsPDF**; matplotlib path is legacy.

### What changed (by area)
- **UI/dark mode** (`frontend/src/index.css`): raised dark `--text-secondary`/
  `--text-muted` above WCAG AA; `color-scheme` for native controls; focus rings.
- **Chat agent routing** (`ChatPage.tsx`, `backend/api/llm.py`): removed
  default-to-first-agent. Resolution order = @-mention → active agent → LLM route
  (`POST /api/llm/route-agent`) → `AgentPickerDialog`. New global error modal
  system: `frontend/src/lib/errorModal.tsx` (`ErrorModalProvider`/`useErrorModal`,
  `showApiError`, copy-details), mounted in `App.tsx`; replaced all `alert()`.
- **Dashboard chat** (`backend/api/dashboards.py`, `DashboardChat.tsx`): history
  in Mongo `dashboard_chat_sessions` (+ `GET .../chat/history`); unsupported-op
  gating (`_detect_unsupported`: 3D/geo-map/animation/wordcloud/gantt) returns a
  helpful hint; whole-word match so heatmap/roadmap pass.
- **PDF versioning**: `backend/services/export_store.py` (GridFS, per-dashboard
  version numbering). Endpoints `POST/GET /{did}/pdf-exports`,
  `GET .../{id}/download`. `DashboardViewPage.exportPDF` uploads each export;
  `PDFHistoryModal.tsx` lists/downloads versions.
- **PPTX feedback loop**: `pptx_service.generate_with_spec()` returns the slide
  spec; `POST /{did}/pptx/session` generates → stores GridFS version → returns
  spec; `GET /{did}/pptx-exports[/{id}/download]`. `PPTXChatModal.tsx` = describe
  → preview slides → refine → download + history. Export menu opens this (the
  Presenton iframe `PPTXEditor` stays in code, unreachable).
- **Narrative**: `backend/services/narrative.py` (`generate_narrative`,
  brief|detailed). `/api/llm/summarize` takes `detail`+`context`. QueryResultCard
  gained an on-demand "Detailed insights" toggle.
- **Editable filters**: backend already supported `number_range`; added frontend
  rendering + add-modal option; `POST /{did}/suggest-filters` (LLM + heuristic
  fallback); `PATCH /{did}/filters/{id}` (edit), `PUT /{did}/filters/reorder`.
- **Telegram PDF fix** (`delivery_service.py`, `telegram_bot/bot.py`): root cause
  = default ~5s `send_document` write timeout + bare `except: pass` silently
  degrading to text. Now: generous read/write/connect timeouts + logged failures.
  ("Chat not found" in logs = invalid recipient chat_id / user hasn't `/start`-ed
  the bot — config, not code.)
- **Remove Templates**: deleted `api/templates.py`, `services/template_service.py`,
  templates indexes, `template_id` schedule mode (schedules are dashboard-only now),
  frontend Templates pages/components/sidebar, bot `/run`. Migration:
  `scripts/drop_templates_collection.py` (idempotent).
- **Docker/infra/README**: docker-compose already uses EXTERNAL Mongo (no mongo
  container); `.env.example` MONGODB_URI documented as external. Backend deps
  already in `pyproject.toml` (`pip install -e .[all]`). Extracted reliable
  MindsDB handler deps to `requirements-mindsdb.txt`. README rewritten with a
  detailed Supported Features section + limited-resource testing guide.
- **Scheduler bug fix** (`report_runner.py`): used non-existent `mindsdb.query()`
  → `sql_query()`; map `column_names`/`data` → `cached_data` `columns`/`rows`.
- **Finance demo**: `docs/test-scenario/finance/` (seed-postgres.sql, docker-
  compose.yml on :5433, budget.csv, board-report.md RAG source with $9.8M target,
  README) + `scripts/setup_finance_demo.py` (seeds a 16-widget dashboard — 4 KPIs,
  AI summary, 8 G2 charts, S2 pivot region×category, conditionally-formatted
  detail table, top-months, 4 global filters — directly into Mongo so it renders
  from cached data without Postgres).

### Still pending / for a future session
- Click-test all stack-dependent items once Docker is healthy (bring up CORE only:
  `docker compose up -d --build backend frontend mindsdb redis`; skip Presenton).
- Optional: slim `Dockerfile.mindsdb` to only used connectors (build keeps hitting
  disk/IO limits on the user's laptop).
- Presenton PPTX path is superseded by the new direct python-pptx feedback loop
  but left in code; remove if confirmed unused.

---

## What Is OpenBI

Full-stack self-hosted business intelligence platform.

- **Backend**: FastAPI (Python 3.11), Motor (async MongoDB), MindsDB for LLM-powered SQL queries
- **Frontend**: React 18 + TypeScript, Vite, Ant Design
- **Infrastructure**: Docker Compose — backend, frontend, MindsDB, Redis, Presenton, Telegram bot
- **Auth**: JWT stored in localStorage (`openbi_token` / `openbi_user`)
- **DB**: MongoDB — collections: `users`, `organizations`, `projects`, `dashboards`, `widgets`, `connections`, `knowledge_bases`, `pptx_presentations`, etc.

---

## Directory Map

```
OpenBI/
├── backend/
│   ├── api/             # FastAPI routers (one file per domain)
│   ├── core/            # database.py, security.py, exceptions.py
│   ├── prompts/         # LLM prompt templates
│   ├── services/        # Business logic services
│   ├── tasks/           # Celery background tasks
│   ├── config.py
│   └── main.py          # App factory, router registration
├── frontend/
│   └── src/
│       ├── components/  # dashboard/, layout/, shared/, templates/
│       ├── hooks/       # useAuth, useChat, useWebSocket
│       ├── lib/         # api.ts, auth.tsx, sources.ts, types.ts
│       └── pages/       # One file per page/route
├── docker-compose.yml
├── Dockerfile           # Backend
├── Dockerfile.frontend
├── Dockerfile.mindsdb
├── Dockerfile.presenton
├── telegram_bot/
└── report_templates/
```

---

## Services Map

| File | Purpose |
|---|---|
| `backend/services/mindsdb_client.py` | MindsDB SQL, agent, KB management |
| `backend/services/chart_agent.py` | LLM → chart config (AntV G2 spec) |
| `backend/services/table_agent.py` | LLM → table config (AntV S2 spec) |
| `backend/services/pptx_service.py` | PPTX via Presenton or direct LLM |
| `backend/services/pdf_service.py` | PDF export (matplotlib server-side render) |
| `backend/services/lida_service.py` | LIDA chart generation |
| `backend/services/llm_client.py` | Unified LLM client (Anthropic/Gemini/OpenAI) |
| `backend/services/dashboard_service.py` | Dashboard widget refresh, filters |
| `backend/services/delivery_service.py` | Email/Telegram report delivery |
| `backend/services/template_service.py` | Report template rendering |
| `backend/services/version_service.py` | Dashboard version history |
| `backend/services/websocket_manager.py` | Redis pub/sub for WebSocket broadcast |
| `backend/tasks/scheduled_reports.py` | Celery task: scheduled report delivery |
| `backend/tasks/sync_schemas.py` | Celery task: sync MindsDB table schemas |

---

## API Routes

| Router file | Prefix |
|---|---|
| `auth.py` | `/api/auth` |
| `users.py` | `/api/users` |
| `projects.py` | `/api/projects` |
| `connections.py` | `/api/projects/{pid}/connections` |
| `dashboards.py` | `/api/projects/{pid}/dashboards` |
| `charts.py` | `/api/projects/{pid}/charts` |
| `agents.py` | `/api/projects/{pid}/agents` |
| `knowledge_bases.py` | `/api/projects/{pid}/knowledge-bases` |
| `chat.py` | `/api/projects/{pid}/chat` |
| `templates.py` | `/api/projects/{pid}/templates` |
| `schedules.py` | `/api/projects/{pid}/schedules` |
| `settings.py` | `/api/settings` |
| `llm.py` | `/api/llm` |
| `sql.py` | `/api/sql` |
| `versions.py` | `/api/versions` |
| `public.py` | `/api/public` |
| `ws.py` | `/ws` (WebSocket) |
| `health.py` | `/health` |

---

## Key Patterns

### Backend
- Singleton service instances at module level: `pptx_service = PPTXService()`
- All DB calls use Motor async: `await db.collection.find_one(...)`
- LLM API key stored encrypted in MongoDB org settings; decrypted via `decrypt_api_key()`
- `ObjectId` imported at top level from `bson` (never use `__import__("bson")`)
- Brand/settings accessed safely: `.get("settings", {}).get("branding", {}).get("chart_palette")`
- SQL injection guard: escape single quotes, cast numbers to float in dashboard filter injection

### Frontend
- All API calls via Axios `api` instance from `lib/api.ts`
- Chat/SSE uses `fetch()` not Axios (SSE requires streaming — Axios buffers)
- Relative API URLs (`""`) go through Vite proxy → `backend:8000`
- `VITE_API_URL=""` means all calls go through proxy, never direct to backend
- JWT stored in `localStorage` as `openbi_token` / `openbi_user`
- React stale closure guard: use `useRef` for loading flags in `useCallback` with `[]` deps

---

## Commit History

### `init` — 2026-04-28
Initial project scaffold. All core features in place:
- Auth (JWT, signup, login, super admin)
- Projects, Connections, Dashboards, Widgets
- MindsDB integration (SQL queries, agents)
- Knowledge Bases
- Chat (SSE streaming)
- Schedules (report delivery)
- Templates
- PDF export
- WebSocket (real-time widget updates)
- Telegram bot
- Full frontend: all pages, sidebar, topbar, layout

### `feat/tested-data-sources` — 2026-05-23
Major feature expansion and polish pass:
- **59 data sources** across 8 categories added to `frontend/src/lib/sources.ts`
- **Dashboard widgets**: AddWidgetModal, WidgetEditorDrawer, KPICard, AISummaryCard, VersionHistoryDrawer, ShareDashboardModal
- **Chart/Table components**: GPTVisChart, TanStackTable (both later superseded by AntV migration)
- **Agents page** major rework
- **Chat page** improvements
- **Public dashboard** sharing (`/api/public`, `PublicDashboardPage.tsx`)
- **Template runner** (`TemplateRunnerPage.tsx`)
- **Version history** for dashboards (`versions.py`, `version_service.py`)
- **LIDA** chart generation service
- **Background tasks** with Celery: `scheduled_reports.py`, `sync_schemas.py`
- **LLM API** (`llm.py`) and **SQL API** (`sql.py`) added as standalone endpoints
- Test scenario docs: `docs/test-scenario/` with docker-compose files for each DB
- Seed SQL files: `seed/mysql-hr.sql`, `seed/postgres-retail.sql`
- Removed `AGGridTable` (replaced by TanStack)

### `feat/openbi-enhancements` — 2026-05-31
Enhancement pass (12 commits). See **Session 4** at the top of this file for the
full per-area breakdown, new files, and pending verification steps.

---

## Feature: AntV Migration (2026-05-23)

### Why
- Plotly is not grammar-based — LLMs struggle to generate valid Plotly specs
- TanStack lacks pivot table / large-data support
- Needed PPTX export pathway

### What Changed
**Replaced**: `PlotlyChart` + `AGGridTable` → `AntVG2Chart` + `AntVS2Table`

**New components**:
- `frontend/src/components/dashboard/AntVG2Chart.tsx` — loads `@antv/g2` from CDN (`window.G2`)
- `frontend/src/components/dashboard/AntVS2Table.tsx` — loads `@antv/s2` from CDN (`window.S2`)
- `frontend/src/components/dashboard/PPTXEditor.tsx` — iframe-based Presenton editor

**CDN**:
- G2: `https://cdn.jsdelivr.net/npm/@antv/g2@5/dist/g2.min.js`
- S2: `https://cdn.jsdelivr.net/npm/@antv/s2@2/dist/s2.min.js` + CSS

**Config schema change**:
- Charts: `chart_config.g2_spec` — G2 5.x `chart.options()` spec: `{type, data, encode, axis, title, scale, theme}`
- Tables: `table_config` → S2 config: `{fields, hiddenColumns, sortParams, conditions, meta, isPivot}`

**Backward compat**:
- `GPTVisChart.tsx` and `TanStackTable.tsx` re-export new AntV components
- Old widgets with `plotly_data` still render via CDN Plotly fallback in `AntVG2Chart`
- Check `g2_spec` first, then fall back to `plotly_data`

**Server-side rendering** (PDF / PPTX — no browser):
- PDF: `pdf_service.py` → `_render_g2_to_png()` uses matplotlib
- PPTX: `pptx_service.py` → uses python-pptx native charts (`XL_CHART_TYPE`) — fully editable in PowerPoint

---

## Feature: Presenton PPTX (2026-05-27 — 2026-05-28)

### What Is Presenton
Self-hosted AI presentation generator (`openbi-presenton-1` container).
Replaces the direct LLM → python-pptx pipeline with richer AI slides + in-browser editing.

### Architecture
- **Docker**: `Dockerfile.presenton`, port `127.0.0.1:7771:80` (localhost-only)
- **Backend service**: `PPTXService` in `backend/services/pptx_service.py`
- **Frontend**: `PPTXEditor.tsx` — modal with iframe, history panel, download button
- **API endpoint**: `POST /api/projects/{pid}/dashboards/{did}/pptx/presenton`
- **MongoDB**: `pptx_presentations` collection — stores last 10 per dashboard

### docker-compose.yml — Presenton block (current)
```yaml
presenton:
  build:
    context: .
    dockerfile: Dockerfile.presenton
  ports:
    - "127.0.0.1:7771:80"
  environment:
    OPENAI_API_KEY: ${OPENAI_API_KEY:-}
    GOOGLE_API_KEY: ${GOOGLE_API_KEY:-}
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
    LLM: ${PRESENTON_LLM_PROVIDER:-google}
    AUTH_USERNAME: ${PRESENTON_USERNAME:-openbi}
    AUTH_PASSWORD: ${PRESENTON_PASSWORD:-openbi_pptx_2024}
    DISABLE_AUTH: "true"         # needed for iframe — browser has no presenton_session cookie
  volumes:
    - presenton_data:/app_data

backend:
  volumes:
    - presenton_data:/app/presenton_data   # same volume, different mount path
  environment:
    PRESENTON_USERNAME: ${PRESENTON_USERNAME:-openbi}
    PRESENTON_PASSWORD: ${PRESENTON_PASSWORD:-openbi_pptx_2024}
```

### Presenton API Reference
| Endpoint | Method | Notes |
|---|---|---|
| `/api/v1/auth/setup` | POST | One-time — 409 if already done |
| `/api/v1/auth/login` | POST | Returns `presenton_session` cookie |
| `/api/v1/ppt/presentation/generate/async` | POST | Returns task id immediately |
| `/api/v1/ppt/presentation/status/{task_id}` | GET | Poll for status |
| `/api/v1/ppt/presentation/{id}/export` | GET | Download PPTX (auth required) |
| `/app_data/exports/{uuid}/{uuid}.pptx` | GET | Static file (no auth needed) |

Generate payload: `{"content": "...", "n_slides": 10, "export_as": "pptx"}`
Status values: `"pending"` → `"completed"` or `"error"`

### Frontend Proxy
- Vite proxy: `/presenton-proxy/*` → `http://presenton:80/*`
- iframe URL: `/presenton-proxy{edit_path}`
- Direct URL (Open in New Tab): `VITE_PRESENTON_URL ?? 'http://localhost:7771'`

### Problem Log

**428 Precondition Required**
- Cause: Presenton needs auth setup before any API call
- Fix: `_presenton_ensure_session()` — calls `/auth/setup` (409=already done is fine), then `/auth/login`, caches cookie at class level, `_presenton_request()` auto re-auths on 401

**"Google API Key is not set" (400)**
- Cause: `start.js` hardcodes `USER_CONFIG_PATH = /app_data/userConfig.json` — overrides any docker-compose env var. `UserConfigEnvUpdateMiddleware` runs on every request and wipes `os.environ` with whatever is in that file. If file missing `GOOGLE_API_KEY`, the env var from docker-compose is gone.
- Fix: Backend writes LLM config to `/app/presenton_data/userConfig.json` (shared volume) before every generate call. `_configure_presenton_llm()` merges into existing file (preserves AUTH_* fields).

**Wrong generate payload field**
- Cause: Used `prompt` key; Presenton uses `content`
- Fix: `json={"content": prompt, "n_slides": n_slides, "export_as": "pptx"}`

**Sync generate times out (5-10 min ReadTimeout)**
- Cause: Sync endpoint blocks; Presenton runs 3 LLM retries per slide for text-too-long
- Fix: Use `/generate/async` → poll `/status/{task_id}` every 10s, max 60 attempts (10 min)

**502 Bad Gateway during polling**
- Cause: `httpx.ReadTimeout` on 15s status poll while Presenton is busy; `dashboards.py` wraps all exceptions as 502
- Fix: Wrap each poll in `try/except (httpx.ReadTimeout, httpx.ConnectError, httpx.RemoteProtocolError)` → `continue`; bumped timeout to 20s

**Image generation disabled**
- Cause: `DISABLE_IMAGE_GENERATION: "true"` in docker-compose AND persisted in `userConfig.json` (volume survives container restart)
- Fix: Removed env var; `_configure_presenton_llm()` now explicitly writes `DISABLE_IMAGE_GENERATION: False` + `IMAGE_PROVIDER` (`gemini_flash` for Google, `dall_e_3` for OpenAI) on every generate call

**Iframe 401 (presentation won't load)**
- Cause: Browser never gets `presenton_session` cookie (only backend has it); Next.js app inside iframe calls `/api/v1/ppt/presentation/{uuid}` → 401
- Fix: `DISABLE_AUTH: "true"` in presenton env (safe — port is `127.0.0.1` only)

---

## Feature: MindsDB Integration

### Core Pattern
MindsDB runs as a sidecar container at `http://mindsdb:47334`.
`MindsDBClient` (singleton) wraps all SQL and agent calls.

### Key Rules
- Provider mapping: `gemini` → `google`, `openai` → `openai`, `anthropic` → `anthropic`
- MindsDB Skills are **DEPRECATED** — agents use `data.tables` and `data.knowledge_bases` directly
- Container rebuilds lose projects — always call `ensure_project()` before any project-scoped operation
- MongoDB handler: use `host` param (not `connection_string`) for URI strings

### Streaming Format
SSE events from MindsDB agent completions:
```json
{"type": "context"}  // context events contain SQL query
{"type": "data"}     // data events contain answer text in "text" field
{"type": "end"}
```
- SQL extraction from context events: regex `(?:SQL query:\s*|query:\s*)(SELECT\s.+)`
- `/completions` endpoint has a `trace_id` bug — always use `/completions/stream`

### Knowledge Bases
- Web crawl handler table is `crawler` (NOT `content`)
- Web query: `WHERE url='...'` with columns `url, text_content, error`
- Alias in KB create: `text_content AS content, url AS metadata`
- KB agent catalogs only ~5 rows — if multiple files uploaded, only first file's topics appear
- Workaround: separate KBs per topic domain
- `mindsdb[web]` must be installed (now in `Dockerfile.mindsdb`) and MindsDB restarted before `CREATE DATABASE ... WITH ENGINE='web'` works

### Dockerfile.mindsdb additions (beyond base image)
```
pymongo clickhouse-sqlalchemy clickhouse-driver elasticsearch influxdb-client chromadb
mindsdb[web]
mysql-connector-python cloud-sql-python-connector pydruid impyla vertica-python
teradatasql crate fauna surrealdb ibm_db hdbcli
pymilvus lancedb qdrant-client pgvector
msal python-gitlab coinbase-advanced-py newsapi-python google-api-python-client ...
```

---

## Feature: Data Sources (59 sources)

Defined in `frontend/src/lib/sources.ts`. 8 categories:

| Category | Examples |
|---|---|
| Database | PostgreSQL, MySQL, MariaDB, MSSQL, Oracle, SQLite, DuckDB, IBM Db2, SAP HANA, CockroachDB |
| Cloud Data Warehouse | BigQuery, Snowflake, Redshift, Databricks, Azure Synapse, Google Spanner, Firebolt |
| SaaS | Salesforce, HubSpot, Stripe, Shopify, Google Analytics, GitHub, GitLab, Jira, Slack |
| File Storage | S3, GCS, Azure Blob, SharePoint, Google Drive |
| Time-Series | InfluxDB, TimescaleDB, Druid, OpenTSDB |
| Vector/ML | ChromaDB, Milvus, LanceDB, Qdrant, pgvector |
| Search | Elasticsearch, OpenSearch |
| API | REST API, GraphQL, Fauna, SurrealDB |

---

## Feature: Knowledge Bases

Page: `KnowledgeBasesPage.tsx`
API: `backend/api/knowledge_bases.py`

- Upload files or add URLs as knowledge sources
- Creates MindsDB KB with vector embeddings
- KB-backed MindsDB agents answer questions from uploaded content
- Each KB can have multiple files but different topic domains need separate KBs (MindsDB catalog limit)

### Supported Vector Stores (as of 2026-05-28)

All sourced from MindsDB docs; packages installed in `Dockerfile.mindsdb`.

| Store | Engine id | Key params |
|---|---|---|
| Default (built-in) | `default` | — ChromaDB managed by MindsDB |
| ChromaDB (external) | `chromadb` | `host`, `port`, `distance` (optional) |
| Qdrant | `qdrant` | `url`, `api_key` (optional) |
| Milvus | `milvus` | `host`, `port`, `user`, `password` |
| PGVector | `pgvector` | `host`, `port`, `database`, `user`, `password`, `distance` (optional) |
| LanceDB | `lancedb` | `uri` |
| Weaviate | `weaviate` | `weaviate_url`, `weaviate_api_key` (optional) |
| Pinecone | `pinecone` | `api_key` |
| Couchbase | `couchbase` | `connection_string`, `bucket`, `user`, `password`, `scope` (optional) |

Backend guard: `SUPPORTED_VECTOR_STORE_TYPES` set in `knowledge_bases.py` — returns 400 with supported list if an unknown type is sent.

### Supported File Types (upload)

`pdf`, `csv`, `xlsx`, `xls`, `txt`, `md`, `json`, `parquet`

- PDF: searchable only (not scanned)
- CSV/XLSX/XLS/Parquet: stored as tables
- TXT/MD/JSON: chunked and stored as text

---

## Feature: Scheduled Reports

- `backend/tasks/scheduled_reports.py` — Celery task
- `backend/api/schedules.py` — CRUD for schedule configs
- `backend/services/delivery_service.py` — email + Telegram delivery
- Schedules store: cron expression, dashboard ID, recipients, format (PDF/email)

---

## Feature: Telegram Bot

- `telegram_bot/bot.py` — standalone service
- Connects to `http://backend:8000` internally
- Documentation: `docs/TELEGRAM_BOT.md`

### Commands (as of 2026-05-28)

| Command | Description |
|---|---|
| `/connect <api_key>` | Link account via API key (calls `/api/auth/telegram/link`) |
| `/disconnect` | Clear all session data |
| `/status` | Show connected user, project, agent, active session |
| `/projects` | List projects with inline tap-to-select keyboard |
| `/use <name>` | Switch project by name |
| `/agents` | List agents with inline tap-to-select keyboard |
| `/dashboards` | Browse dashboards; tap to receive as chart image album |
| `/report pdf\|pptx` | Pick a dashboard and receive as a file document |
| `/newchat` | Clear session_id → fresh conversation, no prior context |
| `/kbs` | List knowledge bases with source counts |
| `/run <template>` | Execute a report template, returns web app link |
| `/help` | Show all commands |

### Architecture

- **Conversational memory**: chat uses `session_id` returned by `POST /api/projects/{pid}/chat` (non-streaming). Stored in `context.user_data["session_id"]` and sent on every subsequent message → backend maintains last 20 messages in MongoDB `chat_sessions` collection
- **Inline keyboards**: `_kb()` helper builds numbered `InlineKeyboardButton` rows; `CallbackQueryHandler` dispatches on `prefix:idx` callback data (e.g. `proj:0`, `dash_pdf:2`)
- **PDF export**: `POST /api/projects/{pid}/dashboards/{did}/pdf` → bytes sent via `send_document`
- **PPTX export**: `POST /api/projects/{pid}/dashboards/{did}/pptx` → bytes sent via `send_document` (300s timeout)
- **Auto-suggestions**: `set_my_commands` called via `post_init` on startup — Telegram stores the list server-side, shows on `/`

### Unwanted request handling

| Input | Handling |
|---|---|
| Unknown command (`/foo`) | "Unknown command. Type /help." |
| Photo, video, voice, sticker, document, location, poll, animation | "I only understand text messages." |
| Group / channel messages | Silently ignored (`filters.ChatType.PRIVATE` on all message handlers) |
| Empty / whitespace message | Silently ignored |
| Message > 2000 chars | Rejected with clear error |
| Double-send while processing | "Still working on previous message…" (`_processing` flag in `user_data`) |
| Stale inline button (list changed) | "List has changed. Run /dashboards again." |
| Malformed callback data | Caught by `ValueError`/`IndexError`, shows alert popup |
| Backend timeout | "The agent took too long to respond." |
| Backend unreachable | "Could not reach the OpenBI backend." |
| Any unhandled exception | Global `handle_error` logs it, replies "Something went wrong." |

---

## Feature: Public Dashboard Sharing

- `backend/api/public.py` — unauthenticated endpoints
- `frontend/src/pages/PublicDashboardPage.tsx`
- Share link generated per dashboard; no login required to view

---

## Feature: Version History

- `backend/services/version_service.py` + `backend/api/versions.py`
- `frontend/src/components/dashboard/VersionHistoryDrawer.tsx`
- Each significant dashboard change saves a snapshot to MongoDB
- Users can browse and restore previous versions

---

## Common Bugs Fixed (Across All Sessions)

| Bug | Fix |
|---|---|
| Brand colors crash: `settings["branding"]["chart_palette"]` KeyError | Always use `.get()` chain |
| `__import__("bson")` in service code | Top-level `from bson import ObjectId` |
| SQL injection in dashboard filters | Escape single quotes, cast numbers to float |
| JSON parse from LLM response crashes | `try/except` with regex fallback |
| Fernet key regenerated on restart | Added startup warning log |
| WebSocket URL hardcoded to localhost | Use `VITE_WS_URL` env var |
| React stale closure in polling hook | Use `useRef` for loading guard |
| MindsDB `/completions` trace_id bug | Switch to `/completions/stream` |
| MindsDB MongoDB handler wrong param | Use `host` not `connection_string` |
| Presenton `prompt` vs `content` field | Use `content` in generate payload |
| Presenton status poll crashes on timeout | `except httpx.ReadTimeout: continue` |

---

## Docker / Infrastructure

### Services
| Service | Image/Build | Port | Purpose |
|---|---|---|---|
| `backend` | `Dockerfile` | `8000` | FastAPI app |
| `frontend` | `Dockerfile.frontend` | `3000` | Vite/React |
| `mindsdb` | `Dockerfile.mindsdb` | `47334` (internal) | LLM + SQL engine |
| `redis` | `redis:7-alpine` | `6379` (internal) | WebSocket pub/sub + Celery |
| `presenton` | `Dockerfile.presenton` | `127.0.0.1:7771` | AI presentation generator |
| `telegram_bot` | `telegram_bot/Dockerfile.telegram` | — | Telegram bot |

### Named Volumes
| Volume | Used by | Purpose |
|---|---|---|
| `mindsdb_data` | mindsdb | Persists MindsDB projects, models |
| `uploads` | backend | User-uploaded files |
| `presenton_data` | presenton + backend | Shared — LLM config + PPTX exports |

### Networking
All services on `openbi-network` bridge. Vite proxy handles all `/api/` and `/ws/` routing — frontend never speaks directly to backend port. Chat SSE uses `fetch()` (not Axios) with relative URLs through the proxy.

### Useful Commands
```bash
# Start everything
docker compose up -d

# Rebuild single service
docker compose up -d --build backend
docker compose up -d --no-deps presenton

# View logs
docker compose logs -f backend
docker compose logs -f presenton

# Force recreate (picks up env changes)
docker compose up -d --force-recreate presenton

# Full rebuild from scratch
docker compose down -v && docker compose up -d --build
```

---

## Environment Variables (`.env`)

| Key | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | `mongodb://mongo:27017/openbi` | MongoDB connection |
| `MONGODB_DB_NAME` | `openbi` | DB name |
| `JWT_SECRET_KEY` | — | Must be set |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | 24h |
| `MINDSDB_URL` | `http://mindsdb:47334` | Internal |
| `REDIS_URL` | `redis://redis:6379/0` | Internal |
| `FERNET_KEY` | — | API key encryption — if missing, regenerated on restart (warning logged) |
| `SUPER_ADMIN_EMAIL` | `admin@openbi.dev` | First user |
| `SUPER_ADMIN_PASSWORD` | `changeme123` | Must change |
| `TELEGRAM_BOT_TOKEN` | — | Optional |
| `SMTP_*` | — | Email delivery |
| `APP_URL` | `http://localhost:3000` | Used in email links |
| `PRESENTON_USERNAME` | `openbi` | Presenton auth |
| `PRESENTON_PASSWORD` | `openbi_pptx_2024` | Presenton auth |
| `PRESENTON_LLM_PROVIDER` | `google` | Which LLM Presenton uses |
| `OPENAI_API_KEY` | — | Passed to Presenton |
| `GOOGLE_API_KEY` | — | Passed to Presenton |
| `ANTHROPIC_API_KEY` | — | Passed to Presenton |

> LLM provider/model/key for the main OpenBI app are configured **in the UI** (Settings → LLM) and stored encrypted in MongoDB — not in `.env`.
