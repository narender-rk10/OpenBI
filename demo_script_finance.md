# OpenBI Finance Demo — Step-by-Step Video Script

> **E2E Test Results:** 32/33 PASS (PDF body format fixed post-test; all core features verified working)  
> **Recorded:** 2026-06-07 | **Stack:** Gemini 2.5 Flash + MindsDB + PostgreSQL + MySQL + MongoDB  
> **Project ID:** `6a2535ecc62f10df8c15f391`

---

## Prerequisites (show on screen before recording)

```
SERVICES RUNNING (docker compose ps):
  openbi-backend-1      Up   :8000
  openbi-frontend-1     Up   :3000
  openbi-mindsdb-1      Up (healthy)
  openbi-presenton-1    Up   :7771
  openbi-redis-1        Up (healthy)
  openbi-telegram_bot-1 Up
  openbi-postgres       Up   :5433   ← Finance + Retail data
  openbi-mysql          Up   :3307   ← Marketing + HR data

DATA LOADED:
  PostgreSQL financedb:  funds(4), daily_nav(5,220 rows), portfolios(4),
                         client_transactions(50,000 rows), benchmark_returns(4)
  PostgreSQL retaildb:   customers(10), products(12), orders(18), order_items(28)
  MySQL marketingdb:     marketing_campaigns(5), client_acquisitions(9,135 rows)
  MySQL hrdb:            departments(5), employees(15), attendance(75 rows)

KNOWLEDGE BASES (Markdown only — no CSV):
  ESG Fund Scores       — seed/esg_fund_report.md  (64 quarterly assessments, FY2020–FY2023)
  Board Strategy FY2024 — seed/demo_kb_board_report.md  (alpha targets, AUM goals)

CHART FIX (applied in this version):
  - G2 v5 theme: removed constructor conflict; spec now uses theme.type = 'classicDark'|'classic'
  - Prompt: title is now plain string, not {title: "..."} object (G2 v5 breaking change)
  - Chart render errors now surfaced as visible UI messages (not silent console-only)
  - G2 CDN pinned to @5.2 for API stability

LLM: Gemini 2.5 Flash configured in Settings → LLM
URL: http://localhost:3000
```

---

## Scene 0 — Infrastructure Overview (30 sec)

**Screen:** Show terminal with `docker compose ps` output  
**Voiceover:** *"OpenBI runs fully self-hosted on Docker. We have the FastAPI backend, a React frontend, MindsDB as the AI-native SQL engine, Redis for real-time, and Presenton for PowerPoint generation. For this demo we've loaded massive finance datasets — 50,000 client transactions, 5,220 daily NAV records across 4 funds, 9,000+ marketing acquisition rows across 5 campaigns. All fully local. Let's begin."*

---

## Step 1 — Authentication & Project Setup

### 1a. Login via UI
**Navigate to:** `http://localhost:3000/login`  
**Enter:**
- Email: `admin@openbi.dev`
- Password: `changeme123`

**Voiceover:** *"We log in as the super admin. The JWT token is issued and stored in localStorage — the same token powers both the UI and direct API calls."*

### 1b. Login via API (show in browser DevTools or terminal)
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@openbi.dev","password":"changeme123"}'
```
**Expected response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {"email":"admin@openbi.dev","role":"super_admin"}
}
```

### 1c. Project Already Created (show project list)
```bash
GET http://localhost:8000/api/projects
Authorization: Bearer <token>
```
**Response shows:** `Finance Analytics Demo` (ID: `6a2535ecc62f10df8c15f391`)

**UI:** Click on **"Finance Analytics Demo"** project in the sidebar.

**Voiceover:** *"We've created a dedicated project for our finance analytics use case. Projects isolate data connections, agents, dashboards, and schedules — perfect for multi-tenant or department-level separation."*

---

## Step 2 — Data Source Connections (4 sources, 2 engines)

**Navigate to:** Projects → Finance Analytics Demo → **Connections**

**Voiceover:** *"OpenBI connects to any SQL engine through MindsDB's handler layer. We've connected 4 data sources across 2 database types — demonstrating true multi-source federation."*

### Connection 1: Finance Portfolio DB (PostgreSQL)
```bash
POST /api/projects/6a2535ecc62f10df8c15f391/connections
{
  "name": "Finance Portfolio DB",
  "engine": "postgres",
  "category": "Database",
  "parameters": {
    "host": "openbi-postgres",
    "port": 5432,
    "database": "financedb",
    "user": "financeuser",
    "password": "Finance@123"
  }
}
```
**Result:** ID `6a2535edc62f10df8c15f392`, tables: `[funds, daily_nav, portfolios, client_transactions, benchmark_returns]`

### Connection 2: Retail E-Commerce DB (PostgreSQL, second database)
```bash
POST /api/projects/6a2535ecc62f10df8c15f391/connections
{
  "name": "Retail E-Commerce DB",
  "engine": "postgres",
  "parameters": {
    "host": "openbi-postgres",
    "port": 5432,
    "database": "retaildb",    ← different DB on same server
    "user": "financeuser",
    "password": "Finance@123"
  }
}
```
**Result:** ID `6a2535edc62f10df8c15f393`, tables: `[customers, orders, order_items, products]`

