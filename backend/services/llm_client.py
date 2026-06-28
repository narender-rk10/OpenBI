"""Unified LLM caller — routes to Gemini, OpenAI, or Anthropic based on org settings."""

import logging

import httpx

from backend.core.security import decrypt_api_key


logger = logging.getLogger("openbi.llm")


class LLMNotConfiguredError(Exception):
    """Raised when a service tries to call the LLM but the org hasn't configured one."""


async def call_llm(prompt: str, org_settings: dict | None = None, system_prompt: str | None = None) -> str:
    """Call the configured LLM provider and return text response.

    Org settings are the only source of truth — there are no hard-coded defaults.
    Raises LLMNotConfiguredError if provider/model/key isn't set."""
    if org_settings is None:
        from backend.core.database import get_org_settings
        org_settings = await get_org_settings()

    provider = org_settings.get("llm_provider")
    model = org_settings.get("llm_model")
    api_key = decrypt_api_key(org_settings.get("llm_api_key_encrypted", ""))

    if not provider or not model:
        raise LLMNotConfiguredError(
            "LLM provider/model not configured. Set them in Settings → LLM."
        )
    if not api_key:
        raise LLMNotConfiguredError(
            f"LLM API key for provider '{provider}' not configured. Set it in Settings → LLM."
        )

    if provider == "gemini":
        return await _call_gemini(prompt, model, api_key, system_prompt)
    elif provider == "openai":
        return await _call_openai(prompt, model, api_key, system_prompt)
    elif provider == "anthropic":
        return await _call_anthropic(prompt, model, api_key, system_prompt)
    elif provider == "groq":
        return await _call_openai_compatible(prompt, model, api_key, system_prompt, "https://api.groq.com/openai/v1")
    elif provider == "mistral":
        return await _call_openai_compatible(prompt, model, api_key, system_prompt, "https://api.mistral.ai/v1")
    elif provider == "deepseek":
        return await _call_openai_compatible(prompt, model, api_key, system_prompt, "https://api.deepseek.com/v1")
    elif provider == "ollama":
        base_url = org_settings.get("llm_base_url") or "http://localhost:11434/v1"
        return await _call_openai_compatible(prompt, model, api_key or "ollama", system_prompt, base_url)
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")


async def _call_gemini(prompt: str, model: str, api_key: str, system_prompt: str | None) -> str:
    """Call Google Gemini API."""
    import google.generativeai as genai
    genai.configure(api_key=api_key)

    model_instance = genai.GenerativeModel(
        model,
        system_instruction=system_prompt if system_prompt else None,
    )
    response = await model_instance.generate_content_async(prompt)
    return response.text


async def _call_openai(prompt: str, model: str, api_key: str, system_prompt: str | None) -> str:
    """Call OpenAI API."""
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model, "messages": messages, "temperature": 0.1},
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def _call_openai_compatible(prompt: str, model: str, api_key: str, system_prompt: str | None, base_url: str) -> str:
    """Call any OpenAI-compatible API (Groq, Mistral, Ollama, etc.)."""
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model, "messages": messages, "temperature": 0.1},
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def _call_anthropic(prompt: str, model: str, api_key: str, system_prompt: str | None) -> str:
    """Call Anthropic Claude API."""
    body: dict = {
        "model": model,
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system_prompt:
        body["system"] = system_prompt

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=body,
        )
        resp.raise_for_status()
        return resp.json()["content"][0]["text"]


