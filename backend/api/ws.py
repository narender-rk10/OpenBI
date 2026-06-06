"""WebSocket endpoint for real-time dashboard updates."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from backend.core.security import decode_access_token
from backend.services.websocket_manager import ws_manager
from backend.services.dashboard_service import dashboard_service
from backend.core.database import get_db

router = APIRouter()


@router.websocket("/ws/dashboard/{dashboard_id}")
async def dashboard_websocket(
    websocket: WebSocket,
    dashboard_id: str,
    token: str = Query(default=""),
):
    """WebSocket for real-time dashboard updates — filters, widget refresh, collaboration."""
    # Verify JWT
    try:
        payload = decode_access_token(token)
        user_id = payload.get("user_id", "anonymous")
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await ws_manager.connect(websocket, dashboard_id, user_id)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "filter_change":
                filter_id = data.get("filter_id")
                value = data.get("value")
                db = get_db()

                try:
                    updated = await dashboard_service.apply_filter(dashboard_id, filter_id, value, db)
                    for widget_data in updated:
                        if "error" not in widget_data:
                            await ws_manager.broadcast_widget_update(
                                dashboard_id,
                                widget_data["widget_id"],
                                {"columns": widget_data.get("columns", []), "rows": widget_data.get("rows", [])},
                                widget_data.get("chart_config"),
                            )
                        else:
                            await ws_manager.broadcast(dashboard_id, {
                                "type": "widget_error",
                                "widget_id": widget_data["widget_id"],
                                "error": widget_data["error"],
                            })
                except Exception as e:
                    await websocket.send_json({"type": "error", "message": str(e)})

            elif msg_type == "refresh_widget":
                widget_id = data.get("widget_id")
                db = get_db()
                from bson import ObjectId

                widget = await db.widgets.find_one({
                    "dashboard_id": ObjectId(dashboard_id),
                    "widget_id": widget_id,
                })
                if widget and widget.get("data_binding", {}).get("query"):
                    try:
                        from backend.services.mindsdb_client import mindsdb
                        result = await mindsdb.sql_query(widget["data_binding"]["query"])
                        columns = result.get("column_names", [])
                        rows = result.get("data", [])

                        from datetime import datetime, timezone
                        await db.widgets.update_one(
                            {"_id": widget["_id"]},
                            {"$set": {"cached_data": {"columns": columns, "rows": rows, "fetched_at": datetime.now(timezone.utc)}}},
                        )

                        chart_config = None
                        if widget.get("display_type") == "chart":
                            from backend.services.chart_agent import chart_agent
                            org = await db.organizations.find_one({})
                            brand_colors = org["settings"]["branding"]["chart_palette"] if org else None
                            chart_config = await chart_agent.generate_chart(columns, rows, "auto", brand_colors)
                            await db.widgets.update_one({"_id": widget["_id"]}, {"$set": {"chart_config": chart_config}})

                        await ws_manager.broadcast_widget_update(
                            dashboard_id, widget_id,
                            {"columns": columns, "rows": rows},
                            chart_config,
                        )
                    except Exception as e:
                        await ws_manager.broadcast(dashboard_id, {
                            "type": "widget_error",
                            "widget_id": widget_id,
                            "error": str(e),
                        })

            elif msg_type == "refresh_all":
                db = get_db()
                from bson import ObjectId
                widgets = await db.widgets.find({"dashboard_id": ObjectId(dashboard_id)}).to_list(100)
                for widget in widgets:
                    if widget.get("data_binding", {}).get("query"):
                        try:
                            from backend.services.mindsdb_client import mindsdb
                            result = await mindsdb.sql_query(widget["data_binding"]["query"])
                            await ws_manager.broadcast_widget_update(
                                dashboard_id,
                                widget["widget_id"],
                                {"columns": result.get("column_names", []), "rows": result.get("data", [])},
                            )
                        except Exception:
                            pass

    except WebSocketDisconnect:
        ws_manager.disconnect(dashboard_id, user_id)
    except Exception:
        ws_manager.disconnect(dashboard_id, user_id)
