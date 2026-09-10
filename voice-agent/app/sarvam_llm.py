"""Chat completion against Sarvam's LLM (sarvam-m by default), via the
officially documented `sarvamai` Python SDK method `client.chat.completions(
messages=..., model=...)` — note this is NOT `client.chat.completions.
create(...)` (the OpenAI SDK convention); the sarvamai SDK's method name is
`completions()` itself.
"""

from __future__ import annotations

import logging

from sarvamai import AsyncSarvamAI

from .config import Settings
from .prompts import SYSTEM_PROMPT

logger = logging.getLogger("voice-agent.llm")

FALLBACK_REPLY = "Sorry, could you say that again?"


async def generate_reply(settings: Settings, history: list[dict[str, str]]) -> str:
    """`history` is a list of {"role": "user"|"assistant", "content": str}
    turns (no system message — SYSTEM_PROMPT is prepended here on every
    call, so callers never need to worry about persona drift over a long
    conversation history).
    """
    client = AsyncSarvamAI(api_subscription_key=settings.sarvam_api_key)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, *history]
    try:
        response = await client.chat.completions(messages=messages, model=settings.sarvam_llm_model)
        choice = response.choices[0]
        content = getattr(choice.message, "content", None) if hasattr(choice, "message") else None
        return (content or FALLBACK_REPLY).strip()
    except Exception as exc:  # noqa: BLE001 — never crash the call over one bad LLM turn
        logger.error("Sarvam chat completion failed: %s", exc)
        return FALLBACK_REPLY
