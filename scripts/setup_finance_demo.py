"""Seed a ready-to-explore "Finance Demo" dashboard into MongoDB.

Creates one dashboard with ~16 widgets (KPIs, charts, a pivot table, a
conditionally-formatted detail table, an AI-summary card) and global filters,
all pre-populated with deterministic 2024 finance data so the dashboard renders
immediately — no Postgres/agent required just to *see* it.

For the fully interactive experience (live filtering, dashboard-chat changes,
follow-ups, RAG+SQL side by side) follow docs/test-scenario/finance/README.md to
connect the seed Postgres and create a Finance Agent.

Usage:
    python scripts/setup_finance_demo.py --project-id <PROJECT_ID>

Honors MONGODB_URI / MONGODB_DB_NAME (same as the backend).
"""

import argparse
import asyncio
import os
from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/openbi")
MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME", "openbi")

REGIONS = [("North", 1), ("South", 2), ("East", 3), ("West", 4)]
CATEGORIES = [("Electronics", 1, 420.0), ("Furniture", 2, 260.0),
              ("Office Supplies", 3, 35.0), ("Software", 4, 180.0)]
MONTHS = [f"2024-{m:02d}" for m in range(1, 13)]
PALETTE = ["#e94560", "#0f3460", "#16a34a", "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"]


def _units(m: int, r_idx: int, c_idx: int, seasonal: bool = True) -> int:
    base = 120 + m * 6 + r_idx * 18 + c_idx * 11
    if seasonal and m in (11, 12):
        base += 60
    return base


def build_data() -> dict:
    """Return aggregated finance datasets used by the widgets."""
    rows = []  # (month_idx, month, region, category, units, revenue, budget)
    for m in range(1, 13):
        for region, r_idx in REGIONS:
            for cat, c_idx, price in CATEGORIES:
                units = _units(m, r_idx, c_idx)
                revenue = round(units * price, 2)
                budget = round(_units(m, r_idx, c_idx, seasonal=False) * price * 1.05, 2)
                rows.append((m, MONTHS[m - 1], region, cat, units, revenue, budget))
    return {"rows": rows}


def agg(rows, key_idx, val_idx):
    out: dict = {}
    for r in rows:
        out[r[key_idx]] = out.get(r[key_idx], 0) + r[val_idx]
    return out


def chart_widget(title, chart_type, g2_type, columns, data_rows, encode, *, extra_spec=None, query=""):
    spec = {
        "type": g2_type,
        "data": [],  # renderer injects real data from cached_data columns/rows
        "encode": encode,
        "axis": {"x": {}, "y": {"nice": True}},
        "title": {"title": title, "style": {"fontSize": 14, "fontWeight": 600}},
        "theme": {"color10": PALETTE},
    }
    if extra_spec:
        spec.update(extra_spec)
    return {
        "display_type": "chart",
        "title": title,
        "chart_config": {"chart_type": chart_type, "g2_spec": spec, "reasoning": "Finance demo widget"},
        "table_config": None,
        "cached_data": {"columns": columns, "rows": data_rows, "fetched_at": datetime.now(timezone.utc)},
        "data_binding": {"query": query, "agent_name": "Finance Agent"},
    }


def kpi_widget(title, value, prev, query=""):
    return {
        "display_type": "kpi",
        "title": title,
        "chart_config": None,
        "table_config": None,
        "cached_data": {"columns": ["value"], "rows": [[value], [prev]], "fetched_at": datetime.now(timezone.utc)},
        "data_binding": {"query": query, "agent_name": "Finance Agent"},
    }


def table_widget(title, columns, data_rows, table_config, query=""):
    return {
        "display_type": "table",
        "title": title,
        "chart_config": None,
        "table_config": table_config,
        "cached_data": {"columns": columns, "rows": data_rows, "fetched_at": datetime.now(timezone.utc)},
        "data_binding": {"query": query, "agent_name": "Finance Agent"},
    }


