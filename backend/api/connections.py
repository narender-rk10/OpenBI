"""Data source connection routes — CRUD, test, table listing."""

import json
from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.deps import get_current_project, get_current_user, get_db
from backend.core.security import decrypt_api_key, encrypt_api_key
from backend.services.mindsdb_client import MindsDBError, mindsdb

router = APIRouter(prefix="/api/projects/{project_id}/connections")


class ConnectionCreate(BaseModel):
    name: str
    engine: str
    category: str = "Database"
    parameters: dict


class ConnectionTest(BaseModel):
    engine: str
    parameters: dict


def _serialize(c: dict) -> dict:
    c = {**c}
    c["_id"] = str(c["_id"])
    c["project_id"] = str(c["project_id"])
    c["created_by"] = str(c["created_by"])
    return c


@router.get("")
async def list_connections(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    project = await get_current_project(project_id, user, db)
    conns = await db.connections.find({"project_id": ObjectId(project_id)}).to_list(200)
    return [_serialize(c) for c in conns]


@router.post("")
async def create_connection(
    project_id: str,
    body: ConnectionCreate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    project = await get_current_project(project_id, user, db)

    # Check name uniqueness BEFORE creating anything in MindsDB
    existing = await db.connections.find_one(
        {"name": body.name, "project_id": ObjectId(project_id)}
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A connection named '{body.name}' already exists in this project",
        )

    mindsdb_db_name = f"conn_{uuid4().hex[:8]}"

    # Create database in MindsDB (sends credentials ONLY to MindsDB)
    try:
        await mindsdb.create_database(mindsdb_db_name, body.engine, body.parameters)
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)

    # Get table list
    tables = []
    try:
        table_list = await mindsdb.list_tables(mindsdb_db_name)
        if isinstance(table_list, list):
            tables = [t.get("name", t) if isinstance(t, dict) else str(t) for t in table_list]
    except MindsDBError:
        pass

    # Store safe params (no password) for display, plus encrypted full params for MindsDB recovery
    safe_params = {k: v for k, v in body.parameters.items() if k not in ("password", "api_key", "credentials", "secret")}

    conn_doc = {
        "project_id": ObjectId(project_id),
        "name": body.name,
        "engine": body.engine,
        "category": body.category,
        "mindsdb_db_name": mindsdb_db_name,
        "connection_params": safe_params,
        "connection_params_encrypted": encrypt_api_key(json.dumps(body.parameters)),
        "status": "connected",
        "tables": tables,
        "last_synced_at": datetime.now(timezone.utc),
        "created_by": ObjectId(user["_id"]),
        "created_at": datetime.now(timezone.utc),
    }

    try:
        result = await db.connections.insert_one(conn_doc)
    except Exception:
        # Clean up MindsDB database if MongoDB insert fails
        try:
            await mindsdb.delete_database(mindsdb_db_name)
        except MindsDBError:
            pass
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Connection name already exists in this project")

    conn_doc["_id"] = result.inserted_id
    return _serialize(conn_doc)


@router.post("/test")
async def test_connection(
    project_id: str,
    body: ConnectionTest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    result = await mindsdb.test_connection(body.engine, body.parameters)
    return result


@router.get("/{conn_id}/tables")
async def list_tables(
    project_id: str,
    conn_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    conn = await db.connections.find_one({"_id": ObjectId(conn_id), "project_id": ObjectId(project_id)})
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    db_name = conn["mindsdb_db_name"]

    # Auto-recover MindsDB database if lost on container restart
    if not await mindsdb.database_exists(db_name):
        if conn.get("connection_params_encrypted"):
            try:
                full_params = json.loads(decrypt_api_key(conn["connection_params_encrypted"]))
                await mindsdb.create_database(db_name, conn["engine"], full_params)
            except MindsDBError as e:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                                    detail=f"Failed to restore connection '{conn['name']}': {e.message}")
        else:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail=f"MindsDB database for '{conn['name']}' is missing and cannot be restored.")

    tables = await mindsdb.list_tables(db_name)
    table_names = [t.get("name", t) if isinstance(t, dict) else str(t) for t in tables] if isinstance(tables, list) else []

    await db.connections.update_one(
        {"_id": ObjectId(conn_id)},
        {"$set": {"tables": table_names, "last_synced_at": datetime.now(timezone.utc)}},
    )
    return table_names


@router.get("/{conn_id}/tables/{table_name}/columns")
async def list_columns(
    project_id: str,
    conn_id: str,
    table_name: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    conn = await db.connections.find_one({"_id": ObjectId(conn_id), "project_id": ObjectId(project_id)})
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    try:
        result = await mindsdb.sql_query(f"SELECT * FROM {conn['mindsdb_db_name']}.{table_name} LIMIT 1")
        columns = result.get("column_names", [])
        return [{"name": c, "type": "unknown"} for c in columns]
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)


class FilterDetectRequest(BaseModel):
    table: str
    sample_size: int = 200


@router.post("/{conn_id}/detect-filters")
async def detect_filters(
    project_id: str,
    conn_id: str,
    body: FilterDetectRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Profile a table and suggest filter candidates via LIDA."""
    await get_current_project(project_id, user, db)
    conn = await db.connections.find_one({"_id": ObjectId(conn_id), "project_id": ObjectId(project_id)})
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    sample_size = max(1, min(body.sample_size, 1000))
    try:
        result = await mindsdb.sql_query(
            f"SELECT * FROM {conn['mindsdb_db_name']}.{body.table} LIMIT {sample_size}"
        )
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    columns = result.get("column_names", [])
    rows = result.get("data", [])

    from backend.core.database import get_org_settings
    from backend.services.lida_service import LIDAService

    org_settings = await get_org_settings()
    lida = LIDAService(org_settings)
    try:
        filters = await lida.detect_filters(columns, rows)
        chart_suggestion = await lida.suggest_chart(columns, rows)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Analysis failed: {e}")
    return {"filters": filters, "chart_suggestion": chart_suggestion, "row_count": len(rows)}


@router.delete("/{conn_id}")
async def delete_connection(
    project_id: str,
    conn_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    conn = await db.connections.find_one({"_id": ObjectId(conn_id), "project_id": ObjectId(project_id)})
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    try:
        await mindsdb.delete_database(conn["mindsdb_db_name"])
    except MindsDBError:
        pass

    await db.connections.delete_one({"_id": ObjectId(conn_id)})
    return {"status": "deleted"}
