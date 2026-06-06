"""OpenBI Telegram Bot.

Features:
  - Conversational chat with session history (multi-turn, backed by MongoDB session)
  - Inline keyboard numbered selection for projects, agents, dashboards
  - /report pdf|pptx — select a dashboard and receive the file
  - /dashboards — view dashboard as rendered chart images
  - /kbs — list knowledge bases
  - /status — show current connection state
  - /newchat — start a fresh conversation
"""

import io
import base64
import logging
import os

import httpx
from telegram import BotCommand, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaPhoto, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

logger = logging.getLogger("openbi.telegram")
logging.basicConfig(
    format="[%(asctime)s] %(name)s %(levelname)s: %(message)s",
    level=logging.INFO,
)

API_BASE = os.getenv("API_BASE_URL", "http://backend:8000")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")


# ── Shared helpers ────────────────────────────────────────────────────────────

def _h(jwt: str) -> dict:
    return {"Authorization": f"Bearer {jwt}"}


def _kb(items: list, prefix: str, label_key: str = "name") -> InlineKeyboardMarkup:
    """Inline keyboard — one numbered button per item."""
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(f"{i + 1}. {item[label_key]}", callback_data=f"{prefix}:{i}")]
        for i, item in enumerate(items)
    ])


async def _get_projects(jwt: str) -> list:
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{API_BASE}/api/projects", headers=_h(jwt))
    return r.json() if r.status_code == 200 else []


async def _get_dashboards(jwt: str, pid: str) -> list:
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{API_BASE}/api/projects/{pid}/dashboards", headers=_h(jwt))
    return r.json() if r.status_code == 200 else []


async def _get_agents(jwt: str, pid: str) -> list:
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{API_BASE}/api/projects/{pid}/agents", headers=_h(jwt))
    return r.json() if r.status_code == 200 else []


# ── Bot ───────────────────────────────────────────────────────────────────────

