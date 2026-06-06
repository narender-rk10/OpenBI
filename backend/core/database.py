"""Async MongoDB client using Motor. Handles connection lifecycle and index creation."""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from backend.config import settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect_db():
    """Connect to MongoDB on startup."""
    global _client, _db
    _client = AsyncIOMotorClient(settings.MONGODB_URI)
    _db = _client[settings.MONGODB_DB_NAME]
    print(f"Connected to MongoDB: {settings.MONGODB_DB_NAME}")


async def close_db():
    """Close MongoDB connection on shutdown."""
    global _client
    if _client:
        _client.close()
        print("MongoDB connection closed")


def get_db() -> AsyncIOMotorDatabase:
    """Get the database instance."""
    if _db is None:
        raise RuntimeError("Database not initialized. Call connect_db() first.")
    return _db


async def get_org_settings() -> dict:
    """Load the org settings from MongoDB (cached in future)."""
    db = get_db()
    org = await db.organizations.find_one({})
    if org:
        return org.get("settings", {})
    return {
        "llm_provider": "",
        "llm_model": "",
        "llm_api_key_encrypted": "",
        "branding": {
            "primary_color": "#1a1a2e",
            "secondary_color": "#e94560",
            "accent_color": "#0f3460",
            "chart_palette": [
                "#1a1a2e", "#e94560", "#0f3460", "#16a34a",
                "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316"
            ],
            "logo_url": None,
        },
    }


async def create_indexes(db: AsyncIOMotorDatabase):
    """Create all MongoDB indexes on startup."""
    # Users
    await db.users.create_index("email", unique=True)
    await db.users.create_index("org_id")

    # Projects
    await db.projects.create_index([("name", 1), ("org_id", 1)], unique=True)
    await db.projects.create_index("org_id")
    await db.projects.create_index("created_by")

    # Connections
    await db.connections.create_index("project_id")
    await db.connections.create_index([("name", 1), ("project_id", 1)], unique=True)

    # Knowledge Bases
    await db.knowledge_bases.create_index("project_id")
    await db.knowledge_bases.create_index([("name", 1), ("project_id", 1)], unique=True)

    # Agents
    await db.agents.create_index("project_id")
    await db.agents.create_index([("name", 1), ("project_id", 1)], unique=True)

    # Chat Sessions
    await db.chat_sessions.create_index([("project_id", 1), ("user_id", 1)])
    await db.chat_sessions.create_index("created_at")

    # Dashboards
    await db.dashboards.create_index("project_id")
    await db.dashboards.create_index([("project_id", 1), ("user_id", 1)])
    await db.dashboards.create_index("is_shared")

    # Widgets
    await db.widgets.create_index("dashboard_id")
    await db.widgets.create_index([("dashboard_id", 1), ("widget_id", 1)], unique=True)

    # Schedules
    await db.schedules.create_index("project_id")
    await db.schedules.create_index("is_active")
    await db.schedules.create_index("next_run_at")

    # Schedule run history
    await db.schedule_runs.create_index("project_id")
    await db.schedule_runs.create_index("schedule_id")
    await db.schedule_runs.create_index([("project_id", 1), ("started_at", -1)])

    # Public dashboard share tokens
    await db.dashboards.create_index(
        "public_token",
        unique=True,
        partialFilterExpression={"public_token": {"$exists": True}},
    )

    # Dashboard version history
    await db.dashboard_versions.create_index([("dashboard_id", 1), ("version_number", -1)])
    await db.dashboard_versions.create_index("created_at")

    print("MongoDB indexes created")
