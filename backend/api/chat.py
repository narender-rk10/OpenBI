"""Chat routes — SSE streaming with MindsDB agents, @ChartAgent/@TableAgent routing."""

import asyncio
import json
import re
from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.deps import get_current_project, get_current_user, get_db
from backend.services.chart_agent import chart_agent
from backend.services.mindsdb_client import MindsDBError, mindsdb
from backend.services.table_agent import table_agent


def _est_tokens(text: str) -> int:
    """Estimate token count: word count × 1.3 is more accurate than chars÷4."""
    return max(1, int(len(text.split()) * 1.3)) if text.strip() else 0

_GREETING_RE = re.compile(
    r"^\s*(hi+|hello+|hey+|howdy|good\s+(morning|afternoon|evening|day)|"
    r"what'?s\s+up|how\s+are\s+you|who\s+are\s+you|what\s+are\s+you|"
    r"what\s+can\s+you\s+do|help\s*me?|greetings?|yo+|hiya|sup)\s*[!?.]*\s*$",
    re.IGNORECASE,
)

_OPENBI_GREETING = (
    "Hi! I'm OpenBI Assistant, your AI-powered data analyst. "
    "I can query your connected databases in plain English, generate charts and visualizations automatically, "
    "and summarize data results. "
    "Just ask me anything about your data — for example: "
    "\"What were total sales last month?\" or \"Show me the top 10 customers by revenue.\" "
    "Type @ to switch between different data agents."
)

router = APIRouter(prefix="/api/projects/{project_id}/chat")


class ChatRequest(BaseModel):
    session_id: str | None = None
    agent_id: str
    message: str
    stream: bool = True
    # How the agent was selected: at_mention | auto_routed | single_agent | continuation | picker | greeting
    routing_source: str = "unknown"


class ChartAgentRequest(BaseModel):
    message_id: str
    user_message: str | None = None


class TableAgentRequest(BaseModel):
    message_id: str
    user_message: str


class MultiChatRequest(BaseModel):
    session_id: str | None = None
    agent_ids: list[str]
    message: str


def _serialize_session(s: dict) -> dict:
    s = {**s}
    s["_id"] = str(s["_id"])
    s["project_id"] = str(s["project_id"])
    s["user_id"] = str(s["user_id"])
    s["agent_id"] = str(s["agent_id"]) if s.get("agent_id") else None
    return s


