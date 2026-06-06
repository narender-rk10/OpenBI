"""Schedule routes — CRUD for automated report delivery."""

from datetime import datetime, timezone

from bson import ObjectId
from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.deps import get_current_project, get_current_user, get_db
from backend.services.scheduler_service import register_schedule, unregister_schedule

router = APIRouter(prefix="/api/projects/{project_id}/schedules")


class ScheduleCreate(BaseModel):
    name: str = ""
    cron: str = "0 8 * * 1"
    # A schedule snapshots and delivers a specific dashboard.
    dashboard_id: str | None = None
    parameters: dict = {}
    delivery: dict = {}
    is_active: bool = True


class ScheduleUpdate(BaseModel):
    name: str | None = None
    cron: str | None = None
    dashboard_id: str | None = None
    parameters: dict | None = None
    delivery: dict | None = None
    is_active: bool | None = None


def _compute_next_run(cron: str) -> datetime | None:
    try:
        return croniter(cron, datetime.now(timezone.utc)).get_next(datetime)
    except Exception:
        return None


def _serialize(s: dict) -> dict:
    # Stringify every ObjectId field defensively. Older schedule docs may carry
    # extra ObjectId fields (e.g. `template_id` from the removed Templates feature)
    # that FastAPI's JSON encoder can't serialize — converting only a known subset
    # left those records 500-ing on list. Convert all ObjectId values to be safe.
    return {k: (str(v) if isinstance(v, ObjectId) else v) for k, v in s.items()}


def _serialize_run(r: dict) -> dict:
    return {k: (str(v) if isinstance(v, ObjectId) else v) for k, v in r.items()}


@router.get("")
async def list_schedules(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    schedules = await db.schedules.find({"project_id": ObjectId(project_id)}).to_list(100)
    return [_serialize(s) for s in schedules]


@router.post("")
async def create_schedule(
    project_id: str,
    body: ScheduleCreate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)

    if not body.dashboard_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide a dashboard_id to schedule",
        )

    now = datetime.now(timezone.utc)
    doc = {
        "project_id": ObjectId(project_id),
        "dashboard_id": ObjectId(body.dashboard_id) if body.dashboard_id else None,
        "name": body.name or f"Schedule {now.strftime('%Y-%m-%d')}",
        "cron": body.cron,
        "parameters": body.parameters,
        "delivery": body.delivery,
        "is_active": body.is_active,
        "last_run_at": None,
        "last_run_status": None,
        "last_run_error": None,
        "next_run_at": _compute_next_run(body.cron),
        "created_by": ObjectId(user["_id"]),
        "created_at": now,
        "updated_at": now,
    }

    result = await db.schedules.insert_one(doc)
    doc["_id"] = result.inserted_id

    if body.is_active:
        register_schedule(str(result.inserted_id), body.cron)

    return _serialize(doc)


# Must be defined before /{schedule_id} to avoid path conflict
@router.get("/runs")
async def list_runs(
    project_id: str,
    limit: int = 100,
    schedule_id: str | None = None,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return recent run history for the project, newest first."""
    await get_current_project(project_id, user, db)
    query: dict = {"project_id": ObjectId(project_id)}
    if schedule_id:
        query["schedule_id"] = ObjectId(schedule_id)
    runs = (
        await db.schedule_runs.find(query)
        .sort("started_at", -1)
        .limit(min(limit, 500))
        .to_list(min(limit, 500))
    )
    return [_serialize_run(r) for r in runs]


@router.get("/{schedule_id}")
async def get_schedule(
    project_id: str,
    schedule_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    schedule = await db.schedules.find_one({"_id": ObjectId(schedule_id)})
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    return _serialize(schedule)


@router.put("/{schedule_id}")
async def update_schedule(
    project_id: str,
    schedule_id: str,
    body: ScheduleUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    update: dict = {"updated_at": datetime.now(timezone.utc)}

    if body.name is not None:
        update["name"] = body.name
    if body.cron is not None:
        update["cron"] = body.cron
        update["next_run_at"] = _compute_next_run(body.cron)
    if body.dashboard_id is not None:
        update["dashboard_id"] = ObjectId(body.dashboard_id)
    if body.parameters is not None:
        update["parameters"] = body.parameters
    if body.delivery is not None:
        update["delivery"] = body.delivery
    if body.is_active is not None:
        update["is_active"] = body.is_active

    await db.schedules.update_one({"_id": ObjectId(schedule_id)}, {"$set": update})
    schedule = await db.schedules.find_one({"_id": ObjectId(schedule_id)})

    # Sync with in-process scheduler
    if schedule:
        if schedule.get("is_active"):
            register_schedule(schedule_id, schedule["cron"])
        else:
            unregister_schedule(schedule_id)

    return _serialize(schedule)


@router.delete("/{schedule_id}")
async def delete_schedule(
    project_id: str,
    schedule_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    unregister_schedule(schedule_id)
    await db.schedules.delete_one({"_id": ObjectId(schedule_id)})
    return {"status": "deleted"}
