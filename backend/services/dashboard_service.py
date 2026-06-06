"""Dashboard service — filter logic, widget data refresh."""

import re
from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId

from backend.services.mindsdb_client import mindsdb


class DashboardService:

    async def add_filter(self, dashboard_id: str, filter_config: dict, db) -> dict:
        """Add a global filter to a dashboard."""
        filter_id = f"filter_{uuid4().hex[:8]}"
        options = None

        if filter_config["type"] in ("select", "multi_select"):
            widget = await self._find_widget_with_column(dashboard_id, filter_config["column"], db)
            if widget:
                col = filter_config["column"]
                db_name, table = await self._resolve_db_and_table(widget, db)
                if db_name and table:
                    try:
                        result = await mindsdb.sql_query(f"SELECT DISTINCT `{col}` FROM {db_name}.{table} ORDER BY `{col}` LIMIT 100")
                        options = [row[0] for row in result.get("data", [])]
                    except Exception:
                        options = []

        elif filter_config["type"] == "date_range":
            widget = await self._find_widget_with_column(dashboard_id, filter_config["column"], db)
            if widget:
                col = filter_config["column"]
                db_name, table = await self._resolve_db_and_table(widget, db)
                if db_name and table:
                    try:
                        result = await mindsdb.sql_query(f"SELECT MIN(`{col}`), MAX(`{col}`) FROM {db_name}.{table}")
                        if result.get("data"):
                            options = {"min": str(result["data"][0][0]), "max": str(result["data"][0][1])}
                    except Exception:
                        options = {}

        elif filter_config["type"] == "number_range":
            widget = await self._find_widget_with_column(dashboard_id, filter_config["column"], db)
            if widget:
                col = filter_config["column"]
                db_name, table = await self._resolve_db_and_table(widget, db)
                if db_name and table:
                    try:
                        result = await mindsdb.sql_query(f"SELECT MIN(`{col}`), MAX(`{col}`) FROM {db_name}.{table}")
                        if result.get("data"):
                            options = {"min": result["data"][0][0], "max": result["data"][0][1]}
                    except Exception:
                        options = {}

        new_filter = {
            "id": filter_id,
            "column": filter_config["column"],
            "type": filter_config["type"],
            "options": options,
            "current_value": None,
            "bound_widget_ids": filter_config.get("bound_widget_ids", []),
        }

        await db.dashboards.update_one(
            {"_id": ObjectId(dashboard_id)},
            {"$push": {"global_filters": new_filter}},
        )
        return new_filter

    async def apply_filter(self, dashboard_id: str, filter_id: str, value, db) -> list[dict]:
        """Apply filter, re-query bound widgets, return updated data."""
        dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
        filter_def = next((f for f in dashboard.get("global_filters", []) if f["id"] == filter_id), None)
        if not filter_def:
            raise ValueError("Filter not found")

        await db.dashboards.update_one(
            {"_id": ObjectId(dashboard_id), "global_filters.id": filter_id},
            {"$set": {"global_filters.$.current_value": value}},
        )

        updated_widgets = []
        for widget_id in filter_def.get("bound_widget_ids", []):
            widget = await db.widgets.find_one({"dashboard_id": ObjectId(dashboard_id), "widget_id": widget_id})
            if not widget:
                continue

            query = self._apply_filter_to_query(
                widget["data_binding"].get("query", ""),
                filter_def["column"],
                filter_def["type"],
                value,
            )

            try:
                result = await mindsdb.sql_query(query)
                columns = result.get("column_names", [])
                rows = result.get("data", [])

                await db.widgets.update_one(
                    {"_id": widget["_id"]},
                    {"$set": {"cached_data": {"columns": columns, "rows": rows, "fetched_at": datetime.now(timezone.utc)}}},
                )

                chart_config = None
                if widget.get("display_type") == "chart" and columns and rows:
                    from backend.services.chart_agent import chart_agent
                    org = await db.organizations.find_one({})
                    brand_colors = org.get("settings", {}).get("branding", {}).get("chart_palette") if org else None
                    chart_config = await chart_agent.generate_chart(columns, rows, "auto", brand_colors)
                    await db.widgets.update_one({"_id": widget["_id"]}, {"$set": {"chart_config": chart_config}})

                updated_widgets.append({"widget_id": widget_id, "columns": columns, "rows": rows, "chart_config": chart_config})
            except Exception as e:
                updated_widgets.append({"widget_id": widget_id, "error": str(e)})

        return updated_widgets

    @staticmethod
    def _sanitize_str(val: str) -> str:
        """Escape single quotes to prevent SQL injection."""
        return str(val).replace("'", "''")

    def _apply_filter_to_query(self, query: str, column: str, filter_type: str, value) -> str:
        """Inject WHERE clause into SQL query."""
        if value is None:
            return query

        if filter_type == "select":
            safe = self._sanitize_str(value)
            condition = f"`{column}` = '{safe}'"
        elif filter_type == "multi_select":
            values = ", ".join([f"'{self._sanitize_str(v)}'" for v in value])
            condition = f"`{column}` IN ({values})"
        elif filter_type == "date_range":
            safe_start = self._sanitize_str(value['start'])
            safe_end = self._sanitize_str(value['end'])
            condition = f"`{column}` >= '{safe_start}' AND `{column}` <= '{safe_end}'"
        elif filter_type == "number_range":
            min_val = float(value['min'])
            max_val = float(value['max'])
            condition = f"`{column}` >= {min_val} AND `{column}` <= {max_val}"
        elif filter_type == "search":
            safe = self._sanitize_str(value)
            condition = f"`{column}` LIKE '%{safe}%'"
        else:
            return query

        if re.search(r"\bWHERE\b", query, re.IGNORECASE):
            query = re.sub(r"\bWHERE\b", f"WHERE {condition} AND", query, count=1, flags=re.IGNORECASE)
        elif re.search(r"\bGROUP BY\b", query, re.IGNORECASE):
            query = re.sub(r"\bGROUP BY\b", f"WHERE {condition} GROUP BY", query, count=1, flags=re.IGNORECASE)
        elif re.search(r"\bORDER BY\b", query, re.IGNORECASE):
            query = re.sub(r"\bORDER BY\b", f"WHERE {condition} ORDER BY", query, count=1, flags=re.IGNORECASE)
        elif re.search(r"\bLIMIT\b", query, re.IGNORECASE):
            query = re.sub(r"\bLIMIT\b", f"WHERE {condition} LIMIT", query, count=1, flags=re.IGNORECASE)
        else:
            query = query.rstrip(";") + f" WHERE {condition}"

        return query

    async def _find_widget_with_column(self, dashboard_id: str, column: str, db):
        widgets = await db.widgets.find({"dashboard_id": ObjectId(dashboard_id)}).to_list(100)
        for w in widgets:
            if w.get("cached_data") and column in w["cached_data"].get("columns", []):
                return w
            query = w.get("data_binding", {}).get("query", "")
            if column.lower() in query.lower():
                return w
        return widgets[0] if widgets else None

    def _extract_table_from_query(self, query: str) -> str:
        match = re.search(r"\bFROM\s+(\S+)", query, re.IGNORECASE)
        if match:
            table = match.group(1)
            if "." in table:
                table = table.split(".")[-1]
            return table.replace("`", "").replace("\"", "").replace("'", "")
        return ""

    async def _resolve_db_and_table(self, widget, db) -> tuple[str, str]:
        if not widget:
            return "", ""

        query = widget.get("data_binding", {}).get("query", "")
        db_name = widget.get("data_binding", {}).get("mindsdb_db_name", "")

        if not db_name:
            conn_id = widget.get("data_binding", {}).get("connection_id")
            if conn_id:
                try:
                    conn = await db.connections.find_one({"_id": ObjectId(conn_id)})
                    if conn:
                        db_name = conn.get("mindsdb_db_name", "")
                except Exception:
                    pass

        if not db_name and query:
            match = re.search(r"\bFROM\s+(\S+)", query, re.IGNORECASE)
            if match:
                table_part = match.group(1)
                if "." in table_part:
                    db_name = table_part.split(".")[0].replace("`", "").replace("\"", "").replace("'", "")

        table = self._extract_table_from_query(query)
        return db_name, table


dashboard_service = DashboardService()