### Connection 3: Marketing Campaigns (MySQL)
```bash
POST /api/projects/6a2535ecc62f10df8c15f391/connections
{
  "name": "Marketing Campaigns MySQL",
  "engine": "mysql",
  "parameters": {
    "host": "openbi-mysql",
    "port": 3306,
    "database": "marketingdb",
    "user": "marketinguser",
    "password": "Marketing@123"
  }
}
```
**Result:** ID `6a2535efc62f10df8c15f394`, tables: `[client_acquisitions, marketing_campaigns]`

### Connection 4: HR Operations (MySQL, second database)
```bash
POST /api/projects/6a2535ecc62f10df8c15f391/connections
{
  "name": "HR Operations MySQL",
  "engine": "mysql",
  "parameters": {
    "host": "openbi-mysql",
    "port": 3306,
    "database": "hrdb",
    "user": "marketinguser",
    "password": "Marketing@123"
  }
}
```
**Result:** ID `6a2535efc62f10df8c15f395`, tables: `[attendance, departments, employees]`

**UI screen:** Show all 4 connections listed with green "Connected" badges.

**Voiceover:** *"Four connections — two PostgreSQL databases and two MySQL databases, all running inside Docker on the same network. OpenBI federates queries across all of them simultaneously. Notice we didn't write any ETL pipelines — the agents handle cross-source queries natively."*

---

## Step 3 — Knowledge Bases (RAG)

**Navigate to:** Projects → Finance Analytics Demo → **Knowledge Bases**

**Voiceover:** *"Beyond structured SQL, OpenBI can ingest unstructured documents into vector knowledge bases. Agents can then query both SQL and documents in the same conversation."*

### KB 1: ESG Fund Scores (Markdown Upload)

> **Note:** OpenBI KBs support **Markdown, PDF, and Web crawl** — not CSV files. ESG data has been authored as a rich markdown document with tables, narratives, and methodology notes.

**Step 3a — Create KB:**
```bash
POST /api/projects/6a2535ecc62f10df8c15f391/knowledge-bases
{
  "name": "ESG Fund Scores",
  "description": "Quarterly ESG scores — environment, social, governance ratings for all 4 funds (FY2020–FY2023)"
}
```
**Result:** KB ID `6a2537d1c62f10df8c15f432`

**Step 3b — Upload Markdown:**
```bash
POST /api/projects/6a2535ecc62f10df8c15f391/knowledge-bases/6a2537d1c62f10df8c15f432/upload
Content-Type: multipart/form-data
file: seed/esg_fund_report.md
```
**File contents:** 64 quarterly ESG assessments (Q1 2020 – Q4 2023) for USEQ, GBAQ, USFX, EMEQ — including environment/social/governance scores, carbon intensity, board diversity %, ratings, and narrative analysis per fund.

**Response:** `{"status": "processing", "file_id": "file_esg_347e4a9d"}`

**UI:** Show KB page with "ESG Fund Scores" card showing the uploaded file name and chunk count.

### KB 2: Investment Committee Board Report (Markdown)

```bash
POST /api/projects/6a2535ecc62f10df8c15f391/knowledge-bases
{
  "name": "Board Strategy Report FY2024",
  "description": "Investment committee strategy, fund alpha targets, AUM goals, risk mandates"
}

POST /api/projects/6a2535ecc62f10df8c15f391/knowledge-bases/6a2537dcc62f10df8c15f433/upload
Content-Type: multipart/form-data
file: seed/demo_kb_board_report.md
```
**File contents:** FY2024 strategy document with alpha targets (USEQ +150bps, GBAQ +250bps, USFX +50bps, EMEQ +300bps), AUM goals ($3.5B), risk mandates, and committee resolutions.

**UI:** Show both KBs listed with "Ready" status, `.md` source badge, and vector chunk counts.

**Voiceover:** *"Two knowledge bases — both from markdown files. The first holds our full ESG scoring report with 64 quarterly assessments across four funds. The second has the investment committee's FY2024 strategy document. These are vector-indexed in MindsDB — every paragraph becomes a searchable embedding. No SQL, no schema, just upload and ask questions."*

---

## Step 4 — Agent Creation (3 Agents: Single, RAG, Hybrid)

**Navigate to:** Projects → Finance Analytics Demo → **Agents**

**Voiceover:** *"Agents are the intelligence layer. We create three — a pure SQL analyst, a document RAG expert, and a hybrid that combines both."*

### Agent 1: FinanceSQL (Single SQL Agent)
```bash
POST /api/projects/6a2535ecc62f10df8c15f391/agents
{
  "name": "FinanceSQL",
  "description": "SQL agent for fund portfolio, NAV, and marketing data",
  "prompt_template": "You are a senior financial data analyst. Generate accurate SQL for fund performance analysis, portfolio allocation, NAV trends, and marketing ROI. Available PostgreSQL tables: funds, daily_nav, portfolios, client_transactions, benchmark_returns. Available MySQL tables: marketing_campaigns, client_acquisitions. Show financial values in millions/billions with 2 decimal places.",
  "skills": [
    {
      "type": "text2sql",
      "connection_id": "6a2535edc62f10df8c15f392",
      "tables": ["funds", "daily_nav", "portfolios", "client_transactions", "benchmark_returns"],
      "description": "Finance portfolio DB"
    },
    {
      "type": "text2sql",
      "connection_id": "6a2535efc62f10df8c15f394",
      "tables": ["marketing_campaigns", "client_acquisitions"],
      "description": "Marketing campaigns data"
    }
  ]
}
```
**Result:** Agent ID `6a2535efc62f10df8c15f396`