@router.post("")
async def chat(
    project_id: str,
    body: ChatRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Main chat endpoint — SSE streaming or JSON response."""
    project = await get_current_project(project_id, user, db)
    agent = await db.agents.find_one({"_id": ObjectId(body.agent_id), "project_id": ObjectId(project_id)})
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    # ── Check for @ChartAgent or @TableAgent routing ──
    msg = body.message.strip()
    if msg.lower().startswith("@chartagent") or msg.lower().startswith("@chart"):
        return await _handle_chart_agent_chat(project_id, body, user, db)
    if msg.lower().startswith("@tableagent") or msg.lower().startswith("@table"):
        return await _handle_table_agent_chat(project_id, body, user, db)

    # ── Load or create session ──
    now = datetime.now(timezone.utc)
    if body.session_id:
        session = await db.chat_sessions.find_one({"_id": ObjectId(body.session_id)})
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    else:
        session = {
            "project_id": ObjectId(project_id),
            "user_id": ObjectId(user["_id"]),
            "title": body.message[:60],
            "agent_id": ObjectId(body.agent_id),
            "messages": [],
            "pinned_sources": [],
            "is_shared": False,
            "created_at": now,
            "updated_at": now,
        }
        result = await db.chat_sessions.insert_one(session)
        session["_id"] = result.inserted_id

    # ── Format conversation history for MindsDB ──
    history = []
    for msg_doc in session.get("messages", [])[-20:]:
        if msg_doc["role"] == "user":
            history.append({"question": msg_doc["content"], "answer": None})
        elif msg_doc["role"] == "assistant" and history:
            history[-1]["answer"] = msg_doc["content"]

    history.append({"question": body.message, "answer": None})

    mindsdb_project = project["mindsdb_project_name"]
    mindsdb_agent = agent["mindsdb_agent_name"]

    # ── Greeting / identity shortcut — reply without calling MindsDB ──
    if _GREETING_RE.match(body.message.strip()):
        async def _greeting_stream():
            g_start = datetime.now(timezone.utc)
            yield _sse("thinking", {"step": "Preparing response..."})
            yield _sse("answer", {"content": _OPENBI_GREETING})
            g_msg_id = f"msg_{uuid4().hex[:8]}"
            now_g = datetime.now(timezone.utc)
            g_latency = int((now_g - g_start).total_seconds() * 1000)
            await db.chat_sessions.update_one(
                {"_id": session["_id"]},
                {
                    "$push": {
                        "messages": {
                            "$each": [
                                {"id": f"msg_{uuid4().hex[:8]}", "role": "user", "content": body.message, "agent_name": agent["name"], "timestamp": now_g},
                                {"id": g_msg_id, "role": "assistant", "content": _OPENBI_GREETING, "agent_name": agent["name"], "sql_query": None, "data": None, "chart_config": None, "table_config": None, "timestamp": now_g},
                            ]
                        },
                        "$set": {"updated_at": now_g},
                    }
                },
            )
            yield _sse("done", {"session_id": str(session["_id"]), "message_id": g_msg_id, "latency_ms": g_latency})
        return StreamingResponse(_greeting_stream(), media_type="text/event-stream")

    # Ensure project exists in MindsDB (survives container rebuilds)
    try:
        await mindsdb.ensure_project(mindsdb_project)
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)

    if not body.stream:
        return await _handle_non_streaming(
            project_id, mindsdb_project, mindsdb_agent, agent,
            body, session, history, user, db
        )

    # Cost rates per 1M tokens: (input_rate, output_rate)
    _COST_RATES = {
        "gemini": (0.00125, 0.005),
        "openai": (0.005, 0.015),
        "anthropic": (0.003, 0.015),
    }

    # ── SSE streaming ──
    async def event_stream():
        sql_query = None
        answer_text = ""
        stream_error: str | None = None
        stream_start = datetime.now(timezone.utc)

        try:
            yield _sse("thinking", {"step": "Understanding question..."})

            async for data_line in mindsdb.chat_with_agent_stream(mindsdb_project, mindsdb_agent, history):
                try:
                    event_data = json.loads(data_line)
                except json.JSONDecodeError:
                    continue

                evt_type = event_data.get("type", "")

                # Context updates → show as status + extract SQL
                if evt_type == "context":
                    content = event_data.get("content", "")
                    yield _sse("thinking", {"step": content})

                    # Extract from "Executing final SQL query:" prefix (allowing newlines)
                    sql_match = re.search(
                        r"Executing final SQL query:\s*(SELECT\s+[\s\S]+)",
                        content, re.IGNORECASE,
                    )
                    if sql_match:
                        sql_query = sql_match.group(1).strip()
                        yield _sse("sql", {"query": sql_query})

                # Data event → the actual answer
                elif evt_type == "data":
                    answer_text = event_data.get("text", "") or event_data.get("content", "")
                    if "query" in event_data:
                        sql_query = event_data["query"]
                        yield _sse("sql", {"query": sql_query})

                # Legacy format support
                elif "actions" in event_data:
                    for action in event_data["actions"]:
                        tool_input = action.get("tool_input", "")
                        if isinstance(tool_input, str) and "SELECT" in tool_input.upper():
                            sql_query = tool_input
                            yield _sse("sql", {"query": sql_query})
                elif "steps" in event_data:
                    for step in event_data["steps"]:
                        tool_input = step.get("action", {}).get("tool_input", "")
                        if isinstance(tool_input, str) and "SELECT" in tool_input.upper():
                            sql_query = tool_input
                            yield _sse("sql", {"query": sql_query})
                elif "output" in event_data:
                    answer_text = event_data["output"]

                if evt_type == "end":
                    break

        except MindsDBError as e:
            stream_error = e.message
            yield _sse("error", {"message": e.message})
        except Exception as e:
            stream_error = str(e)
            yield _sse("error", {"message": str(e)})

        # Re-execute SQL for clean data
        columns, rows = [], []
        if sql_query:
            try:
                result = await mindsdb.sql_query(sql_query)
                columns = result.get("column_names", [])
                rows = result.get("data", [])
                yield _sse("data", {"columns": columns, "rows": rows})
            except MindsDBError as e:
                yield _sse("error", {"message": e.message})

        if answer_text:
            yield _sse("answer", {"content": answer_text})

        # Save messages to MongoDB
        msg_id = f"msg_{uuid4().hex[:8]}"
        user_msg = {
            "id": f"msg_{uuid4().hex[:8]}",
            "role": "user",
            "content": body.message,
            "agent_name": agent["name"],
            "timestamp": datetime.now(timezone.utc),
        }
        assistant_msg = {
            "id": msg_id,
            "role": "assistant",
            "content": answer_text or "No response",
            "agent_name": agent["name"],
            "sql_query": sql_query,
            "data": {"columns": columns, "rows": rows} if columns else None,
            "chart_config": None,
            "table_config": None,
            "timestamp": datetime.now(timezone.utc),
        }

        await db.chat_sessions.update_one(
            {"_id": session["_id"]},
            {
                "$push": {"messages": {"$each": [user_msg, assistant_msg]}},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )

        # ── Record analytics ──
        stream_end = datetime.now(timezone.utc)
        latency_ms = int((stream_end - stream_start).total_seconds() * 1000)

        # Token estimation: word count × 1.3 (more accurate than chars÷4)
        input_text = " ".join(
            (h.get("question") or "") + " " + (h.get("answer") or "")
            for h in history
        )
        input_tokens = _est_tokens(input_text)
        output_tokens = _est_tokens(answer_text or "")

        try:
            from backend.core.database import get_org_settings
            org_cfg = await get_org_settings()
            provider = org_cfg.get("llm_provider", "unknown")
            model_name = org_cfg.get("llm_model", "unknown")
        except Exception:
            provider, model_name = "unknown", "unknown"

        in_rate, out_rate = _COST_RATES.get(provider, (0.002, 0.008))
        estimated_cost = (input_tokens * in_rate + output_tokens * out_rate) / 1_000_000

        await db.chat_analytics.insert_one({
            "project_id": ObjectId(project_id),
            "user_id": ObjectId(user["_id"]),
            "session_id": str(session["_id"]),
            "agent_id": str(agent["_id"]),
            "agent_name": agent["name"],
            "provider": provider,
            "model": model_name,
            "routing_source": body.routing_source,
            "timestamp": stream_end,
            "user_message": body.message,
            "assistant_response": answer_text or "",
            "sql_query": sql_query,
            "has_data": bool(columns),
            "row_count": len(rows),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "estimated_cost_usd": estimated_cost,
            "latency_ms": latency_ms,
            "error": stream_error,
        })

        yield _sse("done", {"session_id": str(session["_id"]), "message_id": msg_id, "latency_ms": latency_ms})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/multi")
async def multi_chat(
    project_id: str,
    body: MultiChatRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Fire one message to multiple agents in parallel and stream a consolidated report."""
    from backend.services.llm_client import call_llm

    project = await get_current_project(project_id, user, db)

    agents_list = []
    for agent_id in body.agent_ids:
        agent = await db.agents.find_one({"_id": ObjectId(agent_id), "project_id": ObjectId(project_id)})
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Agent {agent_id} not found")
        agents_list.append(agent)

    if not agents_list:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No agents specified")

    mindsdb_project = project["mindsdb_project_name"]
    try:
        await mindsdb.ensure_project(mindsdb_project)
    except MindsDBError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=e.message)

    async def _query_agent(agent: dict) -> tuple[str, str]:
        messages = [{"question": body.message, "answer": None}]
        answer = ""
        try:
            async for chunk in mindsdb.chat_with_agent_stream(mindsdb_project, agent["mindsdb_agent_name"], messages):
                try:
                    ev = json.loads(chunk)
                except json.JSONDecodeError:
                    continue
                evt_type = ev.get("type", "")
                if evt_type == "data":
                    answer = ev.get("text", "") or ev.get("content", "")
                elif evt_type != "context" and "output" in ev:
                    answer = ev["output"]
                if evt_type == "end":
                    break
        except Exception as e:
            answer = f"[Error: {e}]"
        return agent["name"], answer

    async def event_stream():
        yield _sse("thinking", {"step": f"Querying {len(agents_list)} agents in parallel..."})

        results: list[tuple[str, str]] = await asyncio.gather(*[_query_agent(a) for a in agents_list])

        for name, _ in results:
            yield _sse("thinking", {"step": f"Received response from {name}"})

        if len(results) == 1:
            final_answer = results[0][1] or "No response"
        else:
            yield _sse("thinking", {"step": "Consolidating results from all agents..."})
            sections = "\n\n".join(
                f"**{name}:**\n{ans}" if ans else f"**{name}:**\n[No data returned]"
                for name, ans in results
            )
            prompt = (
                "You are a senior business analyst. Multiple data agents answered the same question.\n\n"
                f'User question: "{body.message}"\n\n'
                f"Agent responses:\n{sections}\n\n"
                "Write a concise consolidated report. Use a heading per agent for key findings, "
                "then a '## Summary' section with combined insights."
            )
            try:
                final_answer = await call_llm(prompt)
            except Exception:
                final_answer = sections

        yield _sse("answer", {"content": final_answer})

        # Persist to session
        now = datetime.now(timezone.utc)
        agent_names = " & ".join(a["name"] for a in agents_list)
        msg_id = f"msg_{uuid4().hex[:8]}"
        user_msg_doc = {
            "id": f"msg_{uuid4().hex[:8]}",
            "role": "user",
            "content": body.message,
            "agent_name": agent_names,
            "timestamp": now,
        }
        assistant_msg_doc = {
            "id": msg_id,
            "role": "assistant",
            "content": final_answer,
            "agent_name": agent_names,
            "sql_query": None,
            "data": None,
            "chart_config": None,
            "table_config": None,
            "timestamp": now,
        }

        if body.session_id:
            session_doc = await db.chat_sessions.find_one({"_id": ObjectId(body.session_id)})
        else:
            session_doc = None

        if session_doc:
            await db.chat_sessions.update_one(
                {"_id": session_doc["_id"]},
                {"$push": {"messages": {"$each": [user_msg_doc, assistant_msg_doc]}}, "$set": {"updated_at": now}},
            )
            session_id_str = str(session_doc["_id"])
        else:
            new_session = {
                "project_id": ObjectId(project_id),
                "user_id": ObjectId(user["_id"]),
                "title": body.message[:60],
                "agent_id": agents_list[0]["_id"],
                "messages": [user_msg_doc, assistant_msg_doc],
                "pinned_sources": [],
                "is_shared": False,
                "created_at": now,
                "updated_at": now,
            }
            ins = await db.chat_sessions.insert_one(new_session)
            session_id_str = str(ins.inserted_id)

        yield _sse("done", {"session_id": session_id_str, "message_id": msg_id, "latency_ms": 0})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _handle_non_streaming(
    project_id, mindsdb_project, mindsdb_agent, agent, body, session, history, user, db
):
    """Non-streaming chat (for Telegram bot) — consumes the SSE stream internally."""
    sql_query: str | None = None
    answer_text = ""
    columns: list = []
    rows: list = []

    try:
        async for data_line in mindsdb.chat_with_agent_stream(mindsdb_project, mindsdb_agent, history):
            try:
                event_data = json.loads(data_line)
            except json.JSONDecodeError:
                continue

            evt_type = event_data.get("type", "")

            if evt_type == "context":
                content = event_data.get("content", "")
                sql_match = re.search(
                    r"Executing final SQL query:\s*(SELECT\s+[\s\S]+)",
                    content, re.IGNORECASE,
                )
                if sql_match:
                    sql_query = sql_match.group(1).strip()
            elif evt_type == "data":
                answer_text = event_data.get("text", "") or event_data.get("content", "")
                if "query" in event_data:
                    sql_query = event_data["query"]
            elif "output" in event_data:
                answer_text = event_data["output"]

            if evt_type == "end":
                break

    except MindsDBError as e:
        answer_text = f"Error: {e.message}"

    # Re-execute SQL for clean structured data
    if sql_query:
        try:
            result = await mindsdb.sql_query(sql_query)
            columns = result.get("column_names", [])
            rows = result.get("data", [])
        except MindsDBError:
            pass

    msg_id = f"msg_{uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)

    user_msg = {
        "id": f"msg_{uuid4().hex[:8]}",
        "role": "user",
        "content": body.message,
        "agent_name": agent["name"],
        "timestamp": now,
    }
    assistant_msg = {
        "id": msg_id,
        "role": "assistant",
        "content": answer_text or "No response",
        "agent_name": agent["name"],
        "sql_query": sql_query,
        "data": {"columns": columns, "rows": rows} if columns else None,
        "chart_config": None,
        "table_config": None,
        "timestamp": now,
    }

    await db.chat_sessions.update_one(
        {"_id": session["_id"]},
        {"$push": {"messages": {"$each": [user_msg, assistant_msg]}}, "$set": {"updated_at": now}},
    )

    return {
        "session_id": str(session["_id"]),
        "message_id": msg_id,
        "answer": answer_text or "No response",
        "columns": columns,
        "rows": rows,
    }


