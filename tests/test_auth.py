"""Tests for /api/auth endpoints."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from bson import ObjectId
from backend.core.security import hash_password
from tests.conftest import auth_headers, USER_ID, ORG_ID, MOCK_USER


pytestmark = pytest.mark.asyncio


class TestSignup:
    async def test_signup_success(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=None)  # no existing users
        ins = MagicMock()
        ins.inserted_id = ObjectId()
        db.organizations.insert_one = AsyncMock(return_value=ins)
        db.users.insert_one = AsyncMock(return_value=ins)

        r = await ac.post("/api/auth/signup", json={
            "email": "admin@test.com",
            "password": "password123",
            "name": "Admin",
            "org_name": "Test Org",
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["email"] == "admin@test.com"
        assert "password_hash" not in data["user"]

    async def test_signup_fails_when_users_exist(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value={"_id": ObjectId(), "email": "existing@test.com"})

        r = await ac.post("/api/auth/signup", json={
            "email": "new@test.com",
            "password": "password123",
            "name": "New",
            "org_name": "Org",
        })
        assert r.status_code == 409

    async def test_signup_invalid_email(self, client):
        ac, db = client
        r = await ac.post("/api/auth/signup", json={
            "email": "not-an-email",
            "password": "password123",
            "name": "Admin",
            "org_name": "Org",
        })
        assert r.status_code == 422


class TestLogin:
    async def test_login_success(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value={
            "_id": ObjectId(USER_ID),
            "email": "test@openbi.dev",
            "name": "Test",
            "role": "super_admin",
            "org_id": ObjectId(ORG_ID),
            "is_active": True,
            "password_hash": hash_password("password123"),
        })
        db.users.update_one = AsyncMock(return_value=MagicMock())

        r = await ac.post("/api/auth/login", json={
            "email": "test@openbi.dev",
            "password": "password123",
        })
        assert r.status_code == 200
        assert "access_token" in r.json()

    async def test_login_wrong_password(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value={
            "_id": ObjectId(USER_ID),
            "email": "test@openbi.dev",
            "role": "super_admin",
            "org_id": ObjectId(ORG_ID),
            "is_active": True,
            "password_hash": hash_password("correctpassword"),
        })

        r = await ac.post("/api/auth/login", json={
            "email": "test@openbi.dev",
            "password": "wrongpassword",
        })
        assert r.status_code == 401

    async def test_login_user_not_found(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value=None)

        r = await ac.post("/api/auth/login", json={
            "email": "nobody@test.com",
            "password": "password123",
        })
        assert r.status_code == 401

    async def test_login_inactive_user(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value={
            "_id": ObjectId(USER_ID),
            "email": "test@openbi.dev",
            "role": "member",
            "org_id": ObjectId(ORG_ID),
            "is_active": False,
            "password_hash": hash_password("password123"),
        })

        r = await ac.post("/api/auth/login", json={
            "email": "test@openbi.dev",
            "password": "password123",
        })
        assert r.status_code == 403


class TestGetMe:
    async def test_get_me_authenticated(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value={
            **MOCK_USER,
            "_id": ObjectId(USER_ID),
            "org_id": ObjectId(ORG_ID),
        })

        r = await ac.get("/api/auth/me", headers=auth_headers())
        assert r.status_code == 200
        assert r.json()["user"]["email"] == "test@openbi.dev"

    async def test_get_me_unauthenticated(self, client):
        ac, db = client
        r = await ac.get("/api/auth/me")
        assert r.status_code == 401

    async def test_get_me_invalid_token(self, client):
        ac, db = client
        r = await ac.get("/api/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert r.status_code == 401


class TestUpdateMe:
    async def test_update_name(self, client):
        ac, db = client
        updated = {**MOCK_USER, "_id": ObjectId(USER_ID), "org_id": ObjectId(ORG_ID), "name": "New Name"}
        db.users.find_one = AsyncMock(return_value=updated)
        db.users.update_one = AsyncMock(return_value=MagicMock())

        r = await ac.put("/api/auth/me", json={"name": "New Name"}, headers=auth_headers())
        assert r.status_code == 200
        assert r.json()["user"]["name"] == "New Name"

    async def test_update_preferences(self, client):
        ac, db = client
        updated = {**MOCK_USER, "_id": ObjectId(USER_ID), "org_id": ObjectId(ORG_ID),
                   "preferences": {"theme": "light"}}
        db.users.find_one = AsyncMock(return_value=updated)
        db.users.update_one = AsyncMock(return_value=MagicMock())

        r = await ac.put("/api/auth/me", json={"preferences": {"theme": "light"}}, headers=auth_headers())
        assert r.status_code == 200


class TestInviteUser:
    async def test_invite_success(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(side_effect=[
            # get_current_user lookup
            {**MOCK_USER, "_id": ObjectId(USER_ID), "org_id": ObjectId(ORG_ID)},
            # existing email check
            None,
        ])
        ins = MagicMock()
        ins.inserted_id = ObjectId()
        db.users.insert_one = AsyncMock(return_value=ins)

        r = await ac.post("/api/auth/invite", json={
            "email": "newuser@test.com",
            "name": "New User",
            "role": "member",
        }, headers=auth_headers())
        assert r.status_code == 200
        data = r.json()
        assert "temporary_password" in data
        assert data["user"]["email"] == "newuser@test.com"

    async def test_invite_duplicate_email(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(side_effect=[
            {**MOCK_USER, "_id": ObjectId(USER_ID), "org_id": ObjectId(ORG_ID)},
            {"_id": ObjectId(), "email": "exists@test.com"},
        ])

        r = await ac.post("/api/auth/invite", json={
            "email": "exists@test.com",
            "name": "Dupe",
            "role": "member",
        }, headers=auth_headers())
        assert r.status_code == 409

    async def test_invite_invalid_role(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(side_effect=[
            {**MOCK_USER, "_id": ObjectId(USER_ID), "org_id": ObjectId(ORG_ID)},
            None,
        ])

        r = await ac.post("/api/auth/invite", json={
            "email": "new@test.com",
            "name": "New",
            "role": "hacker",
        }, headers=auth_headers())
        assert r.status_code == 400

    async def test_invite_requires_super_admin(self, client):
        ac, db = client
        db.users.find_one = AsyncMock(return_value={
            **MOCK_USER, "_id": ObjectId(USER_ID), "org_id": ObjectId(ORG_ID),
            "role": "member",
        })

        r = await ac.post("/api/auth/invite", json={
            "email": "new@test.com", "name": "New", "role": "member",
        }, headers=auth_headers(role="member"))
        assert r.status_code == 403
