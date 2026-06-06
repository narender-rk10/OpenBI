# OpenBI — AI-Native Business Intelligence Platform

> Self-hosted, AI-first BI platform. Connect 90+ data sources, chat with AI agents, build interactive dashboards, and automate report delivery — no SQL required.

[![Python](https://img.shields.io/badge/Python-3.11+-blue)](https://www.python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org)
[![MindsDB](https://img.shields.io/badge/MindsDB-26.x-purple)](https://mindsdb.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)](https://docs.docker.com/compose)
[![License: CC BY-NC-ND 4.0](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-lightgrey)](LICENSE)

---

## Demo Video

<!-- PLACEHOLDER: Replace with your YouTube video embed -->
[![OpenBI Demo](https://img.youtube.com/vi/YOUR_VIDEO_ID/maxresdefault.jpg)](https://youtu.be/YOUR_VIDEO_ID)

> *Full walkthrough: connecting a data source, building an AI dashboard, chatting with agents, exporting to PDF/PPTX, and scheduling a Telegram report.*

---

## Screenshots

<!-- PLACEHOLDER: Replace each image path with your actual screenshot files under docs/screenshots/ -->

| Dashboard View | AI Chat |
|---|---|
| ![Dashboard View](docs/screenshots/dashboard_view.png) | ![AI Chat](docs/screenshots/ai_chat.png) |

| Knowledge Bases | Agents Page |
|---|---|
| ![Knowledge Bases](docs/screenshots/knowledge_bases.png) | ![Agents](docs/screenshots/agents.png) |

| PPTX Export | Scheduled Reports |
|---|---|
| ![PPTX Export](docs/screenshots/pptx_export.png) | ![Schedules](docs/screenshots/schedules.png) |

| Dashboard Filters | PDF History |
|---|---|
| ![Filters](docs/screenshots/dashboard_filters.png) | ![PDF History](docs/screenshots/pdf_history.png) |

| Connections Page | Settings / LLM Config |
|---|---|
| ![Connections](docs/screenshots/connections.png) | ![Settings](docs/screenshots/settings.png) |

---

## System Architecture

<!-- PLACEHOLDER: Replace with your architecture diagram -->
![Architecture Diagram](docs/architecture.png)

*FastAPI backend · MindsDB sidecar (text-to-SQL + agents + vector KB) · React frontend · APScheduler for cron jobs · Redis pub/sub for live WebSocket updates · Presenton for AI slide generation · Telegram bot for mobile delivery.*

---

## Features

### AI-Powered Dashboards

- **Drag-and-drop grid** (Gridstack.js) with four widget types: Chart, Table, KPI card, AI Summary card
- **AntV G2** charts (bar, column, line, area, pie, scatter, heatmap) loaded from CDN
- **AntV S2** pivot tables with conditional formatting, sorting, column hiding, and number/currency/percent formatting
- **Dashboard Chat** — modify any widget in plain English:
  - Charts: change type, recolor, retitle, rewrite the underlying SQL query
  - Tables: pivot (rows × columns × values), filter, sort, hide columns, add conditional formatting
  - Unsupported ops (3D, geo-map, animation, word cloud, Gantt) are gracefully rejected with guidance
- **Global Filters** — text, dropdown, date-range, and number-range filters applied across all widgets; AI-suggested filters based on your data schema; reorder and edit via drag-and-drop
- **AI Narrative** — on-demand brief or detailed natural-language summary of any widget result
- **Real-time updates** over WebSocket (Redis pub/sub)
- **Version History** — every significant save creates a restorable snapshot
- **Public Sharing** — one-click share link, no login required for viewers

---

### AI Agents & Streaming Chat

- Agents connect to one or more **data sources** and/or **knowledge bases** (SQL + SQL, or SQL + RAG, or any combination)
- **`@`-mention** an agent by name in the chat to target it directly
- Smart routing: active agent → LLM auto-route → picker dialog
- Streaming SSE answers with **extracted SQL**, auto-generated charts, and a natural-language summary
- Conversation context retained across follow-ups (session history in MongoDB, last 20 messages)
- **Multi-LLM support**: Gemini, OpenAI, Anthropic — configured per-org in the UI (encrypted at rest)

---

### Knowledge Bases (RAG)

- Upload files or crawl URLs to build a vector-backed knowledge source
- Agents can query KBs alongside live database tables in the same question
- **Supported file types**: `pdf`, `csv`, `xlsx`, `xls`, `txt`, `md`, `json`, `parquet`
- **Web crawl**: index a URL (and its linked pages) as a KB source
- **9 vector store backends** (see table below)
- Embed batch size tuned for Vertex AI / Gemini limits (`KB_EMBED_BATCH_SIZE=50`)

| Vector Store | Engine ID | Key Params |
|---|---|---|
| Built-in ChromaDB | `default` | — managed by MindsDB |
| ChromaDB (external) | `chromadb` | `host`, `port` |
| Qdrant | `qdrant` | `url`, `api_key` |
| Milvus | `milvus` | `host`, `port`, `user`, `password` |
| PGVector | `pgvector` | `host`, `port`, `database`, `user`, `password` |
| LanceDB | `lancedb` | `uri` |
| Weaviate | `weaviate` | `weaviate_url`, `weaviate_api_key` |
| Pinecone | `pinecone` | `api_key` |
| Couchbase | `couchbase` | `connection_string`, `bucket`, `user`, `password` |

---

### 90+ Data Source Connectors

Powered by MindsDB handlers. Credentials entered in the UI — no config files.

| Category | Sources |
|---|---|
| **Database** | PostgreSQL, MySQL, MariaDB, MSSQL, Oracle, SQLite, DuckDB, MongoDB, ClickHouse, CockroachDB, TiDB, Vitess, SingleStore, Cassandra, ScyllaDB, DynamoDB, Couchbase, Supabase, Firestore, Amazon Aurora, Google Cloud SQL, Cloud Spanner, Apache Druid, Apache Impala, Vertica, Teradata, IBM Db2, SAP HANA, SurrealDB, PlanetScale, YugabyteDB, Materialize, CrateDB, Dremio, FaunaDB |
| **Cloud Data Warehouse** | Snowflake, BigQuery, Redshift, Databricks, Trino, StarRocks, Apache Hive |
| **SaaS / APIs** | Salesforce, HubSpot, Stripe, Shopify, GitHub, GitLab, Slack, Gmail, Twitter/X, Notion, Airtable, Zendesk, Intercom, Jira, Confluence, PayPal, Binance, Plaid, Twilio, Strava, WhatsApp, Discord, YouTube, QuickBooks, Google Calendar, Google Analytics, Reddit, Microsoft Teams, Coinbase, NewsAPI, Google Search, Eventbrite, Sendinblue/Brevo, Docker Hub, OpenBB, Wikipedia, Rocket.Chat, Strapi, HackerNews, Google Sheets |
| **File Storage** | Amazon S3, Google Cloud Storage, Azure Blob Storage, HDFS, FTP, Dropbox, OneDrive, SharePoint |
| **Time-Series** | InfluxDB, TimescaleDB, QuestDB, TDengine |
| **Vector / ML** | ChromaDB, Milvus, LanceDB, Qdrant, PGVector, Weaviate, Pinecone, Couchbase |
| **Search** | Elasticsearch, Apache Solr |
| **API** | REST API (web handler) |

---

### PDF Export (Versioned)

- Client-side capture of the full live dashboard (html2canvas + jsPDF, landscape)
- Every export is **version-numbered** and stored in MongoDB GridFS
- **PDF History modal** — browse and download any previous version per dashboard
- Delivered via Telegram bot (`/report pdf`) or email attachment

---

### PPTX Export (AI-Assisted via Presenton)

- Click **Export → PPTX** on any dashboard
- Dashboard context is summarised and sent to **Presenton** (self-hosted AI presentation generator)
- Slides generated asynchronously; editable in an in-browser iframe before download
- Delivered via Telegram bot (`/report pptx`) as a `.pptx` document

---

### Scheduled Reports

- Cron expressions — powered by **APScheduler** (in-process, no Celery/Redis needed)
- Three delivery channels per schedule:
  - **Email** — HTML/PDF attachment via SMTP (STARTTLS on port 587)
  - **Telegram** — PDF document sent to any chat ID
  - **Webhook** — POST with dashboard snapshot JSON
- Run history and delivery logs visible on the **Schedules** page

---

### Telegram Bot

Full-featured mobile interface for OpenBI. All commands work in private chat only.

| Command | Description |
|---|---|
| `/connect <api_key>` | Link your OpenBI account |
| `/disconnect` | Clear session |
| `/status` | Show connected user, project, and agent |
| `/projects` | List projects with tap-to-select keyboard |
| `/use <name>` | Switch active project |
| `/agents` | List agents with tap-to-select keyboard |
| `/dashboards` | Browse dashboards; tap to receive as a chart image album |
| `/report pdf\|pptx` | Pick a dashboard and receive as a file |
| `/kbs` | List knowledge bases |
| `/newchat` | Start a fresh conversation (clears context) |
| `/help` | Show all commands |

---

### Observability (Langfuse)

- Optional **Langfuse** integration for LLM request tracing
- Track token usage, latency, and agent reasoning across all chat/agent calls
- Enable via `LANGFUSE_*` env vars — zero impact when disabled

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, Motor (async MongoDB) |
| Frontend | React 19, TypeScript, Vite, Tailwind v4, Radix UI |
| Charts | AntV G2 v5 (CDN) |
| Tables | AntV S2 v2 (CDN) |
| Dashboard Grid | Gridstack.js |
| AI Engine | MindsDB 26.x (text-to-SQL, agents, KBs) |
| LLM Providers | Google Gemini, OpenAI, Anthropic (pluggable) |
| Database | MongoDB (external — Atlas or self-hosted) |
| Scheduler | APScheduler (AsyncIOScheduler, in-process) |
| Real-time | Redis + WebSocket (pub/sub broadcast) |
| PDF Export | html2canvas + jsPDF (client-side) |
| PPTX Export | Presenton (self-hosted AI presentation generator) |
| Telegram | python-telegram-bot v21 |
| Auth | JWT (HS256), stored in localStorage |
| Containerisation | Docker Compose |

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- An external MongoDB instance (Atlas free tier works fine — **no Mongo container included**)
- At least one LLM API key (Gemini, OpenAI, or Anthropic) — configured in the UI after login

### 1. Clone

```bash
git clone https://github.com/narender-rk10/openbi.git
cd openbi
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — the only required change before first boot:

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/openbi
JWT_SECRET_KEY=your-random-secret-here
```

Everything else has working defaults (see full table below).

### 3. Start

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000)

Default login: `admin@openbi.dev` / `changeme123` — **change this immediately in Settings.**

### 4. Connect a data source

1. Go to **Connections** → **Add Connection**
2. Pick a source from the catalog, enter credentials, click **Test** then **Save**
3. Go to **Agents** → create an agent linked to your connection
4. Go to **Chat** and start asking questions

### 5. (Optional) Enable Telegram bot

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token
2. Set `TELEGRAM_BOT_TOKEN=your-token` in `.env`
3. `docker compose up -d telegram_bot`
4. In the bot chat: `/connect <your-openbi-api-key>`

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MONGODB_URI` | — | **Required.** External MongoDB connection string |
| `MONGODB_DB_NAME` | `openbi` | Database name |
| `JWT_SECRET_KEY` | — | **Required.** Random string for JWT signing |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Token lifetime (24 h) |
| `MINDSDB_URL` | `http://mindsdb:47334` | MindsDB internal URL |
| `REDIS_URL` | `redis://redis:6379/0` | Redis (WebSocket pub/sub) |
| `FERNET_KEY` | auto-generated | API key encryption key — set explicitly to survive restarts |
| `SUPER_ADMIN_EMAIL` | `admin@openbi.dev` | First superuser email |
| `SUPER_ADMIN_PASSWORD` | `changeme123` | First superuser password — **change this** |
| `TELEGRAM_BOT_TOKEN` | — | Optional. Telegram bot token from @BotFather |
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port (587 = STARTTLS) |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASSWORD` | — | SMTP password |
| `SMTP_FROM` | — | Sender address for report emails |
| `APP_URL` | `http://localhost:3000` | Used in email links |
| `PRESENTON_LLM_PROVIDER` | `google` | LLM provider for PPTX generation (`google` / `openai` / `anthropic`) |
| `OPENAI_API_KEY` | — | Passed to Presenton |
| `GOOGLE_API_KEY` | — | Passed to Presenton |
| `ANTHROPIC_API_KEY` | — | Passed to Presenton |
| `LANGFUSE_SECRET_KEY` | — | Optional. Langfuse observability |
| `LANGFUSE_PUBLIC_KEY` | — | Optional. Langfuse observability |
| `LANGFUSE_HOST` | — | Optional. Langfuse server URL |

> **LLM provider, model, and API key for the main OpenBI app** are configured in the UI under **Settings → LLM** and stored encrypted in MongoDB — not in `.env`.

---

## Docker Services

| Service | Build | Port | Description |
|---|---|---|---|
| `backend` | `Dockerfile` | `8000` | FastAPI application |
| `frontend` | `Dockerfile.frontend` | `3000` | React / Vite SPA |
| `mindsdb` | `Dockerfile.mindsdb` | `47334` (internal) | MindsDB — SQL + agents + KBs |
| `redis` | `redis:7-alpine` | `6379` (internal) | WebSocket pub/sub |
| `presenton` | `Dockerfile.presenton` | `127.0.0.1:7771` | AI presentation generator |
| `telegram_bot` | `telegram_bot/Dockerfile.telegram` | — | Telegram bot |

### Useful commands

```bash
# Start full stack
docker compose up -d

# Rebuild a single service
docker compose up -d --build backend

# View logs
docker compose logs -f backend
docker compose logs -f mindsdb

# Full rebuild (wipes volumes)
docker compose down -v && docker compose up -d --build

# Core-only (low RAM / testing)
docker compose up -d backend frontend mindsdb redis
```

---

## Project Structure

```
openbi/
├── backend/
│   ├── api/              # FastAPI routers — one file per domain
│   │   ├── auth.py
│   │   ├── projects.py
│   │   ├── connections.py
│   │   ├── dashboards.py
│   │   ├── agents.py
│   │   ├── knowledge_bases.py
│   │   ├── chat.py
│   │   ├── schedules.py
│   │   ├── settings.py
│   │   ├── analytics.py
│   │   └── ...
│   ├── core/             # database.py, security.py, exceptions.py
│   ├── services/         # Business logic
│   │   ├── mindsdb_client.py    # MindsDB SQL + agent + KB wrapper
│   │   ├── llm_client.py        # Unified LLM (Gemini / OpenAI / Anthropic)
│   │   ├── chart_agent.py       # LLM → AntV G2 spec
│   │   ├── table_agent.py       # LLM → AntV S2 spec
│   │   ├── pdf_service.py       # Client-side PDF capture + GridFS storage
│   │   ├── pptx_service.py      # Presenton PPTX generation
│   │   ├── delivery_service.py  # Email + Telegram + webhook delivery
│   │   ├── report_runner.py     # APScheduler job — refresh + deliver
│   │   └── langfuse_client.py   # Observability (optional)
│   └── prompts/          # LLM system-prompt templates
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── dashboard/   # AntVG2Chart, AntVS2Table, PPTXExportModal,
│       │   │                # DashboardFilters, DataTableModal, ...
│       │   ├── layout/      # Sidebar, TopBar
│       │   └── shared/      # DataTableModal, error modals, ...
│       ├── pages/           # ChatPage, DashboardViewPage, AgentsPage,
│       │                    # KnowledgeBasesPage, SchedulesPage, SettingsPage,
│       │                    # ConnectionsPage, ObservabilityPage, ...
│       ├── hooks/           # useChat, useAuth, useWebSocket
│       └── lib/             # api.ts, auth.tsx, sources.ts (90+ source catalog), types.ts
├── telegram_bot/
│   ├── bot.py
│   └── Dockerfile.telegram
├── report_templates/        # Jinja2 HTML report templates
├── docs/
│   ├── screenshots/         # Screenshot images (referenced above)
│   ├── architecture.png     # Architecture diagram
│   └── test-scenario/       # Seed SQL + docker-compose files for each DB
├── scripts/                 # Maintenance scripts
├── docker-compose.yml
├── Dockerfile               # Backend
├── Dockerfile.frontend
├── Dockerfile.mindsdb       # MindsDB + all handler dependencies
├── Dockerfile.presenton
├── requirements-mindsdb.txt # Handler pip packages (90+ sources)
└── pyproject.toml           # Backend Python dependencies
```

---

## Testing with Limited Resources

The full stack is memory-intensive. On a constrained machine (< 16 GB RAM):

```bash
# Start only the core services
docker compose up -d backend frontend mindsdb redis

# Spin up a test data source (examples under docs/test-scenario/)
docker compose -f docs/test-scenario/finance/docker-compose.yml up -d

# Tear it down when done
docker compose -f docs/test-scenario/finance/docker-compose.yml down
```

A seed finance dashboard (16 widgets — KPIs, charts, pivot table, AI summary) is available via:

```bash
python scripts/setup_finance_demo.py
```

---

## License

Copyright (c) 2026 **Narender Keswani**

This work is licensed under a **Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License**.

- **Share** — you may copy and redistribute the material in any medium or format
- **Attribution** — you must give appropriate credit to Narender Keswani and link to the original repository
- **NonCommercial** — you may not use this for commercial purposes
- **NoDerivatives** — you may not distribute modified versions

For commercial licensing, contact: **narender.rk10@gmail.com**

[![CC BY-NC-ND 4.0](https://licensebuttons.net/l/by-nc-nd/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc-nd/4.0/)

See [LICENSE](LICENSE) for full terms.

---

*Built to replace traditional BI tools with an AI-first experience — connect your data, ask questions, ship insights.*