class OpenBIBot:
    def __init__(self):
        token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        if not token:
            print("⚠ TELEGRAM_BOT_TOKEN not set — bot disabled")
            self.app = None
            return
        self.app = Application.builder().token(token).post_init(self._set_commands).build()
        self._register()

    async def _set_commands(self, app: Application) -> None:
        """Register bot commands so Telegram shows auto-suggestions when user types /."""
        await app.bot.set_my_commands([
            # Account
            BotCommand("connect",     "Link your OpenBI account with an API key"),
            BotCommand("disconnect",  "Unlink your account"),
            BotCommand("status",      "Show current project, agent, and session"),
            # Projects & agents
            BotCommand("projects",    "List and select a project"),
            BotCommand("use",         "Switch project by name  e.g. /use Sales"),
            BotCommand("agents",      "List and select an agent"),
            # Dashboards & reports
            BotCommand("dashboards",  "Browse dashboards — tap to view as images"),
            BotCommand("report",      "Export a dashboard  /report pdf  or  /report pptx"),
            # Chat
            BotCommand("newchat",     "Start a fresh conversation (clears history)"),
            # Other
            BotCommand("kbs",         "List knowledge bases"),
            BotCommand("help",        "Show all commands"),
        ])

    def _register(self):
        a = self.app.add_handler

        # Known commands
        a(CommandHandler("start", self.cmd_start))
        a(CommandHandler("help", self.cmd_help))
        a(CommandHandler("connect", self.cmd_connect))
        a(CommandHandler("disconnect", self.cmd_disconnect))
        a(CommandHandler("status", self.cmd_status))
        a(CommandHandler("projects", self.cmd_projects))
        a(CommandHandler("use", self.cmd_use))
        a(CommandHandler("agents", self.cmd_agents))
        a(CommandHandler("dashboards", self.cmd_dashboards))
        a(CommandHandler("report", self.cmd_report))
        a(CommandHandler("newchat", self.cmd_newchat))
        a(CommandHandler("kbs", self.cmd_kbs))

        # Inline button presses
        a(CallbackQueryHandler(self.handle_callback))

        # Text chat — private only (ignore group/channel messages)
        a(MessageHandler(
            filters.TEXT & ~filters.COMMAND & filters.ChatType.PRIVATE,
            self.handle_message,
        ))

        # Unknown commands (catch-all, must come after known CommandHandlers)
        a(MessageHandler(filters.COMMAND, self.handle_unknown_command))

        # Unsupported media types — photos, stickers, voice, video, docs, etc.
        a(MessageHandler(
            (
                filters.PHOTO | filters.VIDEO | filters.AUDIO | filters.VOICE
                | filters.Document.ALL | filters.Sticker.ALL
                | filters.LOCATION | filters.CONTACT | filters.POLL
                | filters.VIDEO_NOTE | filters.ANIMATION
            ) & filters.ChatType.PRIVATE,
            self.handle_unsupported_media,
        ))

        # Global error handler
        self.app.add_error_handler(self.handle_error)

    # ── /start ────────────────────────────────────────────────────────────────

    async def cmd_start(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(
            "🤖 *Welcome to OpenBI!*\n\n"
            "Connect your account first:\n"
            "`/connect <your_api_key>`\n\n"
            "Get your API key from *Settings → API* in the OpenBI web app.\n\n"
            "Type /help to see all commands.",
            parse_mode="Markdown",
        )

    # ── /help ─────────────────────────────────────────────────────────────────

    async def cmd_help(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(
            "📋 *OpenBI Bot Commands*\n\n"
            "*Account*\n"
            "/connect `<api_key>` — Link your account\n"
            "/disconnect — Unlink account\n"
            "/status — Show current connection\n\n"
            "*Projects & Agents*\n"
            "/projects — List & select a project\n"
            "/use `<name>` — Switch project by name\n"
            "/agents — List & select an agent\n\n"
            "*Dashboards*\n"
            "/dashboards — Browse dashboards (tap to view images)\n"
            "/report `pdf` — Send a dashboard as PDF\n"
            "/report `pptx` — Send a dashboard as PPTX\n\n"
            "*Chat*\n"
            "💬 Just type to chat with your agent\n"
            "/newchat — Start a fresh conversation\n\n"
            "*Other*\n"
            "/kbs — List knowledge bases\n",
            parse_mode="Markdown",
        )

    # ── /connect ──────────────────────────────────────────────────────────────

    async def cmd_connect(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        if not ctx.args:
            await update.message.reply_text("Usage: `/connect <api_key>`", parse_mode="Markdown")
            return
        async with httpx.AsyncClient() as c:
            resp = await c.post(f"{API_BASE}/api/auth/telegram/link", json={
                "telegram_id": str(update.effective_user.id),
                "api_key": ctx.args[0],
                "telegram_username": update.effective_user.username,
            })
        if resp.status_code == 200:
            data = resp.json()
            ctx.user_data["jwt"] = data["access_token"]
            ctx.user_data["user_name"] = data["user_name"]
            await update.message.reply_text(
                f"✅ Connected as *{data['user_name']}*!\n\nType /projects to pick a project.",
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text("❌ Invalid API key. Check Settings in the web app.")

    # ── /disconnect ───────────────────────────────────────────────────────────

    async def cmd_disconnect(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        ctx.user_data.clear()
        await update.message.reply_text("✅ Disconnected.")

    # ── /status ───────────────────────────────────────────────────────────────

    async def cmd_status(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        if not ctx.user_data.get("jwt"):
            await update.message.reply_text("Not connected. Use /connect <api_key>")
            return
        await update.message.reply_text(
            f"👤 *{ctx.user_data.get('user_name', '?')}*\n"
            f"📁 Project: *{ctx.user_data.get('project_name', '—')}*\n"
            f"🤖 Agent: *{ctx.user_data.get('default_agent_name', '—')}*\n"
            f"💬 Active chat session: {'Yes' if ctx.user_data.get('session_id') else 'No'}",
            parse_mode="Markdown",
        )

    # ── /projects ─────────────────────────────────────────────────────────────

    async def cmd_projects(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        jwt = ctx.user_data.get("jwt")
        if not jwt:
            await update.message.reply_text("Not connected. Use /connect first.")
            return
        projects = await _get_projects(jwt)
        if not projects:
            await update.message.reply_text("No projects found.")
            return
        ctx.user_data["project_list"] = projects
        await update.message.reply_text(
            "📁 *Your Projects* — tap to select:",
            parse_mode="Markdown",
            reply_markup=_kb(projects, "proj"),
        )

    # ── /use <name> ───────────────────────────────────────────────────────────

    async def cmd_use(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        jwt = ctx.user_data.get("jwt")
        if not jwt or not ctx.args:
            await update.message.reply_text("Usage: /use <project_name>")
            return
        name = " ".join(ctx.args)
        projects = await _get_projects(jwt)
        match = next((p for p in projects if p["name"].lower() == name.lower()), None)
        if match:
            self._apply_project(ctx, match)
            await update.message.reply_text(
                f"✅ Active project: *{match['name']}*\n\nType /agents to pick an agent.",
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text(f"❌ Project '{name}' not found.")

    def _apply_project(self, ctx: ContextTypes.DEFAULT_TYPE, project: dict):
        ctx.user_data["project_id"] = project["_id"]
        ctx.user_data["project_name"] = project["name"]
        # Reset agent and session when switching projects
        ctx.user_data.pop("default_agent_id", None)
        ctx.user_data.pop("default_agent_name", None)
        ctx.user_data.pop("session_id", None)

    # ── /agents ───────────────────────────────────────────────────────────────

    async def cmd_agents(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        jwt, project_id = ctx.user_data.get("jwt"), ctx.user_data.get("project_id")
        if not project_id:
            await update.message.reply_text("No project selected. Use /projects first.")
            return
        agents = await _get_agents(jwt, project_id)
        if not agents:
            await update.message.reply_text("No agents found. Create one in the web app.")
            return
        ctx.user_data["agent_list"] = agents
        current = ctx.user_data.get("default_agent_name", "none")
        await update.message.reply_text(
            f"🤖 *Agents* (current: *{current}*) — tap to select:",
            parse_mode="Markdown",
            reply_markup=_kb(agents, "agent"),
        )

    # ── /dashboards ───────────────────────────────────────────────────────────

    async def cmd_dashboards(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        jwt, project_id = ctx.user_data.get("jwt"), ctx.user_data.get("project_id")
        if not project_id:
            await update.message.reply_text("No project selected. Use /projects first.")
            return
        dashboards = await _get_dashboards(jwt, project_id)
        if not dashboards:
            await update.message.reply_text("No dashboards found.")
            return
        ctx.user_data["dashboard_list"] = dashboards
        await update.message.reply_text(
            "📊 *Dashboards* — tap to view as images:",
            parse_mode="Markdown",
            reply_markup=_kb(dashboards, "dash_view"),
        )

    # ── /report [pdf|pptx] ────────────────────────────────────────────────────

    async def cmd_report(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        jwt, project_id = ctx.user_data.get("jwt"), ctx.user_data.get("project_id")
        if not project_id:
            await update.message.reply_text("No project selected. Use /projects first.")
            return

        fmt = (ctx.args[0].lower() if ctx.args else "").strip()
        if fmt not in ("pdf", "pptx"):
            await update.message.reply_text(
                "📤 *Export dashboard as:*",
                parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton("📄 PDF", callback_data="fmt:pdf"),
                    InlineKeyboardButton("📊 PPTX", callback_data="fmt:pptx"),
                ]]),
            )
            return

        dashboards = await _get_dashboards(jwt, project_id)
        if not dashboards:
            await update.message.reply_text("No dashboards found.")
            return
        ctx.user_data["dashboard_list"] = dashboards
        await update.message.reply_text(
            f"Select a dashboard for *{fmt.upper()}* export:",
            parse_mode="Markdown",
            reply_markup=_kb(dashboards, f"dash_{fmt}"),
        )

    # ── /newchat ──────────────────────────────────────────────────────────────

    async def cmd_newchat(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        ctx.user_data.pop("session_id", None)
        await update.message.reply_text("🆕 New conversation started. Ask me anything!")

    # ── /kbs ──────────────────────────────────────────────────────────────────

    async def cmd_kbs(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        jwt, project_id = ctx.user_data.get("jwt"), ctx.user_data.get("project_id")
        if not project_id:
            await update.message.reply_text("No project selected. Use /projects first.")
            return
        async with httpx.AsyncClient() as c:
            r = await c.get(
                f"{API_BASE}/api/projects/{project_id}/knowledge-bases", headers=_h(jwt)
            )
        kbs = r.json() if r.status_code == 200 else []
        if not kbs:
            await update.message.reply_text("No knowledge bases found.")
            return
        lines = ["🧠 *Knowledge Bases:*\n"]
        for kb in kbs:
            sources = len(kb.get("sources", []))
            lines.append(f"• *{kb['name']}* — {sources} source(s)")
        await update.message.reply_text("\n".join(lines), parse_mode="Markdown")

    # ── Unknown command ───────────────────────────────────────────────────────

    async def handle_unknown_command(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        cmd = update.message.text.split()[0]
        await update.message.reply_text(
            f"Unknown command `{cmd}`.\nType /help to see all available commands.",
            parse_mode="Markdown",
        )

    # ── Unsupported media ─────────────────────────────────────────────────────

    async def handle_unsupported_media(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(
            "I only understand text messages and commands.\n"
            "Type /help to see what I can do."
        )

    # ── Global error handler ──────────────────────────────────────────────────

    async def handle_error(self, update: object, ctx: ContextTypes.DEFAULT_TYPE):
        logger.error("Unhandled exception: %s", ctx.error, exc_info=ctx.error)
        if isinstance(update, Update) and update.effective_message:
            await update.effective_message.reply_text(
                "Something went wrong on my end. Please try again, or type /help."
            )

    # ── Inline keyboard callbacks ─────────────────────────────────────────────

    async def handle_callback(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        await query.answer()

        data = query.data or ""
        if ":" not in data:
            await query.answer("This button is no longer valid.", show_alert=True)
            return

        try:
            prefix, _, raw_idx = data.partition(":")

            # Project selection
            if prefix == "proj":
                projects = ctx.user_data.get("project_list", [])
                idx = int(raw_idx)
                if not 0 <= idx < len(projects):
                    await query.edit_message_text("List has changed. Run /projects again.")
                    return
                self._apply_project(ctx, projects[idx])
                await query.edit_message_text(
                    f"✅ Active project: *{projects[idx]['name']}*\n\nType /agents to pick an agent.",
                    parse_mode="Markdown",
                )

            # Agent selection
            elif prefix == "agent":
                agents = ctx.user_data.get("agent_list", [])
                idx = int(raw_idx)
                if not 0 <= idx < len(agents):
                    await query.edit_message_text("List has changed. Run /agents again.")
                    return
                ctx.user_data["default_agent_id"] = agents[idx]["_id"]
                ctx.user_data["default_agent_name"] = agents[idx]["name"]
                ctx.user_data.pop("session_id", None)
                await query.edit_message_text(
                    f"✅ Agent set to *{agents[idx]['name']}*\n\nStart chatting — just type a message!",
                    parse_mode="Markdown",
                )

            # Dashboard → images
            elif prefix == "dash_view":
                dashboards = ctx.user_data.get("dashboard_list", [])
                idx = int(raw_idx)
                if not 0 <= idx < len(dashboards):
                    await query.edit_message_text("List has changed. Run /dashboards again.")
                    return
                await query.edit_message_text(
                    f"📸 Loading *{dashboards[idx]['name']}*…", parse_mode="Markdown"
                )
                await self._send_dashboard_images(query.message.chat_id, ctx, dashboards[idx])

            # Dashboard → PDF
            elif prefix == "dash_pdf":
                dashboards = ctx.user_data.get("dashboard_list", [])
                idx = int(raw_idx)
                if not 0 <= idx < len(dashboards):
                    await query.edit_message_text("List has changed. Run /report pdf again.")
                    return
                await query.edit_message_text(
                    f"⏳ Generating PDF for *{dashboards[idx]['name']}*…", parse_mode="Markdown"
                )
                await self._send_pdf(query.message.chat_id, ctx, dashboards[idx])

            # Dashboard → PPTX
            elif prefix == "dash_pptx":
                dashboards = ctx.user_data.get("dashboard_list", [])
                idx = int(raw_idx)
                if not 0 <= idx < len(dashboards):
                    await query.edit_message_text("List has changed. Run /report pptx again.")
                    return
                await query.edit_message_text(
                    f"⏳ Generating PPTX for *{dashboards[idx]['name']}*…", parse_mode="Markdown"
                )
                await self._send_pptx(query.message.chat_id, ctx, dashboards[idx])

            # Format selection → show dashboard list
            elif prefix == "fmt":
                if raw_idx not in ("pdf", "pptx"):
                    await query.edit_message_text("Unknown format.")
                    return
                jwt, project_id = ctx.user_data.get("jwt"), ctx.user_data.get("project_id")
                if not project_id:
                    await query.edit_message_text("No project selected. Use /projects first.")
                    return
                dashboards = await _get_dashboards(jwt, project_id)
                if not dashboards:
                    await query.edit_message_text("No dashboards found.")
                    return
                ctx.user_data["dashboard_list"] = dashboards
                await query.edit_message_text(
                    f"Select a dashboard for *{raw_idx.upper()}* export:",
                    parse_mode="Markdown",
                    reply_markup=_kb(dashboards, f"dash_{raw_idx}"),
                )

            else:
                logger.warning("Unknown callback prefix: %s", prefix)
                await query.answer("Unknown action.", show_alert=True)

        except (ValueError, IndexError) as e:
            logger.warning("Bad callback data '%s': %s", data, e)
            await query.answer("This button is no longer valid.", show_alert=True)
        except Exception as e:
            logger.error("Callback error for data '%s': %s", data, e, exc_info=True)
            await query.answer("Something went wrong. Please try again.", show_alert=True)

    # ── Text message → chat with agent ────────────────────────────────────────

    async def handle_message(self, update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        # Ignore empty / whitespace-only messages
        text = (update.message.text or "").strip()
        if not text:
            return

        # Block while a previous message is still being processed (prevents double-sends)
        if ctx.user_data.get("_processing"):
            await update.message.reply_text("⏳ Still working on your previous message, please wait…")
            return

        jwt = ctx.user_data.get("jwt")
        project_id = ctx.user_data.get("project_id")
        if not jwt or not project_id:
            await update.message.reply_text(
                "Not set up yet. Use /connect and then /projects to get started."
            )
            return

        agent_id = ctx.user_data.get("default_agent_id")
        if not agent_id:
            await update.message.reply_text("No agent selected. Use /agents to pick one.")
            return

        # Enforce a max message length to avoid sending junk to the LLM
        if len(text) > 2000:
            await update.message.reply_text(
                "Your message is too long (max 2000 characters). Please shorten it."
            )
            return

        ctx.user_data["_processing"] = True
        await update.message.chat.send_action("typing")

        try:
            payload: dict = {
                "agent_id": agent_id,
                "message": text,
                "stream": False,
            }
            # Attach existing session → multi-turn conversation continuity
            if ctx.user_data.get("session_id"):
                payload["session_id"] = ctx.user_data["session_id"]

            async with httpx.AsyncClient(timeout=120.0) as c:
                resp = await c.post(
                    f"{API_BASE}/api/projects/{project_id}/chat",
                    headers=_h(jwt),
                    json=payload,
                )

            if resp.status_code != 200:
                await update.message.reply_text("❌ Error getting a response from the agent.")
                return

            data = resp.json()

            # Persist session_id for next message (gives true multi-turn memory)
            if data.get("session_id"):
                ctx.user_data["session_id"] = data["session_id"]

            answer = data.get("answer", "No response")
            if len(answer) > 4000:
                answer = answer[:4000] + "\n\n…(truncated, see web app for full answer)"

            await update.message.reply_text(answer)

            # If the agent ran a SQL query and got tabular data, also render a chart
            if data.get("columns") and data.get("rows"):
                try:
                    async with httpx.AsyncClient(timeout=30.0) as c:
                        rr = await c.post(
                            f"{API_BASE}/api/projects/{project_id}/charts/render",
                            headers=_h(jwt),
                            json={"columns": data["columns"], "rows": data["rows"]},
                        )
                    if rr.status_code == 200:
                        await update.message.reply_photo(photo=rr.content, caption="📊 Chart")
                except Exception:
                    pass

        except httpx.TimeoutException:
            await update.message.reply_text(
                "⏱ The agent took too long to respond. Please try again."
            )
        except httpx.ConnectError:
            await update.message.reply_text(
                "❌ Could not reach the OpenBI backend. Please try again later."
            )
        except Exception as e:
            logger.error("handle_message error: %s", e, exc_info=True)
            await update.message.reply_text(
                "Something went wrong. Please try again or type /help."
            )
        finally:
            ctx.user_data["_processing"] = False

    # ── Helpers: render / export ──────────────────────────────────────────────

    async def _send_dashboard_images(self, chat_id: int, ctx: ContextTypes.DEFAULT_TYPE, dashboard: dict):
        jwt, project_id = ctx.user_data.get("jwt"), ctx.user_data.get("project_id")
        try:
            async with httpx.AsyncClient(timeout=60.0) as c:
                r = await c.get(
                    f"{API_BASE}/api/projects/{project_id}/dashboards/{dashboard['_id']}/render",
                    headers=_h(jwt),
                )
            images = r.json().get("widget_images", []) if r.status_code == 200 else []
            if not images:
                await ctx.bot.send_message(chat_id, f"'{dashboard['name']}' has no chart widgets.")
                return
            media = [
                InputMediaPhoto(
                    media=base64.b64decode(img["image_base64"]),
                    caption=img.get("title", ""),
                )
                for img in images[:10]
            ]
            await ctx.bot.send_media_group(chat_id, media=media)
        except Exception as e:
            await ctx.bot.send_message(chat_id, f"❌ Render failed: {e}")

    async def _send_pdf(self, chat_id: int, ctx: ContextTypes.DEFAULT_TYPE, dashboard: dict):
        jwt, project_id = ctx.user_data.get("jwt"), ctx.user_data.get("project_id")
        try:
            async with httpx.AsyncClient(timeout=120.0) as c:
                r = await c.post(
                    f"{API_BASE}/api/projects/{project_id}/dashboards/{dashboard['_id']}/pdf",
                    headers=_h(jwt),
                    json={},
                )
            if r.status_code != 200:
                await ctx.bot.send_message(chat_id, f"❌ PDF failed: {r.text[:200]}")
                return
            filename = dashboard["name"].replace(" ", "_") + ".pdf"
            await ctx.bot.send_document(
                chat_id,
                document=r.content,
                filename=filename,
                caption=f"📄 {dashboard['name']}",
                # Generous timeouts — uploading a multi-page PDF over a slow
                # link far exceeds the library's ~5s default write timeout.
                read_timeout=120,
                write_timeout=120,
                connect_timeout=30,
            )
        except Exception as e:
            await ctx.bot.send_message(chat_id, f"❌ Error: {e}")

    async def _send_pptx(self, chat_id: int, ctx: ContextTypes.DEFAULT_TYPE, dashboard: dict):
        """Generate the deck via Presenton (Docker) then send the .pptx file."""
        jwt, project_id = ctx.user_data.get("jwt"), ctx.user_data.get("project_id")
        base = f"{API_BASE}/api/projects/{project_id}/dashboards/{dashboard['_id']}/pptx/presenton"
        try:
            async with httpx.AsyncClient(timeout=600.0) as c:
                gen = await c.post(base, headers=_h(jwt), json={"feedback": None})
                if gen.status_code != 200:
                    await ctx.bot.send_message(chat_id, f"❌ PPTX failed: {gen.text[:200]}")
                    return
                data = gen.json()
                pid = data["presentation_id"]
                dl_path = data.get("download_path", "")
                params = {"download_path": dl_path} if dl_path else None
                r = await c.get(f"{base}/{pid}/download", headers=_h(jwt), params=params)
            if r.status_code != 200:
                await ctx.bot.send_message(chat_id, f"❌ PPTX download failed: {r.text[:200]}")
                return
            buf = io.BytesIO(r.content)
            buf.name = dashboard["name"].replace(" ", "_") + ".pptx"
            await ctx.bot.send_document(chat_id, document=buf, filename=buf.name)
        except Exception as e:
            await ctx.bot.send_message(chat_id, f"❌ Error: {e}")

    def run(self):
        if self.app:
            self.app.run_polling()
        else:
            print("Bot not configured — exiting")


if __name__ == "__main__":
    bot = OpenBIBot()
    bot.run()
