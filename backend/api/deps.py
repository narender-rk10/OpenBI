"""Dependency injection for FastAPI routes."""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from backend.core.database import get_db as _get_db
from backend.core.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_db() -> AsyncIOMotorDatabase:
    """Yield the MongoDB database instance."""
    return _get_db()


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    """Extract and validate the current user from JWT."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(token)
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = await db.users.find_one({"_id": ObjectId(user_id), "is_active": True})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    user["_id"] = str(user["_id"])
    user["org_id"] = str(user["org_id"])
    return user


async def require_super_admin(user: dict = Depends(get_current_user)) -> dict:
    """Require the current user to be a super_admin."""
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required")
    return user


async def get_current_project(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    """Validate project access for the current user."""
    try:
        project = await db.projects.find_one({
            "_id": ObjectId(project_id),
            "org_id": ObjectId(user["org_id"]),
            "is_active": True,
        })
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project["_id"] = str(project["_id"])
    project["org_id"] = str(project["org_id"])
    project["created_by"] = str(project["created_by"])
    return project
