"""Public dashboard routes — read-only access via share token."""

from datetime import datetime, timezone
from secrets import token_urlsafe

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.deps import get_current_user, get_db

router = APIRouter()


class PublicShareRequest(BaseModel):
    enabled: bool = True
    expires_in_days: int | None = None


def _serialize(doc: dict) -> dict:
    out = {**doc}
    out["_id"] = str(out["_id"])
    for key in ("project_id", "user_id", "dashboard_id"):
        if key in out and isinstance(out[key], ObjectId):
            out[key] = str(out[key])
    return out


# ── Token management (authenticated) ────────────────────────────────────

@router.post("/api/dashboards/{dashboard_id}/public")
async def enable_public_share(
    dashboard_id: str,
    body: PublicShareRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Mint or revoke a public share token for a dashboard."""
    dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
    if not dashboard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
    if str(dashboard["user_id"]) != user["_id"] and user.get("role") not in ("super_admin", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    if not body.enabled:
        await db.dashboards.update_one(
            {"_id": ObjectId(dashboard_id)},
            {"$unset": {"public_token": "", "public_expires_at": ""}},
        )
        return {"enabled": False}

    token = dashboard.get("public_token") or token_urlsafe(24)
    update: dict = {"public_token": token}
    if body.expires_in_days:
        from datetime import timedelta

        update["public_expires_at"] = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)
    else:
        await db.dashboards.update_one(
            {"_id": ObjectId(dashboard_id)},
            {"$unset": {"public_expires_at": ""}},
        )
    await db.dashboards.update_one({"_id": ObjectId(dashboard_id)}, {"$set": update})
    return {
        "enabled": True,
        "token": token,
        "expires_at": update.get("public_expires_at"),
    }


# ── Public read endpoint (no auth) ──────────────────────────────────────

@router.get("/api/public/{token}")
async def public_dashboard(
    token: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    dashboard = await db.dashboards.find_one({"public_token": token})
    if not dashboard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    expires = dashboard.get("public_expires_at")
    if expires and expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share link expired")

    widgets = await db.widgets.find({"dashboard_id": dashboard["_id"]}).to_list(100)

    # Strip anything that would let viewers re-run queries or learn schema.
    safe_dashboard = {
        "_id": str(dashboard["_id"]),
        "name": dashboard.get("name", ""),
        "description": dashboard.get("description", ""),
        "global_filters": [
            {k: v for k, v in f.items() if k != "bound_widget_ids"}
            for f in dashboard.get("global_filters", [])
        ],
        "auto_refresh": dashboard.get("auto_refresh", {"enabled": False}),
    }
    safe_widgets = []
    for w in widgets:
        safe_widgets.append({
            "_id": str(w["_id"]),
            "widget_id": w.get("widget_id"),
            "title": w.get("title", ""),
            "display_type": w.get("display_type", "chart"),
            "chart_config": w.get("chart_config"),
            "table_config": w.get("table_config"),
            "position": w.get("position", {}),
            "cached_data": w.get("cached_data", {}),
        })
    return {"dashboard": safe_dashboard, "widgets": safe_widgets}