async def _handle_chart_agent_chat(project_id, body, user, db):
    """Route @ChartAgent messages to our Chart Agent."""
    msg = re.sub(r"^@(chartagent|chart)\s*", "", body.message.strip(), flags=re.IGNORECASE)

    session = await db.chat_sessions.find_one({"_id": ObjectId(body.session_id)}) if body.session_id else None
    if not session:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session required for Chart Agent")

    # Find last message with data
    data_msg = None
    for m in reversed(session.get("messages", [])):
        if m.get("role") == "assistant" and m.get("data") and m["data"].get("columns"):
            data_msg = m
            break

    if not data_msg:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No data found in session to chart")

    org = await db.organizations.find_one({})
    brand_colors = org.get("settings", {}).get("branding", {}).get("chart_palette") if org else None

    current_config = data_msg.get("chart_config")
    if current_config:
        new_config = await chart_agent.modify_chart(msg, current_config, data_msg["data"]["columns"], data_msg["data"]["rows"], brand_colors)
    else:
        new_config = await chart_agent.generate_chart(data_msg["data"]["columns"], data_msg["data"]["rows"], msg, brand_colors)

    # Update message
    await db.chat_sessions.update_one(
        {"_id": session["_id"], "messages.id": data_msg["id"]},
        {"$set": {"messages.$.chart_config": new_config}},
    )

    return {"chart_config": new_config, "message_id": data_msg["id"], "changes_made": new_config.get("reasoning", "")}