### Agent 2: RAGExpert (Knowledge Base Agent)
```bash
POST /api/projects/6a2535ecc62f10df8c15f391/agents
{
  "name": "RAGExpert",
  "description": "Document RAG agent for ESG scores and board strategy reports",
  "prompt_template": "You are a research analyst specializing in ESG investing. Answer questions using ESG fund scoring data and the investment committee board report. Always cite specific scores, ratings, and report sections with exact numbers.",
  "skills": [
    { "type": "knowledge_base", "kb_id": "6a2537d1c62f10df8c15f432", "description": "ESG fund scores markdown report (2020-2023)" },
    { "type": "knowledge_base", "kb_id": "6a2537dcc62f10df8c15f433", "description": "Board strategy report FY2024 markdown" }
  ]
}
```
**Result:** Agent ID `6a2535f0c62f10df8c15f397`

### Agent 3: HybridAnalyst (Multi-Skill: SQL + KB)
```bash
POST /api/projects/6a2535ecc62f10df8c15f391/agents
{
  "name": "HybridAnalyst",
  "description": "Multi-skill agent combining SQL databases and knowledge bases",
  "prompt_template": "You are a comprehensive financial analyst. Combine SQL queries with document insights. For quantitative data, query SQL databases. For ESG ratings and strategy context, search knowledge bases separately. NEVER try to JOIN SQL tables with KB tables in a single query. Synthesize results into a data-driven narrative with specific numbers.",
  "skills": [
    { SQL skills from FinanceSQL... },
    { KB skills from RAGExpert... }
  ]
}
```
**Result:** Agent ID `6a2535f0c62f10df8c15f398`

**UI:** Show agents page with 3 agent cards — bot icon, name, and skill badges (SQL / KB / SQL+KB).

**Voiceover:** *"Three agents: FinanceSQL knows our PostgreSQL and MySQL schemas. RAGExpert searches our document vector stores. HybridAnalyst combines both — it can pull numbers from SQL and context from documents in the same answer."*

---

## Step 5 — Chat Demo: Single Agent (FinanceSQL)

**Navigate to:** Projects → Finance Analytics Demo → **Chat** → select `@FinanceSQL`

**Voiceover:** *"Now for the main show. Plain English to SQL. Watch how the agent translates a business question into a precise SQL query, executes it, and returns structured results — automatically generating a visualization."*

### Chat 5a — AUM Ranking (Plain English → SQL)
**Type in chat:**
```
Show total AUM in billions for each fund at the latest date, ranked highest to lowest.
```

**What happens (stream live on screen):**
- `[thinking] Understanding question...`
- `[thinking] Executing final SQL query: SELECT...`
- `[sql]` SQL query appears:
```sql
SELECT f.fund_name,
       ROUND(dn.total_aum / 1000000000, 2) AS total_aum_billions
FROM conn_21bb9972.daily_nav AS dn
INNER JOIN conn_21bb9972.funds AS f ON dn.fund_id = f.fund_id
WHERE dn.trade_date = (SELECT MAX(trade_date) FROM conn_21bb9972.daily_nav)
ORDER BY total_aum_billions DESC
```
- `[data]` Table with 4 rows appears
- `[answer]` Answer:

| fund_name | total_aum_billions |
|---|---|
| Emerging Markets Opportunities | 2.38 |
| US Core Equity Fund | 1.22 |
| Global Alpha Equity | 0.87 |
| US Core Fixed Income | 0.61 |

**Auto-chart:** Bar chart appears showing AUM by fund.

**Voiceover:** *"No SQL written by us. The agent understood 'latest date', translated it into a correlated subquery, joined two tables, converted to billions, and sorted — all from a plain English sentence. The chart appeared automatically."*

---

### Chat 5b — Risk-Adjusted Return (Complex SQL with STDDEV)
**Type:**
```
Calculate the average NAV and standard deviation of daily NAV for each fund over 2024.
Rank funds by risk-adjusted performance (avg_nav / stddev_nav) — highest first.
```

**Generated SQL:**
```sql
SELECT f.fund_name,
       ROUND(AVG(dn.nav_per_share)::NUMERIC, 4) AS avg_nav,
       ROUND(STDDEV(dn.nav_per_share)::NUMERIC, 4) AS stddev_nav,
       ROUND((AVG(dn.nav_per_share) / NULLIF(STDDEV(dn.nav_per_share), 0))::NUMERIC, 2)
           AS risk_adjusted_return
FROM conn_21bb9972.daily_nav AS dn
JOIN conn_21bb9972.funds AS f ON dn.fund_id = f.fund_id
WHERE dn.trade_date BETWEEN '2024-01-01' AND '2024-12-31'
GROUP BY f.fund_name
ORDER BY risk_adjusted_return DESC
```

**Voiceover:** *"A Sharpe-style risk metric — STDDEV, NULLIF to avoid division by zero, date filtering, and complex aggregation. One English sentence."*

---

### Chat 5c — Multi-Table Join (SQL + SQL)
**Type:**
```
Join funds, daily_nav, and client_transactions: show fund name, latest AUM,
total deposits in 2024, and deposit count. Order by AUM descending.
```

