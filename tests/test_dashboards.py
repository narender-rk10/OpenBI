"""Tests for /api/projects/{project_id}/dashboards endpoints."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId
from tests.conftest import auth_headers, USER_ID, ORG_ID, MOCK_USER, MOCK_PROJECT, PROJECT_ID, make_cursor

pytestmark = pytest.mark.asyncio

DASH_ID = str(ObjectId())
WIDGET_ID = "wgt-abc123"
FILTER_ID = "flt-xyz789"

BASE = f"/api/projects/{PROJECT_ID}/dashboards"


def _user_doc():
    return {**MOCK_USER, "_id": ObjectId(USER_ID), "org_id": ObjectId(ORG_ID)}


def _project_doc():
    return {
        **MOCK_PROJECT,
        "_id": ObjectId(PROJECT_ID),
        "org_id": ObjectId(ORG_ID),
        "created_by": ObjectId(USER_ID),
    }


def _dash_doc(filters=None):
    return {
        "_id": ObjectId(DASH_ID),
        "name": "Sales Dashboard",
        "description": "",
        "project_id": ObjectId(PROJECT_ID),
        "user_id": ObjectId(USER_ID),
        "is_shared": False,
        "global_filters": filters or [],
        "created_at": "2024-01-01T00:00:00",
    }


def _widget_doc(cached_data=None):
    return {
        "_id": ObjectId(),
        "widget_id": WIDGET_ID,
        "dashboard_id": ObjectId(DASH_ID),
        "title": "Revenue Chart",
        "display_type": "chart",
        "data_binding": {"query": "SELECT * FROM orders"},
        "cached_data": cached_data or {"columns": ["category", "revenue"],
                                        "rows": [["Electronics", 1000], ["Clothing", 500]]},
        "chart_config": {"chart_type": "bar", "g2_spec": {"encode": {}}},
        "position": {"x": 0, "y": 0, "w": 6, "h": 4},
    }


class TestListDashboards:
    async def test_list_empty(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.dashboards.find.return_value = make_cursor([])

        r = await ac.get(BASE, headers=auth_headers())
        assert r.status_code == 200
        assert r.json() == []

    async def test_list_returns_dashboards(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        # list_dashboards calls find() twice: own dashboards + shared dashboards
        db.dashboards.find.side_effect = [make_cursor([_dash_doc()]), make_cursor([])]

        r = await ac.get(BASE, headers=auth_headers())
        assert r.status_code == 200
        assert len(r.json()) == 1
        assert r.json()[0]["name"] == "Sales Dashboard"

    async def test_list_requires_auth(self, client):
        ac, db = client
        r = await ac.get(BASE)
        assert r.status_code == 401


class TestCreateDashboard:
    async def test_create_success(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        ins = MagicMock()
        ins.inserted_id = ObjectId(DASH_ID)
        db.dashboards.insert_one = AsyncMock(return_value=ins)

        r = await ac.post(BASE, json={
            "name": "My Dashboard",
            "description": "test",
        }, headers=auth_headers())
        assert r.status_code == 200
        assert r.json()["name"] == "My Dashboard"

    async def test_create_missing_name(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        r = await ac.post(BASE, json={}, headers=auth_headers())
        assert r.status_code == 422


class TestGetDashboard:
    async def test_get_existing(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.dashboards.find_one = AsyncMock(return_value=_dash_doc())
        db.widgets.find.return_value = make_cursor([])

        r = await ac.get(f"{BASE}/{DASH_ID}", headers=auth_headers())
        assert r.status_code == 200
        assert r.json()["name"] == "Sales Dashboard"

    async def test_get_not_found(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.dashboards.find_one = AsyncMock(return_value=None)

        r = await ac.get(f"{BASE}/{DASH_ID}", headers=auth_headers())
        assert r.status_code == 404


class TestDeleteDashboard:
    async def test_delete_success(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())

        r = await ac.delete(f"{BASE}/{DASH_ID}", headers=auth_headers())
        assert r.status_code == 200
        # Verify both widgets and dashboard were deleted
        db.widgets.delete_many.assert_called_once()
        db.dashboards.delete_one.assert_called_once()

    async def test_delete_requires_auth(self, client):
        ac, db = client
        r = await ac.delete(f"{BASE}/{DASH_ID}")
        assert r.status_code == 401


class TestAddWidget:
    async def test_add_widget_success(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.dashboards.find_one = AsyncMock(return_value=_dash_doc())
        ins = MagicMock()
        ins.inserted_id = ObjectId()
        db.widgets.insert_one = AsyncMock(return_value=ins)
        db.widgets.find_one = AsyncMock(return_value=_widget_doc())

        r = await ac.post(f"{BASE}/{DASH_ID}/widgets", json={
            "title": "Revenue Chart",
            "display_type": "chart",
            "data_binding": {"query": "SELECT * FROM orders"},
        }, headers=auth_headers())
        assert r.status_code == 200
        assert r.json()["title"] == "Revenue Chart"

    async def test_add_widget_requires_auth(self, client):
        ac, db = client
        r = await ac.post(f"{BASE}/{DASH_ID}/widgets", json={"title": "X"})
        assert r.status_code == 401


class TestUpdateWidget:
    async def test_update_title_and_chart_config(self, client):
        ac, db = client
        updated = {**_widget_doc(), "title": "Updated Title"}
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.dashboards.find_one = AsyncMock(return_value=_dash_doc())
        db.widgets.find_one = AsyncMock(return_value=updated)
        db.widgets.update_one = AsyncMock(return_value=MagicMock())
        # dashboard_versions is already set up as AsyncMock in make_db() — don't replace it

        r = await ac.put(f"{BASE}/{DASH_ID}/widgets/{WIDGET_ID}", json={
            "title": "Updated Title",
            "chart_config": {
                "chart_type": "line",
                "g2_spec": {"encode": {"x": "date", "y": "revenue", "color": "category"}}
            },
        }, headers=auth_headers())
        assert r.status_code == 200
        assert r.json()["title"] == "Updated Title"


class TestRefreshWidget:
    async def test_refresh_success(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.dashboards.find_one = AsyncMock(return_value=_dash_doc())
        db.widgets.find_one = AsyncMock(return_value=_widget_doc())
        db.widgets.update_one = AsyncMock(return_value=MagicMock())

        with patch("backend.api.dashboards.mindsdb") as mock_mdb:
            mock_mdb.sql_query = AsyncMock(return_value={
                "column_names": ["category", "revenue"],
                "data": [["Electronics", 1000]],
            })
            r = await ac.post(
                f"{BASE}/{DASH_ID}/widgets/{WIDGET_ID}/refresh", json={},
                headers=auth_headers()
            )
        assert r.status_code == 200


class TestGlobalFilters:
    async def test_add_filter(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.dashboards.find_one = AsyncMock(return_value=_dash_doc())
        db.dashboards.update_one = AsyncMock(return_value=MagicMock())

        r = await ac.post(f"{BASE}/{DASH_ID}/filters", json={
            "column": "category",
            "type": "select",
        }, headers=auth_headers())
        assert r.status_code == 200

    async def test_update_filter_value(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        filter_doc = {"id": FILTER_ID, "column": "category", "type": "select", "value": None}
        db.dashboards.find_one = AsyncMock(return_value=_dash_doc(filters=[filter_doc]))
        db.dashboards.update_one = AsyncMock(return_value=MagicMock())
        db.widgets.find.return_value = make_cursor([])

        with patch("backend.api.dashboards.mindsdb") as mock_mdb:
            mock_mdb.sql_query = AsyncMock(return_value={"column_names": [], "data": []})
            r = await ac.put(f"{BASE}/{DASH_ID}/filters/{FILTER_ID}", json={
                "value": "Electronics",
            }, headers=auth_headers())
        assert r.status_code == 200

    async def test_remove_filter(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        filter_doc = {"id": FILTER_ID, "column": "category", "type": "select"}
        db.dashboards.find_one = AsyncMock(return_value=_dash_doc(filters=[filter_doc]))
        db.dashboards.update_one = AsyncMock(return_value=MagicMock())

        r = await ac.delete(f"{BASE}/{DASH_ID}/filters/{FILTER_ID}", headers=auth_headers())
        assert r.status_code == 200


class TestSuggestFilters:
    async def test_suggest_filters_no_cached_data_returns_422(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.dashboards.find_one = AsyncMock(return_value=_dash_doc())
        # Widgets with no cached_data
        db.widgets.find.return_value = make_cursor([
            {**_widget_doc(), "cached_data": None}
        ])

        r = await ac.post(f"{BASE}/{DASH_ID}/suggest-filters", headers=auth_headers())
        assert r.status_code == 422
        assert "Refresh your widgets" in r.json()["detail"]

    async def test_suggest_filters_with_data(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=_user_doc())
        db.projects.find_one = AsyncMock(return_value=_project_doc())
        db.dashboards.find_one = AsyncMock(return_value=_dash_doc())
        db.widgets.find.return_value = make_cursor([_widget_doc()])
        db.organizations.find_one = AsyncMock(return_value={"settings": {}})

        # call_llm is a local import inside the endpoint function — patch at source
        with patch("backend.services.llm_client.call_llm", side_effect=Exception("no LLM")):
            r = await ac.post(f"{BASE}/{DASH_ID}/suggest-filters", headers=auth_headers())

        assert r.status_code == 200
        data = r.json()
        assert "suggestions" in data
        assert len(data["suggestions"]) > 0
        cols = [s["column"] for s in data["suggestions"]]
        assert "category" in cols or "revenue" in cols
