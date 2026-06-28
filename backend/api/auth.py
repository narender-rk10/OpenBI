"""Auth routes — signup, login, invite, profile, telegram linking."""

from collections import defaultdict
from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr

from backend.api.deps import get_current_user, get_db, require_super_admin
from backend.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)

router = APIRouter()

# ── In-process login rate limiter ────────────────────────────────────────────
# Tracks failed attempts per IP. 10 failures in 5 min → 429 for 5 min.
_login_fail: dict[str, list[float]] = defaultdict(list)
_MAX_FAILS = 10
_WINDOW = 300.0  # seconds


def _check_login_rate(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc).timestamp()
    _login_fail[ip] = [t for t in _login_fail[ip] if now - t < _WINDOW]
    if len(_login_fail[ip]) >= _MAX_FAILS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again in 5 minutes.",
            headers={"Retry-After": "300"},
        )


def _record_fail(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    _login_fail[ip].append(datetime.now(timezone.utc).timestamp())


def _clear_fail(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    _login_fail.pop(ip, None)


# ── Request / Response schemas ──────────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    org_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class InviteRequest(BaseModel):
    email: EmailStr
    name: str
    role: str = "member"


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    preferences: dict | None = None


class TelegramLinkRequest(BaseModel):
    telegram_id: str
    api_key: str
    telegram_username: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ── Helpers ─────────────────────────────────────────────────────────────

def _serialize_user(user: dict) -> dict:
    u = {**user}
    u["_id"] = str(u["_id"])
    u["org_id"] = str(u["org_id"])
    u.pop("password_hash", None)
    u.pop("api_key_hash", None)
    return u


# ── Routes ──────────────────────────────────────────────────────────────

@router.post("/signup")
async def signup(body: SignupRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    """First-user signup — creates org + super_admin. Fails if users already exist."""
    existing = await db.users.find_one()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Users already exist. Use login instead.")

    now = datetime.now(timezone.utc)

    # Create organisation. LLM settings start empty — the new super admin must
    # configure provider/model/API key via Settings → LLM before any agent or KB
    # work will succeed.
    org_result = await db.organizations.insert_one({
        "name": body.org_name,
        "settings": {
            "llm_provider": "",
            "llm_model": "",
            "llm_api_key_encrypted": "",
            "branding": {
                "primary_color": "#1a1a2e",
                "secondary_color": "#e94560",
                "accent_color": "#0f3460",
                "chart_palette": [
                    "#1a1a2e", "#e94560", "#0f3460", "#16a34a",
                    "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316",
                ],
                "logo_url": None,
            },
        },
        "created_at": now,
    })

    # Create super admin user
    user_doc = {
        "email": body.email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": "super_admin",
        "org_id": org_result.inserted_id,
        "is_active": True,
        "preferences": {"theme": "dark", "default_project_id": None},
        "created_at": now,
        "updated_at": now,
        "last_login_at": now,
    }
    user_result = await db.users.insert_one(user_doc)
    user_doc["_id"] = user_result.inserted_id

    token = create_access_token({
        "user_id": str(user_doc["_id"]),
        "email": body.email,
        "role": "super_admin",
        "org_id": str(org_result.inserted_id),
    })

    return {"access_token": token, "token_type": "bearer", "user": _serialize_user(user_doc)}


@router.post("/login")
async def login(request: Request, body: LoginRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Authenticate and return JWT."""
    _check_login_rate(request)
    user = await db.users.find_one({"email": body.email})
    if not user or not verify_password(body.password, user["password_hash"]):
        _record_fail(request)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
    _clear_fail(request)

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login_at": datetime.now(timezone.utc)}},
    )

    token = create_access_token({
        "user_id": str(user["_id"]),
        "email": user["email"],
        "role": user["role"],
        "org_id": str(user["org_id"]),
    })

    return {"access_token": token, "token_type": "bearer", "user": _serialize_user(user)}


@router.post("/invite")
async def invite_user(
    body: InviteRequest,
    admin: dict = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Invite a new user (super_admin only)."""
    existing = await db.users.find_one({"email": body.email})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    if body.role not in ("super_admin", "admin", "member"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    temp_password = uuid4().hex[:12]
    now = datetime.now(timezone.utc)

    user_doc = {
        "email": body.email,
        "password_hash": hash_password(temp_password),
        "name": body.name,
        "role": body.role,
        "org_id": ObjectId(admin["org_id"]),
        "is_active": True,
        "preferences": {"theme": "dark", "default_project_id": None},
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id

    return {"user": _serialize_user(user_doc), "temporary_password": temp_password}


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return current user profile."""
    return {"user": user}


@router.put("/me")
async def update_me(
    body: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update current user profile."""
    update: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.name is not None:
        update["name"] = body.name
    if body.preferences is not None:
        update["preferences"] = body.preferences

    await db.users.update_one({"_id": ObjectId(user["_id"])}, {"$set": update})
    updated = await db.users.find_one({"_id": ObjectId(user["_id"])})
    return {"user": _serialize_user(updated)}


@router.patch("/password")
async def change_password(
    body: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Change current user's password."""
    db_user = await db.users.find_one({"_id": ObjectId(user["_id"])})
    if not db_user or not verify_password(body.current_password, db_user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect")
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"password_hash": hash_password(body.new_password), "updated_at": datetime.now(timezone.utc)}},
    )
    return {"detail": "Password updated successfully"}


# ── Telegram Auth ───────────────────────────────────────────────────────

@router.post("/telegram/link")
async def telegram_link(body: TelegramLinkRequest, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Link a Telegram account using API key."""
    # Find user by API key
    from backend.core.security import verify_password as _verify
    users = db.users.find({"api_key_hash": {"$exists": True, "$ne": None}})
    matched_user = None
    async for u in users:
        if _verify(body.api_key, u["api_key_hash"]):
            matched_user = u
            break

    if not matched_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    await db.users.update_one(
        {"_id": matched_user["_id"]},
        {"$set": {
            "telegram_id": body.telegram_id,
            "telegram_username": body.telegram_username,
        }},
    )

    token = create_access_token({
        "user_id": str(matched_user["_id"]),
        "email": matched_user["email"],
        "role": matched_user["role"],
        "org_id": str(matched_user["org_id"]),
    })

    return {"access_token": token, "user_name": matched_user["name"]}


@router.post("/telegram/generate-key")
async def generate_api_key(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Generate an API key for Telegram auth."""
    api_key = uuid4().hex
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"api_key_hash": hash_password(api_key)}},
    )
    return {"api_key": api_key}