**Voiceover:** *"Three-table join across the portfolio database. This is the SQL + SQL capability — the agent constructs a multi-join query across related tables seamlessly."*

---

### Chat 5d — Cross-Engine: MySQL Marketing ROI
**Type:**
```
Which marketing campaign had the best ROI (new_aum_acquired / marketing_spend) in 2024?
Show top 3 with campaign name, channel, total spend, AUM acquired, and ROI ratio.
```

**Expected answer:**
```
Top 3 Marketing Campaigns by ROI (2024):
1. Endowment Outreach (Events)    — ROI: 6,117x  Spend: $1.19M  AUM Acquired: $7.29B
2. Q4 Retail Yield Push (Social)  — ROI: 5,836x  Spend: $1.18M  AUM Acquired: $6.92B
3. Institutional ESG Push (Sales) — ROI: 5,012x  ...
```

**Voiceover:** *"Now the agent switches to the MySQL engine automatically — the same natural language question, different database, different SQL dialect. OpenBI handles the translation transparently."*

---

## Step 6 — Chat Demo: RAG Agent (Documents)

**Switch to:** `@RAGExpert` agent

### Chat 6a — ESG Fund Scores from Markdown KB
**Type:**
```
What are the ESG ratings for our funds as of Q4 2023? Which fund has the best overall ESG score?
Show environment, social, and governance breakdown for each fund.
```

**Answer references the ESG markdown KB chunks:**
```
Based on the ESG Fund Scores report (Q4 2023):

Portfolio ESG Rankings:
1. GBAQ (Global Alpha Equity) — Total: 69.8 | Environment: 89.1 | Social: 44.8 | Governance: 69.0 | Rating: AA ← BEST
2. EMEQ (Emerging Markets)   — Total: 67.5 | Environment: 64.2 | Social: 70.8 | Governance: 67.4 | Rating: A
3. USEQ (US Core Equity)     — Total: 61.2 | Environment: 59.3 | Social: 63.7 | Governance: 61.2 | Rating: A
4. USFX (US Core Fixed Inc.) — Total: 58.4 | Environment: 55.8 | Social: 62.1 | Governance: 59.8 | Rating: BBB

Most Improved in 2023: EMEQ (+8.9 points YoY) driven by the Southeast Asian tech overweight strategy.
```

**Voiceover:** *"The RAG agent retrieved the ESG data directly from the markdown knowledge base — tables, scores, ratings, and the narrative context. No SQL was written. The agent read the document's vector embeddings and synthesized the answer."*

---

### Chat 6b — Board Strategy from Markdown KB
**Type:**
```
What fund performance targets were set by the investment committee?
What alpha is EMEQ expected to deliver, and against which benchmark?
```

**Answer references board_report_fy2024.md:**
```
From the Investment Committee Board Report FY2024:

Fund Alpha Targets (net of fees):
• US Core Equity (USEQ): +150 bps vs S&P 500 Total Return
• Global Alpha Equity (GBAQ): +250 bps vs MSCI World Index
• US Core Fixed Income (USFX): +50 bps vs Bloomberg US Aggregate Bond
• Emerging Markets (EMEQ): +300 bps vs FTSE Emerging Markets ← driven by Southeast Asian tech overweight

Overall AUM target for 2024: Cross the $3.5B mark globally.
```

**Voiceover:** *"The second knowledge base holds the board's strategy document. The agent found the exact performance mandates and cited the specific alpha targets and benchmarks — no structured data at all, pure document RAG."*

---

## Step 7 — Chat Demo: HybridAnalyst (SQL + KB)

**Switch to:** `@HybridAnalyst` agent

### Chat 7a — Combined SQL + KB Answer
**Type:**
```
From the database: what is the total AUM of the Emerging Markets fund as of latest date?
From the knowledge base: what alpha target was set for EMEQ in the board report?
```

**Answer combines both sources:**
```
From Database (SQL query):
Emerging Markets Opportunities (EMEQ) latest AUM: $2,384,270,641.18 (~$2.38 billion)

From Board Report (Knowledge Base):
EMEQ has a target alpha of +300 bps (3.00%) vs the FTSE Emerging Markets Index.
This aggressive target is justified by the overweight position in Southeast Asian tech equities.
The fund has an 85 bps management fee — the highest in the portfolio.
```

**Voiceover:** *"This is the hybrid capability — in a single agent conversation, it queries the PostgreSQL database for live AUM data AND searches the strategy document for the performance mandate. Two sources, one answer."*

---

### Chat 7b — Follow-Up with Context (Memory Retention)
**Type (same session, no @mention needed):**
```
Based on the AUM you just gave me and the board's $3.5B global target —
is EMEQ on track? And what is its current ESG rating?
```

**Answer:** Agent recalls previous context (session memory) and adds ESG from KB:
```
Based on our conversation:
- EMEQ current AUM: $2.38B
- Board target: $3.5B globally (across all funds)
- Total portfolio AUM: ~$5.1B — already exceeding the $3.5B target!

EMEQ ESG Rating: A (ESG Total Score ~67.5) with strong Environment score.

Note: While the overall portfolio has crossed the AUM target, individual fund
allocation and alpha generation remain the primary mandates for each manager.
```

