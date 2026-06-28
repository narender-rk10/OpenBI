"""FastAPI application — lifespan, CORS, all routers."""

import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backend.config import settings
from backend.core.database import close_db, connect_db, create_indexes, get_db
from backend.core.security import hash_password
from backend.services.mindsdb_client import mindsdb
from backend.services.scheduler_service import start_scheduler, stop_scheduler

from backend.api import deps as api_deps
from backend.api import (
    auth,
    users,
    projects,
    connections,
    knowledge_bases,
    agents,
    chat,
    charts,
    tables,
    dashboards,
    schedules,
    settings as settings_api,
    ws,
    health,
    public,
    versions,
    llm,
    sql,
    analytics,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # ── Startup ──
    await connect_db()
    db = get_db()
    await create_indexes(db)

    # Wait for MindsDB to be ready
    for i in range(30):
        if await mindsdb.health_check():
            print("✓ MindsDB is ready")
            break
        print(f"  Waiting for MindsDB... ({i + 1}/30)")
        await asyncio.sleep(2)
    else:
        print("⚠ MindsDB not available — continuing without it")

    # Create super admin if no users exist
    await _ensure_super_admin(db)

    # Start in-process schedule runner (replaces Celery worker + beat)
    await start_scheduler(db)

    yield

    # ── Shutdown ──
    stop_scheduler()
    await close_db()


app = FastAPI(
    title="OpenBI",
    description="AI-native open-source Business Intelligence platform",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ──
_cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Authenticated file serving (replaces unauthenticated StaticFiles) ──
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)


@app.get("/uploads/{file_path:path}")
async def serve_upload(
    file_path: str,
    user: dict = Depends(api_deps.get_current_user),
):
    """Serve uploaded files — requires a valid JWT."""
    full = os.path.realpath(os.path.join(settings.UPLOAD_DIR, file_path))
    # Prevent path traversal
    if not full.startswith(os.path.realpath(settings.UPLOAD_DIR)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if not os.path.isfile(full):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return FileResponse(full)

# ── Register routers ──
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(connections.router, tags=["connections"])
app.include_router(knowledge_bases.router, tags=["knowledge-bases"])
app.include_router(agents.router, tags=["agents"])
app.include_router(chat.router, tags=["chat"])
app.include_router(charts.router, tags=["charts"])
app.include_router(tables.router, tags=["tables"])
app.include_router(dashboards.router, tags=["dashboards"])
app.include_router(schedules.router, tags=["schedules"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["settings"])
app.include_router(ws.router, tags=["websocket"])
app.include_router(public.router, tags=["public"])
app.include_router(versions.router, tags=["versions"])
app.include_router(llm.router, tags=["llm"])
app.include_router(sql.router, tags=["sql"])
app.include_router(analytics.router, tags=["analytics"])


async def _ensure_super_admin(db):
    """Create super admin + org if no users exist."""
    existing = await db.users.find_one({"role": "super_admin"})
    if existing:
        return

    if not settings.SUPER_ADMIN_EMAIL:
        return

    now = datetime.now(timezone.utc)

    # LLM settings start empty — the super admin must configure them via
    # Settings → LLM before any agent or KB operations will work.
    org = await db.organizations.insert_one({
        "name": "Default Organization",
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

    await db.users.insert_one({
        "email": settings.SUPER_ADMIN_EMAIL,
        "password_hash": hash_password(settings.SUPER_ADMIN_PASSWORD or "changeme123"),
        "name": "Super Admin",
        "role": "super_admin",
        "org_id": org.inserted_id,
        "is_active": True,
        "preferences": {"theme": "dark", "default_project_id": None},
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
    })
    print(f"✓ Super admin created: {settings.SUPER_ADMIN_EMAIL}")
