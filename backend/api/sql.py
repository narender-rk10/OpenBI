"""Direct SQL query passthrough — used by AddWidgetModal preview."""

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.deps import get_current_project, get_current_user, get_db
from backend.services.mindsdb_client import MindsDBError, mindsdb

router = APIRouter(prefix="/api/projects/{project_id}/sql")


class SQLQuery(BaseModel):
    query: str
    limit: int = 1000


@router.post("/query")
async def run_sql(
    project_id: str,
    body: SQLQuery,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Execute a SQL query against MindsDB and return columns + rows.

    Project access is required; the query itself is passed through to MindsDB
    which handles its own quoting/permissions on the underlying connection.
    """
    await get_current_project(project_id, user, db)
    try:
        result = await mindsdb.sql_query(body.query)
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)

    columns = result.get("column_names", [])
    rows = result.get("data", [])
    if body.limit and len(rows) > body.limit:
        rows = rows[: body.limit]
    return {"columns": columns, "rows": rows}
