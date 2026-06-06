# Presenton Integration History

## What Is Presenton

Self-hosted AI presentation generator running as a Docker container (`openbi-presenton-1`).
Replaces LLM-based PPTX generation with in-browser slide editing via iframe.

- **Port**: `127.0.0.1:7771:80` (localhost-only for security)
- **Dockerfile**: `Dockerfile.presenton` (multi-stage build from GitHub source)
- **Backend service**: `backend/services/pptx_service.py` — `PPTXService` class
- **Frontend component**: `frontend/src/components/dashboard/PPTXEditor.tsx`

---

## Session 1 — Initial Integration (2026-05-27)

### Goal
Replace direct LLM → python-pptx pipeline with Presenton for better slide quality and in-browser editing.

### Work Done
- Created `backend/services/pptx_service.py` with `PPTXService` class
- Added `backend/api/dashboards.py` endpoint `POST /{dashboard_id}/pptx/presenton`
- Created `frontend/src/components/dashboard/PPTXEditor.tsx` with iframe + download UI
- Wired up MongoDB collection `pptx_presentations` for history
- Added `presenton_data` shared volume to `docker-compose.yml`

---

## Problem Log — Auth (428 Precondition Required)

**Symptom**: Every Presenton API call returned `428 Precondition Required`.

**Root cause**: Presenton requires one-time auth setup before any API call works.

**Fix**: Added `_presenton_ensure_session()`:
1. `POST /api/v1/auth/setup` with credentials (409 = already done, that's fine)
2. `POST /api/v1/auth/login` → returns `presenton_session` cookie
3. Cookie cached at class level (`PPTXService._presenton_cookies`)
4. `_presenton_request()` auto re-auths on 401 response

**Env vars**: `PRESENTON_USERNAME` / `PRESENTON_PASSWORD` (defaults: `openbi` / `openbi_pptx_2024`)

---

## Problem Log — LLM Config ("Google API Key is not set")

**Symptom**: Presenton returned `400 Bad Request` — "Google API Key is not set" — even though `GOOGLE_API_KEY` was in docker-compose.yml.

**Root cause (deep)**: Presenton's `start.js` hardcodes:
```js
const USER_CONFIG_PATH = join(appDataDirectory, "userConfig.json")
```
This overrides any docker-compose env var for `USER_CONFIG_PATH`. Presenton's `UserConfigEnvUpdateMiddleware` runs `update_env_with_user_config()` on **every request**, reading from this hardcoded path and overwriting `os.environ` in the FastAPI process. If `userConfig.json` doesn't have `GOOGLE_API_KEY`, the env var from docker-compose is wiped.

**Fix**: Backend writes LLM config to `/app/presenton_data/userConfig.json` (shared volume) **before** every generate call.

- Backend mounts volume at `/app/presenton_data`
- Presenton mounts same volume at `/app_data`
- So `/app/presenton_data/userConfig.json` (backend) = `/app_data/userConfig.json` (presenton)
- `_configure_presenton_llm()` reads existing file, merges LLM fields, writes back (preserves AUTH_* fields)

**docker-compose.yml** — added shared volume:
```yaml
backend:
  volumes:
    - presenton_data:/app/presenton_data

presenton:
  volumes:
    - presenton_data:/app_data

volumes:
  presenton_data:
```

---

## Problem Log — Wrong Generate Payload Field

**Symptom**: `422 Unprocessable Entity` on generate call.

**Root cause**: Code used `json={"prompt": ...}` but Presenton's `GeneratePresentationRequest` uses `content` field.

**Fix**:
```python
json={"content": prompt, "n_slides": n_slides, "export_as": "pptx"}
```

---

## Problem Log — Sync Generate Times Out (ReadTimeout after 5-10 min)

**Symptom**: `httpx.ReadTimeout` on `POST /api/v1/ppt/presentation/generate`.

**Root cause**: Sync endpoint blocks for 5-10+ minutes. Presenton runs 3 LLM validation retries per slide for text that is too long. With 11 slides, this stacks up.

**Fix**: Switched to async endpoint:
1. `POST /api/v1/ppt/presentation/generate/async` → returns `{id: "task-xxx", status: "pending"}` immediately
2. Poll `GET /api/v1/ppt/presentation/status/{task_id}` every 10s
3. Status values: `"pending"` → `"completed"` or `"error"`
4. Max 60 attempts × 10s = 10 minutes

---

## Problem Log — 502 Bad Gateway During Polling

**Symptom**: Backend returned `502 Bad Gateway` while Presenton was still generating. Presenton logs showed active validation loops for 11 slides.

**Root cause**: `httpx.ReadTimeout` on status poll (15s timeout) while Presenton is busy generating. `dashboards.py` converts all exceptions to `502`.

**Fix**: Wrapped each status poll in try/except — transient errors just `continue`:
```python
except (httpx.ReadTimeout, httpx.ConnectError, httpx.RemoteProtocolError) as exc:
    logger.warning("Presenton status poll transient error (attempt %d): %s", attempt + 1, exc)
    continue
```
Also bumped poll timeout from 15s → 20s.

---

## Problem Log — Image Generation Disabled

**Symptom**: Presentations generated without images.

**Root cause**:
1. `docker-compose.yml` had `DISABLE_IMAGE_GENERATION: "true"` in presenton env
2. This value was also written into the persisted `userConfig.json` — so removing the env var alone was not enough

**Fix**:
1. Removed `DISABLE_IMAGE_GENERATION: "true"` from docker-compose.yml presenton service
2. `_configure_presenton_llm()` now explicitly writes `DISABLE_IMAGE_GENERATION: False` to `userConfig.json` before every generate call
3. Also sets `IMAGE_PROVIDER` based on LLM:
   - `google` / `gemini` → `gemini_flash`
   - `openai` → `dall_e_3`

---

## Problem Log — Iframe 401 (Presentation Doesn't Load in Browser)

**Symptom**: `GET /api/v1/ppt/presentation/{uuid} 401 Unauthorized` in Presenton logs after generation. The iframe in PPTXEditor showed a blank/broken page.

**Root cause**: Browser doesn't have the `presenton_session` cookie (that's held only by the backend). The Next.js app inside the iframe makes API calls to Presenton's `/api/v1/` endpoints which require a session.

