"""PPTX generation via Presenton — the self-hosted AI presentation Docker API."""

import asyncio
import json
import logging
import os

import httpx
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.core.security import decrypt_api_key

logger = logging.getLogger(__name__)

_PRESENTON_URL = os.getenv("PRESENTON_URL", "http://presenton:80")
_PRESENTON_USER = os.getenv("PRESENTON_USERNAME", "openbi")
_PRESENTON_PASS = os.getenv("PRESENTON_PASSWORD", "openbi_pptx_2024")


class PPTXService:

    # cached Presenton session cookies (class-level, shared across requests)
    _presenton_cookies: "dict[str, str] | None" = None

    # ── Presenton auth ─────────────────────────────────────────────────────────

    async def _presenton_ensure_session(self) -> "dict[str, str]":
        """One-time setup + login. Caches and returns cookies for subsequent requests.

        Retries on ConnectError/ConnectTimeout to tolerate Presenton still starting up
        after a container restart (it takes ~30s for nginx+fastapi to be ready).
        """
        if PPTXService._presenton_cookies is not None:
            return PPTXService._presenton_cookies

        creds = {"username": _PRESENTON_USER, "password": _PRESENTON_PASS}
        last_exc: Exception = RuntimeError("Presenton not reachable")
        for attempt in range(6):
            try:
                async with httpx.AsyncClient(timeout=20, verify=False) as client:
                    setup = await client.post(f"{_PRESENTON_URL}/api/v1/auth/setup", json=creds)
                    if setup.status_code not in (200, 201, 409):
                        logger.warning("Presenton auth/setup returned %d: %s", setup.status_code, setup.text[:200])

                    login = await client.post(f"{_PRESENTON_URL}/api/v1/auth/login", json=creds)
                    # Auth may be disabled — treat 404/422 as "no auth needed"
                    if login.status_code in (404, 422):
                        logger.info("Presenton auth disabled (status %d), proceeding without cookies", login.status_code)
                        PPTXService._presenton_cookies = {}
                        return {}
                    login.raise_for_status()

                cookies = dict(login.cookies)
                if not cookies:
                    try:
                        body = login.json()
                        if token := (body.get("access_token") or body.get("token")):
                            cookies = {"access_token": token}
                    except Exception:
                        pass

                # Empty cookies is fine when Presenton auth is disabled
                PPTXService._presenton_cookies = cookies
                logger.info("Presenton session established (cookies: %s)", list(cookies.keys()))
                return cookies

            except (httpx.ConnectTimeout, httpx.ConnectError) as exc:
                last_exc = exc
                wait = 10 * (attempt + 1)
                logger.warning("Presenton not ready (attempt %d/6), retrying in %ds: %s", attempt + 1, wait, exc)
                await asyncio.sleep(wait)

        raise last_exc

    async def _presenton_request(self, method: str, url: str, timeout: float = 30.0, **kwargs) -> httpx.Response:
        """Authenticated request to Presenton. Re-auths once on 401."""
        cookies = await self._presenton_ensure_session()
        async with httpx.AsyncClient(timeout=timeout, verify=False) as client:
            resp = await client.request(method, url, cookies=cookies, **kwargs)
            if resp.status_code == 401:
                PPTXService._presenton_cookies = None
                cookies = await self._presenton_ensure_session()
                resp = await client.request(method, url, cookies=cookies, **kwargs)
        return resp

    # ── shared helpers ─────────────────────────────────────────────────────────

    async def _org_llm(self, db: AsyncIOMotorDatabase) -> tuple[str, str, str, str | None]:
        """Return (provider, api_key, model, base_url)."""
        org = await db.organizations.find_one({})
        settings = org.get("settings", {}) if org else {}
        provider = settings.get("llm_provider", "openai")
        api_key = decrypt_api_key(settings.get("llm_api_key_encrypted", ""))
        model = settings.get("llm_model", "")
        base_url = settings.get("llm_base_url")
        return provider, api_key, model, base_url

    async def _dashboard_context(self, dashboard_id: str, db: AsyncIOMotorDatabase) -> dict:
        dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
        if not dashboard:
            raise ValueError("Dashboard not found")

        widgets = await db.widgets.find({"dashboard_id": ObjectId(dashboard_id)}).to_list(100)

        executive_summary = ""
        widget_list = []
        for w in widgets:
            if w.get("display_type") == "ai_summary":
                executive_summary = w.get("cached_text", "")
                continue
            cached = w.get("cached_data") or {}
            widget_list.append({
                "_id": str(w["_id"]),
                "title": w.get("title", "Widget"),
                "display_type": w.get("display_type", "chart"),
                "columns": cached.get("columns", []),
                "rows": (cached.get("rows") or [])[:25],
            })

        return {
            "dashboard": {"name": dashboard.get("name", "Dashboard")},
            "widgets": widget_list,
            "executive_summary": executive_summary,
        }

    # ── Presenton: external service ────────────────────────────────────────────

    _PRESENTON_CONFIG_PATH = "/app/presenton_data/userConfig.json"

    # OpenAI-compatible base URLs for providers Presenton doesn't support natively
    _OPENAI_COMPAT_URLS: "dict[str, str]" = {
        "groq": "https://api.groq.com/openai/v1",
        "mistral": "https://api.mistral.ai/v1",
    }

    # Keys written for each provider — cleared when switching to avoid stale auth
    _PROVIDER_KEYS: "dict[str, list[str]]" = {
        "openai":    ["OPENAI_API_KEY", "OPENAI_MODEL"],
        "google":    ["GOOGLE_API_KEY", "GOOGLE_MODEL"],
        "anthropic": ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"],
        "deepseek":  ["DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "DEEPSEEK_BASE_URL"],
        "ollama":    ["OLLAMA_MODEL", "OLLAMA_URL"],
        "custom":    ["CUSTOM_LLM_URL", "CUSTOM_LLM_API_KEY", "CUSTOM_MODEL"],
    }

    def _configure_presenton_llm(
        self,
        provider: str,
        api_key: str,
        model: str,
        base_url: str | None = None,
    ) -> None:
        """Write LLM + image config to the shared Presenton userConfig file.

        Presenton reads USER_CONFIG_PATH on every request; writing here before
        generate keeps Presenton's LLM in sync with OpenBI's settings.
        Supports: openai, google/gemini, anthropic, deepseek, groq, mistral,
        ollama, and any custom OpenAI-compatible endpoint (via base_url).
        """
        if not api_key and provider != "ollama":
            return

        try:
            os.makedirs(os.path.dirname(self._PRESENTON_CONFIG_PATH), exist_ok=True)
            existing: dict = {}
            try:
                with open(self._PRESENTON_CONFIG_PATH) as f:
                    existing = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError):
                pass

            existing["DISABLE_IMAGE_GENERATION"] = False

            # Determine the Presenton LLM key and image provider for this provider
            if provider == "openai":
                presenton_llm = "openai"
                image_provider = "dall_e_3"
                extra: dict = {"OPENAI_API_KEY": api_key}
                if model: extra["OPENAI_MODEL"] = model

            elif provider in ("google", "gemini"):
                presenton_llm = "google"
                image_provider = "gemini_flash"
                extra = {"GOOGLE_API_KEY": api_key}
                if model: extra["GOOGLE_MODEL"] = model

            elif provider == "anthropic":
                presenton_llm = "anthropic"
                image_provider = "pexels"
                extra = {"ANTHROPIC_API_KEY": api_key}
                if model: extra["ANTHROPIC_MODEL"] = model

            elif provider == "deepseek":
                presenton_llm = "deepseek"
                image_provider = "pexels"
                extra = {"DEEPSEEK_API_KEY": api_key}
                if model: extra["DEEPSEEK_MODEL"] = model
                if base_url: extra["DEEPSEEK_BASE_URL"] = base_url

            elif provider == "ollama":
                presenton_llm = "ollama"
                image_provider = "pexels"
                extra = {}
                if model: extra["OLLAMA_MODEL"] = model
                if base_url: extra["OLLAMA_URL"] = base_url

            else:
                # Groq, Mistral, or any custom OpenAI-compatible provider
                custom_url = base_url or self._OPENAI_COMPAT_URLS.get(provider)
                if custom_url:
                    presenton_llm = "custom"
                    extra = {"CUSTOM_LLM_URL": custom_url, "CUSTOM_LLM_API_KEY": api_key}
                    if model: extra["CUSTOM_MODEL"] = model
                else:
                    presenton_llm = "openai"
                    extra = {"OPENAI_API_KEY": api_key}
                    if model: extra["OPENAI_MODEL"] = model
                image_provider = "pexels"

            # Clear stale keys from all other providers before writing new ones
            for keys in self._PROVIDER_KEYS.values():
                for k in keys:
                    existing.pop(k, None)

            existing["LLM"] = presenton_llm
            existing["DISABLE_IMAGE_GENERATION"] = False
            existing["IMAGE_PROVIDER"] = image_provider
            existing.update(extra)

            with open(self._PRESENTON_CONFIG_PATH, "w") as f:
                json.dump(existing, f)

            logger.info(
                "Updated Presenton config (openbi_provider=%s → presenton_llm=%s, image=%s)",
                provider, existing["LLM"], existing.get("IMAGE_PROVIDER"),
            )
        except Exception as exc:
            logger.warning("Could not write Presenton LLM config: %s", exc)

    async def presenton_submit(
        self,
        dashboard_id: str,
        db: AsyncIOMotorDatabase,
        feedback: str | None = None,
    ) -> str:
        """Configure Presenton's LLM, then submit an async generate task.

        Returns the Presenton task_id immediately (does NOT wait for generation).
        Callers poll ``presenton_task_status`` so no single request is held open
        for the (potentially several-minute) generation — that would be cut off
        by proxy/load-balancer read timeouts.
        """
        context = await self._dashboard_context(dashboard_id, db)
        provider, api_key, model, base_url = await self._org_llm(db)

        # Push the in-app LLM config to Presenton before every generate call
        self._configure_presenton_llm(provider, api_key, model, base_url)

        prompt = self._build_presenton_prompt(context, feedback)
        n_slides = min(len(context["widgets"]) + 2, 8)

        resp = await self._presenton_request(
            "POST",
            f"{_PRESENTON_URL}/api/v1/ppt/presentation/generate/async",
            timeout=60.0,
            json={"content": prompt, "n_slides": n_slides, "export_as": "pptx"},
        )
        resp.raise_for_status()
        task_id = resp.json()["id"]
        logger.info("Presenton async task %s started", task_id)
        return task_id

    async def presenton_task_status(self, task_id: str) -> dict:
        """Check a Presenton async task once (fast, returns immediately).

        Returns one of:
          {"status": "pending"}
          {"status": "completed", "presentation_id", "edit_path", "download_path"}
          {"status": "failed", "error"}
        """
        status_resp = await self._presenton_request(
            "GET",
            f"{_PRESENTON_URL}/api/v1/ppt/presentation/status/{task_id}",
            timeout=20.0,
        )
        body = status_resp.json()
        status = body.get("status", "")
        if status == "completed":
            data = body.get("data") or {}
            pid = data["presentation_id"]
            return {
                "status": "completed",
                "presentation_id": pid,
                "edit_path": data.get("edit_path") or f"/editor/{pid}",
                "download_path": data.get("path") or "",
            }
        if status in ("failed", "error"):
            return {"status": "failed", "error": body.get("error", "unknown")}
        return {"status": status or "pending"}

    async def presenton_generate(
        self,
        dashboard_id: str,
        db: AsyncIOMotorDatabase,
        feedback: str | None = None,
    ) -> tuple[str, str, str]:
        """Submit + server-side poll until done. Returns (presentation_id, edit_path, download_path).

        Used by server-to-server callers (e.g. the Telegram bot) where holding the
        request open for the whole generation is fine. Browser clients should use
        ``presenton_submit`` + ``presenton_task_status`` polling instead.
        """
        task_id = await self.presenton_submit(dashboard_id, db, feedback)

        # Poll until completed (max 10 min); ignore transient timeouts
        for attempt in range(60):
            await asyncio.sleep(10)
            try:
                result = await self.presenton_task_status(task_id)
            except (httpx.ReadTimeout, httpx.ConnectError, httpx.RemoteProtocolError) as exc:
                logger.warning("Presenton status poll transient error (attempt %d): %s", attempt + 1, exc)
                continue

            status = result["status"]
            logger.info("Presenton task %s: %s (attempt %d)", task_id, status, attempt + 1)
            if status == "completed":
                logger.info("Presenton generated presentation %s", result["presentation_id"])
                return result["presentation_id"], result["edit_path"], result["download_path"]
            if status == "failed":
                raise ValueError(f"Presenton generation failed: {result.get('error', 'unknown')}")

        raise TimeoutError("Presenton generation timed out after 10 minutes")

    async def presenton_download(self, presentation_id: str, download_path: str = "") -> bytes:
        """Download PPTX bytes from Presenton for a previously generated presentation."""
        candidates: list[str] = []
        if download_path:
            candidates.append(f"{_PRESENTON_URL}{download_path}")
        candidates += [
            f"{_PRESENTON_URL}/api/v1/ppt/presentation/{presentation_id}/export",
            f"{_PRESENTON_URL}/api/v1/ppt/presentation/{presentation_id}/download",
        ]

        for url in candidates:
            try:
                r = await self._presenton_request("GET", url, timeout=60.0)
                if r.status_code == 200 and r.content:
                    return r.content
            except Exception:
                continue

        raise ValueError(f"Could not download PPTX for {presentation_id} from Presenton")

    def _build_presenton_prompt(self, context: dict, feedback: str | None) -> str:
        name = context["dashboard"]["name"]
        parts = [f"Create a professional data presentation for the '{name}' dashboard.\n"]

        if context.get("executive_summary"):
            parts.append(f"Executive Summary:\n{context['executive_summary']}\n")

        parts.append("Dashboard widgets (each becomes a slide):")
        for w in context["widgets"]:
            parts.append(f"\n### {w['title']} ({w['display_type']})")
            cols = w.get("columns") or []
            if cols:
                parts.append(f"Columns: {', '.join(str(c) for c in cols[:8])}")
            rows = w.get("rows") or []
            if rows:
                parts.append(f"Sample data ({len(rows)} rows):")
                for row in rows[:5]:
                    parts.append("  " + " | ".join("" if v is None else str(v) for v in row[:8]))

        if feedback:
            parts.append(f"\nSpecial instructions: {feedback}")

        return "\n".join(parts)


