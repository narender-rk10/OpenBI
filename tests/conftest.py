"""Shared fixtures for all tests.

Strategy:
- Skip the FastAPI lifespan entirely (no real MongoDB or MindsDB needed).
- Override `get_db` with a factory that returns an AsyncMock database.
- Patch `mindsdb` singleton where imported.
- Issue real JWTs so auth middleware works without touching the DB for token decode.
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId
from httpx import AsyncClient, ASGITransport

from backend.core.security import create_access_token, hash_password


# ── Reusable IDs ────────────────────────────────────────────────────────────

ORG_ID = str(ObjectId())
USER_ID = str(ObjectId())
PROJECT_ID = str(ObjectId())


# ── Auth token helper ────────────────────────────────────────────────────────

def make_token(role: str = "super_admin") -> str:
    return create_access_token({
        "user_id": USER_ID,
        "email": "test@openbi.dev",
        "role": role,
        "org_id": ORG_ID,
    })


def auth_headers(role: str = "super_admin") -> dict:
    return {"Authorization": f"Bearer {make_token(role)}"}


# ── Mock DB builder ──────────────────────────────────────────────────────────

def make_cursor(docs: list):
    """Return a mock Motor cursor that supports .sort().to_list()."""
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.to_list = AsyncMock(return_value=docs)
    cursor.__aiter__ = MagicMock(return_value=iter(docs))

    async def _aiter():
        for doc in docs:
            yield doc

    cursor.__aiter__ = lambda self: _aiter().__aiter__()
    return cursor


def make_insert_result(inserted_id=None):
    result = MagicMock()
    result.inserted_id = inserted_id or ObjectId()
    return result


def make_db() -> AsyncMock:
    """Create a fresh AsyncMock database with sensible defaults."""
    db = MagicMock()

    for col in [
        "users", "organizations", "projects", "connections",
        "dashboards", "widgets", "knowledge_bases", "agents",
        "schedules", "schedule_runs", "chat_sessions", "dashboard_versions",
    ]:
        collection = MagicMock()
        collection.find_one = AsyncMock(return_value=None)
        collection.insert_one = AsyncMock(return_value=make_insert_result())
        collection.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
        collection.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
        collection.delete_many = AsyncMock(return_value=MagicMock(deleted_count=0))
        collection.find.return_value = make_cursor([])
        collection.create_index = AsyncMock(return_value=None)
        collection.count_documents = AsyncMock(return_value=0)
        setattr(db, col, collection)

    return db


# ── User fixture returned by get_current_user ────────────────────────────────

MOCK_USER = {
    "_id": USER_ID,
    "email": "test@openbi.dev",
    "name": "Test User",
    "role": "super_admin",
    "org_id": ORG_ID,
    "is_active": True,
    "preferences": {"theme": "dark"},
}

MOCK_PROJECT = {
    "_id": PROJECT_ID,
    "name": "Test Project",
    "description": "",
    "org_id": ORG_ID,
    "created_by": USER_ID,
    "is_active": True,
    "mindsdb_project_name": "proj_test",
}


# ── App fixture ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db():
    return make_db()


@pytest_asyncio.fixture
async def client(db):
    """AsyncClient with mocked DB and MindsDB, no lifespan."""
    from contextlib import asynccontextmanager
    from fastapi import FastAPI
    from backend.api import auth, projects, connections, dashboards, knowledge_bases, agents, settings as settings_api, health
    from backend.api.deps import get_db, get_current_user

    @asynccontextmanager
    async def noop_lifespan(app):
        yield

    app = FastAPI(lifespan=noop_lifespan)
    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api/auth")
    app.include_router(projects.router, prefix="/api/projects")
    app.include_router(connections.router)
    app.include_router(dashboards.router)
    app.include_router(knowledge_bases.router)
    app.include_router(agents.router)
    app.include_router(settings_api.router, prefix="/api/settings")

    # Override DB dependency
    app.dependency_overrides[get_db] = lambda: db

    # Make get_current_user return MOCK_USER when DB returns it
    db.users.find_one = AsyncMock(return_value={
        **MOCK_USER,
        "_id": ObjectId(USER_ID),
        "org_id": ObjectId(ORG_ID),
        "password_hash": hash_password("password123"),
    })

    with patch("backend.services.mindsdb_client.mindsdb") as mock_mindsdb, \
         patch("backend.api.projects.mindsdb") as mock_mindsdb_proj, \
         patch("backend.api.connections.mindsdb") as mock_mindsdb_conn, \
         patch("backend.api.dashboards.mindsdb") as mock_mindsdb_dash, \
         patch("backend.api.knowledge_bases.mindsdb") as mock_mindsdb_kb, \
         patch("backend.api.agents.mindsdb") as mock_mindsdb_ag:

        for m in [mock_mindsdb, mock_mindsdb_proj, mock_mindsdb_conn,
                  mock_mindsdb_dash, mock_mindsdb_kb, mock_mindsdb_ag]:
            m.health_check = AsyncMock(return_value=True)
            m.create_project = AsyncMock(return_value=None)
            m.delete_project = AsyncMock(return_value=None)
            m.drop_project = AsyncMock(return_value=None)
            m.create_database = AsyncMock(return_value=None)
            m.delete_database = AsyncMock(return_value=None)
            m.list_tables = AsyncMock(return_value=[{"name": "orders"}, {"name": "customers"}])
            m.sql_query = AsyncMock(return_value={"column_names": [], "data": []})
            m.test_connection = AsyncMock(return_value={"status": "success"})

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac, db
