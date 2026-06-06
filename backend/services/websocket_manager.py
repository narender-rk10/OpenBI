"""WebSocket connection manager for real-time dashboard updates."""

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections per dashboard."""

    def __init__(self):
        # {dashboard_id: {user_id: WebSocket}}
        self.active_connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, dashboard_id: str, user_id: str):
        await websocket.accept()
        if dashboard_id not in self.active_connections:
            self.active_connections[dashboard_id] = {}
        self.active_connections[dashboard_id][user_id] = websocket

    def disconnect(self, dashboard_id: str, user_id: str):
        if dashboard_id in self.active_connections:
            self.active_connections[dashboard_id].pop(user_id, None)
            if not self.active_connections[dashboard_id]:
                del self.active_connections[dashboard_id]

    async def send_to_user(self, dashboard_id: str, user_id: str, message: dict):
        """Send message to a specific user on a dashboard."""
        conn = self.active_connections.get(dashboard_id, {}).get(user_id)
        if conn:
            try:
                await conn.send_json(message)
            except Exception:
                self.disconnect(dashboard_id, user_id)

    async def broadcast(self, dashboard_id: str, message: dict, exclude_user: str | None = None):
        """Broadcast message to all users viewing a dashboard."""
        connections = self.active_connections.get(dashboard_id, {})
        disconnected = []
        for user_id, ws in connections.items():
            if user_id == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(user_id)

        for uid in disconnected:
            self.disconnect(dashboard_id, uid)

    async def broadcast_widget_update(
        self,
        dashboard_id: str,
        widget_id: str,
        data: dict,
        chart_config: dict | None = None,
        exclude_user: str | None = None,
    ):
        """Send widget data update to all dashboard viewers."""
        message = {
            "type": "widget_update",
            "widget_id": widget_id,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if chart_config:
            message["chart_config"] = chart_config

        await self.broadcast(dashboard_id, message, exclude_user)

    async def broadcast_filter_options(self, dashboard_id: str, filter_id: str, options: list):
        """Send refreshed filter options."""
        await self.broadcast(dashboard_id, {
            "type": "filter_options_refresh",
            "filter_id": filter_id,
            "options": options,
        })

    async def broadcast_dashboard_change(self, dashboard_id: str, change: str, data: Any = None, exclude_user: str | None = None):
        """Notify about dashboard structural changes."""
        await self.broadcast(dashboard_id, {
            "type": "dashboard_changed",
            "change": change,
            "data": data,
        }, exclude_user)

    def get_viewer_count(self, dashboard_id: str) -> int:
        return len(self.active_connections.get(dashboard_id, {}))


ws_manager = ConnectionManager()
