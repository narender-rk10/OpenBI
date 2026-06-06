"""Dashboard version snapshot helper. Used by mutation endpoints to record history."""

from datetime import datetime, timezone

from bson import ObjectId


async def snapshot_dashboard(dashboard_id: str, db, changed_by: str, description: str) -> None:
    """Insert an immutable snapshot of the current dashboard + widgets."""
    try:
        oid = ObjectId(dashboard_id)
    except Exception:
        return

    dashboard = await db.dashboards.find_one({"_id": oid})
    if not dashboard:
        return

    widgets = await db.widgets.find({"dashboard_id": oid}).to_list(200)
    version_count = await db.dashboard_versions.count_documents({"dashboard_id": oid})

    await db.dashboard_versions.insert_one({
        "dashboard_id": oid,
        "version_number": version_count + 1,
        "snapshot": {
            "dashboard": _strip_ids(dashboard),
            "widgets": [_strip_ids(w) for w in widgets],
        },
        "changed_by": ObjectId(changed_by) if changed_by else None,
        "change_description": description,
        "created_at": datetime.now(timezone.utc),
    })


def _strip_ids(doc: dict) -> dict:
    """Recursively coerce ObjectId → str so the snapshot is BSON-safe and JSON-friendly."""
    out: dict = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, dict):
            out[k] = _strip_ids(v)
        elif isinstance(v, list):
            out[k] = [_strip_ids(x) if isinstance(x, dict) else (str(x) if isinstance(x, ObjectId) else x) for x in v]
        else:
            out[k] = v
    return out
