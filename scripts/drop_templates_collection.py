"""One-off migration: drop the legacy `templates` collection.

The Templates feature was removed (schedules are now dashboard-based). This
script drops the orphaned collection. It is idempotent — safe to run more than
once, and a no-op if the collection is already gone.

Usage:
    python scripts/drop_templates_collection.py

Honors the same env vars as the backend (MONGODB_URI, MONGODB_DB_NAME).
"""

import asyncio
import os

from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://mongo:27017/openbi")
MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME", "openbi")


async def main() -> None:
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[MONGODB_DB_NAME]
    existing = await db.list_collection_names()
    if "templates" in existing:
        count = await db.templates.estimated_document_count()
        await db.templates.drop()
        print(f"Dropped 'templates' collection ({count} documents) from '{MONGODB_DB_NAME}'.")
    else:
        print(f"No 'templates' collection in '{MONGODB_DB_NAME}' — nothing to do.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
