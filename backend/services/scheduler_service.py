"""In-process APScheduler — no Celery worker or Beat container needed.

Starts inside the FastAPI lifespan, loads all active schedules from MongoDB,
and runs them according to their cron expressions.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="UTC")
    return _scheduler


async def start_scheduler(db) -> None:
    """Load active schedules from DB and start the scheduler."""
    scheduler = get_scheduler()
    if scheduler.running:
        return

    schedules = await db.schedules.find({"is_active": True}).to_list(1000)
    for s in schedules:
        _register(scheduler, str(s["_id"]), s["cron"])

    scheduler.start()
    logger.info("Scheduler started — %d active schedule(s) loaded", len(schedules))


def stop_scheduler() -> None:
    scheduler = get_scheduler()
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def register_schedule(schedule_id: str, cron: str) -> None:
    """Add or replace a running job. Safe to call before start."""
    scheduler = get_scheduler()
    if scheduler.running:
        _register(scheduler, schedule_id, cron)


def unregister_schedule(schedule_id: str) -> None:
    """Remove a job if it exists."""
    scheduler = get_scheduler()
    if not scheduler.running:
        return
    try:
        scheduler.remove_job(schedule_id)
    except Exception:
        pass


def _register(scheduler: AsyncIOScheduler, schedule_id: str, cron: str) -> None:
    from backend.services.report_runner import run_schedule
    try:
        trigger = CronTrigger.from_crontab(cron, timezone="UTC")
        scheduler.add_job(
            run_schedule,
            trigger=trigger,
            id=schedule_id,
            args=[schedule_id],
            replace_existing=True,
            misfire_grace_time=300,  # allow up to 5 min late
        )
        logger.debug("Registered schedule job %s  cron=%r", schedule_id, cron)
    except Exception as e:
        logger.error("Failed to register schedule %s: %s", schedule_id, e)
