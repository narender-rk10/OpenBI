"""Org settings routes — LLM config, branding, logo upload."""

import asyncio
import logging
import os
from datetime import datetime, timezone

import aiofiles
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.agents import SkillConfig, _build_mindsdb_agent_config
from backend.api.deps import get_current_user, get_db, require_super_admin
from backend.config import settings as app_settings
from backend.core.security import decrypt_api_key, encrypt_api_key
from backend.services.mindsdb_client import MindsDBError, mindsdb

logger = logging.getLogger("openbi.settings")

router = APIRouter()


async def _resync_agents_with_new_key(
    db: AsyncIOMotorDatabase,
    org_id: ObjectId,
    new_api_key: str,
    provider: str,
    model: str,
) -> dict:
    """Rebuild every MindsDB agent owned by the org with the new LLM config.

    Uses the same `_build_mindsdb_agent_config` helper as the create/update
    endpoints so the request shape is identical to the one MindsDB accepts on
    creation — avoids the silent-no-op we'd hit by sending a partial `{"model": {...}}`
    body against MindsDB's PUT schema.

    Returns {synced: N, failed: [{name, error}]}.
    """
    projects = await db.projects.find({"org_id": org_id}).to_list(500)
    project_by_id = {p["_id"]: p for p in projects}

    agents = await db.agents.find(
        {"project_id": {"$in": list(project_by_id.keys())}}
    ).to_list(1000)

    synced = 0
    failed: list[dict] = []

    for agent in agents:
        project = project_by_id.get(agent["project_id"])
        if not project:
            continue
        mindsdb_project = project["mindsdb_project_name"]
        mindsdb_agent_name = agent["mindsdb_agent_name"]
        display_name = agent.get("name") or mindsdb_agent_name

        try:
            skills = [SkillConfig(**s) for s in agent.get("skills", [])]
            # Force the new org-wide key/provider/model onto this rebuild.
            model_cfg_input = {
                "provider": provider,
                "model_name": model,
                "api_key": new_api_key,
            }
            agent_config, _ = await _build_mindsdb_agent_config(
                db,
                project_id=str(agent["project_id"]),
                mindsdb_project=mindsdb_project,
                name=mindsdb_agent_name,
                skills=skills,
                prompt_template=agent.get("prompt_template", ""),
                model_cfg_input=model_cfg_input,
            )
            await mindsdb.update_agent(mindsdb_project, mindsdb_agent_name, agent_config)

            # Mirror the new (non-secret) model config back into Mongo so future
            # per-agent updates merge on top of the current state, not a stale one.
            stored_model_cfg = {
                **(agent.get("model_config") or {}),
                "provider": provider,
                "model_name": model,
                "api_key_encrypted": encrypt_api_key(new_api_key),
            }
            stored_model_cfg.pop("api_key", None)
            await db.agents.update_one(
                {"_id": agent["_id"]},
                {"$set": {"model_config": stored_model_cfg, "updated_at": datetime.now(timezone.utc)}},
            )
            synced += 1
        except MindsDBError as e:
            logger.error("Resync failed for agent %s: %s", display_name, e.message)
            failed.append({"name": display_name, "error": e.message})
        except HTTPException as e:
            logger.error("Resync validation failed for agent %s: %s", display_name, e.detail)
            failed.append({"name": display_name, "error": str(e.detail)})
        except Exception as e:
            logger.exception("Unexpected resync error for agent %s", display_name)
            failed.append({"name": display_name, "error": f"{type(e).__name__}: {e}"[:300]})

    return {"synced": synced, "failed": failed}


async def _list_kbs_needing_recreate(
    db: AsyncIOMotorDatabase, org_id: ObjectId
) -> list[dict]:
    projects = await db.projects.find({"org_id": org_id}).to_list(500)
    project_ids = [p["_id"] for p in projects]
    kbs = await db.knowledge_bases.find({"project_id": {"$in": project_ids}}).to_list(1000)
    return [
        {
            "_id": str(kb["_id"]),
            "project_id": str(kb["project_id"]),
            "name": kb.get("name"),
            "source_count": len(kb.get("sources", [])),
        }
        for kb in kbs
    ]


class LLMSettingsUpdate(BaseModel):
    provider: str
    model: str
    api_key: str | None = None
    base_url: str | None = None  # for Ollama / OpenAI-compatible endpoints


class BrandingUpdate(BaseModel):
    primary_color: str | None = None
    secondary_color: str | None = None
    accent_color: str | None = None
    chart_palette: list[str] | None = None
    title: str | None = None
    description: str | None = None


class SmtpSettingsUpdate(BaseModel):
    host: str
    port: int = 587
    username: str
    password: str | None = None  # None = keep existing password
    from_addr: str