def build_widgets(data: dict) -> list[dict]:
    rows = data["rows"]
    total_rev = round(sum(r[5] for r in rows), 2)
    total_bud = round(sum(r[6] for r in rows), 2)
    total_units = sum(r[4] for r in rows)
    variance_pct = round((total_rev - total_bud) / total_bud * 100, 1)

    rev_by_region = agg(rows, 2, 5)
    units_by_region = agg(rows, 2, 4)
    rev_by_cat = agg(rows, 3, 5)
    rev_by_month = agg(rows, 1, 5)
    bud_by_month = agg(rows, 1, 6)

    widgets: list[dict] = []

    # ── KPIs (prev = a slightly lower comparison so deltas render) ──
    widgets.append(kpi_widget("Total Revenue", total_rev, round(total_rev * 0.92, 2),
                              query="SELECT SUM(revenue) FROM sales"))
    widgets.append(kpi_widget("Total Budget", total_bud, round(total_bud * 0.95, 2),
                              query="SELECT SUM(budget_amount) FROM budget"))
    widgets.append(kpi_widget("Budget Variance %", variance_pct, 0.0,
                              query="-- (SUM(revenue)-SUM(budget))/SUM(budget)*100"))
    widgets.append(kpi_widget("Units Sold", total_units, round(total_units * 0.9),
                              query="SELECT SUM(units) FROM sales"))

    # ── AI summary card ──
    widgets.append({
        "display_type": "ai_summary",
        "title": "Executive Summary",
        "chart_config": None, "table_config": None,
        "cached_data": None,
        "cached_text": (
            f"FY2024 total revenue reached ${total_rev:,.0f} against a budget of "
            f"${total_bud:,.0f} ({'+' if variance_pct >= 0 else ''}{variance_pct}% variance), "
            f"driven by a strong Q4 in Electronics and Software. West led regional growth; "
            f"Office Supplies remained the lowest-margin category. Against the board's $9.8M "
            f"target, the year finished {'ahead' if total_rev >= 9_800_000 else 'short'}."
        ),
        "data_binding": {"query": "", "agent_name": "Finance Agent"},
    })

    # ── Charts ──
    widgets.append(chart_widget(
        "Revenue by Region", "interval", "interval",
        ["region", "revenue"], [[k, round(v, 2)] for k, v in rev_by_region.items()],
        {"x": "region", "y": "revenue", "color": "region"},
        query="SELECT region, SUM(revenue) revenue FROM sales GROUP BY region"))

    widgets.append(chart_widget(
        "Revenue Trend by Month", "line", "line",
        ["month", "revenue"], [[m, round(rev_by_month[m], 2)] for m in MONTHS],
        {"x": "month", "y": "revenue", "shape": "smooth"},
        query="SELECT to_char(sale_date,'YYYY-MM') month, SUM(revenue) revenue FROM sales GROUP BY 1 ORDER BY 1"))

    widgets.append(chart_widget(
        "Revenue by Category", "pie", "interval",
        ["product_category", "revenue"], [[k, round(v, 2)] for k, v in rev_by_cat.items()],
        {"y": "revenue", "color": "product_category"},
        extra_spec={"transform": [{"type": "stackY"}], "coordinate": {"type": "theta", "outerRadius": 0.8}},
        query="SELECT product_category, SUM(revenue) revenue FROM sales GROUP BY 1"))

    # Budget vs Actual (grouped/dodge) — long format: month, series, amount
    bva_rows = []
    for m in MONTHS:
        bva_rows.append([m, "Actual", round(rev_by_month[m], 2)])
        bva_rows.append([m, "Budget", round(bud_by_month[m], 2)])
    widgets.append(chart_widget(
        "Budget vs Actual by Month", "interval", "interval",
        ["month", "series", "amount"], bva_rows,
        {"x": "month", "y": "amount", "color": "series"},
        extra_spec={"transform": [{"type": "dodgeX"}]},
        query="-- actual vs budget per month (union of sales + budget)"))

    widgets.append(chart_widget(
        "Units by Region", "interval", "interval",
        ["region", "units"], [[k, v] for k, v in units_by_region.items()],
        {"x": "region", "y": "units", "color": "region"},
        query="SELECT region, SUM(units) units FROM sales GROUP BY region"))

    # Category revenue trend (area, by month + category)
    cat_trend_rows = []
    for m in MONTHS:
        for cat, _i, _p in CATEGORIES:
            v = sum(r[5] for r in rows if r[1] == m and r[3] == cat)
            cat_trend_rows.append([m, cat, round(v, 2)])
    widgets.append(chart_widget(
        "Category Revenue Trend", "area", "area",
        ["month", "product_category", "revenue"], cat_trend_rows,
        {"x": "month", "y": "revenue", "color": "product_category"},
        query="SELECT to_char(sale_date,'YYYY-MM') month, product_category, SUM(revenue) revenue FROM sales GROUP BY 1,2"))

    widgets.append(chart_widget(
        "Region Revenue Share", "pie", "interval",
        ["region", "revenue"], [[k, round(v, 2)] for k, v in rev_by_region.items()],
        {"y": "revenue", "color": "region"},
        extra_spec={"transform": [{"type": "stackY"}], "coordinate": {"type": "theta", "outerRadius": 0.8}},
        query="SELECT region, SUM(revenue) revenue FROM sales GROUP BY region"))

    var_rows = [[m, round((rev_by_month[m] - bud_by_month[m]) / bud_by_month[m] * 100, 1)] for m in MONTHS]
    widgets.append(chart_widget(
        "Monthly Variance %", "line", "line",
        ["month", "variance_pct"], var_rows,
        {"x": "month", "y": "variance_pct", "shape": "smooth"},
        query="-- (actual-budget)/budget*100 per month"))

    # ── Pivot table (region x category, revenue) ──
    pivot_rows = []
    for region, _ri in REGIONS:
        for cat, _ci, _p in CATEGORIES:
            v = sum(r[5] for r in rows if r[2] == region and r[3] == cat)
            pivot_rows.append([region, cat, round(v, 2)])
    widgets.append(table_widget(
        "Revenue Pivot (Region × Category)",
        ["region", "product_category", "revenue"], pivot_rows,
        {
            "isPivot": True,
            "fields": {"rows": ["region"], "columns": ["product_category"], "values": ["revenue"]},
            "meta": [{"field": "revenue", "name": "Revenue", "formatter": "currency"}],
        },
        query="SELECT region, product_category, SUM(revenue) revenue FROM sales GROUP BY 1,2"))

    # ── Detail table with conditional formatting on variance ──
    detail_rows = []
    for region, _ri in REGIONS:
        for cat, _ci, _p in CATEGORIES:
            rev = sum(r[5] for r in rows if r[2] == region and r[3] == cat)
            bud = sum(r[6] for r in rows if r[2] == region and r[3] == cat)
            vpct = round((rev - bud) / bud * 100, 1)
            detail_rows.append([region, cat, round(rev, 2), round(bud, 2), vpct])
    widgets.append(table_widget(
        "Region × Category Detail",
        ["region", "product_category", "revenue", "budget", "variance_pct"], detail_rows,
        {
            "isPivot": False,
            "meta": [
                {"field": "revenue", "name": "Revenue", "formatter": "currency"},
                {"field": "budget", "name": "Budget", "formatter": "currency"},
                {"field": "variance_pct", "name": "Variance %", "formatter": "percent"},
            ],
            "conditions": {
                "text": [{"field": "variance_pct", "operator": "<", "value": 0, "textColor": "#dc2626"}],
                "background": [{"field": "variance_pct", "operator": ">=", "value": 5, "fill": "#16a34a22"}],
            },
            "sortParams": [{"sortFieldId": "revenue", "sortMethod": "DESC"}],
        },
        query="SELECT region, product_category, SUM(revenue) revenue FROM sales GROUP BY 1,2"))

    # ── Top months table ──
    top_months = sorted(([m, round(rev_by_month[m], 2), round(bud_by_month[m], 2)] for m in MONTHS),
                        key=lambda x: x[1], reverse=True)
    widgets.append(table_widget(
        "Top Months by Revenue",
        ["month", "revenue", "budget"], top_months,
        {"isPivot": False, "meta": [
            {"field": "revenue", "formatter": "currency"},
            {"field": "budget", "formatter": "currency"}]},
        query="SELECT to_char(sale_date,'YYYY-MM') month, SUM(revenue) revenue FROM sales GROUP BY 1 ORDER BY 2 DESC"))

    return widgets


