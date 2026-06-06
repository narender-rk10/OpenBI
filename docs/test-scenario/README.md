# OpenBI End-to-End Test Scenario

Two seeded SQL databases on the OpenBI Docker network plus a click-through
scenario that exercises the whole stack: **connect → agent → chat →
chart/table**.

| DB | Engine | Purpose | Hostname (in network) | Host port |
|----|--------|---------|----------------------|-----------|
| `retail`  | Postgres 16 | E-commerce orders, customers, products | `retail-pg`  | `55432` |
| `hr`      | MySQL 8.4   | Employees, departments, attendance     | `hr-mysql`   | `53306` |

---

## 1. Bring up the test stack

From the project root:

```bash
# 1. Start the main app first so the network exists
docker compose up -d

# 2. Add the two test databases on the same network
docker compose -f docker-compose.yml -f docs/test-scenario/docker-compose.test-data.yml up -d retail-pg hr-mysql
```

Verify both are healthy:

```bash
docker compose ps retail-pg hr-mysql
# both columns should show "healthy"
```

> **Network name note.** The overlay assumes `openbi_openbi-network` (compose's
> default `<project>_<network>` naming when the project dir is `openbi`). If
> your project dir is named differently, run `docker network ls`, find the
> right name, and update `networks.openbi-network.name` in
> `docker-compose.test-data.yml`.

## 2. Sanity check the seed data

Optional shortcut — run the bundled smoke test (no extra deps, uses the
`docker exec` clients already inside the containers):

```bash
bash docs/test-scenario/smoke-test.sh
```

Expected output ends with `ALL CHECKS PASSED`.

Or check manually:

```bash
docker exec -it openbi-retail-pg psql -U retail -d retail -c \
  "SELECT COUNT(*) AS orders FROM orders;"
# orders | 18

docker exec -it openbi-hr-mysql mysql -uhr -phr123 hr -e \
  "SELECT COUNT(*) AS employees FROM employees;"
# employees | 15
```

## 3. Configure LLM (one-time)

The backend now refuses to create agents/KBs without an LLM configured.

1. Open <http://localhost:3000>, log in as super admin.
2. **Settings → LLM**: set provider/model/API key, **Save**.
3. Confirm the green "LLM settings saved." banner.

## 4. Connect both databases in OpenBI

Pick (or create) a project, then **Data Sources → New Connection**.

### Connection A — Retail (Postgres)

| Field | Value |
|-------|-------|
| Name | `Retail Postgres` |
| Engine | `postgres` |
| host | `retail-pg` |
| port | `5432` |
| database | `retail` |
| user | `retail` |
| password | `retail123` |

Click **Test Connection** → should return success. Save.

After save, the table picker should list:
`customers`, `products`, `orders`, `order_items`.

### Connection B — HR (MySQL)

| Field | Value |
|-------|-------|
| Name | `HR MySQL` |
| Engine | `mysql` |
| host | `hr-mysql` |
| port | `3306` |
| database | `hr` |
| user | `hr` |
| password | `hr123` |

Test → save. Tables shown: `departments`, `employees`, `attendance`.

## 5. Create two agents

### Agent A — "Sales Analyst"

- **Skills**: one *text2sql* skill on **Retail Postgres**.
  - Tables: select all four (`customers`, `products`, `orders`, `order_items`).
- **Prompt**: leave default, or paste:
  > You are a sales analyst. Always cite specific revenue numbers and date
  > ranges. When the user asks for trends, prefer monthly aggregations.

### Agent B — "People Ops"

- **Skills**: one *text2sql* skill on **HR MySQL**.
  - Tables: `departments`, `employees`, `attendance`.
- **Prompt**:
  > You are an HR analytics partner. Exclude inactive employees unless asked.
  > Round salaries to the nearest thousand when summarising.

## 6. Run the scenario