@router.get("")
async def get_settings(
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return org settings (masks API key)."""
    org = await db.organizations.find_one({"_id": ObjectId(user["org_id"])})
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    settings_data = org.get("settings", {})
    # Mask LLM API key
    encrypted_key = settings_data.get("llm_api_key_encrypted", "")
    if encrypted_key:
        key = decrypt_api_key(encrypted_key)
        settings_data["llm_api_key_masked"] = f"...{key[-4:]}" if len(key) > 4 else "****"
    else:
        settings_data["llm_api_key_masked"] = ""
    settings_data.pop("llm_api_key_encrypted", None)

    # Mask SMTP password
    smtp = settings_data.get("smtp", {})
    if smtp.get("password_encrypted"):
        smtp["password_masked"] = "••••••••"
    else:
        smtp["password_masked"] = ""
    smtp.pop("password_encrypted", None)
    settings_data["smtp"] = smtp

    return {
        "org_name": org.get("name", ""),
        "settings": settings_data,
    }


@router.put("/llm")
async def update_llm_settings(
    body: LLMSettingsUpdate,
    user: dict = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update LLM provider/model/key."""
    update = {
        "settings.llm_provider": body.provider,
        "settings.llm_model": body.model,
    }
    if body.api_key:
        update["settings.llm_api_key_encrypted"] = encrypt_api_key(body.api_key)
    if body.base_url is not None:
        update["settings.llm_base_url"] = body.base_url

    org_id = ObjectId(user["org_id"])
    await db.organizations.update_one({"_id": org_id}, {"$set": update})

    # If the API key changed, push it into every MindsDB agent and surface
    # the KBs that need recreation (their stored embeddings are bound to the old key).
    agent_resync = {"synced": 0, "failed": []}
    kbs_need_recreate: list[dict] = []
    if body.api_key:
        agent_resync = await _resync_agents_with_new_key(
            db, org_id, body.api_key, body.provider, body.model
        )
        kbs_need_recreate = await _list_kbs_needing_recreate(db, org_id)

    return {
        "status": "updated",
        "agents_synced": agent_resync["synced"],
        "agents_failed": agent_resync["failed"],
        "kbs_need_recreate": kbs_need_recreate,
    }


@router.put("/branding")
async def update_branding(
    body: BrandingUpdate,
    user: dict = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update org branding colors and text."""
    update = {}
    if body.primary_color is not None:
        update["settings.branding.primary_color"] = body.primary_color
    if body.secondary_color is not None:
        update["settings.branding.secondary_color"] = body.secondary_color
    if body.accent_color is not None:
        update["settings.branding.accent_color"] = body.accent_color
    if body.chart_palette is not None:
        update["settings.branding.chart_palette"] = body.chart_palette
    if body.title is not None:
        update["settings.branding.title"] = body.title
    if body.description is not None:
        update["settings.branding.description"] = body.description

    if update:
        await db.organizations.update_one({"_id": ObjectId(user["org_id"])}, {"$set": update})
    return {"status": "updated"}


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    user: dict = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Upload org logo."""
    ext = os.path.splitext(file.filename or "logo.png")[1]
    logo_path = os.path.join(app_settings.UPLOAD_DIR, f"org_logo{ext}")

    await asyncio.to_thread(os.makedirs, app_settings.UPLOAD_DIR, exist_ok=True)
    content = await file.read()
    async with aiofiles.open(logo_path, "wb") as f:
        await f.write(content)

    logo_url = f"/uploads/org_logo{ext}"
    await db.organizations.update_one(
        {"_id": ObjectId(user["org_id"])},
        {"$set": {"settings.branding.logo_url": logo_url}},
    )
    return {"logo_url": logo_url}


@router.delete("/logo")
async def delete_logo(
    user: dict = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Remove org logo."""
    org = await db.organizations.find_one({"_id": ObjectId(user["org_id"])})
    logo_url = org.get("settings", {}).get("branding", {}).get("logo_url")
    if logo_url:
        full_path = os.path.join(app_settings.UPLOAD_DIR, os.path.basename(logo_url))
        if os.path.exists(full_path):
            await asyncio.to_thread(os.remove, full_path)

    await db.organizations.update_one(
        {"_id": ObjectId(user["org_id"])},
        {"$set": {"settings.branding.logo_url": None}},
    )
    return {"status": "deleted"}


@router.put("/smtp")
async def update_smtp_settings(
    body: SmtpSettingsUpdate,
    user: dict = Depends(require_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Store SMTP config in org settings (password encrypted)."""
    update = {
        "settings.smtp.host": body.host,
        "settings.smtp.port": body.port,
        "settings.smtp.username": body.username,
        "settings.smtp.from_addr": body.from_addr,
    }
    if body.password is not None:
        update["settings.smtp.password_encrypted"] = encrypt_api_key(body.password)

    await db.organizations.update_one({"_id": ObjectId(user["org_id"])}, {"$set": update})
    return {"status": "updated"}