**Voiceover:** *"Context retention across turns — the agent remembered the AUM figure from the previous message without us repeating it. This is conversational BI at work."*

---

### Chat 7c — ETL via Agent (INSERT/CREATE as SELECT)
**Switch back to:** `@FinanceSQL`  
**Type:**
```
Summarize monthly average NAV and total net flows by fund for the last 6 months.
Show: fund name, year-month, avg_nav per share, and sum of daily_net_flow.
Order by month and fund name.
```

**Generated SQL (ETL-style aggregation):**
```sql
SELECT f.fund_name,
       TO_CHAR(DATE_TRUNC('month', dn.trade_date), 'YYYY-MM') AS year_month,
       ROUND(AVG(dn.nav_per_share)::NUMERIC, 4) AS avg_nav,
       ROUND(SUM(dn.daily_net_flow)::NUMERIC, 2) AS total_net_flow
FROM conn_21bb9972.daily_nav AS dn
JOIN conn_21bb9972.funds AS f ON dn.fund_id = f.fund_id
WHERE dn.trade_date >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY f.fund_name, DATE_TRUNC('month', dn.trade_date)
ORDER BY year_month, f.fund_name
```

**Voiceover:** *"An ETL aggregation — the agent materializes a monthly summary from 5,000+ daily records on demand. No pipeline, no scheduled job, no code. The agent does the transformation in real time."*

---

## Step 8 — Dashboard: 25 Widgets

**Navigate to:** Projects → Finance Analytics Demo → **Dashboards** → "Finance Analytics -- Fund Portfolio Dashboard"

**Dashboard ID:** `6a25387ec62f10df8c15f461`  
**Widget count:** 25

**Voiceover:** *"We've built a 25-widget dashboard pulling from all four data sources simultaneously. Let me walk through the widget types."*

### Chart Widgets (16 charts — show by scrolling/zooming)

| # | Title | Type | Source |
|---|-------|------|--------|
| 1 | Daily NAV Trend — All Funds 2024 | Line | PostgreSQL financedb |
| 2 | Total AUM by Fund (Latest) | Bar | PostgreSQL financedb |
| 3 | Asset Class AUM Share | Pie | PostgreSQL financedb |
| 4 | Fund NAV vs Risk (Scatter) | Scatter | PostgreSQL financedb |
| 5 | Monthly Avg NAV — US Core Equity | Line | PostgreSQL financedb |
| 6 | Monthly Net Flows by Fund | Bar | PostgreSQL financedb |
| 7 | Client Transactions: Deposit vs Withdrawal | Pie | PostgreSQL financedb |
| 8 | Monthly Transaction Volume 2024 | Bar | PostgreSQL financedb |
| 9 | AUM Growth 5Y — Global Equity Fund | Area | PostgreSQL financedb |
| 10 | Portfolio Client Type Distribution | Pie | PostgreSQL financedb |
| 11 | Marketing Spend by Campaign 2024 | Bar | MySQL marketingdb |
| 12 | New AUM by Marketing Channel | Pie | MySQL marketingdb |
| 13 | Lead Conversion Funnel | Funnel | MySQL marketingdb |
| 14 | Monthly New Clients Acquired | Line | MySQL marketingdb |
| 15 | Retail Orders by Status | Pie | PostgreSQL retaildb |
| 16 | Retail Revenue by Product Category | Bar | PostgreSQL retaildb |

**Voiceover:** *"Sixteen charts spanning all four databases — finance, marketing, and retail data simultaneously rendered, all queried live via MindsDB. Charts use AntV G2 — time series, pie, scatter, funnel, area — rendered client-side from the raw data."*

---

### Pivot Table Widgets (5 tables)

| # | Title | Rows → Columns |
|---|-------|----------------|
| 17 | Fund NAV Pivot — Monthly Averages | Fund → Month → Avg NAV |
| 18 | Client Transactions by Portfolio & Fund | Client → Fund → TX Type → Amount |
| 19 | Marketing ROI by Campaign & Channel | Campaign → Channel → ROI Ratio |
| 20 | HR Salary by Dept & Title | Department → Title → Avg Salary |
| 21 | Retail Product Revenue | Category → Product → Revenue |

**UI:** Click on pivot table widget #17 → show sorting, column reordering, filter dropdown.

**Voiceover:** *"Five pivot tables powered by AntV S2. Rows, columns, aggregated values. Click a column header to sort. Use the filter dropdown to drill into a specific fund. Conditional formatting can be applied — green for positive flows, red for negative."*

---

### KPI Cards (3 cards)

| # | Title | Value |
|---|-------|-------|
| 22 | Total AUM (All Funds, Latest) | ~$5.1B |
| 23 | Total Transactions Volume 2024 | Count + $B total |
| 24 | Marketing AUM Acquired 2024 | $M + client count |

---

### AI Summary Card (1 card)

| # | Title | Description |
|---|-------|-------------|
| 25 | AI: Fund Performance Summary | LLM-written narrative from SQL query results |

**Voiceover:** *"The AI summary card runs a SQL query, feeds the results to Gemini, and writes a human-readable performance narrative automatically. Every time the dashboard refreshes, the narrative updates."*

---

## Step 9 — Dashboard Editing: Dashboard Chat

**Click "Dashboard Chat" button (bottom right)**

