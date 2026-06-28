"""Agent CRUD routes — create with skills, update, delete."""

import json
from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.deps import get_current_project, get_current_user, get_db
from backend.core.security import decrypt_api_key, encrypt_api_key
from backend.services.mindsdb_client import MindsDBError, mindsdb

router = APIRouter(prefix="/api/projects/{project_id}/agents")

# MindsDB 26.x agents use pydantic-ai directly.  The model dict's "provider"
# field must match the pydantic-ai provider name, which differs from MindsDB's
# ML engine names for some providers (e.g. Gemini uses "google", not "gemini").
MINDSDB_PROVIDER_MAP = {
    "gemini": "google",
    "openai": "openai",
    "anthropic": "anthropic",
}


class SkillConfig(BaseModel):
    type: str  # "text2sql" | "knowledge_base"
    connection_id: str | None = None
    kb_id: str | None = None
    tables: list[str] | None = None
    description: str = ""


class AgentCreate(BaseModel):
    name: str
    description: str = ""
    icon: str = "bot"
    model_config_data: dict | None = None
    skills: list[SkillConfig] = []
    prompt_template: str = "You are a helpful data analyst. Always provide specific numbers and trends."


class AgentUpdate(BaseModel):
    description: str | None = None
    icon: str | None = None
    prompt_template: str | None = None
    skills: list[SkillConfig] | None = None
    model_config_data: dict | None = None


async def _build_mindsdb_agent_config(
    db: AsyncIOMotorDatabase,
    project_id: str,
    mindsdb_project: str,
    name: str,
    skills: list[SkillConfig],
    prompt_template: str,
    model_cfg_input: dict | None,
) -> tuple[dict, list[dict]]:
    """Resolves connections/KBs/tables for a list of skills and builds the
    MindsDB 26.x agent payload.  MindsDB 26.x uses pydantic-ai directly so the
    model field must be a provider config dict (not a pre-created MindsDB model).

    Returns (agent_config, skill_docs_for_mongo)."""
    skill_docs: list[dict] = []
    agent_tables: list[str] = []
    agent_kbs: list[str] = []

    for skill in skills:
        skill_doc: dict = {"type": skill.type, "description": skill.description}

        if skill.type == "text2sql" and skill.connection_id:
            conn = await db.connections.find_one({"_id": ObjectId(skill.connection_id)})
            if not conn:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Connection {skill.connection_id} not found",
                )
            db_name = conn["mindsdb_db_name"]

            # Auto-recover MindsDB database if lost (e.g., container restart wiped state)
            if not await mindsdb.database_exists(db_name):
                if conn.get("connection_params_encrypted"):
                    try:
                        full_params = json.loads(decrypt_api_key(conn["connection_params_encrypted"]))
                        await mindsdb.create_database(db_name, conn["engine"], full_params)
                    except MindsDBError as e:
                        raise HTTPException(
                            status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Failed to restore MindsDB database for '{conn['name']}': {e.message}",
                        )
                else:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"MindsDB database for connection '{conn['name']}' is missing. Delete and recreate the connection to fix this.",
                    )

            tables = skill.tables or conn.get("tables", [])
            if tables:
                for t in tables:
                    agent_tables.append(f"{db_name}.{t}")
            else:
                agent_tables.append(f"{db_name}.*")
            skill_doc["connection_id"] = skill.connection_id
            skill_doc["mindsdb_db_name"] = db_name
            skill_doc["tables"] = tables

        elif skill.type == "knowledge_base" and skill.kb_id:
            kb = await db.knowledge_bases.find_one({"_id": ObjectId(skill.kb_id)})
            if not kb:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"KB {skill.kb_id} not found",
                )
            agent_kbs.append(f"{mindsdb_project}.{kb['mindsdb_kb_name']}")
            skill_doc["kb_id"] = skill.kb_id
            skill_doc["mindsdb_kb_name"] = kb["mindsdb_kb_name"]
        else:
            continue

        skill_docs.append(skill_doc)

    org = await db.organizations.find_one({})
    org_settings = org.get("settings", {}) if org else {}
    model_cfg_input = model_cfg_input or {}
    provider = model_cfg_input.get("provider") or org_settings.get("llm_provider")
    model_name = model_cfg_input.get("model_name") or org_settings.get("llm_model")
    api_key = model_cfg_input.get("api_key") or decrypt_api_key(
        org_settings.get("llm_api_key_encrypted", "")
    )

    missing = [
        label for label, val in
        (("provider", provider), ("model", model_name), ("API key", api_key))
        if not val
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"LLM {', '.join(missing)} not configured. "
                "Set it in Settings → LLM before creating or updating agents."
            ),
        )

    # MindsDB 26.x agents use pydantic-ai provider names.
    # "gemini" → "google" so pydantic-ai picks up the GoogleModel class.
    mindsdb_provider = MINDSDB_PROVIDER_MAP.get(provider, provider)

    agent_config: dict = {
        "name": name,
        "model": {
            "provider": mindsdb_provider,
            "model_name": model_name,
            "api_key": api_key,
        },
        "params": {
            "prompt_template": prompt_template,
        },
    }

    data: dict = {}
    if agent_tables:
        data["tables"] = agent_tables
    if agent_kbs:
        data["knowledge_bases"] = agent_kbs
    if data:
        agent_config["params"]["data"] = data

    return agent_config, skill_docs


