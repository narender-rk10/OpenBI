# Finance Demo

A complete, low-memory demo: 2024 sales vs. budget across 4 regions × 4 product
categories, with a board report for RAG. Two ways to use it.

## A. Instant dashboard (no Postgres/agent needed to *see* it)

Seeds a "Finance Demo" dashboard with **16 widgets** (4 KPIs, an AI summary, 8
charts, a pivot table, a conditionally-formatted detail table, a top-months
table) and **4 global filters** — all pre-populated so it renders immediately.

```bash
# 1. Find your project id (Projects page URL, or query Mongo)
# 2. Run the seeder (uses MONGODB_URI / MONGODB_DB_NAME like the backend)
python scripts/setup_finance_demo.py --project-id <PROJECT_ID>
```

It prints the dashboard URL. Open it — you'll see KPIs, bar/line/pie/area
charts, a **pivot table** (region × category), and a detail table with
conditional formatting (negative variance in red, >5% beats in green).

> The instant dashboard uses cached data, so the global filters are visible and
> **editable** but won't live-filter until widgets are bound to a real
> connection (path B). This is intentional — it lets you preview the look
> instantly on a constrained laptop.

## B. Fully interactive (live SQL + RAG + dashboard chat)

This exercises agents, follow-ups, chart changes, and RAG+SQL side by side.

### 1. Start the seed Postgres (alone — memory friendly)
```bash
docker compose -f docs/test-scenario/finance/docker-compose.yml up -d
```
It loads `seed-postgres.sql` (tables `sales`, `budget`). Host port is **5433**.

### 2. Connect it in OpenBI
Data Sources → **PostgreSQL**:
- host `finance-pg` (same Docker network) — or `host.docker.internal` port `5433`
- database `openbi_finance`, user `demo`, password `demo`

### 3. Add the board report as a Knowledge Base (RAG)
Knowledge → New KB → upload **`board-report.md`** (PDF/MD/TXT supported).
This is what answers "what was the revenue target from the board report?".

### 4. Create the **Finance Agent**
Agents → New → connect **both** the Postgres tables *and* the board-report KB.
Now one agent answers SQL questions and RAG questions.

### 5. Things to try (covers the demo checklist)
- **Pivot:** "show revenue by region and product category as a pivot table"
- **Global filters:** add a Region + Date filter; switch Region → widgets update
- **Chart change via chat:** select a widget → "make this a pie chart" →
  "change the color to blue"
- **Follow-up conversation:** "show revenue by month" → then "now show only Q4"
  (the agent reuses the prior query/context)
- **RAG + SQL side by side:**
  - RAG: "What was the FY2024 revenue target from the board report?" → $9.8M
  - SQL: "What was our actual total revenue?" → from `sales`
  - Put both results on the dashboard to compare target vs. actual
- **Unsupported guardrail:** "make a 3D scatter on a map" → dashboard chat
  replies that it isn't supported and lists what is.

### 6. Tear down (free memory)
```bash
docker compose -f docs/test-scenario/finance/docker-compose.yml down -v
```

## Files
| File | Purpose |
|---|---|
| `seed-postgres.sql` | `sales` + `budget` tables with deterministic 2024 data |
| `budget.csv` | budget rows as a CSV (optional file-source demo) |
| `board-report.md` | RAG source (board targets/guidance) |
| `docker-compose.yml` | standalone Postgres preloaded with the seed |
| `../../../scripts/setup_finance_demo.py` | seeds the 16-widget dashboard into Mongo |
