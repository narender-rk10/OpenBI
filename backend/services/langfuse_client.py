"""Optional Langfuse observability — no-ops silently when not configured."""

import logging

logger = logging.getLogger("openbi.langfuse")

try:
    from langfuse import Langfuse
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False
    logger.debug("langfuse package not installed; tracing disabled")


class LangfuseService:
    """Thin wrapper around the Langfuse SDK. All methods are safe to call even
    when Langfuse is not configured — they simply do nothing."""

    def __init__(self):
        self._client = None

    def configure(self, public_key: str, secret_key: str, host: str = "") -> None:
        if not _AVAILABLE:
            return
        if not (public_key and secret_key):
            self._client = None
            return
        try:
            self._client = Langfuse(
                public_key=public_key,
                secret_key=secret_key,
                host=host or "https://cloud.langfuse.com",
            )
            logger.info("Langfuse tracing enabled (host=%s)", host or "cloud.langfuse.com")
        except Exception as exc:
            logger.warning("Langfuse configure failed: %s", exc)
            self._client = None

    @property
    def enabled(self) -> bool:
        return self._client is not None

    def record(
        self,
        *,
        name: str = "openbi-chat",
        user_id: str,
        session_id: str,
        input_messages: list[dict],
        output: str,
        model: str = "unknown",
        input_tokens: int = 0,
        output_tokens: int = 0,
        metadata: dict | None = None,
    ) -> None:
        if not self._client:
            return
        try:
            trace = self._client.trace(
                name=name,
                user_id=user_id,
                session_id=session_id,
                input=input_messages,
                output=output,
                metadata=metadata or {},
            )
            trace.generation(
                name="agent-completion",
                model=model,
                input=input_messages,
                output=output,
                usage={
                    "input": input_tokens,
                    "output": output_tokens,
                    "total": input_tokens + output_tokens,
                    "unit": "TOKENS",
                },
                metadata=metadata or {},
            )
            self._client.flush()
        except Exception as exc:
            logger.warning("Langfuse trace failed: %s", exc)


langfuse_service = LangfuseService()
