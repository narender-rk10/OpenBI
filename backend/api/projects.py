"""Project CRUD routes + MindsDB project creation."""

from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.deps import get_current_user, get_db
from backend.services.mindsdb_client import MindsDBError, mindsdb

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


def _serialize(p: dict) -> dict:
    p = {**p}
    p["_id"] = str(p["_id"])
    p["org_id"] = str(p["org_id"])
    p["created_by"] = str(p["created_by"])
    return p


@router.get("")
async def list_projects(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List all projects in the user's org."""
    projects = await db.projects.find({
        "org_id": ObjectId(user["org_id"]),
        "is_active": True,
    }).sort("created_at", -1).to_list(200)
    return [_serialize(p) for p in projects]


@router.post("")
async def create_project(
    body: ProjectCreate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Create a new project + MindsDB project."""
    mindsdb_name = f"proj_{uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)

    # Create MindsDB project
    try:
        await mindsdb.create_project(mindsdb_name)
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)

    project_doc = {
        "name": body.name,
        "description": body.description,
        "org_id": ObjectId(user["org_id"]),
        "created_by": ObjectId(user["_id"]),
        "mindsdb_project_name": mindsdb_name,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }

    try:
        result = await db.projects.insert_one(project_doc)
    except Exception:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project name already exists")

    project_doc["_id"] = result.inserted_id
    return _serialize(project_doc)


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get a single project."""
    project = await db.projects.find_one({
        "_id": ObjectId(project_id),
        "org_id": ObjectId(user["org_id"]),
        "is_active": True,
    })
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return _serialize(project)


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update project name/description. Does NOT rename MindsDB project."""
    update: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.name is not None:
        update["name"] = body.name
    if body.description is not None:
        update["description"] = body.description

    result = await db.projects.update_one(
        {"_id": ObjectId(project_id), "org_id": ObjectId(user["org_id"])},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    return _serialize(project)


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Soft-delete project."""
    project = await db.projects.find_one({
        "_id": ObjectId(project_id),
        "org_id": ObjectId(user["org_id"]),
    })
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Optionally delete from MindsDB
    try:
        await mindsdb.drop_project(project["mindsdb_project_name"])
    except MindsDBError:
        pass  # non-critical

    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"status": "deleted"}
