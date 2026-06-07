<div align="center">

<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#0f0f1a"/>
  <g stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" transform="translate(4,4)">
    <path d="M3 3v16a2 2 0 0 0 2 2h16"/>
    <path d="M18 17V9"/>
    <path d="M13 17V5"/>
    <path d="M8 17v-3"/>
  </g>
</svg>

# OpenBI - AI-Native Business Intelligence Platform

**Self-hosted · Open Source · No SQL Required**

Connect 90+ data sources, chat with AI agents, build interactive dashboards, and automate report delivery — powered by MindsDB, FastAPI, and React.

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MindsDB](https://img.shields.io/badge/MindsDB-26.x-7C3AED)](https://mindsdb.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Motor-47A248?logo=mongodb&logoColor=white)](https://motor.readthedocs.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose)
[![License: CC BY-NC-ND 4.0](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-lightgrey)](LICENSE)

</div>

---

## Demo Video

[![OpenBI Demo](https://img.youtube.com/vi/fFX7RMDVej8/maxresdefault.jpg)](https://youtu.be/fFX7RMDVej8)

> *Full walkthrough: connecting a data source, building an AI dashboard, chatting with agents, exporting to PDF/PPTX, and scheduling a Telegram report.*

---

## Screenshots

### Landing Page
![Landing Page](docs/screenshots/1.png)

### Projects
![Projects](docs/screenshots/2_projects.png)

### Data Sources

| Add Source | Connected Sources | Table Preview |
|---|---|---|
| ![Add Data Source](docs/screenshots/3a_data_.png) | ![Connected Sources](docs/screenshots/3b_data.png) | ![Table Preview](docs/screenshots/3c_data_.png) |

### Knowledge Bases

| KB List | Chunk Viewer |
|---|---|
| ![Knowledge Bases](docs/screenshots/4_kb.png) | ![KB Chunks](docs/screenshots/4b_kb.png) |

### AI Agents

| Agent List | Create Agent |
|---|---|
| ![AI Agents](docs/screenshots/5b_ai_agents.png) | ![Create Agent](docs/screenshots/5a_ai_agents.png) |

### Chat

| Table Result | Auto-Generated Chart |
|---|---|
| ![Chat Table](docs/screenshots/6a_chat_table.png) | ![Chat Chart](docs/screenshots/6b_chat_chart.png) |

| SQL Query View | Add to Dashboard |
|---|---|
| ![SQL Query](docs/screenshots/6c_chat_sql_query.png) | ![Add to Dashboard](docs/screenshots/6d_add_in_dash.png) |

### Dashboards

| Dashboard List | Dashboard View |
|---|---|
| ![Dashboards](docs/screenshots/7a_dashabord_overview.png) | ![Dashboard](docs/screenshots/7b_dashabord.png) |

### Export

| PDF Export | PPTX Export (Presenton AI) |
|---|---|
| ![PDF Export](docs/screenshots/8_pdf_Export.png) | ![PPTX Export](docs/screenshots/9_pptx_Export.png) |

### Scheduled Reports

| Schedule Builder | Run History |
|---|---|
| ![Schedule Builder](docs/screenshots/10a_scheule.png) | ![Run History](docs/screenshots/10b_scheule_history.png) |

### Observability & Analytics

| Chat Analytics | Langfuse Query Log |
|---|---|
| ![Chat Analytics](docs/screenshots/11a_llm_observalibility%20.png) | ![Langfuse](docs/screenshots/11b_llm_observalibility%20.png) |

### Settings

| LLM Configuration | User Management | Telegram Integration |
|---|---|---|
| ![LLM Config](docs/screenshots/12_llm_config.png) | ![User Management](docs/screenshots/13_user_management.png) | ![Telegram](docs/screenshots/14a_tg_config.png) |

### Telegram Bot (Mobile)

| Help & Commands | Connect & Setup | Projects & Agents | Dashboards | Reports |
|---|---|---|---|---|
| ![TG Help](docs/screenshots/14c_IMG_1956.png) | ![TG Connect](docs/screenshots/14c_IMG_1957.png) | ![TG Agents](docs/screenshots/14c_IMG_1958.png) | ![TG Dashboards](docs/screenshots/14c_IMG_1959.png) | ![TG Reports](docs/screenshots/14c_IMG_1960.png) |

---

## ✨ Features

### 🤖 AI Agents & Smart Chat

- **Plain-English querying** — type any question; MindsDB translates it to SQL and executes it against your live database
- **`@`-mention routing** — type `@SalesAgent` to target a specific agent directly
- **Multi-agent queries** — mention multiple agents (`@Sales @Marketing show Q1 revenue`) to fire parallel queries and get a consolidated LLM-synthesized report
- **Auto-routing** — when no `@` is used, an LLM picks the best-fit agent automatically; if ambiguous, a picker modal appears
- **Greeting detection** — conversational messages ("hi", "hello") are handled instantly without agent routing overhead
- **Streaming SSE answers** — answers appear token-by-token with intermediate status ("Executing SQL…", "Processing results…")
- **Extracted SQL display** — every answer shows the exact SQL query that was run (copyable)
- **Auto-generated charts** — data results automatically trigger chart generation via AntV G2
- **AI data summary** — each result gets a brief natural-language insight ("Revenue grew 12% YoY, driven by the APAC region")
- **Conversation memory** — last 20 messages are included as context for every follow-up question
- **Multi-LLM support** — Gemini, OpenAI, and Anthropic are pluggable; configured per-org in the UI (encrypted at rest)
- **Session history** — all conversations are saved; resume any previous chat from the sidebar

---

### 📊 AI-Powered Dashboards

- **Drag-and-drop grid** (Gridstack.js) — freely resize and reposition any widget
- **Four widget types**:
  - **Chart** — AntV G2 v5 (bar, column, line, area, pie, donut, scatter, heatmap, treemap, gauge, funnel, radar)
  - **Table** — AntV S2 v2 pivot table with conditional formatting, sorting, column hiding, number/currency/percent formatting
  - **KPI Card** — metric + trend indicator + comparison period
  - **AI Summary Card** — LLM-generated narrative for the latest widget result
- **Dashboard Chat** — modify any widget in plain English:
  - Charts: change type, recolor, retitle, change the underlying SQL, switch between chart variants
  - Tables: pivot rows × columns × values, add conditional formatting, sort, hide columns
  - Graceful rejection of unsupported ops (3D, geo-map, Gantt) with redirect guidance
- **Global Filters** — text, dropdown, date-range, and number-range filters applied across all widgets at once
  - AI-suggested filters based on your data schema
  - Drag-and-drop reorder, inline edit, one-click clear
- **AI Narrative** — on-demand brief or detailed natural-language summary of any widget result
- **Real-time updates** over WebSocket (Redis pub/sub broadcast)
- **Version History** — every significant save creates a restorable named snapshot; browse and restore via the Version History drawer
- **Public Sharing** — one-click share link, fully readable without login

---

### 🧠 Knowledge Bases (RAG)

- **File upload** — ingest documents into a vector store; agents query KBs alongside live database tables in the same question
- **Web crawl** — index a URL (and its linked pages) as a KB source using MindsDB's built-in web handler
- **Hybrid queries** — combine SQL (structured data) and RAG (unstructured documents) in a single agent response
- **9 vector store backends** — choose at KB creation time
- **Embed batch control** — `KB_EMBED_BATCH_SIZE` env var tunes batch size for your embedding provider's rate limits

#### Supported File Formats

| Format | Extension(s) | How it's processed |
|---|---|---|
| PDF | `.pdf` | Text extracted via `pypdf`, page-by-page |
| CSV | `.csv` | Loaded with pandas, converted to plain text |
| TSV | `.tsv` | Loaded with pandas (tab separator), converted to plain text |
| Excel | `.xlsx`, `.xls` | Loaded with pandas `read_excel`, converted to plain text |
| JSON | `.json` | Parsed and pretty-formatted as text |
| Parquet | `.parquet` | Loaded with pandas + pyarrow, converted to plain text |
| Markdown | `.md`, `.markdown`, `.mdown`, `.mkd` | Remapped to `.txt` (MindsDB rejects `.md` extension directly) |
| reStructuredText | `.rst` | Remapped to `.txt` |
| Plain Text | `.txt`, `.text`, `.log`, `.rtf` | Decoded as UTF-8 and uploaded directly |
| Any other | `*` | Decoded as UTF-8 text; binary files will error gracefully |

#### Vector Store Backends

| Vector Store | Engine ID | Notes |
|---|---|---|
| ChromaDB (built-in) | `default` | Managed by MindsDB — zero config |
| ChromaDB (external) | `chromadb` | `host`, `port` |
| Qdrant | `qdrant` | `url`, `api_key` |
| Milvus | `milvus` | `host`, `port`, `user`, `password` |
| PGVector | `pgvector` | `host`, `port`, `database`, `user`, `password` |
| LanceDB | `lancedb` | `uri` |
| Weaviate | `weaviate` | `weaviate_url`, `weaviate_api_key` |
| Pinecone | `pinecone` | `api_key` |
| Couchbase | `couchbase` | `connection_string`, `bucket`, `user`, `password` |

---

### 📄 PDF Export (Versioned)

- Client-side full-dashboard capture (html2canvas + jsPDF, landscape)
- Every export is **version-numbered** and stored in MongoDB GridFS
- **PDF History modal** — browse, preview info, and re-download any previous version
- Delivered via Telegram bot (`/report pdf`) or email attachment

---

### 📑 PPTX Export (AI-Assisted via Presenton)

- Click **Export → PPTX** on any dashboard
- Dashboard context is summarised and sent to **Presenton** (self-hosted AI presentation generator)
- Slides generated asynchronously; editable in an in-browser iframe before download
- Delivered via Telegram bot (`/report pptx`) as a `.pptx` document

---

### 📅 Scheduled Reports

- Cron expressions — powered by **APScheduler** (AsyncIOScheduler, in-process — no Celery or extra Redis queue needed)
- Three delivery channels per schedule:
  - **Email** — HTML report + PDF attachment via SMTP (STARTTLS port 587)
  - **Telegram** — PDF document sent to any chat ID
  - **Webhook** — HTTP POST with dashboard snapshot JSON payload
- Run history and last-delivery status visible on the **Schedules** page

---

### 📱 Telegram Bot

Full-featured mobile interface. All commands work in private chat only.

| Command | Description |
|---|---|
| `/connect <api_key>` | Link your OpenBI account |
| `/disconnect` | Clear session |
| `/status` | Show connected user, project, and active agent |
| `/projects` | List projects with tap-to-select keyboard |
| `/use <name>` | Switch active project |
| `/agents` | List agents with tap-to-select keyboard |
| `/dashboards` | Browse dashboards; tap to receive chart image album |
| `/report pdf\|pptx` | Pick a dashboard and receive as a file |
| `/kbs` | List knowledge bases |
| `/newchat` | Start a fresh conversation (clears context) |
| `/help` | Show all commands |

---

### 📈 Observability (Langfuse)

- Optional **Langfuse** integration for LLM request tracing
- Track token usage, latency, cost estimation, and agent reasoning per call
- Enable via `LANGFUSE_*` env vars — zero overhead when disabled

---

## 🏗️ System Architecture & Data Flow

### High-Level System Architecture
![High-Level System Architecture](docs/high_level.png)

### Low-Level Data Flows
![Low-Level Data Flows](docs/low_level.png)

For a detailed walkthrough of each architectural layer, database collections, credentials encryption, and background job runner subsystems, refer to the full [OpenBI Architectural Reference](docs/architecture.md).

---

### Step-by-Step Data Flows

#### 1. Authentication Flow

```
User submits credentials
  → POST /api/auth/login (FastAPI)
  → bcrypt password verify against MongoDB
  → JWT (HS256) issued with user_id + org_id
  → stored in localStorage as openbi_token
  → all subsequent API calls send Bearer <token>
```

#### 2. Connecting a Data Source

```
User fills connection form (UI)
  → POST /api/projects/{pid}/connections
  → FastAPI encrypts credentials with Fernet key
  → Stores encrypted creds in MongoDB (connections collection)
  → Calls MindsDB: CREATE DATABASE handler_name WITH ENGINE='postgres', PARAMETERS={...}
  → MindsDB validates connectivity (raises error on failure)
  → Connection record marked active in MongoDB
```

#### 3. Creating an Agent

```
User defines agent (name, LLM, data sources, KB, prompt template)
  → POST /api/projects/{pid}/agents
  → FastAPI calls MindsDB REST: POST /api/projects/{project}/agents
  → MindsDB creates agent with skills: [{type:'text2sql', tables:[...]}, {type:'knowledge_base', ...}]
  → Agent record stored in MongoDB with mindsdb_agent_name reference
```

#### 4. Chat Query Flow (most critical path)

```
User types question in Chat UI
  ↓
Frontend routing logic:
  ├─ Multiple @agents mentioned? → POST /chat/multi (parallel agents + LLM consolidation)
  ├─ Single @agent? → route directly
  ├─ Greeting ("hi", "hello")? → route to first agent (backend handles locally, no MindsDB call)
  ├─ Active session agent? → reuse (continuation)
  ├─ Single agent exists? → auto-route
  └─ Multiple agents? → POST /api/llm/route-agent (LLM picks best fit)
                          ├─ Confident? → auto-route silently
                          └─ Ambiguous? → Agent Picker modal
  ↓
POST /api/projects/{pid}/chat  (body: agent_id, message, session_id, stream=true)
  ↓
FastAPI backend:
  1. Load session from MongoDB (last 20 messages as history)
  2. Check for greeting pattern → stream local response, skip MindsDB
  3. Ensure MindsDB project exists (survive container restarts)
  4. Open SSE stream → yield "thinking" events
  ↓
MindsDB agent completions/stream:
  → Agent receives question + history
  → LLM selects relevant data source skill
  → Generates SQL query → executes against live DB
  → Streams back: context events (SQL shown) + data event (answer text)
  ↓
FastAPI parses stream:
  → Extracts SQL from context events (regex: "Executing final SQL query:")
  → Re-executes SQL via MindsDB SQL API for clean structured data
  → Yields SSE events: thinking → sql → data → answer → done
  ↓
Frontend (useChat hook):
  → Renders streaming answer live
  → Displays extracted SQL in collapsible block
  → On "done": triggers auto chart generation (AntV G2 spec via LLM)
  → Triggers AI summary generation for data results
  → Persists message to session (MongoDB update)
  → Records analytics (tokens, latency, cost, routing_source)
```

#### 5. Dashboard Widget Flow

```
User adds widget → SQL query entered or AI-generated
  → POST /api/projects/{pid}/dashboards/{did}/widgets
  → Widget stored in MongoDB with sql_query + display_type + config
  ↓
Widget loads:
  → Runs SQL via MindsDB → columns + rows returned
  → cached_data stored on widget document
  → AntV G2 chart spec generated via LLM (chart_config JSONB)
  → AntV S2 table config stored (sort, pivot, formatting)
  ↓
Dashboard Chat ("@ChartAgent make it a line chart"):
  → Modifies chart_config via LLM → stored back to widget
  → WebSocket broadcast → all viewers see update in real-time
```

#### 6. Knowledge Base RAG Flow

```
User uploads file (PDF, CSV, XLSX, JSON, Parquet, MD, TXT…)
  → FastAPI extracts text (pypdf / pandas / plain decode)
  → Writes text to temp file → uploads to MindsDB via multipart
  → MindsDB chunks text server-side → embeds → stores in vector store
  ↓
Agent query that involves KB:
  → MindsDB agent retrieves relevant chunks (semantic search)
  → Combines with SQL results from data source skill
  → LLM synthesizes final answer from both sources
```

#### 7. Scheduled Report Flow

```
User creates schedule (cron expression + dashboard_id + delivery channels)
  → Stored in MongoDB (schedules collection)
  → APScheduler (AsyncIOScheduler) registers job at startup
  ↓
At scheduled time:
  → report_runner.py fires
  → Refreshes all widgets (re-executes SQL queries)
  → Captures PDF (html2canvas → jsPDF) OR triggers PPTX (Presenton)
  → For each delivery channel:
      Email  → aiosmtplib STARTTLS → HTML body + PDF attachment
      Telegram → python-telegram-bot → send_document (PDF) or text summary
      Webhook → httpx POST → JSON payload with widget cached_data
  → Run history recorded in MongoDB
```

---

## 🔌 Data Sources (90+)

Powered by MindsDB handlers. Credentials entered in the UI — no config files required.

### 🗄️ Databases (35 sources)

| Logo | Source | Handler ID |
|---|---|---|
| 🐘 | PostgreSQL | `postgres` |
| 🐬 | MySQL | `mysql` |
| 🦭 | MariaDB | `mariadb` |
| 🪟 | Microsoft SQL Server | `mssql` |
| 🔶 | Oracle | `oracle` |
| 📁 | SQLite | `sqlite` |
| 🦆 | DuckDB | `duckdb` |
| 🍃 | MongoDB | `mongodb` |
| ⚡ | ClickHouse | `clickhouse` |
| 🪳 | CockroachDB | `cockroachdb` |
| 🔷 | TiDB | `tidb` |
| 🟢 | Vitess | `vitess` |
| ⚙️ | SingleStore | `singlestore` |
| 👁️ | Cassandra | `cassandra` |
| 🦈 | ScyllaDB | `scylladb` |
| 🟠 | Amazon DynamoDB | `dynamodb` |
| 🛋️ | Couchbase | `couchbase` |
| ⚡ | Supabase | `supabase` |
| 🔥 | Google Firestore | `firestore` |
| 🌅 | Amazon Aurora | `aurora` |
| ☁️ | Google Cloud SQL | `google_cloud_sql` |
| 🌐 | Google Cloud Spanner | `spanner` |
| 🐉 | Apache Druid | `druid` |
| 🦌 | Apache Impala | `impala` |
| 🔷 | Vertica | `vertica` |
| 🔵 | Teradata | `teradata` |
| 🔵 | IBM Db2 | `db2` |
| 🌸 | SAP HANA | `sap_hana` |
| 🌀 | SurrealDB | `surrealdb` |
| 🪐 | PlanetScale | `planet_scale` |
| ⚡ | YugabyteDB | `yugabyte` |
| 🧲 | Materialize | `materialize` |
| 📦 | CrateDB | `crate` |
| 🚀 | Dremio | `dremio` |
| 🦋 | FaunaDB | `fauna` |

### ☁️ Cloud Data Warehouses (7 sources)

| Logo | Source | Handler ID |
|---|---|---|
| ❄️ | Snowflake | `snowflake` |
| 📊 | Google BigQuery | `bigquery` |
| 🔴 | Amazon Redshift | `redshift` |
| 🧱 | Databricks | `databricks` |
| 🔺 | Trino | `trino` |
| ⭐ | StarRocks | `starrocks` |
| 🐝 | Apache Hive | `hive` |

### 🔗 SaaS & APIs (40+ sources)

| Logo | Source | Handler ID |
|---|---|---|
| 📑 | Google Sheets | `sheets` |
| 💳 | Stripe | `stripe` |
| 🧡 | HubSpot | `hubspot` |
| 🛒 | Shopify | `shopify` |
| ☁️ | Salesforce | `salesforce` |
| 💬 | Slack | `slack` |
| 🐙 | GitHub | `github` |
| 🦊 | GitLab | `gitlab` |
| 📧 | Gmail | `gmail` |
| 🐦 | Twitter / X | `twitter` |
| 📝 | Notion | `notion` |
| 📋 | Airtable | `airtable` |
| 🎫 | Zendesk | `zendesk` |
| 💙 | Intercom | `intercom` |
| 🔵 | Jira | `jira` |
| 📖 | Confluence | `confluence` |
| 💰 | PayPal | `paypal` |
| 🪙 | Binance | `binance` |
| 🔵 | Coinbase | `coinbase` |
| 🏦 | Plaid | `plaid` |
| 📱 | Twilio | `twilio` |
| 🚴 | Strava | `strava` |
| 💬 | WhatsApp | `whatsapp` |
| 👾 | Discord | `discord` |
| 📺 | YouTube | `youtube` |
| 🏦 | QuickBooks | `quickbooks` |
| 📅 | Google Calendar | `google_calendar` |
| 📈 | Google Analytics | `google_analytics` |
| 🔍 | Google Search | `google_search` |
| 🤖 | Reddit | `reddit` |
| 💼 | Microsoft Teams | `teams` |
| 📰 | NewsAPI | `newsapi` |
| 🎟️ | Eventbrite | `eventbrite` |
| 📨 | Sendinblue / Brevo | `sendinblue` |
| 🐳 | Docker Hub | `dockerhub` |
| 📊 | OpenBB | `openbb` |
| 📖 | Wikipedia | `mediawiki` |
| 🚀 | Rocket.Chat | `rocket_chat` |
| 🏗️ | Strapi | `strapi` |
| 🔶 | HackerNews | `hackernews` |

### 🗂️ File Storage (9 sources)

| Logo | Source | Handler ID |
|---|---|---|
| 🪣 | Amazon S3 | `s3` |
| 🗄️ | Google Cloud Storage | `gcs` |
| 🔷 | Azure Blob Storage | `azure_blob` |
| 🐘 | HDFS | `hdfs` |
| 🟡 | MinIO | `minio` |
| 📂 | FTP | `ftp` |
| 📦 | Dropbox | `dropbox` |
| ☁️ | OneDrive | `one_drive` |
| 🏢 | SharePoint | `sharepoint` |

### ⏱️ Time-Series (4 sources)

| Logo | Source | Handler ID |
|---|---|---|
| 📈 | InfluxDB | `influxdb` |
| ⏱️ | TimescaleDB | `timescaledb` |
| 🏛️ | QuestDB | `questdb` |
| 🕐 | TDengine | `tdengine` |

### 🔍 Search (2 sources)

| Logo | Source | Handler ID |
|---|---|---|
| 🔍 | Elasticsearch | `elasticsearch` |
| ☀️ | Apache Solr | `solr` |

### 🌐 API (1 source)

| Logo | Source | Handler ID |
|---|---|---|
| 🌐 | REST API / Web Crawler | `web` |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11, FastAPI 0.115, Motor (async MongoDB driver), Pydantic v2 |
| **Frontend** | React 19, TypeScript 5.x, Vite 8, Tailwind CSS v4, Radix UI |
| **Charts** | AntV G2 v5 (CDN — bar, line, area, scatter, pie, heatmap, treemap, gauge, funnel, radar) |
| **Tables** | AntV S2 v2 (CDN — pivot table, conditional formatting, sorting, multi-level headers) |
| **Dashboard Grid** | Gridstack.js 12 (drag-resize, multi-column layout, responsive breakpoints) |
| **AI Engine** | MindsDB 26.x (text-to-SQL, multi-skill agents, vector knowledge bases) |
| **LLM Providers** | Google Gemini · OpenAI GPT-4o · Anthropic Claude (pluggable per-org) |
| **Database** | MongoDB (external — Atlas or self-hosted; Motor async driver) |
| **Scheduler** | APScheduler 3.10 (AsyncIOScheduler, in-process — no Celery/Redis queue) |
| **Real-time** | Redis 7 + WebSocket (pub/sub broadcast for live dashboard updates) |
| **PDF Export** | html2canvas 1.4 + jsPDF 4.2 (client-side, landscape, versioned in GridFS) |
| **PPTX Export** | Presenton (self-hosted AI presentation generator, async generate + poll) |
| **Telegram** | python-telegram-bot v21 (private-chat commands, PDF/PPTX delivery) |
| **Email** | aiosmtplib 3 (async SMTP, STARTTLS port 587, HTML + PDF attachment) |
| **Auth** | JWT HS256, bcrypt password hashing, stored in localStorage |
| **Observability** | Langfuse (optional LLM tracing, token usage, latency) |
| **Containerisation** | Docker Compose (6 services) |

---

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- External MongoDB instance (Atlas free tier works — **no Mongo container included**)
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

Edit `.env` — the only **required** changes before first boot:

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/openbi
JWT_SECRET_KEY=your-random-secret-here
```

### 3. Start

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000)

Default login: `admin@openbi.dev` / `changeme123` — **change this immediately in Settings.**

### 4. Connect a data source

1. **Connections** → **Add Connection** → pick a source → enter credentials → **Test** → **Save**
2. **Agents** → **Create Agent** → link the connection → set LLM model and prompt
3. **Chat** → start asking questions in plain English

### 5. (Optional) Enable Telegram bot

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token
2. Set `TELEGRAM_BOT_TOKEN=your-token` in `.env`
3. `docker compose up -d telegram_bot`
4. In the bot: `/connect <your-openbi-api-key>`

---

## 🔧 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MONGODB_URI` | — | **Required.** External MongoDB connection string |
| `MONGODB_DB_NAME` | `openbi` | Database name |
| `JWT_SECRET_KEY` | — | **Required.** Random string for JWT signing |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Token lifetime (24 h) |
| `MINDSDB_URL` | `http://mindsdb:47334` | MindsDB internal URL |
| `REDIS_URL` | `redis://redis:6379/0` | Redis (WebSocket pub/sub) |
| `FERNET_KEY` | auto-generated | API key encryption key — **set explicitly** to survive container restarts |
| `SUPER_ADMIN_EMAIL` | `admin@openbi.dev` | First superuser email |
| `SUPER_ADMIN_PASSWORD` | `changeme123` | First superuser password — **change this** |
| `KB_EMBED_BATCH_SIZE` | `100` | Embedding batch size (tune for Vertex AI / Gemini limits) |
| `TELEGRAM_BOT_TOKEN` | — | Optional. Telegram bot token from @BotFather |
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port (587 = STARTTLS) |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASSWORD` | — | SMTP password |
| `SMTP_FROM` | — | Sender address for report emails |
| `APP_URL` | `http://localhost:3000` | Used in email links |
| `PRESENTON_LLM_PROVIDER` | `google` | LLM for PPTX generation (`google` / `openai` / `anthropic`) |
| `OPENAI_API_KEY` | — | Passed to Presenton container |
| `GOOGLE_API_KEY` | — | Passed to Presenton container |
| `ANTHROPIC_API_KEY` | — | Passed to Presenton container |
| `LANGFUSE_SECRET_KEY` | — | Optional. Langfuse observability |
| `LANGFUSE_PUBLIC_KEY` | — | Optional. Langfuse observability |
| `LANGFUSE_HOST` | — | Optional. Langfuse server URL |

> **LLM provider, model, and API key for the main OpenBI app** are configured in the UI under **Settings → LLM** and stored encrypted in MongoDB — not in `.env`.

---

## 🐳 Docker Services

| Service | Dockerfile | Port | Description |
|---|---|---|---|
| `backend` | `Dockerfile` | `8000` | FastAPI application server |
| `frontend` | `Dockerfile.frontend` | `3000` | React / Vite SPA (Vite dev server) |
| `mindsdb` | `Dockerfile.mindsdb` | `47334` (internal) | MindsDB — SQL engine + agents + knowledge bases |
| `redis` | `redis:7-alpine` | `6379` (internal) | WebSocket pub/sub broadcast |
| `presenton` | `Dockerfile.presenton` | `127.0.0.1:7771` | Self-hosted AI presentation (PPTX) generator |
| `telegram_bot` | `telegram_bot/Dockerfile.telegram` | — | Telegram bot process |

### Useful commands

```bash
# Start full stack
docker compose up -d

# Rebuild a single service after code changes
docker compose up -d --build backend
docker compose up -d --build frontend

# Follow logs
docker compose logs -f backend
docker compose logs -f mindsdb

# Full rebuild (wipes volumes — resets MindsDB)
docker compose down -v && docker compose up -d --build

# Lightweight mode (low RAM / testing — skips Presenton + Telegram)
docker compose up -d backend frontend mindsdb redis
```

---

## 📁 Project Structure

```
openbi/
├── backend/
│   ├── api/                   # FastAPI routers (one file per domain)
│   │   ├── auth.py            # JWT login / signup / refresh
│   │   ├── projects.py        # Project CRUD
│   │   ├── connections.py     # Data source connections (encrypted creds)
│   │   ├── knowledge_bases.py # KB create / upload / crawl / delete
│   │   ├── agents.py          # MindsDB agent management
│   │   ├── chat.py            # SSE streaming chat + multi-agent
│   │   ├── dashboards.py      # Dashboard + widget CRUD
│   │   ├── schedules.py       # APScheduler cron jobs
│   │   ├── settings.py        # Org LLM config, branding, SMTP
│   │   ├── analytics.py       # Chat analytics + observability
│   │   ├── llm.py             # LLM complete / summarize / route-agent
│   │   └── ...
│   ├── core/
│   │   ├── database.py        # Motor async client, org settings cache
│   │   ├── security.py        # JWT + bcrypt + Fernet encryption
│   │   └── exceptions.py
│   └── services/
│       ├── mindsdb_client.py  # MindsDB REST wrapper (SQL + agents + KBs)
│       ├── llm_client.py      # Unified LLM (Gemini / OpenAI / Anthropic)
│       ├── chart_agent.py     # LLM → AntV G2 chart spec
│       ├── table_agent.py     # LLM → AntV S2 pivot spec
│       ├── delivery_service.py # Email + Telegram + webhook delivery
│       ├── report_runner.py   # APScheduler job — refresh + deliver
│       ├── narrative.py       # AI natural-language data summaries
│       └── langfuse_client.py # Optional LLM observability
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── dashboard/     # AntVG2Chart, AntVS2Table, KPICard,
│       │   │                  # PPTXExportModal, DashboardFilters, …
│       │   ├── layout/        # Sidebar, Topbar
│       │   └── shared/        # ConfirmDialog, EmptyState, ScheduleBuilder
│       ├── pages/             # ChatPage, DashboardViewPage, AgentsPage,
│       │                      # KnowledgeBasesPage, ConnectionsPage,
│       │                      # SchedulesPage, SettingsPage, ObservabilityPage
│       ├── hooks/             # useChat (SSE), useAuth, useWebSocket
│       └── lib/
│           ├── api.ts         # Axios instance with JWT injection
│           ├── sources.ts     # 90+ data source catalog
│           ├── auth.tsx       # Auth context + token management
│           └── types.ts       # Shared TypeScript types
├── telegram_bot/
│   ├── bot.py                 # All Telegram commands + session management
│   └── Dockerfile.telegram
├── report_templates/          # Jinja2 HTML email report templates
├── docs/
│   ├── screenshots/           # UI screenshots
│   ├── architecture.png       # Architecture diagram
│   └── test-scenario/         # Seed SQL + docker-compose for test DBs
├── scripts/                   # setup_finance_demo.py + maintenance tools
├── docker-compose.yml
├── Dockerfile                 # Backend image
├── Dockerfile.frontend        # Frontend (Node 20 + Vite dev)
├── Dockerfile.mindsdb         # MindsDB + handler packages
├── Dockerfile.presenton       # Presenton AI slide generator
└── pyproject.toml             # Backend Python dependencies
```

---

## 🔬 Testing with Limited Resources

The full stack requires ~12–16 GB RAM. On constrained machines:

```bash
# Start only core services (no Presenton / Telegram)
docker compose up -d backend frontend mindsdb redis

# Spin up a test PostgreSQL with finance seed data
docker compose -f docs/test-scenario/finance/docker-compose.yml up -d

# Run the finance demo setup script (creates connection + agent + 16-widget dashboard)
python scripts/setup_finance_demo.py

# Tear down the test DB when done
docker compose -f docs/test-scenario/finance/docker-compose.yml down
```

---

## 📄 License

Copyright © 2026 **Narender Keswani**

Licensed under **Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International**.

- ✅ **Share** — copy and redistribute in any medium or format
- ✅ **Attribution** — credit Narender Keswani and link to this repository
- ❌ **NonCommercial** — no commercial use
- ❌ **NoDerivatives** — no modified distributions

For commercial licensing: **narender.rk10@gmail.com**