# Grid positions (12-col): KPIs row, summary, then 2-per-row charts, tables.
def layout_for(index: int, display_type: str) -> dict:
    # First 4 are KPIs
    if index < 4:
        return {"x": index * 3, "y": 0, "w": 3, "h": 2}
    if index == 4:  # AI summary, full width
        return {"x": 0, "y": 2, "w": 12, "h": 2}
    # Remaining: two per row, charts h=4, tables h=5
    seq = index - 5
    h = 5 if display_type == "table" else 4
    col = seq % 2
    row_base = 4
    # compute y by stacking; approximate with seq//2 * 5 (max row height) for spacing
    y = row_base + (seq // 2) * 5
    return {"x": col * 6, "y": y, "w": 6, "h": h}


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project-id", required=True, help="Target OpenBI project _id")
    ap.add_argument("--name", default="Finance Demo")
    args = ap.parse_args()

    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[MONGODB_DB_NAME]

    project = await db.projects.find_one({"_id": ObjectId(args.project_id)})
    if not project:
        raise SystemExit(f"Project {args.project_id} not found in '{MONGODB_DB_NAME}'.")
    user_id = project.get("user_id") or project.get("created_by")
    if not user_id:
        first_user = await db.users.find_one({})
        user_id = first_user["_id"] if first_user else ObjectId()

    data = build_data()
    widgets = build_widgets(data)

    # Global filters (visible + editable in the UI). Options sourced from the data.
    now = datetime.now(timezone.utc)
    global_filters = [
        {"id": "filter_region", "column": "region", "type": "select",
         "options": [r for r, _ in REGIONS], "current_value": None,
         "bound_widget_ids": []},
        {"id": "filter_category", "column": "product_category", "type": "select",
         "options": [c for c, _i, _p in CATEGORIES], "current_value": None,
         "bound_widget_ids": []},
        {"id": "filter_month", "column": "month", "type": "select",
         "options": MONTHS, "current_value": None, "bound_widget_ids": []},
        {"id": "filter_revenue", "column": "revenue", "type": "number_range",
         "options": {"min": 0, "max": 200000}, "current_value": None,
         "bound_widget_ids": []},
    ]

    dash_doc = {
        "project_id": ObjectId(args.project_id),
        "user_id": ObjectId(user_id),
        "name": args.name,
        "description": "Auto-generated finance demo: sales vs budget across regions & categories.",
        "is_shared": False, "shared_with": [],
        "layout": [], "global_filters": global_filters,
        "auto_refresh": {"enabled": False, "interval_seconds": 300},
        "created_at": now, "updated_at": now,
    }
    res = await db.dashboards.insert_one(dash_doc)
    dash_id = res.inserted_id

    bound_ids = []
    for i, w in enumerate(widgets):
        wid = f"w{i + 1}"
        bound_ids.append(wid)
        w_doc = {
            "dashboard_id": dash_id,
            "widget_id": wid,
            "source_type": "manual",
            "source_session_id": None,
            "source_message_id": None,
            "data_binding": w.get("data_binding", {}),
            "display_type": w["display_type"],
            "chart_config": w.get("chart_config"),
            "table_config": w.get("table_config"),
            "position": layout_for(i, w["display_type"]),
            "title": w["title"],
            "auto_refresh": {"enabled": False, "interval_seconds": 300},
            "cached_data": w.get("cached_data"),
            "cached_text": w.get("cached_text"),
            "created_at": now, "updated_at": now,
        }
        await db.widgets.insert_one(w_doc)

    # Bind the select/number filters to all widgets so they appear connected.
    await db.dashboards.update_one(
        {"_id": dash_id},
        {"$set": {f"global_filters.{j}.bound_widget_ids": bound_ids for j in range(len(global_filters))}},
    )

    client.close()
    print(f"✅ Created '{args.name}' with {len(widgets)} widgets.")
    print(f"   Dashboard id: {dash_id}")
    print(f"   Open: /projects/{args.project_id}/dashboards/{dash_id}")


if __name__ == "__main__":
    asyncio.run(main())
