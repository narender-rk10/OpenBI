"""Dashboard routes — CRUD, widgets, filters, rendering, chart/table agent."""

import base64
import logging
import re
from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.deps import get_current_project, get_current_user, get_db
from backend.services.chart_agent import chart_agent
from backend.services.dashboard_service import dashboard_service
from backend.services.mindsdb_client import mindsdb
from backend.services.table_agent import table_agent
from backend.services.version_service import snapshot_dashboard
from backend.services.websocket_manager import ws_manager

router = APIRouter(prefix="/api/projects/{project_id}/dashboards")


# ── Schemas ─────────────────────────────────────────────────────────────

class DashboardCreate(BaseModel):
    name: str
    description: str = ""


class DashboardUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_shared: bool | None = None
    auto_refresh: dict | None = None


class WidgetCreate(BaseModel):
    source_type: str = "chat"
    source_session_id: str | None = None
    source_message_id: str | None = None
    data_binding: dict = {}
    display_type: str = "chart"
    chart_config: dict | None = None
    table_config: dict | None = None
    title: str = "Widget"
    position: dict = {"x": 0, "y": 0, "w": 6, "h": 4}


class WidgetUpdate(BaseModel):
    title: str | None = None
    display_type: str | None = None
    chart_config: dict | None = None
    table_config: dict | None = None
    position: dict | None = None
    data_binding: dict | None = None
    auto_refresh: dict | None = None
    cached_text: str | None = None  # for ai_summary widgets


class PDFExportRequest(BaseModel):
    chart_images: dict[str, str] = {}  # widget_id → base64 PNG (no data: prefix)
    theme: str = "light"               # "dark" | "light" — mirror the on-screen theme
    grid_width_px: float | None = None  # rendered GridStack width, for aspect/scale
    columns: int = 12                  # GridStack column count
    layout: dict[str, dict] = {}       # widget_id → {x,y,w,h} actual on-screen position


class LayoutUpdate(BaseModel):
    layout: list[dict]


class FilterCreate(BaseModel):
    column: str
    type: str = "select"
    bound_widget_ids: list[str] = []


class FilterApply(BaseModel):
    value: object = None


class FilterConfigUpdate(BaseModel):
    """User edits to a filter's definition (any subset)."""
    type: str | None = None
    options: object | None = None
    current_value: object | None = None
    bound_widget_ids: list[str] | None = None


class FilterReorder(BaseModel):
    order: list[str]


class ShareRequest(BaseModel):
    is_shared: bool = True
    shared_with: list[str] = []


class WidgetAgentRequest(BaseModel):
    message: str


class DashboardChatRequest(BaseModel):
    message: str
    widget_id: str | None = None


class PresentonGenerateRequest(BaseModel):
    feedback: str | None = None


# ── Helpers ─────────────────────────────────────────────────────────────

def _serialize_dashboard(d: dict) -> dict:
    d = {**d}
    d["_id"] = str(d["_id"])
    d["project_id"] = str(d["project_id"])
    d["user_id"] = str(d["user_id"])
    return d


def _serialize_widget(w: dict) -> dict:
    w = {**w}
    w["_id"] = str(w["_id"])
    w["dashboard_id"] = str(w["dashboard_id"])
    return w


# ── Dashboard CRUD ──────────────────────────────────────────────────────