**Fix**: Added `DISABLE_AUTH: "true"` to presenton environment in docker-compose.yml. Safe because the port is already bound to `127.0.0.1:7771` (localhost-only).

---

## Current docker-compose.yml Presenton Block

```yaml
presenton:
  build:
    context: .
    dockerfile: Dockerfile.presenton
  ports:
    - "127.0.0.1:7771:80"
  environment:
    OPENAI_API_KEY: ${OPENAI_API_KEY:-}
    GOOGLE_API_KEY: ${GOOGLE_API_KEY:-}
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
    LLM: ${PRESENTON_LLM_PROVIDER:-google}
    AUTH_USERNAME: ${PRESENTON_USERNAME:-openbi}
    AUTH_PASSWORD: ${PRESENTON_PASSWORD:-openbi_pptx_2024}
    DISABLE_AUTH: "true"
  volumes:
    - presenton_data:/app_data
  networks:
    - openbi-network
```

---

## Presenton API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/auth/setup` | POST | One-time setup — 409 if already done |
| `/api/v1/auth/login` | POST | Returns `presenton_session` cookie |
| `/api/v1/ppt/presentation/generate/async` | POST | Submit async generate task |
| `/api/v1/ppt/presentation/status/{task_id}` | GET | Poll status |
| `/api/v1/ppt/presentation/{id}/export` | GET | Download PPTX (auth required) |
| `/app_data/exports/{uuid}/{uuid}.pptx` | GET | Static file download (no auth) |

**Generate payload**:
```json
{"content": "...", "n_slides": 10, "export_as": "pptx"}
```

**Status response**:
```json
{"status": "completed", "data": {"presentation_id": "...", "edit_path": "/editor/...", "path": "/app_data/exports/..."}}
```

---

## Frontend Proxy

- Vite proxy: `/presenton-proxy/*` → `http://presenton:80/*` (same-origin iframe)
- `PRESENTON_PROXY_TARGET: "http://presenton:80"` in frontend service env
- iframe URL: `/presenton-proxy{edit_path}`
- Direct URL (Open in New Tab): `VITE_PRESENTON_URL ?? 'http://localhost:7771'`

---

## MongoDB Schema (`pptx_presentations`)

```json
{
  "dashboard_id": "ObjectId",
  "project_id": "ObjectId",
  "user_id": "ObjectId",
  "presentation_id": "string",
  "edit_path": "string",
  "download_path": "string",
  "feedback": "string | null",
  "created_at": "datetime"
}
```

Last 10 presentations returned for history panel in PPTXEditor.

---

## Restart Commands

```bash
# After changing docker-compose.yml presenton env:
docker compose up -d --no-deps presenton

# After changing backend Python (normally hot-reloads via volume mount):
docker compose restart backend

# Full rebuild (Dockerfile changes):
docker compose up -d --build presenton
```

---

## Known Gotchas

- `start.js` hardcodes `USER_CONFIG_PATH = /app_data/userConfig.json` — env var override has no effect
- `userConfig.json` persists across container restarts (volume) — stale values like `DISABLE_IMAGE_GENERATION: true` must be explicitly overwritten by backend before generating
- Sync generate endpoint (`/generate`) takes 5-10 min and blocks — always use `/generate/async`
- Session cookie is backend-only — browser never gets it — `DISABLE_AUTH: true` required for iframe to work
- `presenton_data` volume is shared: backend at `/app/presenton_data`, presenton at `/app_data`