pptx_service = PPTXService()


async def run_presenton_job(job_id: str, db: AsyncIOMotorDatabase) -> None:
    """Background task: submit to Presenton and poll until it finishes.

    Runs entirely server-side with no time limit — the user can close their
    browser and come back to check status via GET /pptx/presenton/jobs.
    """
    from datetime import datetime, timezone
    from bson import ObjectId as _ObjId

    _now = lambda: datetime.now(timezone.utc)

    async def _update(fields: dict) -> None:
        await db.pptx_jobs.update_one(
            {"_id": _ObjId(job_id)},
            {"$set": {**fields, "updated_at": _now()}},
        )

    try:
        await _update({"status": "processing"})
        doc = await db.pptx_jobs.find_one({"_id": _ObjId(job_id)})
        if not doc:
            return

        task_id = await pptx_service.presenton_submit(
            str(doc["dashboard_id"]), db, feedback=doc.get("feedback")
        )

        # Poll until Presenton finishes — no hard timeout.
        while True:
            await asyncio.sleep(10)
            try:
                result = await pptx_service.presenton_task_status(task_id)
            except Exception:
                continue  # transient Presenton/network error — keep trying

            if result["status"] == "completed":
                pid = result["presentation_id"]
                await _update({
                    "status": "completed",
                    "presentation_id": pid,
                    "edit_path": result["edit_path"],
                    "download_path": result["download_path"],
                })
                # Cache PPTX bytes immediately — Presenton is ephemeral, restarts lose files
                pptx_bytes = None
                try:
                    pptx_bytes = await pptx_service.presenton_download(pid, result["download_path"])
                    logger.info("Cached %d bytes for presentation %s", len(pptx_bytes), pid)
                except Exception as cache_err:
                    logger.warning("Could not cache PPTX bytes for %s: %s", pid, cache_err)

                existing = await db.pptx_presentations.find_one({"presentation_id": pid})
                if not existing:
                    rec = {
                        "dashboard_id": doc["dashboard_id"],
                        "project_id": doc["project_id"],
                        "user_id": doc["user_id"],
                        "presentation_id": pid,
                        "edit_path": result["edit_path"],
                        "download_path": result["download_path"],
                        "feedback": doc.get("feedback"),
                        "created_at": _now(),
                    }
                    if pptx_bytes:
                        rec["pptx_bytes"] = pptx_bytes
                    await db.pptx_presentations.insert_one(rec)
                elif pptx_bytes and not existing.get("pptx_bytes"):
                    await db.pptx_presentations.update_one(
                        {"presentation_id": pid},
                        {"$set": {"pptx_bytes": pptx_bytes}},
                    )
                logger.info("pptx job %s completed: presentation %s", job_id, pid)
                return

            if result["status"] == "failed":
                await _update({"status": "failed", "error": result.get("error", "Presenton reported failure")})
                logger.warning("pptx job %s failed: %s", job_id, result.get("error"))
                return

    except Exception as exc:
        logger.exception("pptx job %s raised an unexpected error", job_id)
        try:
            from datetime import datetime, timezone
            from bson import ObjectId as _ObjId2
            await db.pptx_jobs.update_one(
                {"_id": _ObjId2(job_id)},
                {"$set": {"status": "failed", "error": str(exc), "updated_at": datetime.now(timezone.utc)}},
            )
        except Exception:
            pass
