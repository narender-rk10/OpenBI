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

    # Check name uniqueness against active projects only
    existing = await db.projects.find_one({
        "org_id": ObjectId(user["org_id"]),
        "name": body.name,
        "is_active": True,
    })
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project name already exists")

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
    """Delete project and all related MindsDB + MongoDB resources."""
    project = await db.projects.find_one({
        "_id": ObjectId(project_id),
        "org_id": ObjectId(user["org_id"]),
    })
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    pid = ObjectId(project_id)
    mindsdb_project = project["mindsdb_project_name"]

    # 1. Drop MindsDB agents
    agents = await db.agents.find({"project_id": pid}).to_list(200)
    for agent in agents:
        try:
            await mindsdb.delete_agent(mindsdb_project, agent["mindsdb_agent_name"])
        except MindsDBError:
            pass

    # 2. Drop MindsDB knowledge bases
    kbs = await db.knowledge_bases.find({"project_id": pid}).to_list(200)
    for kb in kbs:
        try:
            await mindsdb.delete_knowledge_base(mindsdb_project, kb["mindsdb_kb_name"])
        except MindsDBError:
            pass

    # 3. Drop MindsDB connection databases (conn_*)
    conns = await db.connections.find({"project_id": pid}).to_list(200)
    for conn in conns:
        db_name = conn.get("mindsdb_db_name")
        if db_name:
            try:
                await mindsdb.delete_database(db_name)
            except MindsDBError:
                pass

    # 4. Drop the MindsDB project itself
    try:
        await mindsdb.drop_project(mindsdb_project)
    except MindsDBError:
        pass

    # 5. Delete all related MongoDB collections
    await db.agents.delete_many({"project_id": pid})
    await db.knowledge_bases.delete_many({"project_id": pid})
    await db.connections.delete_many({"project_id": pid})
    await db.dashboards.delete_many({"project_id": pid})
    await db.chat_sessions.delete_many({"project_id": pid})
    await db.schedules.delete_many({"project_id": pid})
    await db.projects.delete_one({"_id": pid})

    return {"status": "deleted"}
