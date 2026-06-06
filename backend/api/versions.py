"""Dashboard version history — list, retrieve, revert."""

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.api.deps import get_current_user, get_db

router = APIRouter()


def _serialize_version(v: dict) -> dict:
    return {
        "_id": str(v["_id"]),
        "dashboard_id": str(v["dashboard_id"]),
        "version_number": v["version_number"],
        "change_description": v.get("change_description", ""),
        "changed_by": str(v["changed_by"]) if v.get("changed_by") else None,
        "created_at": v["created_at"],
    }


@router.get("/api/dashboards/{dashboard_id}/versions")
async def list_versions(
    dashboard_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
    if not dashboard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")

    versions = await db.dashboard_versions.find(
        {"dashboard_id": ObjectId(dashboard_id)}
    ).sort("version_number", -1).to_list(100)
    return [_serialize_version(v) for v in versions]


@router.get("/api/dashboards/{dashboard_id}/versions/{version_id}")
async def get_version(
    dashboard_id: str,
    version_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    version = await db.dashboard_versions.find_one({
        "_id": ObjectId(version_id),
        "dashboard_id": ObjectId(dashboard_id),
    })
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    return {
        **_serialize_version(version),
        "snapshot": version.get("snapshot", {}),
    }


@router.post("/api/dashboards/{dashboard_id}/versions/{version_id}/revert")
async def revert_version(
    dashboard_id: str,
    version_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Replace the live dashboard + widgets with a stored snapshot.

    The current state is snapshotted first so revert itself is undoable.
    """
    version = await db.dashboard_versions.find_one({
        "_id": ObjectId(version_id),
        "dashboard_id": ObjectId(dashboard_id),
    })
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    # Snapshot current state before clobbering
    from backend.services.version_service import snapshot_dashboard
    await snapshot_dashboard(
        dashboard_id, db, user["_id"], f"Auto-snapshot before revert to v{version['version_number']}"
    )

    snapshot = version.get("snapshot", {})
    snap_dashboard = snapshot.get("dashboard", {})
    snap_widgets = snapshot.get("widgets", [])

    # Apply dashboard fields (skip _id, project_id, user_id, created_at — keep originals)
    update_fields = {
        k: v for k, v in snap_dashboard.items()
        if k in ("name", "description", "layout", "global_filters", "auto_refresh", "is_shared", "shared_with")
    }
    update_fields["updated_at"] = datetime.now(timezone.utc)
    await db.dashboards.update_one({"_id": ObjectId(dashboard_id)}, {"$set": update_fields})

    # Replace widgets wholesale
    await db.widgets.delete_many({"dashboard_id": ObjectId(dashboard_id)})
    for w in snap_widgets:
        new_widget = {k: v for k, v in w.items() if k not in ("_id", "dashboard_id")}
        new_widget["dashboard_id"] = ObjectId(dashboard_id)
        new_widget["updated_at"] = datetime.now(timezone.utc)
        await db.widgets.insert_one(new_widget)

    return {"status": "reverted", "version_number": version["version_number"]}
