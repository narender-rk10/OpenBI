"""Table agent endpoint (direct, not through chat)."""

from fastapi import APIRouter

router = APIRouter(prefix="/api/projects/{project_id}/tables")

# Table agent functionality is handled via chat.py endpoints:
# POST /api/projects/{project_id}/chat/sessions/{session_id}/table-agent
# This file exists for future direct table operations.