async def _handle_table_agent_chat(project_id, body, user, db):
    """Route @TableAgent messages to our Table Agent."""
    msg = re.sub(r"^@(tableagent|table)\s*", "", body.message.strip(), flags=re.IGNORECASE)

    session = await db.chat_sessions.find_one({"_id": ObjectId(body.session_id)}) if body.session_id else None
    if not session:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session required for Table Agent")

    data_msg = None
    for m in reversed(session.get("messages", [])):
        if m.get("role") == "assistant" and m.get("data") and m["data"].get("columns"):
            data_msg = m
            break

    if not data_msg:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No data found in session")

    current_config = data_msg.get("table_config") or {}
    new_config = await table_agent.process(msg, current_config, data_msg["data"]["columns"], data_msg["data"]["rows"])

    await db.chat_sessions.update_one(
        {"_id": session["_id"], "messages.id": data_msg["id"]},
        {"$set": {"messages.$.table_config": new_config}},
    )

    return {"table_config": new_config, "message_id": data_msg["id"], "changes_made": new_config.get("changes_made", "")}


# ── Session management ──

@router.get("/sessions")
async def list_sessions(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    sessions = await db.chat_sessions.find(
        {"project_id": ObjectId(project_id), "user_id": ObjectId(user["_id"])}
    ).sort("updated_at", -1).to_list(100)
    return [_serialize_session(s) for s in sessions]


@router.get("/sessions/{session_id}")
async def get_session(
    project_id: str,
    session_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    session = await db.chat_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return _serialize_session(session)


@router.delete("/sessions/{session_id}")
async def delete_session(
    project_id: str,
    session_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)
    await db.chat_sessions.delete_one({"_id": ObjectId(session_id)})
    return {"status": "deleted"}


# ── Chart/Table agent endpoints (message-level) ──

@router.post("/sessions/{session_id}/chart")
async def generate_chart(
    project_id: str,
    session_id: str,
    body: ChartAgentRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Generate or modify chart for a specific message."""
    await get_current_project(project_id, user, db)
    session = await db.chat_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    msg = next((m for m in session["messages"] if m["id"] == body.message_id), None)
    if not msg or not msg.get("data"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message data not found")

    org = await db.organizations.find_one({})
    brand_colors = org.get("settings", {}).get("branding", {}).get("chart_palette") if org else None

    if body.user_message and msg.get("chart_config"):
        config = await chart_agent.modify_chart(body.user_message, msg["chart_config"], msg["data"]["columns"], msg["data"]["rows"], brand_colors)
    else:
        config = await chart_agent.generate_chart(msg["data"]["columns"], msg["data"]["rows"], body.user_message or "auto", brand_colors)

    await db.chat_sessions.update_one(
        {"_id": ObjectId(session_id), "messages.id": body.message_id},
        {"$set": {"messages.$.chart_config": config}},
    )

    return {"chart_config": config}


@router.post("/sessions/{session_id}/table-agent")
async def table_agent_endpoint(
    project_id: str,
    session_id: str,
    body: TableAgentRequest,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Process table formatting request for a specific message."""
    await get_current_project(project_id, user, db)
    session = await db.chat_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    msg = next((m for m in session["messages"] if m["id"] == body.message_id), None)
    if not msg or not msg.get("data"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message data not found")

    current_config = msg.get("table_config") or {}
    config = await table_agent.process(body.user_message, current_config, msg["data"]["columns"], msg["data"]["rows"])

    await db.chat_sessions.update_one(
        {"_id": ObjectId(session_id), "messages.id": body.message_id},
        {"$set": {"messages.$.table_config": config}},
    )

    return {"table_config": config, "changes_made": config.get("changes_made", "")}


# ── SSE helpers ──

def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"
