"""Tests for /api/projects/{project_id}/connections endpoints."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId
from tests.conftest import auth_headers, USER_ID, ORG_ID, MOCK_USER, MOCK_PROJECT, PROJECT_ID, make_cursor

pytestmark = pytest.mark.asyncio

CONN_ID = str(ObjectId())


def _user_doc():
    return {**MOCK_USER, "_id": ObjectId(USER_ID), "org_id": ObjectId(ORG_ID)}


def _project_doc():
    return {
        **MOCK_PROJECT,
        "_id": ObjectId(PROJECT_ID),
        "org_id": ObjectId(ORG_ID),
        "created_by": ObjectId(USER_ID),
    }


def _conn_doc():
    return {
        "_id": ObjectId(CONN_ID),
        "name": "My PG",
        "engine": "postgres",
        "category": "Database",
        "project_id": ObjectId(PROJECT_ID),
        "created_by": ObjectId(USER_ID),
        "mindsdb_db_name": "conn_abc123",
        "tables": ["orders", "customers"],
        "status": "connected",
    }


BASE = f"/api/projects/{PROJECT_ID}/connections"


class TestListConnections:
    async def test_list_empty(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.connections.find.return_value = make_cursor([])

        r = await ac.get(BASE, headers=auth_headers())
        assert r.status_code == 200
        assert r.json() == []

    async def test_list_returns_connections(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.connections.find.return_value = make_cursor([_conn_doc()])

        r = await ac.get(BASE, headers=auth_headers())
        assert r.status_code == 200
        assert len(r.json()) == 1
        assert r.json()[0]["name"] == "My PG"

    async def test_list_requires_auth(self, client):
        ac, db = client
        r = await ac.get(BASE)
        assert r.status_code == 401


class TestTestConnection:
    async def test_test_connection_success(self, client):
        # mindsdb is already mocked in conftest with test_connection returning {"status": "success"}
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())

        r = await ac.post(f"{BASE}/test", json={
            "engine": "postgres",
            "parameters": {"host": "postgres", "port": 5432, "database": "financedb",
                           "user": "financeuser", "password": "Finance@123"},
        }, headers=auth_headers())

        assert r.status_code == 200
        assert r.json()["status"] == "success"

    async def test_test_connection_requires_auth(self, client):
        ac, db = client
        r = await ac.post(f"{BASE}/test", json={
            "engine": "postgres",
            "parameters": {},
        })
        assert r.status_code == 401


class TestCreateConnection:
    async def test_create_success(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.connections.find_one = AsyncMock(return_value=None)  # no duplicate
        ins = MagicMock()
        ins.inserted_id = ObjectId(CONN_ID)
        db.connections.insert_one = AsyncMock(return_value=ins)

        with patch("backend.api.connections.mindsdb") as mock_mdb:
            mock_mdb.create_database = AsyncMock(return_value=None)
            mock_mdb.list_tables = AsyncMock(return_value=[{"name": "orders"}])
            r = await ac.post(BASE, json={
                "name": "My PG",
                "engine": "postgres",
                "parameters": {"host": "postgres", "port": 5432,
                               "database": "financedb", "user": "u", "password": "p"},
            }, headers=auth_headers())

        assert r.status_code == 200
        assert r.json()["name"] == "My PG"
        assert "orders" in r.json()["tables"]

    async def test_create_duplicate_name_rejected(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.connections.find_one = AsyncMock(return_value=_conn_doc())  # duplicate exists

        r = await ac.post(BASE, json={
            "name": "My PG",
            "engine": "postgres",
            "parameters": {},
        }, headers=auth_headers())
        assert r.status_code == 409

    async def test_create_mindsdb_error_returns_502(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.connections.find_one = AsyncMock(return_value=None)

        with patch("backend.api.connections.mindsdb") as mock_mdb:
            from backend.services.mindsdb_client import MindsDBError
            mock_mdb.create_database = AsyncMock(side_effect=MindsDBError("MindsDB unreachable"))
            r = await ac.post(BASE, json={
                "name": "Bad Conn",
                "engine": "postgres",
                "parameters": {},
            }, headers=auth_headers())

        assert r.status_code == 502


class TestDeleteConnection:
    async def test_delete_success(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.connections.find_one = AsyncMock(return_value=_conn_doc())
        db.connections.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))

        with patch("backend.api.connections.mindsdb") as mock_mdb:
            mock_mdb.delete_database = AsyncMock(return_value=None)
            r = await ac.delete(f"{BASE}/{CONN_ID}", headers=auth_headers())

        assert r.status_code == 200

    async def test_delete_not_found(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.connections.find_one = AsyncMock(return_value=None)

        r = await ac.delete(f"{BASE}/{CONN_ID}", headers=auth_headers())
        assert r.status_code == 404


class TestDetectFilters:
    async def test_detect_filters_returns_filters(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.connections.find_one = AsyncMock(return_value=_conn_doc())

        with patch("backend.api.connections.mindsdb") as mock_mdb, \
             patch("backend.core.database.get_org_settings", new=AsyncMock(return_value={})):
            mock_mdb.sql_query = AsyncMock(return_value={
                "column_names": ["category", "price"],
                "data": [["Electronics", 99.9], ["Clothing", 49.9], ["Electronics", 149.9]],
            })
            r = await ac.post(f"{BASE}/{CONN_ID}/detect-filters", json={
                "table": "products",
                "sample_size": 200,
            }, headers=auth_headers())

        assert r.status_code == 200
        data = r.json()
        assert "filters" in data
        assert "chart_suggestion" in data
        filter_cols = [f["column"] for f in data["filters"]]
        assert "category" in filter_cols
        assert "price" in filter_cols

    async def test_detect_filters_mindsdb_error(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.connections.find_one = AsyncMock(return_value=_conn_doc())

        with patch("backend.api.connections.mindsdb") as mock_mdb:
            from backend.services.mindsdb_client import MindsDBError
            mock_mdb.sql_query = AsyncMock(side_effect=MindsDBError("Table not found"))
            r = await ac.post(f"{BASE}/{CONN_ID}/detect-filters", json={
                "table": "nonexistent",
                "sample_size": 200,
            }, headers=auth_headers())

        assert r.status_code == 502
        assert "Table not found" in r.json()["detail"]

    async def test_detect_filters_connection_not_found(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.connections.find_one = AsyncMock(return_value=None)

        r = await ac.post(f"{BASE}/{CONN_ID}/detect-filters", json={
            "table": "orders",
            "sample_size": 100,
        }, headers=auth_headers())
        assert r.status_code == 404