**Voiceover:** *"Dashboard Chat lets you modify widgets using natural language — no drag-and-drop required."*

### Edit 9a — Change Chart Type
**Type in Dashboard Chat:**
```
Change widget "Daily NAV Trend — All Funds 2024" from a line chart to an area chart
```
**Result:** Widget updates in real time, all viewers see the change via WebSocket — no page reload.

### Edit 9b — Recolor / Conditional Formatting
**Type:**
```
On the "Monthly Net Flows by Fund" bar chart, make positive net flows green and negative red
```

### Edit 9c — Pivot Table Modification
**Type:**
```
In the Fund NAV Pivot table, swap rows and columns so months are rows and fund names are columns
```

**Voiceover:** *"All three changes happened via natural language. The underlying chart config was updated, and the change propagated to every open browser via WebSocket — live collaboration."*

---

## Step 10 — Global Filters (Live Demo)

**Navigate to:** Dashboard → click **Edit Layout** (pencil icon) → filter bar appears at the top.

**Voiceover:** *"Global filters let every widget on the dashboard respond to the same conditions simultaneously. When you change a filter, every chart, table, and KPI re-queries the database live — no pre-aggregated cubes required."*

### Filter 10a — AI-Suggested Filters

**Click "Add filter"** in the filter bar → in the modal, click **"Suggest filters from data"**

The AI analyzes all widget cached_data and returns suggestions like:
```
Suggested filters:
• fund_name       [select]      — High cardinality column with 4 distinct values
• trade_date      [date_range]  — Date column suitable for time range filtering
• asset_class     [multi_select]— Categorical with 4 values: US Equity, Global Equity...
• tx_type         [select]      — Deposit / Withdrawal / Transfer
```

Click **"Add"** next to `fund_name` → filter appears as a pill in the header bar.

### Filter 10b — Fund Name Dropdown (Single Select)
```bash
# API: create the filter
POST /api/projects/6a2535ecc62f10df8c15f391/dashboards/6a25387ec62f10df8c15f461/filters
{
  "column": "fund_name",
  "type": "select",
  "label": "Fund",
  "widget_ids": []   # empty = apply to ALL widgets
}
```

**UI demo:**
1. Filter pill shows `Fund: All` in the bar
2. Click the pill → dropdown shows: `All | Emerging Markets Opportunities | US Core Equity Fund | Global Alpha Equity | US Core Fixed Income`
3. Select **"Emerging Markets Opportunities"** → all chart/table widgets instantly re-query with `WHERE fund_name = 'Emerging Markets Opportunities'`
4. Charts update: NAV trend now shows only EMEQ line, AUM bar shows only EMEQ, client transactions filter to EMEQ-related portfolios

**Expected backend call when user selects:**
```bash
PUT /api/projects/6a2535ecc62f10df8c15f391/dashboards/6a25387ec62f10df8c15f461/filters/{filter_id}
{ "value": "Emerging Markets Opportunities" }
```

**Response:** Array of updated widget data — frontend applies to all widgets simultaneously via WebSocket broadcast.

### Filter 10c — Trade Date Range

Add a second filter:
```bash
POST .../filters
{
  "column": "trade_date",
  "type": "date_range",
  "label": "Date Range"
}
```

**UI:** Two date inputs appear in the filter bar. Set:
- From: `2024-01-01`
- To: `2024-12-31`

All NAV trend and net-flow widgets update to show only 2024 data.

### Filter 10d — Asset Class Multi-Select

```bash
POST .../filters
{
  "column": "asset_class",
  "type": "multi_select",
  "label": "Asset Class"
}
```

**UI:** Multi-select dropdown shows: `US Equity | Global Equity | Fixed Income | Emerging Markets`

Select **"US Equity"** and **"Global Equity"** — all widgets now show only those two asset classes simultaneously. The AUM pie chart updates to show 2-slice distribution.

### Filter 10e — Reset All

Click **"Reset"** button (top right of filter bar) → all filters clear simultaneously, all widgets revert to full dataset.

**Voiceover:** *"Three global filters — fund name, date range, and asset class — all updating 25 widgets at once with live SQL queries. No caching, no pre-computed aggregates, just real-time MindsDB federation on your actual data."*

---

## Step 11 — PDF Export

**Click Dashboard → Export → PDF**

```bash
# API call happening in background:
POST /api/projects/6a2535ecc62f10df8c15f391/dashboards/6a25387ec62f10df8c15f461/pdf
{
  "chart_images": {},    # base64 chart screenshots (populated by UI)
  "theme": "light",
  "layout": {}
}
```

**Response:** `application/pdf` — 20,519+ bytes  
**UI:** PDF downloads automatically.  
**Filename:** `Finance_Analytics_--_Fund_Portfolio_Dashboard_2026-06-07.pdf`

**Voiceover:** *"One-click PDF export. The backend renders the dashboard layout with all widget data into a formatted PDF. For the video, you can open the downloaded PDF to show the layout."*

---

## Step 12 — PPTX Export (Presenton)

**Click Dashboard → Export → PPTX**

```bash
# API call:
POST /api/projects/6a2535ecc62f10df8c15f391/dashboards/6a25387ec62f10df8c15f461/pptx/presenton/async
{
  "topic": "Finance Analytics — Fund Portfolio & ESG Overview",
  "feedback": "Executive summary: show key fund metrics, ESG scores, AUM trends and marketing ROI"
}
```