Open each agent in **Chat** and walk through the prompts. The "expected
shape" column tells you what a correct answer looks like — exact wording will
vary by LLM.

### Sales Analyst

| # | Prompt | Expected shape |
|---|--------|---------------|
| 1 | *"How many orders were placed each month between Aug 2024 and Apr 2025?"* | Table/line chart with 9 months, count column. April 2025 = 4 orders. |
| 2 | *"Top 5 customers by total revenue."* | Aarav, Liam, Olivia, Priya appear near top; revenues > $200. |
| 3 | *"Which product category generated the most revenue?"* | Electronics wins (Smart Watch X drives a lot of revenue). |
| 4 | *"Show monthly revenue as a chart."* | Triggers chart agent; bar/line chart rendered by `PlotlyChart`. |
| 5 | *"How many cancelled orders are there?"* | Single number = 1. |

After prompt #4, click the chart and try **"Make it a bar chart, group by
status."** — exercises the chart-modify path.

### People Ops

| # | Prompt | Expected shape |
|---|--------|---------------|
| 1 | *"Average salary per department."* | 5 rows, Engineering ≈ $87k, Sales ≈ $84k. |
| 2 | *"Who are the 3 highest-paid active employees?"* | Vikram Bose ($140k), Mei Lin ($125k), Karan Mehta ($110k). |
| 3 | *"Total hours worked per department for the week of Apr 7."* | 5 rows, Engineering should have ~140h (4 active employees × 5 days × ~8h). |
| 4 | *"Plot headcount per department."* | Chart with 5 categories. |

## 7. Verify what happened end-to-end

After the chat session, confirm each layer fired:

```bash
# Backend logs — should show MindsDB SQL queries with the actual SELECT
docker compose logs --tail=200 backend | grep -E "openbi.mindsdb|SQL"

# MindsDB logs — should show two database handlers attached
docker compose logs --tail=100 mindsdb | grep -E "postgres|mysql"

# In MongoDB the agent doc should have skills with mindsdb_db_name set
docker exec -it openbi-backend python -c "
import asyncio
from backend.core.database import connect_db, get_db
async def main():
    await connect_db()
    db = get_db()
    async for a in db.agents.find({}):
        print(a['name'], '→', [s.get('mindsdb_db_name') for s in a.get('skills', [])])
asyncio.run(main())
"
```

## 8. Negative tests (these *should* fail with a clear error)

These prove the new error-surfacing path works.

| Action | Expected user-visible error |
|--------|------------------------------|
| Clear the LLM API key in Settings, then try to create an agent | `LLM API key not configured. Set it in Settings → LLM before creating or updating agents.` |
| Create an agent with credentials pointing to wrong host (e.g. host = `nope`) | UI shows the upstream MindsDB error (connection refused / unknown host), not a generic 502. |
| Stop `retail-pg` (`docker stop openbi-retail-pg`) and ask the Sales agent a question | Streamed `error` event with the real MindsDB message. |

## 9. Tear down

```bash
docker compose -f docker-compose.yml -f docs/test-scenario/docker-compose.test-data.yml down
# Add -v to drop the seeded volumes too:
docker compose -f docker-compose.yml -f docs/test-scenario/docker-compose.test-data.yml down -v
```

---

## Files in this folder

```
docs/test-scenario/
├── README.md                       (this file)
├── docker-compose.test-data.yml    (Postgres + MySQL overlay)
├── smoke-test.sh                   (verifies both DBs are seeded)
└── seed/
    ├── postgres-retail.sql         (e-commerce schema + data)
    └── mysql-hr.sql                (HR schema + data)
```

## Remaining Data Sources Testing
- [x] ClickHouse (docker-compose.test-clickhouse.yml)
- [x] MariaDB (docker-compose.test-mariadb.yml)
- [x] Microsoft SQL Server (docker-compose.test-mssql.yml)
- [x] Elasticsearch (docker-compose.test-elasticsearch.yml)
