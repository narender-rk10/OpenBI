"""Chat analytics — aggregate and per-record token/cost/latency data."""

from bson import ObjectId
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.api.deps import get_current_project, get_current_user, get_db

router = APIRouter(prefix="/api/projects/{project_id}/analytics", tags=["analytics"])


@router.get("/timeseries")
async def get_timeseries(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Daily query counts, token totals, cost, and average latency (last 90 days)."""
    await get_current_project(project_id, user, db)

    pipeline = [
        {"$match": {"project_id": ObjectId(project_id)}},
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}
                },
                "queries": {"$sum": 1},
                "total_tokens": {"$sum": "$total_tokens"},
                "avg_latency_ms": {"$avg": "$latency_ms"},
                "total_cost": {"$sum": "$estimated_cost_usd"},
            }
        },
        {"$sort": {"_id": 1}},
        {"$limit": 90},
    ]
    results = await db.chat_analytics.aggregate(pipeline).to_list(90)
    return [
        {
            "date": r["_id"],
            "queries": r["queries"],
            "total_tokens": int(r["total_tokens"]),
            "avg_latency_ms": round(r["avg_latency_ms"], 1),
            "total_cost": r["total_cost"],
        }
        for r in results
    ]


@router.get("")
async def get_chat_analytics(
    project_id: str,
    limit: int = 200,
    user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await get_current_project(project_id, user, db)

    records = (
        await db.chat_analytics.find({"project_id": ObjectId(project_id)})
        .sort("timestamp", -1)
        .limit(limit)
        .to_list(limit)
    )

    for r in records:
        r["_id"] = str(r["_id"])
        r["project_id"] = str(r["project_id"])
        r["user_id"] = str(r["user_id"]) if r.get("user_id") else None
        if r.get("timestamp"):
            r["timestamp"] = r["timestamp"].isoformat()

    total = len(records)
    total_tokens = sum(r.get("total_tokens", 0) for r in records)
    total_cost = sum(r.get("estimated_cost_usd", 0.0) for r in records)
    avg_latency = sum(r.get("latency_ms", 0) for r in records) / total if total else 0

    error_count = sum(1 for r in records if r.get("error"))
    agent_map: dict[str, dict] = {}
    routing_map: dict[str, int] = {}

    for r in records:
        name = r.get("agent_name") or "Unknown"
        if name not in agent_map:
            agent_map[name] = {"calls": 0, "tokens": 0, "cost": 0.0, "errors": 0}
        agent_map[name]["calls"] += 1
        agent_map[name]["tokens"] += r.get("total_tokens", 0)
        agent_map[name]["cost"] += r.get("estimated_cost_usd", 0.0)
        if r.get("error"):
            agent_map[name]["errors"] += 1

        src = r.get("routing_source") or "unknown"
        routing_map[src] = routing_map.get(src, 0) + 1

    return {
        "summary": {
            "total_calls": total,
            "total_tokens": total_tokens,
            "estimated_cost_usd": round(total_cost, 6),
            "avg_latency_ms": round(avg_latency, 1),
            "error_count": error_count,
            "error_rate_pct": round(error_count / total * 100, 1) if total else 0,
        },
        "by_agent": [
            {"agent": k, **v}
            for k, v in sorted(agent_map.items(), key=lambda x: -x[1]["calls"])
        ],
        "by_routing": [
            {"source": k, "count": v}
            for k, v in sorted(routing_map.items(), key=lambda x: -x[1])
        ],
        "records": records,
    }