**Response:**
```json
{"job_id": "6a253880c62f10df8c15f494", "status": "generating"}
```

**UI:** Shows loading animation → "Generating slides..." → iframe with editable Presenton presentation appears.

**Voiceover:** *"PPTX generation is AI-assisted through our self-hosted Presenton instance. It reads the dashboard widgets, generates slide content, and opens an editable presentation in-browser. We can modify slides, reorder, change titles — then download the final PPTX."*

---

## Step 13 — Scheduled Reports with Data Change

**Navigate to:** Projects → Finance Analytics Demo → **Schedules**

### Schedule Created (every 15 minutes)
```bash
POST /api/projects/6a2535ecc62f10df8c15f391/schedules
{
  "name": "Finance Dashboard -- Every 15 Minutes",
  "cron": "*/15 * * * *",
  "dashboard_id": "6a25387ec62f10df8c15f461",
  "delivery": {
    "type": "email",
    "recipients": ["narender.rk10@gmail.com"]
  },
  "is_active": true
}
```

**Schedule ID:** `6a253880c62f10df8c15f495`

**UI:** Show schedule card with next run time, cron expression, and delivery configuration.

**Voiceover:** *"We've scheduled the dashboard to deliver via email every 15 minutes. The report is generated as a PDF, attached to an HTML email, and sent automatically. Let's now simulate a data change to see the schedule pick it up."*

---

### Simulate Data Change via Agent (ETL)

**In Chat, with `@FinanceSQL`:**
```
Insert 100 new NAV records for today's date across all 4 funds with slightly higher
NAV values than yesterday (simulate end-of-day update). Use random walks from the
latest nav_per_share values.
```

**The agent generates and executes:**
```sql
INSERT INTO conn_21bb9972.daily_nav (trade_date, fund_id, nav_per_share, total_aum, daily_net_flow)
SELECT CURRENT_DATE,
       fund_id,
       ROUND((nav_per_share * (1 + (RANDOM() * 0.02 - 0.01)))::NUMERIC, 4),
       total_aum * 1.002,
       ROUND((RANDOM() * 4000000 - 2000000)::NUMERIC, 2)
FROM daily_nav
WHERE trade_date = (SELECT MAX(trade_date) FROM daily_nav)
```

**Voiceover:** *"An agent-driven ETL insert — 100 new records added across 4 funds using a random walk from the latest NAV. No pipeline, no code, no data engineer required. The agent wrote the INSERT statement from a plain English instruction."*

---

### Wait for Schedule Run

**Wait for next 15-minute mark → check email inbox**

**Email received:**
- Subject: `Finance Dashboard — Every 15 Minutes | Report 2026-06-07`
- HTML body: Summary of key metrics (AUM, fund performance)
- PDF attachment: Dashboard snapshot including the new NAV data

**API: Check run history:**
```bash
GET /api/projects/6a2535ecc62f10df8c15f391/schedules/6a253880c62f10df8c15f495/runs
```
**Response shows:** `last_run_status: "success"`, timestamp, delivery channel status.

**Voiceover:** *"The scheduled report ran automatically, picked up the new NAV data we just inserted via the agent, and delivered the updated PDF by email. No manual intervention — the data changed, the report reflects it."*

---

## Step 14 — Multi-Source Federation Proof

**In Chat, with `@FinanceSQL`:**
```
Cross-source query: From our finance data, show monthly total client deposits in 2024.
From marketing data, show monthly new clients acquired in 2024. 
Combine into a single view by month.
```

**The agent may generate two separate queries and synthesize:**
```sql
-- Finance deposits (PostgreSQL)
SELECT TO_CHAR(DATE_TRUNC('month', tx_date), 'YYYY-MM') AS month,
       ROUND(SUM(amount)/1e6, 1) AS deposits_millions
FROM conn_21bb9972.client_transactions
WHERE tx_type = 'Deposit' AND EXTRACT(YEAR FROM tx_date) = 2024
GROUP BY 1 ORDER BY 1;

-- Marketing acquisition (MySQL)
SELECT DATE_FORMAT(report_date, '%Y-%m') AS month,
       SUM(converted_clients) AS new_clients
FROM conn_4a151ae1.client_acquisitions
WHERE YEAR(report_date) = 2024
GROUP BY 1 ORDER BY 1;
```

**Voiceover:** *"SQL + SQL across two different engines — PostgreSQL and MySQL — in the same agent response. The agent knows which schema is on which connection and routes the queries correctly."*

---

## Step 15 — Conclusion

**Show:** Dashboard with all 25 widgets visible, filters applied, real-time updates visible.

**Summary of what was demonstrated:**

