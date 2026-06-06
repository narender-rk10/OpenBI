"""Health check endpoint."""

from fastapi import APIRouter
from backend.services.mindsdb_client import mindsdb

router = APIRouter()


@router.get("/health")
async def health():
    """Basic health check."""
    mindsdb_ok = await mindsdb.health_check()
    return {
        "status": "ok",
        "mindsdb": "connected" if mindsdb_ok else "unavailable",
    }
