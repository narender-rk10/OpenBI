"""Centralized MindsDB HTTP API client — ALL MindsDB calls go through here.

Every call funnels through `_request`, which:
  * logs the request method/path,
  * extracts a meaningful error from the response body on failure,
  * raises a `MindsDBError` carrying the upstream message so callers (FastAPI
    routes) can surface it directly to the UI.
"""

import logging
from uuid import uuid4

import httpx

from backend.config import settings


logger = logging.getLogger("openbi.mindsdb")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("[%(asctime)s] %(name)s %(levelname)s: %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class MindsDBError(Exception):
    """Raised whenever a MindsDB call fails.

    `message` is human-readable and safe to surface in API responses; `status_code`
    is the upstream HTTP status (or None for transport errors)."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _extract_error(resp: httpx.Response) -> str:
    """Pull the most useful error string out of a MindsDB response body."""
    try:
        body = resp.json()
        if isinstance(body, dict):
            for key in ("message", "error", "detail", "error_message"):
                val = body.get(key)
                if val:
                    return str(val)
        return resp.text or f"HTTP {resp.status_code}"
    except Exception:
        return resp.text or f"HTTP {resp.status_code}"


class MindsDBClient:
    def __init__(self):
        self.base_url = settings.MINDSDB_URL
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url, timeout=60.0, follow_redirects=True
            )
        return self._client

    # ── Core request wrapper ────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | list | None = None,
        files: dict | None = None,
        data: dict | None = None,
        params: dict | None = None,
        timeout: float | None = None,
        operation: str = "",
    ) -> httpx.Response:
        """Execute a MindsDB HTTP call with consistent logging + error handling."""
        op = operation or f"{method} {path}"
        try:
            resp = await self.client.request(
                method,
                path,
                json=json,
                files=files,
                data=data,
                params=params,
                timeout=timeout,
            )
        except httpx.ConnectError as e:
            logger.error("MindsDB unreachable during %s: %s", op, e)
            raise MindsDBError("MindsDB is not reachable")
        except httpx.TimeoutException as e:
            logger.error("MindsDB timeout during %s: %s", op, e)
            raise MindsDBError(f"MindsDB timed out during {op}")
        except httpx.HTTPError as e:
            logger.error("MindsDB transport error during %s: %s", op, e)
            raise MindsDBError(f"MindsDB transport error: {e}")

        if resp.status_code >= 400:
            err = _extract_error(resp)
            logger.error("MindsDB %s failed (%d): %s", op, resp.status_code, err)
            raise MindsDBError(f"{op} failed: {err}", status_code=resp.status_code)

        return resp

    # ── SQL Query (universal) ───────────────────────────────────────────

    async def sql_query(self, query: str) -> dict:
        """Execute any SQL via MindsDB. Returns {column_names: [...], data: [[...]]}."""
        # Transparently rewrite friendly connection names to internal mindsdb database names
        if query:
            try:
                from backend.core.database import get_db
                import re
                db = get_db()
                conns = await db.connections.find({}).to_list(1000)
                if conns:
                    # Sort connections by name length descending to avoid partial matches
                    conns.sort(key=lambda x: len(x["name"]), reverse=True)
                    for conn in conns:
                        friendly_name = conn.get("name")
                        internal_name = conn.get("mindsdb_db_name")
                        if friendly_name and internal_name:
                            # Match optionally quoted name as a whole word
                            # e.g., HR_MySQL, `HR_MySQL`, "HR_MySQL"
                            pattern = re.compile(rf'([`"]?)\b{re.escape(friendly_name)}\b\1', re.IGNORECASE)
                            query = pattern.sub(internal_name, query)
            except Exception as e:
                logger.warning("Failed to rewrite database names in SQL query: %s", e)

        logger.info("SQL: %s", query[:200])
        resp = await self._request(
            "POST", "/api/sql/query", json={"query": query}, operation="SQL query"
        )
        result = resp.json()
        # MindsDB returns {type: "error", error_message: "..."} as 200 OK sometimes.
        if isinstance(result, dict) and result.get("type") == "error":
            err = result.get("error_message") or "Unknown SQL error"
            logger.error("MindsDB SQL error: %s", err)
            raise MindsDBError(f"SQL error: {err}")
        return result

    # ── Databases (Data Sources) ────────────────────────────────────────

    async def create_database(self, name: str, engine: str, params: dict) -> dict:
        resp = await self._request(
            "POST",
            "/api/databases",
            json={"database": {"name": name, "engine": engine, "parameters": params}},
            operation=f"create database '{name}'",
        )
        return resp.json()

    async def test_connection(self, engine: str, params: dict) -> dict:
        """Test connection: try /api/databases/status first, fall back to create-query-delete."""
        try:
            resp = await self.client.post(
                "/api/databases/status",
                json={"engine": engine, **params},
            )
            if resp.status_code not in (404, 405):
                if resp.status_code >= 400:
                    return {"status": "error", "detail": _extract_error(resp)}
                result = resp.json()
                status_val = result.get("status", "")
                if status_val == "success":
                    return {"status": "success"}
                detail = result.get("detail") or result.get("error") or "Connection failed"
                return {"status": "error", "detail": detail}
        except httpx.ConnectError:
            return {"status": "error", "detail": "MindsDB is not reachable"}
        except Exception:
            pass

        return await self._test_connection_via_temp_db(engine, params)

    async def _test_connection_via_temp_db(self, engine: str, params: dict) -> dict:
        temp_name = f"_test_{uuid4().hex[:12]}"
        try:
            resp = await self.client.post(
                "/api/databases",
                json={"database": {"name": temp_name, "engine": engine, "parameters": params}},
            )
            if resp.status_code >= 400:
                return {"status": "error", "detail": _extract_error(resp)}

            try:
                tables_resp = await self.client.get(
                    f"/api/databases/{temp_name}/tables",
                    timeout=30.0,
                )
                if tables_resp.status_code >= 400:
                    return {"status": "error", "detail": _extract_error(tables_resp)}
                return {"status": "success"}
            except Exception as e:
                return {"status": "error", "detail": str(e)}
        except httpx.ConnectError:
            return {"status": "error", "detail": "MindsDB is not reachable"}
        except Exception as e:
            return {"status": "error", "detail": str(e)}
        finally:
            try:
                await self.client.delete(f"/api/databases/{temp_name}")
            except Exception:
                pass

    async def list_databases(self) -> list:
        resp = await self._request("GET", "/api/databases", operation="list databases")
        return resp.json()

    async def delete_database(self, name: str):
        await self._request(
            "DELETE", f"/api/databases/{name}", operation=f"delete database '{name}'"
        )

    async def list_tables(self, db_name: str) -> list:
        # Try REST first
        try:
            resp = await self._request(
                "GET",
                f"/api/databases/{db_name}/tables",
                operation=f"list tables in '{db_name}'",
            )
            data = resp.json()
            if data:
                return data
        except MindsDBError:
            pass

        # Fallback: SHOW TABLES via SQL — needed for handlers (e.g. MongoDB)
        # whose REST tables endpoint returns empty.
        try:
            result = await self.sql_query(f"SHOW TABLES FROM {db_name}")
            rows = result.get("data", []) or []
            cols = result.get("column_names", []) or []
            name_idx = 0
            for i, c in enumerate(cols):
                if str(c).lower() in ("name", "table_name", "tables_in_" + db_name.lower()):
                    name_idx = i
                    break
            return [{"name": row[name_idx]} for row in rows if row]
        except MindsDBError:
            return []

    # ── Projects ────────────────────────────────────────────────────────

    async def create_project(self, name: str):
        return await self.sql_query(f"CREATE PROJECT IF NOT EXISTS {name}")

    async def ensure_project(self, name: str):
        """Idempotent — creates the project if it doesn't exist."""
        return await self.create_project(name)

    async def drop_project(self, name: str):
        return await self.sql_query(f"DROP PROJECT {name}")

    # ── Knowledge Bases ─────────────────────────────────────────────────

    # ── Vector-store helpers ────────────────────────────────────────────

    _VECTORSTORE_NAME = "openbi_vecs"

    async def _ensure_vectorstore(self) -> str:
        """Idempotently create a local ChromaDB integration in MindsDB.

        MindsDB requires an explicit vector-store integration for every knowledge
        base.  This helper creates a persistent in-process ChromaDB instance the
        first time it is called; subsequent calls are a cheap GET that returns
        immediately when the integration already exists.

        Returns the integration name to pass as storage.database."""
        name = self._VECTORSTORE_NAME
        try:
            await self._request(
                "GET",
                f"/api/databases/{name}",
                operation=f"check vectorstore '{name}'",
            )
            return name  # already exists
        except MindsDBError:
            pass

        logger.info("Creating ChromaDB vectorstore integration '%s'", name)
        await self._request(
            "POST",
            "/api/databases",
            json={
                "database": {
                    "name": name,
                    "engine": "chromadb",
                    "parameters": {"persist_directory": "/tmp/openbi_vecs"},
                }
            },
            operation=f"create vectorstore '{name}'",
        )
        return name

    async def create_knowledge_base(self, project: str, kb_config: dict) -> dict:
        # MindsDB requires an explicit storage database (vector store integration).
        # If the caller hasn't supplied one we auto-provision a local ChromaDB instance.
        kb_config = dict(kb_config)
        storage = kb_config.pop("storage", None)
        if not storage:
            vecs_db = await self._ensure_vectorstore()
            storage = {
                "database": vecs_db,
                "table": kb_config["name"].replace("-", "_"),
            }
        kb_body = {**kb_config, "storage": storage}
        resp = await self._request(
            "POST",
            f"/api/projects/{project}/knowledge_bases",
            json={"knowledge_base": kb_body},
            operation=f"create KB '{kb_config.get('name', '?')}'",
        )
        return resp.json()

    async def list_knowledge_bases(self, project: str) -> list:
        resp = await self._request(
            "GET",
            f"/api/projects/{project}/knowledge_bases",
            operation=f"list KBs in '{project}'",
        )
        return resp.json()

    async def delete_knowledge_base(self, project: str, kb_name: str):
        await self._request(
            "DELETE",
            f"/api/projects/{project}/knowledge_bases/{kb_name}",
            operation=f"delete KB '{kb_name}'",
        )

    async def insert_into_kb(self, project: str, kb_name: str, source: str):
        return await self.sql_query(f"INSERT INTO {project}.{kb_name} SELECT * FROM {source}")

    # ── Files ───────────────────────────────────────────────────────────

    async def upload_file(self, file_name: str, file_bytes: bytes, original_name: str):
        resp = await self._request(
            "PUT",
            f"/api/files/{file_name}",
            files={"file": (original_name, file_bytes)},
            data={"original_file_name": original_name},
            operation=f"upload file '{original_name}'",
        )
        return resp.json()

    async def delete_file(self, file_name: str):
        await self._request(
            "DELETE", f"/api/files/{file_name}", operation=f"delete file '{file_name}'"
        )

    # ── Skills ──────────────────────────────────────────────────────────

    async def create_skill(self, project: str, skill_config: dict) -> dict:
        resp = await self._request(
            "POST",
            f"/api/projects/{project}/skills",
            json={"skill": skill_config},
            operation=f"create skill in '{project}'",
        )
        return resp.json()

    async def delete_skill(self, project: str, skill_name: str):
        await self._request(
            "DELETE",
            f"/api/projects/{project}/skills/{skill_name}",
            operation=f"delete skill '{skill_name}'",
        )

    # ── Agents ──────────────────────────────────────────────────────────

    async def create_agent(self, project: str, agent_config: dict) -> dict:
        resp = await self._request(
            "POST",
            f"/api/projects/{project}/agents",
            json={"agent": agent_config},
            operation=f"create agent '{agent_config.get('name', '?')}'",
        )
        return resp.json()

    async def list_agents(self, project: str) -> list:
        resp = await self._request(
            "GET",
            f"/api/projects/{project}/agents",
            operation=f"list agents in '{project}'",
        )
        return resp.json()

    async def get_agent(self, project: str, agent_name: str) -> dict:
        resp = await self._request(
            "GET",
            f"/api/projects/{project}/agents/{agent_name}",
            operation=f"get agent '{agent_name}'",
        )
        return resp.json()

    async def update_agent(self, project: str, agent_name: str, agent_config: dict) -> dict:
        resp = await self._request(
            "PUT",
            f"/api/projects/{project}/agents/{agent_name}",
            json={"agent": agent_config},
            operation=f"update agent '{agent_name}'",
        )
        return resp.json()

    async def delete_agent(self, project: str, agent_name: str):
        await self._request(
            "DELETE",
            f"/api/projects/{project}/agents/{agent_name}",
            operation=f"delete agent '{agent_name}'",
        )

    # ── Agent Chat (SSE streaming) ──────────────────────────────────────

    async def chat_with_agent_stream(self, project: str, agent_name: str, messages: list):
        """Async generator yielding SSE data lines from MindsDB agent."""
        try:
            async with self.client.stream(
                "POST",
                f"/api/projects/{project}/agents/{agent_name}/completions/stream",
                json={"messages": messages},
                headers={"Accept": "text/event-stream"},
                timeout=120.0,
            ) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    err = body.decode(errors="replace") or f"HTTP {response.status_code}"
                    logger.error("MindsDB chat stream failed (%d): %s", response.status_code, err)
                    raise MindsDBError(
                        f"Agent chat failed: {err}", status_code=response.status_code
                    )
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        yield line[6:]
        except httpx.ConnectError:
            logger.error("MindsDB unreachable during agent chat stream")
            raise MindsDBError("MindsDB is not reachable")
        except httpx.TimeoutException:
            logger.error("MindsDB timeout during agent chat stream")
            raise MindsDBError("MindsDB timed out during agent chat")

    async def chat_with_agent(self, project: str, agent_name: str, messages: list) -> dict:
        """Non-streaming agent chat — uses SQL to bypass trace_id bug in REST endpoint."""
        last_question = ""
        for msg in reversed(messages):
            if msg.get("question"):
                last_question = msg["question"].replace("'", "\\'")
                break

        query = f"SELECT * FROM {project}.{agent_name} WHERE question = '{last_question}'"
        result = await self.sql_query(query)

        answer = ""
        if result.get("data") and len(result["data"]) > 0:
            cols = result.get("column_names", [])
            row = result["data"][-1]
            for col_name in ("answer", "output", "content", "response"):
                if col_name in cols:
                    idx = cols.index(col_name)
                    answer = row[idx] if idx < len(row) else ""
                    break
            if not answer and row:
                answer = str(row[-1])

        return {"message": {"content": answer}}

    # ── Jobs ────────────────────────────────────────────────────────────

    async def create_job(self, project: str, job_config: dict) -> dict:
        resp = await self._request(
            "POST",
            f"/api/projects/{project}/jobs",
            json=job_config,
            operation=f"create job in '{project}'",
        )
        return resp.json()

    async def list_jobs(self, project: str) -> list:
        resp = await self._request(
            "GET", f"/api/projects/{project}/jobs", operation=f"list jobs in '{project}'"
        )
        return resp.json()

    async def delete_job(self, project: str, job_name: str):
        await self._request(
            "DELETE",
            f"/api/projects/{project}/jobs/{job_name}",
            operation=f"delete job '{job_name}'",
        )

    # ── Models ──────────────────────────────────────────────────────────

    async def create_model(self, project: str, query: str) -> dict:
        resp = await self._request(
            "POST",
            f"/api/projects/{project}/models",
            json={"query": query},
            operation=f"create model in '{project}'",
        )
        return resp.json()

    async def list_models(self, project: str) -> list:
        resp = await self._request(
            "GET",
            f"/api/projects/{project}/models",
            operation=f"list models in '{project}'",
        )
        return resp.json()

    async def delete_model(self, project: str, model_name: str):
        await self._request(
            "DELETE",
            f"/api/projects/{project}/models/{model_name}",
            operation=f"delete model '{model_name}'",
        )

    async def predict(self, project: str, model_name: str, data: list) -> dict:
        resp = await self._request(
            "POST",
            f"/api/projects/{project}/models/{model_name}/predict",
            json=data,
            operation=f"predict with model '{model_name}'",
        )
        return resp.json()

    # ── Views ───────────────────────────────────────────────────────────

    async def create_view(self, project: str, name: str, query: str) -> dict:
        resp = await self._request(
            "POST",
            f"/api/projects/{project}/views",
            json={"view": {"name": name, "query": query}},
            operation=f"create view '{name}'",
        )
        return resp.json()

    # ── Additional Database Methods ──────────────────────────────────────

    async def get_database(self, name: str) -> dict:
        resp = await self._request(
            "GET", f"/api/databases/{name}", operation=f"get database '{name}'"
        )
        return resp.json()

    async def update_database(self, name: str, engine: str, params: dict) -> dict:
        resp = await self._request(
            "PUT",
            f"/api/databases/{name}",
            json={"database": {"engine": engine, "parameters": params}},
            operation=f"update database '{name}'",
        )
        return resp.json()

    # ── Additional Table Methods ──────────────────────────────────────

    async def get_table(self, db_name: str, table_name: str) -> dict:
        resp = await self._request(
            "GET",
            f"/api/databases/{db_name}/tables/{table_name}",
            operation=f"get table '{db_name}.{table_name}'",
        )
        return resp.json()

    async def delete_table(self, db_name: str, table_name: str):
        await self._request(
            "DELETE",
            f"/api/databases/{db_name}/tables/{table_name}",
            operation=f"delete table '{db_name}.{table_name}'",
        )

    # ── Additional Skill Methods ──────────────────────────────────────

    async def update_skill(self, project: str, skill_name: str, skill_config: dict) -> dict:
        resp = await self._request(
            "PUT",
            f"/api/projects/{project}/skills/{skill_name}",
            json={"skill": skill_config},
            operation=f"update skill '{skill_name}'",
        )
        return resp.json()

    # ── Additional Model Methods ──────────────────────────────────────

    async def get_model(self, project: str, model_name: str) -> dict:
        resp = await self._request(
            "GET",
            f"/api/projects/{project}/models/{model_name}",
            operation=f"get model '{model_name}'",
        )
        return resp.json()

    async def describe_model(self, project: str, model_name: str, attribute: str = "info") -> dict:
        resp = await self._request(
            "GET",
            f"/api/projects/{project}/models/{model_name}/describe",
            params={"attribute": attribute},
            operation=f"describe model '{model_name}'",
        )
        return resp.json()

    # ── Health ──────────────────────────────────────────────────────────

    async def health_check(self) -> bool:
        try:
            resp = await self.client.get("/api/status")
            return resp.status_code == 200
        except Exception:
            return False


# Singleton instance
mindsdb = MindsDBClient()