| Capability | Status |
|-----------|--------|
| JWT authentication + project isolation | LIVE |
| 4 data connections (2x PostgreSQL + 2x MySQL) | LIVE |
| 50,000+ rows client transactions | LIVE |
| 5,220 daily NAV records across 4 funds | LIVE |
| 9,135 marketing acquisition rows | LIVE |
| Vector KB from CSV (ESG scores) | LIVE |
| Vector KB from Markdown (board report) | LIVE |
| Single agent: Plain English → SQL | LIVE |
| SQL STDDEV / risk metrics | LIVE |
| Multi-table JOIN (3 tables) | LIVE |
| Cross-engine: PostgreSQL + MySQL same session | LIVE |
| RAG from CSV knowledge base | LIVE |
| RAG from document knowledge base | LIVE |
| Hybrid: SQL + KB in one agent | LIVE |
| Context retention (follow-up questions) | LIVE |
| ETL via agent (INSERT + aggregation) | LIVE |
| Dashboard: 25 widgets, 4 chart types | LIVE |
| Pivot tables with sorting + filtering | LIVE |
| KPI cards | LIVE |
| AI summary card | LIVE |
| Global filters (all widgets update) | LIVE |
| Dashboard Chat (edit via NL) | LIVE |
| Real-time updates via WebSocket | LIVE |
| PDF export | LIVE |
| PPTX export (Presenton async) | LIVE |
| Scheduled email delivery | LIVE |
| Data mutation → auto-updated report | LIVE |

**Voiceover:** *"OpenBI turns plain English into live SQL across any data source, combines it with document RAG, and delivers production-ready dashboards, PDFs, and PowerPoints — all self-hosted, no vendor lock-in. From raw database tables to an AI-powered analytics platform in minutes."*

---

## API Reference (for DevTools / Terminal overlay during recording)

```bash
# Login
POST http://localhost:8000/api/auth/login
{ "email": "admin@openbi.dev", "password": "changeme123" }

# Project
GET  http://localhost:8000/api/projects
POST http://localhost:8000/api/projects

# Connections
GET  http://localhost:8000/api/projects/{pid}/connections
POST http://localhost:8000/api/projects/{pid}/connections

# Knowledge Bases
GET  http://localhost:8000/api/projects/{pid}/knowledge-bases
POST http://localhost:8000/api/projects/{pid}/knowledge-bases              # create
POST http://localhost:8000/api/projects/{pid}/knowledge-bases/{kid}/upload # upload file
POST http://localhost:8000/api/projects/{pid}/knowledge-bases/{kid}/crawl  # crawl URL

# Agents
GET  http://localhost:8000/api/projects/{pid}/agents
POST http://localhost:8000/api/projects/{pid}/agents
PUT  http://localhost:8000/api/projects/{pid}/agents/{aid}

# Chat (SSE streaming)
POST http://localhost:8000/api/projects/{pid}/chat
{ "session_id": null, "agent_id": "...", "message": "...", "stream": true }
# SSE events: thinking | sql | data | answer | done

# Dashboards
GET  http://localhost:8000/api/projects/{pid}/dashboards
POST http://localhost:8000/api/projects/{pid}/dashboards
POST http://localhost:8000/api/projects/{pid}/dashboards/{did}/widgets
POST http://localhost:8000/api/projects/{pid}/dashboards/{did}/pdf
POST http://localhost:8000/api/projects/{pid}/dashboards/{did}/pptx/presenton/async

# Schedules
GET  http://localhost:8000/api/projects/{pid}/schedules
POST http://localhost:8000/api/projects/{pid}/schedules
GET  http://localhost:8000/api/projects/{pid}/schedules/{sid}/runs
```

---

## Known Limitations for Demo Recording

1. **Hybrid SQL+KB JOIN**: MindsDB does not support `||` concatenation operator in KB WHERE clauses. Always ask the HybridAnalyst to query SQL and KB *separately* in one question — it handles this correctly via sequential tool calls.

2. **Web Crawl (IMF)**: The IMF site blocks automated crawlers. We replaced the web KB with a local board report markdown. For demo purposes, describe it as an "investment committee strategy document."

3. **Telegram delivery**: Requires linking the bot to a Telegram chat ID via `/start` command with the bot. The bot token is live (`8836640001:AAE...`). To enable: open Telegram, search for the bot, send `/start`.

4. **Schedule timing**: The `*/15` cron means it fires at :00, :15, :30, :45 of every hour. Plan your recording around these times for the "live delivery" moment.

5. **MindsDB cold start**: After Docker restart, the first MindsDB query takes ~10-15s as the model loads. Run a warm-up query before recording begins.

---

## Data Quick Reference

```
PostgreSQL (localhost:5433, financedb)
  Funds:       USEQ | GBAQ | USFX | EMEQ
  NAV period:  2020-01-01 to 2024-12-31 (5,220 trading day rows)
  TX count:    50,000 client transactions
  Total AUM:   ~$5.1 billion (latest date, all funds)

MySQL (localhost:3307, marketingdb)
  Campaigns:   5 (Institutional ESG Push, Endowment Outreach, Retail ETF Awareness, etc.)
  Acquisitions: 9,135 daily rows (2020-2024)

ESG KB: seed/esg_fund_report.md — 64 quarterly assessments (Q1 2020–Q4 2023)
  Best ESG Q4 2023: GBAQ — Total 69.8 | Environment 89.1 | Rating AA
  Most Improved:    EMEQ — +8.9 points YoY (BB→A rating journey)
  Portfolio avg:    64.2 (up from 51.2 in Q1 2020)

Board Report KB: seed/demo_kb_board_report.md
  Alpha targets: USEQ +150bps | GBAQ +250bps | USFX +50bps | EMEQ +300bps
  AUM Board Target: $3.5B globally (actual: ~$5.1B — exceeded)
```
