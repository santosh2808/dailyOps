"""Chat completion against Sarvam's LLM (sarvam-105b-conversations by
default — "sarvam-m" was deprecated by Sarvam), via the officially
documented `sarvamai` Python SDK method `client.chat.completions(
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


async def generate_reply_with_status(settings: Settings, history: list[dict[str, str]]) -> tuple[str, bool]:
    """Same as generate_reply(), but also says whether Sarvam actually
    produced the reply (True) or the fallback line was used because the
    call failed or returned nothing (False). agent.py uses this so a
    Sarvam failure is reported as an agent error instead of being hidden
    behind "Sorry, could you say that again?".

    `history` is a list of {"role": "user"|"assistant", "content": str}
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
        if not content or not content.strip():
            logger.error("Sarvam chat completion returned no content")
            return FALLBACK_REPLY, False
        return content.strip(), True
    except Exception as exc:  # noqa: BLE001 — never crash the call over one bad LLM turn
        logger.error("Sarvam chat completion failed: %s", exc)
        return FALLBACK_REPLY, False


async def generate_reply(settings: Settings, history: list[dict[str, str]]) -> str:
    """Unchanged contract: the reply text, or FALLBACK_REPLY on failure."""
    reply, _ok = await generate_reply_with_status(settings, history)
    return reply
