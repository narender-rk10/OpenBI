"""User management routes (super_admin only)."""

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.deps import get_db, require_super_admin

router = APIRouter()


class UpdateUserRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None


def _serialize_user(u: dict) -> dict:
    u = {**u}
    u["_id"] = str(u["_id"])
    u["org_id"] = str(u["org_id"])
    u.pop("password_hash", None)
    u.pop("api_key_hash", None)
    return u


@router.get("")
async def list_users(
    admin: dict = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List all users in the org."""
    users = await db.users.find({"org_id": ObjectId(admin["org_id"])}).to_list(500)
    return [_serialize_user(u) for u in users]


@router.put("/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    admin: dict = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update a user's role or active status."""
    target = await db.users.find_one({"_id": ObjectId(user_id), "org_id": ObjectId(admin["org_id"])})
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    update: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.role is not None:
        if body.role not in ("super_admin", "admin", "member"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
        update["role"] = body.role
    if body.is_active is not None:
        update["is_active"] = body.is_active

    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})
    updated = await db.users.find_one({"_id": ObjectId(user_id)})
    return _serialize_user(updated)


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    admin: dict = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Soft-delete a user (deactivate)."""
    if user_id == admin["_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate yourself")

    result = await db.users.update_one(
        {"_id": ObjectId(user_id), "org_id": ObjectId(admin["org_id"])},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {"status": "deactivated"}