def _serialize(a: dict) -> dict:
    a = {**a}
    a["_id"] = str(a["_id"])
    a["project_id"] = str(a["project_id"])
    a["created_by"] = str(a["created_by"])
    if "skills" in a and isinstance(a["skills"], list):
        serialized_skills = []
        for s in a["skills"]:
            s = {**s}
            for key in ("connection_id", "kb_id", "_id"):
                if key in s and hasattr(s[key], "__str__") and not isinstance(s[key], str):
                    s[key] = str(s[key])
            serialized_skills.append(s)
        a["skills"] = serialized_skills
    return a


@router.get("")
async def list_agents(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    agents = await db.agents.find({"project_id": ObjectId(project_id)}).to_list(100)
    return [_serialize(a) for a in agents]


@router.post("")
async def create_agent(
    project_id: str,
    body: AgentCreate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    project = await get_current_project(project_id, user, db)

    existing = await db.agents.find_one({"name": body.name, "project_id": ObjectId(project_id)})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An agent named '{body.name}' already exists in this project",
        )

    mindsdb_agent_name = f"agent_{uuid4().hex[:8]}"
    mindsdb_project = project["mindsdb_project_name"]

    await mindsdb.ensure_project(mindsdb_project)

    agent_config, skill_docs = await _build_mindsdb_agent_config(
        db,
        project_id=project_id,
        mindsdb_project=mindsdb_project,
        name=mindsdb_agent_name,
        skills=body.skills,
        prompt_template=body.prompt_template,
        model_cfg_input=body.model_config_data,
    )

    try:
        await mindsdb.create_agent(mindsdb_project, agent_config)
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)

    model_cfg = body.model_config_data or {}
    if model_cfg.get("api_key"):
        model_cfg["api_key_encrypted"] = encrypt_api_key(model_cfg.pop("api_key"))

    agent_doc = {
        "project_id": ObjectId(project_id),
        "name": body.name,
        "description": body.description,
        "icon": body.icon,
        "mindsdb_agent_name": mindsdb_agent_name,
        "model_config": model_cfg,
        "skills": skill_docs,
        "prompt_template": body.prompt_template,
        "created_by": ObjectId(user["_id"]),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    try:
        result = await db.agents.insert_one(agent_doc)
    except Exception:
        try:
            await mindsdb.delete_agent(mindsdb_project, mindsdb_agent_name)
        except MindsDBError:
            pass
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An agent named '{body.name}' already exists in this project",
        )

    agent_doc["_id"] = result.inserted_id
    return _serialize(agent_doc)


@router.get("/{agent_id}")
async def get_agent(
    project_id: str,
    agent_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    agent = await db.agents.find_one({"_id": ObjectId(agent_id), "project_id": ObjectId(project_id)})
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return _serialize(agent)


@router.put("/{agent_id}")
async def update_agent(
    project_id: str,
    agent_id: str,
    body: AgentUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    project = await get_current_project(project_id, user, db)
    agent = await db.agents.find_one({"_id": ObjectId(agent_id), "project_id": ObjectId(project_id)})
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    update: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.description is not None:
        update["description"] = body.description
    if body.icon is not None:
        update["icon"] = body.icon

    needs_mindsdb_sync = (
        body.prompt_template is not None
        or body.skills is not None
        or body.model_config_data is not None
    )

    if needs_mindsdb_sync:
        prompt_template = body.prompt_template if body.prompt_template is not None else agent.get("prompt_template", "")
        if body.skills is not None:
            skills = body.skills
        else:
            skills = [SkillConfig(**s) for s in agent.get("skills", [])]

        merged_model_cfg = {**(agent.get("model_config") or {})}
        if body.model_config_data:
            merged_model_cfg.update(body.model_config_data)
        if merged_model_cfg.get("api_key_encrypted") and not merged_model_cfg.get("api_key"):
            merged_model_cfg["api_key"] = decrypt_api_key(merged_model_cfg["api_key_encrypted"])

        agent_config, skill_docs = await _build_mindsdb_agent_config(
            db,
            project_id=project_id,
            mindsdb_project=project["mindsdb_project_name"],
            name=agent["mindsdb_agent_name"],
            skills=skills,
            prompt_template=prompt_template,
            model_cfg_input=merged_model_cfg,
        )

        try:
            await mindsdb.update_agent(
                project["mindsdb_project_name"],
                agent["mindsdb_agent_name"],
                agent_config,
            )
        except MindsDBError as e:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)

        update["prompt_template"] = prompt_template
        update["skills"] = skill_docs
        if body.model_config_data:
            stored_model_cfg = {k: v for k, v in merged_model_cfg.items() if k != "api_key"}
            if body.model_config_data.get("api_key"):
                stored_model_cfg["api_key_encrypted"] = encrypt_api_key(body.model_config_data["api_key"])
            update["model_config"] = stored_model_cfg

    await db.agents.update_one(
        {"_id": ObjectId(agent_id), "project_id": ObjectId(project_id)},
        {"$set": update},
    )
    fresh = await db.agents.find_one({"_id": ObjectId(agent_id)})
    return _serialize(fresh)


@router.delete("/{agent_id}")
async def delete_agent(
    project_id: str,
    agent_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    project = await get_current_project(project_id, user, db)
    agent = await db.agents.find_one({"_id": ObjectId(agent_id), "project_id": ObjectId(project_id)})
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    try:
        await mindsdb.delete_agent(project["mindsdb_project_name"], agent["mindsdb_agent_name"])
    except MindsDBError:
        pass

    await db.agents.delete_one({"_id": ObjectId(agent_id)})
    return {"status": "deleted"}
