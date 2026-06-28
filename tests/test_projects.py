"""Tests for /api/projects endpoints."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId
from tests.conftest import auth_headers, USER_ID, ORG_ID, MOCK_USER, MOCK_PROJECT, PROJECT_ID, make_cursor


pytestmark = pytest.mark.asyncio


def _user_doc():
    return {**MOCK_USER, "_id": ObjectId(USER_ID), "org_id": ObjectId(ORG_ID)}


def _project_doc():
    return {
        **MOCK_PROJECT,
        "_id": ObjectId(PROJECT_ID),
        "org_id": ObjectId(ORG_ID),
        "created_by": ObjectId(USER_ID),
    }


class TestListProjects:
    async def test_list_empty(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find.return_value = make_cursor([])

        r = await ac.get("/api/projects", headers=auth_headers())
        assert r.status_code == 200
        assert r.json() == []

    async def test_list_returns_projects(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find.return_value = make_cursor([_project_doc()])

        r = await ac.get("/api/projects", headers=auth_headers())
        assert r.status_code == 200
        assert len(r.json()) == 1
        assert r.json()[0]["name"] == "Test Project"

    async def test_list_requires_auth(self, client):
        ac, db = client
        r = await ac.get("/api/projects")
        assert r.status_code == 401


class TestCreateProject:
    async def test_create_success(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        ins = MagicMock()
        ins.inserted_id = ObjectId(PROJECT_ID)
        db.projects.insert_one = AsyncMock(return_value=ins)

        with patch("backend.api.projects.mindsdb") as mock_mdb:
            mock_mdb.create_project = AsyncMock(return_value=None)
            r = await ac.post("/api/projects", json={
                "name": "My Project",
                "description": "A test project",
            }, headers=auth_headers())

        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "My Project"
        assert "_id" in data

    async def test_create_without_auth(self, client):
        ac, db = client
        r = await ac.post("/api/projects", json={"name": "X"})
        assert r.status_code == 401

    async def test_create_missing_name(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        r = await ac.post("/api/projects", json={}, headers=auth_headers())
        assert r.status_code == 422


class TestDeleteProject:
    async def test_delete_success(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.projects.update_one = AsyncMock(return_value=MagicMock())
        db.connections.find.return_value = make_cursor([])

        with patch("backend.api.projects.mindsdb") as mock_mdb:
            mock_mdb.delete_project = AsyncMock(return_value=None)
            mock_mdb.drop_project = AsyncMock(return_value=None)
            r = await ac.delete(f"/api/projects/{PROJECT_ID}", headers=auth_headers())

        assert r.status_code == 200

    async def test_delete_not_found(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=None)

        r = await ac.delete(f"/api/projects/{PROJECT_ID}", headers=auth_headers())
        assert r.status_code == 404
