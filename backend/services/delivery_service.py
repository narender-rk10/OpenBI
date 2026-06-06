"""Delivery service — email, webhook, Telegram delivery for reports."""

import logging
from datetime import datetime, timezone

import httpx
from bson import ObjectId
from backend.config import settings

logger = logging.getLogger("openbi.delivery")


class DeliveryService:

    async def get_org_smtp_config(self, db, org_id: str) -> dict | None:
        """Read SMTP config from org settings. Returns None if not configured (use env vars)."""
        from backend.core.security import decrypt_api_key
        try:
            org = await db.organizations.find_one({"_id": ObjectId(org_id)})
            smtp = (org or {}).get("settings", {}).get("smtp", {})
            if not smtp.get("host"):
                return None
            password = ""
            if smtp.get("password_encrypted"):
                password = decrypt_api_key(smtp["password_encrypted"])
            return {
                "host": smtp["host"],
                "port": int(smtp.get("port", 587)),
                "username": smtp.get("username", ""),
                "password": password,
                "from_addr": smtp.get("from_addr", "") or settings.SMTP_FROM,
            }
        except Exception:
            return None

    async def send_email(
        self,
        to: list[str],
        subject: str,
        body: str,
        attachments: list[dict] | None = None,
        smtp_cfg: dict | None = None,
    ):
        """Send email with optional PDF attachment. Uses smtp_cfg if provided, else env vars."""
        try:
            import aiosmtplib
            from email.message import EmailMessage

            host = smtp_cfg["host"] if smtp_cfg else settings.SMTP_HOST
            port = int(smtp_cfg["port"]) if smtp_cfg else (int(settings.SMTP_PORT) if settings.SMTP_PORT else 587)
            username = smtp_cfg["username"] if smtp_cfg else settings.SMTP_USERNAME
            password = smtp_cfg["password"] if smtp_cfg else settings.SMTP_PASSWORD
            from_addr = smtp_cfg["from_addr"] if smtp_cfg else settings.SMTP_FROM

            msg = EmailMessage()
            msg["From"] = from_addr
            msg["To"] = ", ".join(to)
            msg["Subject"] = subject
            msg.set_content("Please view this email in an HTML-capable client.")
            msg.add_alternative(body, subtype="html")

            if attachments:
                for att in attachments:
                    msg.add_attachment(
                        att["content"],
                        maintype="application",
                        subtype=att.get("content_type", "pdf").split("/")[-1],
                        filename=att["filename"],
                    )

            use_starttls = port == 587
            await aiosmtplib.send(
                msg,
                hostname=host,
                port=port,
                username=username,
                password=password,
                use_tls=not use_starttls,
                start_tls=use_starttls,
            )
        except Exception as e:
            raise Exception(f"Email send failed: {e}")

    async def send_dashboard_report(self, dashboard_id: str, recipients: list[str], db):
        """Generate PDF and send via email."""
        from backend.services.pdf_service import pdf_service

        dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
        pdf_bytes = await pdf_service.generate_dashboard_pdf(dashboard_id, db)

        filename = f"{dashboard['name'].replace(' ', '_')}_{datetime.now().strftime('%Y-%m-%d')}.pdf"

        body = f"""
        <h2>{dashboard['name']}</h2>
        <p>Please find the latest report attached.</p>
        <p>Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}</p>
        <p style="color: #9ca3af; font-size: 12px;">Powered by OpenBI</p>
        """

        await self.send_email(
            to=recipients,
            subject=f"Report: {dashboard['name']} — {datetime.now().strftime('%Y-%m-%d')}",
            body=body,
            attachments=[{"filename": filename, "content": pdf_bytes, "content_type": "application/pdf"}],
        )

    async def send_webhook(self, url: str, dashboard_id: str, db):
        """POST dashboard data to webhook URL."""
        widgets = await db.widgets.find({"dashboard_id": ObjectId(dashboard_id)}).to_list(100)

        payload = {
            "dashboard_id": dashboard_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "widgets": [
                {
                    "widget_id": w["widget_id"],
                    "title": w.get("title"),
                    "display_type": w.get("display_type"),
                    "data": w.get("cached_data", {}),
                }
                for w in widgets
            ],
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(url, json=payload)

    async def send_telegram_dashboard(self, telegram_id: str, dashboard_id: str, db):
        """Send dashboard report to a Telegram chat.

        Tries PDF first (sent as a document); falls back to a Markdown text
        summary built from each widget's cached_data when PDF is unavailable.
        """
        if not settings.TELEGRAM_BOT_TOKEN:
            raise Exception("TELEGRAM_BOT_TOKEN is not configured")

        try:
            from telegram import Bot
        except ImportError:
            raise Exception("python-telegram-bot is not installed")

        bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)

        dashboard = await db.dashboards.find_one({"_id": ObjectId(dashboard_id)})
        name = dashboard.get("name", "Report") if dashboard else "Report"
        now_str = datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC")

        # ── Attempt PDF delivery ──────────────────────────────────────────────
        # Generate the PDF and upload it separately so we can tell *which* step
        # failed: a PDF-generation error is a real fallback case, but an upload
        # timeout should be retried with generous timeouts rather than silently
        # degrading to a text summary (the previous behaviour — the bug).
        pdf_bytes: bytes | None = None
        try:
            from backend.services.pdf_service import pdf_service
            pdf_bytes = await pdf_service.generate_dashboard_pdf(dashboard_id, db)
        except Exception as e:
            logger.warning("Telegram: PDF generation failed for %s, sending text: %s", dashboard_id, e)

        if pdf_bytes:
            from io import BytesIO
            from telegram import InputFile

            buf = BytesIO(pdf_bytes)
            buf.name = f"{name}.pdf"
            try:
                await bot.send_document(
                    chat_id=telegram_id,
                    document=InputFile(buf, filename=f"{name}.pdf"),
                    caption=f"📊 *{name}*\n_{now_str}_ — OpenBI",
                    parse_mode="Markdown",
                    # Uploading a multi-hundred-KB PDF over a slow link needs far
                    # more than the library defaults (~5s), which was timing out.
                    read_timeout=120,
                    write_timeout=120,
                    connect_timeout=30,
                )
                return
            except Exception as e:
                logger.warning("Telegram: PDF upload failed for %s, sending text: %s", dashboard_id, e)

        # ── Text summary fallback ─────────────────────────────────────────────
        widgets = await db.widgets.find({"dashboard_id": ObjectId(dashboard_id)}).to_list(50)

        lines: list[str] = [f"📊 *{name}*", f"_{now_str}_", ""]
        for w in widgets[:15]:
            title = w.get("title", "Widget")
            dtype = w.get("display_type", "")
            cached = w.get("cached_data") or {}
            rows = cached.get("rows") or []
            cols = cached.get("columns") or []

            if dtype == "kpi" and rows:
                val = rows[0][0] if rows[0] else "—"
                lines.append(f"• *{title}*: {val}")
            elif dtype in ("table", "chart") and rows:
                # Show first row as a mini-table if small enough
                if cols and len(cols) <= 4 and rows:
                    header = " | ".join(str(c) for c in cols)
                    first  = " | ".join(str(v) for v in rows[0])
                    lines.append(f"• *{title}* ({len(rows)} rows)\n  `{header}`\n  `{first}`")
                else:
                    lines.append(f"• *{title}*: {len(rows)} rows")
            elif dtype == "ai_summary" and w.get("cached_text"):
                snippet = w["cached_text"][:300].replace("*", "").replace("_", "")
                lines.append(f"💡 _{snippet}…_")

        lines.append("\n_Powered by OpenBI_")
        await bot.send_message(
            chat_id=telegram_id,
            text="\n".join(lines),
            parse_mode="Markdown",
        )


delivery_service = DeliveryService()
