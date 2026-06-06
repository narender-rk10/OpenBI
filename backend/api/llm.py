"""Generic LLM completion endpoint — used by frontend AI summary widget."""

import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.api.deps import get_current_user
from backend.services.llm_client import LLMNotConfiguredError, call_llm

router = APIRouter()
logger = logging.getLogger("openbi.llm")


class CompleteRequest(BaseModel):
    prompt: str
    system_prompt: str | None = None


class SummarizeRequest(BaseModel):
    columns: list
    rows: list
    # "brief" (chat, 2-3 sentences) or "detailed" (PPTX exec summary + findings)
    detail: str = "brief"
    context: str | None = None


class AgentCandidate(BaseModel):
    id: str
    name: str
    description: str | None = None


class RouteAgentRequest(BaseModel):
    message: str
    agents: list[AgentCandidate]


@router.post("/api/llm/complete")
async def complete(
    body: CompleteRequest,
    user: dict = Depends(get_current_user),
):
    try:
        text = await call_llm(body.prompt, system_prompt=body.system_prompt)
    except LLMNotConfiguredError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LLM is not configured. Set provider/model/key in Settings → LLM.",
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    return {"text": text}


@router.post("/api/llm/summarize")
async def summarize_data(
    body: SummarizeRequest,
    user: dict = Depends(get_current_user),
):
    """Generate a natural-language summary of a query result.

    `detail="brief"` for the inline chat insight; `detail="detailed"` for a
    PPTX-grade narrative (executive summary, key findings, recommendations)."""
    from backend.services.narrative import generate_narrative

    try:
        text = await generate_narrative(
            body.columns, body.rows, detail=body.detail, context=body.context
        )
    except LLMNotConfiguredError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LLM is not configured. Set provider/model/key in Settings → LLM.",
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    return {"summary": text}


@router.post("/api/llm/route-agent")
async def route_agent(
    body: RouteAgentRequest,
    user: dict = Depends(get_current_user),
):
    """Pick the most relevant agent for a user message.

    Used by the chat UI when the user did not @-mention an agent and there is no
    active agent in the conversation. Returns the chosen agent id plus a
    confidence flag — the UI falls back to an explicit picker when not confident.
    """
    if not body.agents:
        return {"agent_id": None, "confident": False, "reason": "No agents available."}
    if len(body.agents) == 1:
        return {"agent_id": body.agents[0].id, "confident": True, "reason": "Only one agent available."}

    catalog = "\n".join(
        f'- id="{a.id}" name="{a.name}": {a.description or "data agent"}'
        for a in body.agents
    )
    valid_ids = {a.id for a in body.agents}
    prompt = (
        "You are a router that selects which data agent should answer a user's question.\n"
        "Each agent is connected to specific data sources described below.\n\n"
        f"Agents:\n{catalog}\n\n"
        f'User question: "{body.message}"\n\n'
        "Respond with ONLY a JSON object, no prose:\n"
        '{"agent_id": "<id of best agent, or null if none clearly fits>", '
        '"confident": <true only if one agent clearly fits, false if ambiguous>, '
        '"reason": "<short reason>"}'
    )
    try:
        text = await call_llm(prompt)
    except LLMNotConfiguredError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LLM is not configured. Set provider/model/key in Settings → LLM.",
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    # Parse the model output defensively — fall back to "not confident" so the UI
    # shows the picker rather than guessing wrong.
    parsed: dict = {}
    try:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("route-agent: failed to parse LLM output %r: %s", text, e)

    agent_id = parsed.get("agent_id")
    if agent_id not in valid_ids:
        agent_id = None
    confident = bool(parsed.get("confident")) and agent_id is not None
    return {
        "agent_id": agent_id,
        "confident": confident,
        "reason": parsed.get("reason") or "",
    }