@router.get("")
async def list_dashboards(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    own = await db.dashboards.find({
        "project_id": ObjectId(project_id),
        "user_id": ObjectId(user["_id"]),
    }).to_list(100)
    shared = await db.dashboards.find({
        "project_id": ObjectId(project_id),
        "is_shared": True,
        "user_id": {"$ne": ObjectId(user["_id"])},
    }).to_list(100)
    return [_serialize_dashboard(d) for d in own + shared]


@router.post("")
async def create_dashboard(
    project_id: str,
    body: DashboardCreate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    now = datetime.now(timezone.utc)
    doc = {
        "project_id": ObjectId(project_id),
        "user_id": ObjectId(user["_id"]),
        "name": body.name,
        "description": body.description,
        "is_shared": False,
        "shared_with": [],
        "layout": [],
        "global_filters": [],
        "auto_refresh": {"enabled": False, "interval_seconds": 300},
        "created_at": now,
        "updated_at": now,
    }
    result = await db.dashboards.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize_dashboard(doc)


@router.get("/{dashboard_id}")
async def get_dashboard(
    project_id: str,
    dashboard_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
    if not dashboard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")

    widgets = await db.widgets.find({"dashboard_id": ObjectId(dashboard_id)}).to_list(100)
    result = _serialize_dashboard(dashboard)
    result["widgets"] = [_serialize_widget(w) for w in widgets]
    return result


@router.put("/{dashboard_id}")
async def update_dashboard(
    project_id: str,
    dashboard_id: str,
    body: DashboardUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    update: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.name is not None:
        update["name"] = body.name
    if body.description is not None:
        update["description"] = body.description
    if body.is_shared is not None:
        update["is_shared"] = body.is_shared
    if body.auto_refresh is not None:
        update["auto_refresh"] = body.auto_refresh

    await db.dashboards.update_one({"_id": ObjectId(dashboard_id)}, {"$set": update})
    dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
    await snapshot_dashboard(dashboard_id, db, user["_id"], "Dashboard updated")
    return _serialize_dashboard(dashboard)


@router.delete("/{dashboard_id}")
async def delete_dashboard(
    project_id: str,
    dashboard_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.widgets.delete_many({"dashboard_id": ObjectId(dashboard_id)})
    await db.dashboards.delete_one({"_id": ObjectId(dashboard_id)})
    return {"status": "deleted"}


# ── Widget CRUD ─────────────────────────────────────────────────────────

@router.post("/{dashboard_id}/widgets")
async def add_widget(
    project_id: str,
    dashboard_id: str,
    body: WidgetCreate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    existing = await db.widgets.count_documents({"dashboard_id": ObjectId(dashboard_id)})
    widget_id = f"w{existing + 1}"

    # If from chat, copy cached data
    cached_data = None
    if body.source_type == "chat" and body.source_session_id and body.source_message_id:
        session = await db.chat_sessions.find_one({"_id": ObjectId(body.source_session_id)})
        if session:
            msg = next((m for m in session["messages"] if m["id"] == body.source_message_id), None)
            if msg and msg.get("data"):
                cached_data = {
                    "columns": msg["data"]["columns"],
                    "rows": msg["data"]["rows"],
                    "fetched_at": datetime.now(timezone.utc),
                }
                if not body.chart_config and msg.get("chart_config"):
                    body.chart_config = msg["chart_config"]

    widget_doc = {
        "dashboard_id": ObjectId(dashboard_id),
        "widget_id": widget_id,
        "source_type": body.source_type,
        "source_session_id": body.source_session_id,
        "source_message_id": body.source_message_id,
        "data_binding": body.data_binding,
        "display_type": body.display_type,
        "chart_config": body.chart_config,
        "table_config": body.table_config,
        "position": body.position,
        "title": body.title,
        "auto_refresh": {"enabled": False, "interval_seconds": 300},
        "cached_data": cached_data,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    result = await db.widgets.insert_one(widget_doc)
    widget_doc["_id"] = result.inserted_id

    await ws_manager.broadcast_dashboard_change(dashboard_id, "widget_added", _serialize_widget(widget_doc))
    await snapshot_dashboard(dashboard_id, db, user["_id"], f"Added widget: {body.title}")
    return _serialize_widget(widget_doc)


@router.put("/{dashboard_id}/widgets/{widget_id}")
async def update_widget(
    project_id: str,
    dashboard_id: str,
    widget_id: str,
    body: WidgetUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    old_widget = await db.widgets.find_one({"dashboard_id": ObjectId(dashboard_id), "widget_id": widget_id})
    if not old_widget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Widget not found")

    query_changed = False
    if body.data_binding is not None:
        old_query = old_widget.get("data_binding", {}).get("query")
        new_query = body.data_binding.get("query")
        if old_query != new_query:
            query_changed = True

    display_type_changed = False
    if body.display_type is not None and body.display_type != old_widget.get("display_type"):
        display_type_changed = True

    update: dict = {"updated_at": datetime.now(timezone.utc)}
    for field in ["title", "display_type", "chart_config", "table_config", "position", "data_binding", "auto_refresh", "cached_text"]:
        val = getattr(body, field, None)
        if val is not None:
            update[field] = val

    await db.widgets.update_one(
        {"dashboard_id": ObjectId(dashboard_id), "widget_id": widget_id},
        {"$set": update},
    )
    widget = await db.widgets.find_one({"dashboard_id": ObjectId(dashboard_id), "widget_id": widget_id})

    # Auto refresh cache/chart if query or display mode changed
    if query_changed or (display_type_changed and widget.get("display_type") == "chart"):
        query = widget.get("data_binding", {}).get("query")
        if query:
            try:
                result = await mindsdb.sql_query(query)
                columns = result.get("column_names", [])
                rows = result.get("data", [])
                cached = {"columns": columns, "rows": rows, "fetched_at": datetime.now(timezone.utc)}
                update_fields: dict = {"cached_data": cached, "updated_at": datetime.now(timezone.utc)}

                if widget.get("display_type") == "chart" and columns and rows:
                    org = await db.organizations.find_one({})
                    brand_colors = org.get("settings", {}).get("branding", {}).get("chart_palette") if org else None
                    new_chart = await chart_agent.generate_chart(columns, rows, "auto", brand_colors)
                    update_fields["chart_config"] = new_chart
                    widget["chart_config"] = new_chart

                await db.widgets.update_one({"_id": widget["_id"]}, {"$set": update_fields})
                widget["cached_data"] = cached

                await ws_manager.broadcast_widget_update(
                    dashboard_id, widget_id, cached, widget.get("chart_config")
                )
            except Exception:
                pass

    await snapshot_dashboard(dashboard_id, db, user["_id"], f"Updated widget: {widget.get('title', widget_id)}")
    return _serialize_widget(widget)


@router.delete("/{dashboard_id}/widgets/{widget_id}")
async def delete_widget(
    project_id: str,
    dashboard_id: str,
    widget_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.widgets.delete_one({"dashboard_id": ObjectId(dashboard_id), "widget_id": widget_id})
    await ws_manager.broadcast_dashboard_change(dashboard_id, "widget_removed", {"widget_id": widget_id})
    await snapshot_dashboard(dashboard_id, db, user["_id"], f"Deleted widget {widget_id}")
    return {"status": "deleted"}


@router.post("/{dashboard_id}/widgets/{widget_id}/refresh")
async def refresh_widget(
    project_id: str,
    dashboard_id: str,
    widget_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    widget = await db.widgets.find_one({"dashboard_id": ObjectId(dashboard_id), "widget_id": widget_id})
    if not widget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Widget not found")

    query = widget.get("data_binding", {}).get("query")
    if query:
        try:
            result = await mindsdb.sql_query(query)
            columns = result.get("column_names", [])
            rows = result.get("data", [])
            cached = {"columns": columns, "rows": rows, "fetched_at": datetime.now(timezone.utc)}
            update_fields: dict = {"cached_data": cached, "updated_at": datetime.now(timezone.utc)}

            # Re-generate chart if widget is in chart mode
            if widget.get("display_type") == "chart" and columns and rows:
                org = await db.organizations.find_one({})
                brand_colors = org.get("settings", {}).get("branding", {}).get("chart_palette") if org else None
                new_chart = await chart_agent.generate_chart(columns, rows, "auto", brand_colors)
                update_fields["chart_config"] = new_chart
                widget["chart_config"] = new_chart

            await db.widgets.update_one({"_id": widget["_id"]}, {"$set": update_fields})
            widget["cached_data"] = cached

            await ws_manager.broadcast_widget_update(
                dashboard_id, widget_id, {"columns": columns, "rows": rows}, widget.get("chart_config")
            )
        except Exception as e:
            import logging; logging.getLogger(__name__).warning("refresh_widget failed: %s", e)
    elif widget.get("cached_data"):
        widget["cached_data"]["fetched_at"] = datetime.now(timezone.utc)
        await db.widgets.update_one(
            {"_id": widget["_id"]},
            {"$set": {"cached_data": widget["cached_data"], "updated_at": datetime.now(timezone.utc)}}
        )

    return _serialize_widget(widget)


# ── Layout ──────────────────────────────────────────────────────────────

@router.put("/{dashboard_id}/layout")
async def update_layout(
    project_id: str,
    dashboard_id: str,
    body: LayoutUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    for item in body.layout:
        await db.widgets.update_one(
            {"dashboard_id": ObjectId(dashboard_id), "widget_id": item["widget_id"]},
            {"$set": {"position": {"x": item["x"], "y": item["y"], "w": item["w"], "h": item["h"]}}},
        )

    await ws_manager.broadcast_dashboard_change(
        dashboard_id, "layout_changed", body.layout, exclude_user=user["_id"]
    )
    return {"status": "updated"}


# ── Filters ─────────────────────────────────────────────────────────────

@router.post("/{dashboard_id}/filters")
async def add_filter(
    project_id: str,
    dashboard_id: str,
    body: FilterCreate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    new_filter = await dashboard_service.add_filter(dashboard_id, body.model_dump(), db)
    return new_filter


@router.put("/{dashboard_id}/filters/{filter_id}")
async def apply_filter(
    project_id: str,
    dashboard_id: str,
    filter_id: str,
    body: FilterApply,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    updated = await dashboard_service.apply_filter(dashboard_id, filter_id, body.value, db)

    for widget_data in updated:
        if "error" not in widget_data:
            await ws_manager.broadcast_widget_update(
                dashboard_id,
                widget_data["widget_id"],
                {"columns": widget_data.get("columns", []), "rows": widget_data.get("rows", [])},
                widget_data.get("chart_config"),
            )

    return updated


@router.delete("/{dashboard_id}/filters/{filter_id}")
async def remove_filter(
    project_id: str,
    dashboard_id: str,
    filter_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.dashboards.update_one(
        {"_id": ObjectId(dashboard_id)},
        {"$pull": {"global_filters": {"id": filter_id}}},
    )
    return {"status": "deleted"}


@router.patch("/{dashboard_id}/filters/{filter_id}")
async def update_filter_config(
    project_id: str,
    dashboard_id: str,
    filter_id: str,
    body: FilterConfigUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Edit a filter's options, default value, or bound widgets (user-editable)."""
    set_fields = {
        f"global_filters.$.{k}": v
        for k, v in body.model_dump(exclude_none=True).items()
    }
    if not set_fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    result = await db.dashboards.update_one(
        {"_id": ObjectId(dashboard_id), "global_filters.id": filter_id},
        {"$set": set_fields},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Filter not found")
    dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
    return next((f for f in dashboard.get("global_filters", []) if f["id"] == filter_id), {})


@router.put("/{dashboard_id}/filters/reorder")
async def reorder_filters(
    project_id: str,
    dashboard_id: str,
    body: FilterReorder,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Persist a new filter ordering (list of filter ids)."""
    dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
    if not dashboard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
    by_id = {f["id"]: f for f in dashboard.get("global_filters", [])}
    reordered = [by_id[fid] for fid in body.order if fid in by_id]
    # Keep any filters not mentioned in the order list at the end.
    reordered += [f for f in dashboard.get("global_filters", []) if f["id"] not in set(body.order)]
    await db.dashboards.update_one(
        {"_id": ObjectId(dashboard_id)}, {"$set": {"global_filters": reordered}}
    )
    return {"status": "reordered"}


@router.post("/{dashboard_id}/suggest-filters")
async def suggest_filters(
    project_id: str,
    dashboard_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Suggest useful global filters based on the dashboard's widget columns/data.

    Uses the org LLM to pick high-value columns and an appropriate filter type
    (select for low-cardinality text, date_range for dates, number_range for
    numeric, search otherwise). Falls back to a heuristic if the LLM is off.
    """
    widgets = await db.widgets.find({"dashboard_id": ObjectId(dashboard_id)}).to_list(100)
    # Gather distinct columns + a few sample values per column.
    samples: dict[str, list] = {}
    for w in widgets:
        data = w.get("cached_data") or {}
        cols = data.get("columns") or []
        rows = data.get("rows") or []
        for i, c in enumerate(cols):
            if c not in samples:
                samples[c] = [r[i] for r in rows[:5] if i < len(r)]
    if not samples:
        return {"suggestions": []}

    existing = {f["column"].lower() for f in (await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})).get("global_filters", [])}

    try:
        import json as _json
        from backend.services.llm_client import call_llm
        catalog = "\n".join(f"- {c}: sample {v[:5]}" for c, v in samples.items())
        prompt = (
            "Given these dashboard columns and sample values, suggest up to 4 useful "
            "global filters. Choose the filter type per column:\n"
            "select (low-cardinality text/category), date_range (dates), "
            "number_range (numeric), search (free text).\n\n"
            f"Columns:\n{catalog}\n\n"
            'Respond with ONLY a JSON array: '
            '[{"column": "...", "type": "select|date_range|number_range|search", "reason": "..."}]'
        )
        text = await call_llm(prompt)
        match = re.search(r"\[.*\]", text, re.DOTALL)
        parsed = _json.loads(match.group(0)) if match else []
        suggestions = [
            s for s in parsed
            if isinstance(s, dict) and s.get("column") in samples
            and s["column"].lower() not in existing
        ][:4]
        if suggestions:
            return {"suggestions": suggestions}
    except Exception as e:
        logging.getLogger(__name__).info("suggest-filters LLM fallback: %s", e)

    # Heuristic fallback — infer type from sample values.
    def _infer(values: list) -> str:
        non_null = [v for v in values if v not in (None, "")]
        if not non_null:
            return "search"
        if all(re.search(r"\d{4}-\d{2}-\d{2}", str(v)) for v in non_null):
            return "date_range"
        if all(_is_number(v) for v in non_null):
            return "number_range"
        return "select" if len(set(map(str, non_null))) <= 20 else "search"

    suggestions = [
        {"column": c, "type": _infer(v), "reason": "Auto-suggested from data"}
        for c, v in samples.items()
        if c.lower() not in existing
    ][:4]
    return {"suggestions": suggestions}


def _is_number(v) -> bool:
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


# ── Sharing ─────────────────────────────────────────────────────────────

@router.post("/{dashboard_id}/share")
async def share_dashboard(
    project_id: str,
    dashboard_id: str,
    body: ShareRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    update = {"is_shared": body.is_shared}
    if body.shared_with:
        update["shared_with"] = [ObjectId(uid) for uid in body.shared_with]
    await db.dashboards.update_one({"_id": ObjectId(dashboard_id)}, {"$set": update})
    return {"status": "shared" if body.is_shared else "unshared"}


# ── Widget Chart/Table Agent ────────────────────────────────────────────

@router.post("/{dashboard_id}/widgets/{widget_id}/chart-agent")
async def widget_chart_agent(
    project_id: str,
    dashboard_id: str,
    widget_id: str,
    body: WidgetAgentRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    widget = await db.widgets.find_one({"dashboard_id": ObjectId(dashboard_id), "widget_id": widget_id})
    if not widget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Widget not found")

    data = widget.get("cached_data") or {}
    if not data.get("columns"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Widget has no data")

    org = await db.organizations.find_one({})
    brand_colors = org.get("settings", {}).get("branding", {}).get("chart_palette") if org else None

    cols = data.get("columns", [])
    rows = data.get("rows", [])
    current_config = widget.get("chart_config")
    if current_config:
        new_config = await chart_agent.modify_chart(body.message, current_config, cols, rows, brand_colors)
    else:
        new_config = await chart_agent.generate_chart(cols, rows, body.message, brand_colors)

    await db.widgets.update_one(
        {"_id": widget["_id"]},
        {"$set": {"chart_config": new_config, "display_type": "chart", "updated_at": datetime.now(timezone.utc)}},
    )

    await ws_manager.broadcast_widget_update(
        dashboard_id, widget_id, data, new_config
    )

    return {"chart_config": new_config, "changes_made": new_config.get("reasoning", "")}


@router.post("/{dashboard_id}/widgets/{widget_id}/table-agent")
async def widget_table_agent(
    project_id: str,
    dashboard_id: str,
    widget_id: str,
    body: WidgetAgentRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    widget = await db.widgets.find_one({"dashboard_id": ObjectId(dashboard_id), "widget_id": widget_id})
    if not widget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Widget not found")

    data = widget.get("cached_data") or {}
    if not data.get("columns"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Widget has no data")

    current_config = widget.get("table_config") or {}
    new_config = await table_agent.process(body.message, current_config, data.get("columns", []), data.get("rows", []))

    await db.widgets.update_one(
        {"_id": widget["_id"]},
        {"$set": {"table_config": new_config, "display_type": "table", "updated_at": datetime.now(timezone.utc)}},
    )

    return {"table_config": new_config, "changes_made": new_config.get("changes_made", "")}


# ── Unified Dashboard Natural-Language Chat ─────────────────────────────

# Operations the dashboard chat genuinely cannot do because neither AntV G2
# (charts) nor AntV S2 (tables) support them. Matched as whole words/phrases so
# legitimate requests like "heatmap" or "roadmap revenue" are not blocked.
import re as _re

_UNSUPPORTED_PATTERNS: list[tuple[str, str]] = [
    (r"\b3d\b|\bthree[- ]dimensional\b", "3D charts"),
    (r"\bchoropleth\b|\bgeo(graphic)?\s*map\b|\bworld\s*map\b|\bon a map\b|\bmap chart\b", "geographic maps"),
    (r"\banimat(e|ed|ion)\b", "animations"),
    (r"\bword\s*cloud\b", "word clouds"),
    (r"\bgantt\b", "Gantt charts"),
]

NOT_SUPPORTED_MSG = (
    "Sorry, that operation isn't supported yet. I can: change the chart type "
    "(bar, line, pie, area, scatter, column), apply a filter, sort, pivot the "
    "table, add conditional formatting, modify colors, or change the underlying query."
)


def _detect_unsupported(message: str) -> str | None:
    """Return a human label for the unsupported operation, or None if supported."""
    low = message.lower()
    for pattern, label in _UNSUPPORTED_PATTERNS:
        if _re.search(pattern, low):
            return label
    return None


async def _save_dashboard_chat_turn(
    db: AsyncIOMotorDatabase,
    dashboard_id: str,
    project_id: str,
    widget_id: str | None,
    user_msg: str,
    assistant_msg: str,
) -> None:
    """Append a user/assistant turn to the dashboard's chat session.

    One rolling session document per dashboard in `dashboard_chat_sessions`;
    each message records the widget it targeted (if any)."""
    now = datetime.now(timezone.utc)
    try:
        await db.dashboard_chat_sessions.update_one(
            {"dashboard_id": ObjectId(dashboard_id)},
            {
                "$setOnInsert": {
                    "dashboard_id": ObjectId(dashboard_id),
                    "project_id": ObjectId(project_id),
                    "created_at": now,
                },
                "$set": {"updated_at": now},
                "$push": {
                    "messages": {
                        "$each": [
                            {"role": "user", "content": user_msg, "widget_id": widget_id, "created_at": now},
                            {"role": "assistant", "content": assistant_msg, "widget_id": widget_id, "created_at": now},
                        ]
                    }
                },
            },
            upsert=True,
        )
    except Exception as e:  # history is best-effort — never fail the chat on it
        import logging
        logging.getLogger(__name__).warning("dashboard chat history save failed: %s", e)


@router.get("/{dashboard_id}/chat/history")
async def dashboard_chat_history(
    project_id: str,
    dashboard_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return the persisted dashboard chat history (most recent 200 messages)."""
    session = await db.dashboard_chat_sessions.find_one({"dashboard_id": ObjectId(dashboard_id)})
    messages = (session or {}).get("messages", [])
    for m in messages:
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
    return {"messages": messages[-200:]}


@router.post("/{dashboard_id}/chat")
async def dashboard_chat(
    project_id: str,
    dashboard_id: str,
    body: DashboardChatRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Natural-language chat that modifies a selected widget.

    Automatically routes to the chart or table agent based on the widget's
    current display_type and keywords in the user message."""
    if not body.widget_id:
        return {"response": "Please click a widget first to select it.", "needs_selection": True}

    # Gate: reject operations neither G2 nor S2 can perform, with a helpful hint.
    unsupported = _detect_unsupported(body.message)
    if unsupported:
        await _save_dashboard_chat_turn(
            db, dashboard_id, project_id, body.widget_id, body.message, NOT_SUPPORTED_MSG
        )
        return {"response": NOT_SUPPORTED_MSG, "unsupported": True, "operation": unsupported}

    # Local helper: persist the turn, then return the response payload.
    async def _respond(result: dict, summary: str) -> dict:
        await _save_dashboard_chat_turn(
            db, dashboard_id, project_id, body.widget_id, body.message, summary
        )
        return result

    widget = await db.widgets.find_one(
        {"dashboard_id": ObjectId(dashboard_id), "widget_id": body.widget_id}
    )
    if not widget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Widget not found")

    data = widget.get("cached_data") or {}
    if not data.get("columns"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Widget has no cached data. Refresh the widget first.",
        )

    org = await db.organizations.find_one({})
    brand_colors = (
        org.get("settings", {}).get("branding", {}).get("chart_palette") if org else None
    )

    # ── Check if we should modify the SQL query via natural language ──
    msg_lower = body.message.lower()
    query_keywords = {"query", "sql", "select", "where", "limit", "join", "group by", "order by", "filter data", "show only", "change data", "sum", "count", "average", "avg", "max", "min"}
    is_query_mod = any(kw in msg_lower for kw in query_keywords) or "query" in msg_lower or "sql" in msg_lower

    if is_query_mod:
        current_query = widget.get("data_binding", {}).get("query", "")
        if current_query:
            try:
                from backend.services.llm_client import call_llm
                prompt = (
                    "You are an expert SQL Assistant. Your task is to modify the existing SQL query based on the user's natural language request.\n\n"
                    f"Existing SQL Query:\n{current_query}\n\n"
                    f"User Request:\n{body.message}\n\n"
                    f"Available Columns: {', '.join(data.get('columns', []))}\n\n"
                    "Rules:\n"
                    "1. Output ONLY the modified SQL query. Do not include markdown code block formatting (like ```sql), explanations, or any other text.\n"
                    "2. Maintain the same database/table names (e.g. `conn_xxxx.tablename`) as the original query.\n"
                    "3. Output a single valid SQL query.\n\n"
                    "Modified SQL Query:"
                )
                new_query_raw = await call_llm(prompt, org)
                new_query = new_query_raw.strip().replace("```sql", "").replace("```", "").strip()

                result = await mindsdb.sql_query(new_query)
                columns = result.get("column_names", [])
                rows = result.get("data", [])
                cached = {"columns": columns, "rows": rows, "fetched_at": datetime.now(timezone.utc)}

                update_fields = {
                    "data_binding.query": new_query,
                    "cached_data": cached,
                    "updated_at": datetime.now(timezone.utc)
                }

                chart_config = None
                if widget.get("display_type") == "chart" and columns and rows:
                    chart_config = await chart_agent.generate_chart(columns, rows, "auto", brand_colors)
                    update_fields["chart_config"] = chart_config

                await db.widgets.update_one({"_id": widget["_id"]}, {"$set": update_fields})

                await ws_manager.broadcast_widget_update(
                    dashboard_id, body.widget_id, cached, chart_config or widget.get("chart_config")
                )

                return await _respond(
                    {
                        "display_type": widget.get("display_type"),
                        "changes_made": f"Modified SQL query: '{new_query}'",
                        "chart_config": chart_config or widget.get("chart_config"),
                    },
                    f"Modified the query: {new_query}",
                )
            except Exception as e:
                import logging; logging.getLogger(__name__).warning("SQL mod failed: %s", e)

    # Decide routing: prefer explicit chart/table keywords, fall back to display_type
    chart_keywords = {"chart", "pie", "bar", "line", "area", "scatter", "histogram", "column", "graph", "plot", "visualize", "visualization"}
    table_keywords = {"table", "sort", "filter", "conditional", "highlight", "color row", "format", "column width"}

    force_chart = any(kw in msg_lower for kw in chart_keywords)
    force_table = any(kw in msg_lower for kw in table_keywords)

    use_table = force_table or (not force_chart and widget.get("display_type") == "table")

    if use_table:
        current_config = widget.get("table_config") or {}
        new_config = await table_agent.process(
            body.message, current_config, data.get("columns", []), data.get("rows", [])
        )
        await db.widgets.update_one(
            {"_id": widget["_id"]},
            {
                "$set": {
                    "table_config": new_config,
                    "display_type": "table",
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        await ws_manager.broadcast_widget_update(dashboard_id, body.widget_id, data, None)
        return await _respond(
            {
                "display_type": "table",
                "table_config": new_config,
                "changes_made": new_config.get("changes_made", "Table updated"),
            },
            new_config.get("changes_made", "Table updated"),
        )
    else:
        current_config = widget.get("chart_config")
        if current_config:
            new_config = await chart_agent.modify_chart(
                body.message, current_config, data.get("columns", []), data.get("rows", []), brand_colors
            )
        else:
            new_config = await chart_agent.generate_chart(
                data.get("columns", []), data.get("rows", []), body.message, brand_colors
            )
        await db.widgets.update_one(
            {"_id": widget["_id"]},
            {
                "$set": {
                    "chart_config": new_config,
                    "display_type": "chart",
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        await ws_manager.broadcast_widget_update(dashboard_id, body.widget_id, data, new_config)
        return await _respond(
            {
                "display_type": "chart",
                "chart_config": new_config,
                "changes_made": new_config.get("reasoning", "Chart updated"),
            },
            new_config.get("reasoning", "Chart updated"),
        )


# ── Dashboard Rendering (for Telegram/PDF) ──────────────────────────────

@router.get("/{dashboard_id}/render")
async def render_dashboard(
    project_id: str,
    dashboard_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    widgets = await db.widgets.find({"dashboard_id": ObjectId(dashboard_id)}).to_list(100)
    widget_images = []

    for widget in widgets:
        if widget.get("display_type") == "chart" and widget.get("chart_config"):
            try:
                from backend.services.pdf_service import _render_g2_to_png

                config = widget["chart_config"]
                cached = widget.get("cached_data") or {}
                g2_spec = config.get("g2_spec")
                img_bytes = None

                if g2_spec:
                    img_bytes = _render_g2_to_png(
                        g2_spec,
                        cached.get("columns", []),
                        cached.get("rows", []),
                    )

                if not img_bytes:
                    # Legacy Plotly fallback for older widgets
                    try:
                        import plotly.graph_objects as go
                        import plotly.io as pio

                        fig = go.Figure(
                            data=config.get("plotly_data", []),
                            layout=config.get("plotly_layout", {}),
                        )
                        fig.update_layout(
                            paper_bgcolor="white", plot_bgcolor="white", width=700, height=400
                        )
                        img_bytes = pio.to_image(fig, format="png", engine="kaleido")
                    except Exception:
                        pass

                if img_bytes:
                    widget_images.append({
                        "widget_id": widget["widget_id"],
                        "title": widget.get("title", ""),
                        "image_base64": base64.b64encode(img_bytes).decode(),
                    })
            except Exception:
                continue

    return {"widget_images": widget_images}


# ── AI Summary Widget ────────────────────────────────────────────────────

@router.post("/{dashboard_id}/summary-widget")
async def create_summary_widget(
    project_id: str,
    dashboard_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Create (or regenerate) the AI executive summary widget for this dashboard."""
    await get_current_project(project_id, user, db)
    dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
    if not dashboard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")

    # Gather all widget data for context
    widgets = await db.widgets.find({"dashboard_id": ObjectId(dashboard_id)}).to_list(100)
    summary_data = []
    for w in widgets:
        if w.get("display_type") == "ai_summary":
            continue
        cached = w.get("cached_data") or {}
        if cached.get("rows"):
            summary_data.append({
                "title": w.get("title", ""),
                "columns": cached.get("columns", []),
                "rows": cached["rows"][:10],
            })

    summary_text = ""
    if summary_data:
        try:
            import json
            from backend.services.llm_client import call_llm
            prompt = (
                f"Write a 4-6 sentence executive summary for the '{dashboard['name']}' dashboard.\n"
                f"Widget data:\n{json.dumps(summary_data, default=str)}\n"
                "Be specific with numbers. Professional tone. No bullet points or headings."
            )
            summary_text = await call_llm(prompt)
        except Exception:
            summary_text = ""

    # Check if a summary widget already exists — update it instead of creating a new one
    existing = await db.widgets.find_one({
        "dashboard_id": ObjectId(dashboard_id),
        "display_type": "ai_summary",
    })
    if existing:
        await db.widgets.update_one(
            {"_id": existing["_id"]},
            {"$set": {"cached_text": summary_text, "updated_at": datetime.now(timezone.utc)}},
        )
        existing["cached_text"] = summary_text
        return _serialize_widget(existing)

    existing_count = await db.widgets.count_documents({"dashboard_id": ObjectId(dashboard_id)})
    widget_id = f"w{existing_count + 1}"
    widget_doc = {
        "dashboard_id": ObjectId(dashboard_id),
        "widget_id": widget_id,
        "source_type": "ai",
        "display_type": "ai_summary",
        "title": "Executive Summary",
        "position": {"x": 0, "y": 0, "w": 12, "h": 3},
        "cached_text": summary_text,
        "cached_data": None,
        "chart_config": None,
        "table_config": None,
        "data_binding": {},
        "auto_refresh": {"enabled": False, "interval_seconds": 300},
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.widgets.insert_one(widget_doc)
    widget_doc["_id"] = result.inserted_id
    return _serialize_widget(widget_doc)


# ── PDF Export ──────────────────────────────────────────────────────────

@router.post("/{dashboard_id}/pdf")
async def export_pdf(
    project_id: str,
    dashboard_id: str,
    body: PDFExportRequest = PDFExportRequest(),
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    from backend.services.pdf_service import pdf_service
    from fastapi.responses import Response

    dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
    if not dashboard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")

    pdf_bytes = await pdf_service.generate_dashboard_pdf(
        dashboard_id,
        db,
        body.chart_images,
        options={
            "theme": body.theme,
            "grid_width_px": body.grid_width_px,
            "columns": body.columns,
            "layout": body.layout,
        },
    )
    filename = f"{dashboard['name'].replace(' ', '_')}_{datetime.now().strftime('%Y-%m-%d')}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )


# ── PPTX Export ─────────────────────────────────────────────────────────────

@router.get("/{dashboard_id}/pptx/presenton")
async def list_pptx_presentations(
    project_id: str,
    dashboard_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List past Presenton presentations for this dashboard (newest first)."""
    cursor = db.pptx_presentations.find(
        {"dashboard_id": ObjectId(dashboard_id)},
        sort=[("created_at", -1)],
        limit=10,
    )
    docs = await cursor.to_list(10)
    return [
        {
            "presentation_id": d["presentation_id"],
            "edit_path": d["edit_path"],
            "download_path": d.get("download_path", ""),
            "feedback": d.get("feedback"),
            "created_at": d["created_at"].isoformat(),
        }
        for d in docs
    ]


@router.post("/{dashboard_id}/pptx/presenton")
async def generate_pptx_presenton(
    project_id: str,
    dashboard_id: str,
    body: PresentonGenerateRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Generate presentation via Presenton; saves metadata to MongoDB and returns presentation_id + edit_path."""
    from backend.services.pptx_service import pptx_service

    dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
    if not dashboard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")

    try:
        pid, edit_path, download_path = await pptx_service.presenton_generate(
            dashboard_id, db, feedback=body.feedback
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    # Persist metadata so the history panel can reload past presentations
    await db.pptx_presentations.insert_one({
        "dashboard_id": ObjectId(dashboard_id),
        "project_id": ObjectId(project_id),
        "user_id": ObjectId(user["_id"]),
        "presentation_id": pid,
        "edit_path": edit_path,
        "download_path": download_path,
        "feedback": body.feedback,
        "created_at": datetime.now(timezone.utc),
    })

    return {"presentation_id": pid, "edit_path": edit_path, "download_path": download_path}


@router.post("/{dashboard_id}/pptx/presenton/async")
async def queue_pptx_presenton(
    project_id: str,
    dashboard_id: str,
    body: PresentonGenerateRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Queue a Presenton generation job and return a job_id immediately.

    The actual generation runs as a server-side background task with no time limit.
    The user polls ``GET .../pptx/presenton/jobs`` (or just reopens the modal) to
    check status — there is no need to keep the browser open.
    """
    from backend.services.pptx_service import run_presenton_job

    dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
    if not dashboard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")

    result = await db.pptx_jobs.insert_one({
        "dashboard_id": ObjectId(dashboard_id),
        "project_id": ObjectId(project_id),
        "user_id": ObjectId(user["_id"]),
        "feedback": body.feedback,
        "status": "queued",
        "presentation_id": None,
        "edit_path": None,
        "download_path": None,
        "error": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    job_id = str(result.inserted_id)

    background_tasks.add_task(run_presenton_job, job_id, db)

    return {"job_id": job_id}


@router.get("/{dashboard_id}/pptx/presenton/jobs")
async def list_pptx_jobs(
    project_id: str,
    dashboard_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List PPTX generation jobs for this dashboard, newest first."""
    cursor = db.pptx_jobs.find(
        {"dashboard_id": ObjectId(dashboard_id)},
        sort=[("created_at", -1)],
        limit=20,
    )
    docs = await cursor.to_list(20)
    return [
        {
            "job_id": str(d["_id"]),
            "status": d["status"],
            "feedback": d.get("feedback"),
            "presentation_id": d.get("presentation_id"),
            "edit_path": d.get("edit_path"),
            "download_path": d.get("download_path"),
            "error": d.get("error"),
            "created_at": d["created_at"].isoformat(),
            "updated_at": d["updated_at"].isoformat(),
        }
        for d in docs
    ]


@router.get("/{dashboard_id}/pptx/presenton/{presentation_id}/download")
async def download_pptx_presenton(
    project_id: str,
    dashboard_id: str,
    presentation_id: str,
    download_path: str = "",
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Proxy PPTX download from Presenton."""
    from backend.services.pptx_service import pptx_service
    from fastapi.responses import Response as FastResponse

    # Resolve download_path from MongoDB if not supplied by caller
    if not download_path:
        doc = await db.pptx_presentations.find_one({"presentation_id": presentation_id})
        if doc:
            download_path = doc.get("download_path", "")

    try:
        pptx_bytes = await pptx_service.presenton_download(presentation_id, download_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
    name = dashboard["name"].replace(" ", "_") if dashboard else "presentation"
    filename = f"{name}_{datetime.now().strftime('%Y-%m-%d')}.pptx"

    return FastResponse(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
