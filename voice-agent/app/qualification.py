"""D.O.T. AI Lead Assistant — Phase 3B. End-of-call structured qualification
extraction: turns the free-form conversation Meera just had into the exact
JSON shape the existing Phase 3A DailyOps endpoint expects
(`CreateLeadAiCallLogDto` — status/qualification/summary/quantity/
application/city/state/timeline/siteVisitRequested/callbackRequested/
callbackAt).

Deliberately a SEPARATE LLM call from sarvam_llm.generate_reply() — it does
not touch that function, its SYSTEM_PROMPT, or the live per-turn
conversational path at all. This runs exactly once, after the call has
ended, against the full transcript already collected in agent.py's
self._history. Same model/client construction as generate_reply() (no LLM
model configuration change), just a different, extraction-only prompt.

D.O.T. call-result write-back: this module no longer invents a result when
extraction fails (it used to report QUALIFIED/COLD with a misleading
"transcript available in logs" summary). It returns None instead, and
passes the LLM's values through as-is — DailyOps validates every field on
its own and records anything invalid, rather than this module silently
coercing it (e.g. an unknown qualification is no longer turned into COLD).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from sarvamai import AsyncSarvamAI

from .config import Settings

logger = logging.getLogger("voice-agent.qualification")

_EXTRACTION_SYSTEM_PROMPT = """You just finished listening to a phone call transcript between "Meera", a \
voice assistant for Spyro Fans (an Indian HVLS industrial fan company), and a \
customer who had enquired about HVLS fans. Your job is ONLY to extract a \
structured summary of that call as JSON — you are not talking to the \
customer, you are analyzing a finished conversation.

Output ONLY a single valid JSON object, no prose, no markdown code fences, \
with exactly these keys:

{
  "qualification": one of "HOT", "WARM", "COLD", "NOT_INTERESTED",
  "summary": a short factual 1-3 sentence summary of what the customer said \
— including whether they asked for a quotation, since there is no separate \
field for that,
  "quantity": integer number of fans discussed, or null if never stated,
  "application": short text describing where/how the fans will be used \
(e.g. "Manufacturing warehouse"), or null if never stated,
  "city": the customer's city, or null if never stated,
  "state": the customer's Indian state using its standard full name (e.g. \
"Telangana", "Maharashtra", "Tamil Nadu"), or null if never stated or if \
only a city was given without an explicit state,
  "timeline": short text describing when the customer wants to move \
forward (e.g. "Within 30 days"), or null if never stated,
  "siteVisitRequested": true or false — true only if the customer clearly \
agreed to or asked for a site visit,
  "callbackRequested": true or false — true only if the customer asked to \
be called back later,
  "callbackAt": an ISO 8601 datetime string if the customer gave a specific \
callback time, otherwise null
}

QUALIFICATION RULES — judge the whole conversation, not any single detail \
(a stated quantity alone does NOT make a call HOT):
- "HOT": a genuine active requirement with meaningful buying intent — a \
specific requirement, quantity known or reasonably estimated, installation \
location known, a near-term need (especially within 30-60 days), and \
interest in a quotation and/or site visit, or actively comparing/evaluating \
suppliers with real urgency.
- "WARM": a genuine requirement, but not ready to buy immediately — e.g. \
"planning a project in about three months", or "comparing a few suppliers, \
haven't decided yet".
- "COLD": primarily researching, with no defined immediate requirement — \
e.g. "just researching HVLS fans, haven't decided anything".
- "NOT_INTERESTED": the customer explicitly said they are not interested, \
already bought elsewhere, or asked not to be contacted again.

CRITICAL RULES — DO NOT VIOLATE:
- NEVER invent or guess a value the customer did not actually state. If \
something was not clearly said, its value MUST be null (or false for the \
two boolean fields).
- Base "summary" only on what was actually said in the transcript.
- Output ONLY the JSON object — nothing before or after it.
"""


_IST = timezone(timedelta(hours=5, minutes=30))


def _date_context(now: datetime | None = None) -> str:
    """Tells the LLM today's date in India and the required offset, so a
    spoken "call me tomorrow at 5" becomes an absolute IST time instead of
    a guessed year or a time with no timezone (DailyOps also reads a time
    without an offset as IST, and rejects past times)."""
    today = (now or datetime.now(timezone.utc)).astimezone(_IST)
    return (
        f"Today is {today:%A, %Y-%m-%d} in India (IST, UTC+05:30). "
        "If you give callbackAt, it must be a future date-time with the +05:30 offset, "
        'e.g. "2026-01-15T17:00:00+05:30".\n\n'
    )


# Keys the extraction prompt asks for — the only ones passed on to DailyOps.
EXTRACTED_KEYS = (
    "qualification",
    "summary",
    "quantity",
    "application",
    "city",
    "state",
    "timeline",
    "siteVisitRequested",
    "callbackRequested",
    "callbackAt",
)


async def extract_qualification(settings: Settings, history: list[dict[str, str]]) -> dict | None:
    """Returns the extracted fields (only EXTRACTED_KEYS, values as the LLM
    gave them, strings trimmed, empty/null values omitted), or None if
    extraction could not be done (no history, LLM failure, non-JSON or
    non-object output). Never raises — end-of-call cleanup must always
    finish."""
    if not history:
        return None

    client = AsyncSarvamAI(api_subscription_key=settings.sarvam_api_key)
    transcript_lines = [f'{turn.get("role", "user")}: {turn.get("content", "")}' for turn in history]
    messages = [
        {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": _date_context() + "Transcript:\n" + "\n".join(transcript_lines)},
    ]

    try:
        response = await client.chat.completions(messages=messages, model=settings.sarvam_llm_model)
        choice = response.choices[0]
        content = getattr(choice.message, "content", None) if hasattr(choice, "message") else None
        if not content:
            logger.error("Qualification extraction: empty LLM response")
            return None
    except Exception as exc:  # noqa: BLE001 — never crash end-of-call cleanup over this
        logger.error("Qualification extraction: LLM call failed: %s", type(exc).__name__)
        return None

    return parse_extraction(content)


def parse_extraction(content: str) -> dict | None:
    """Pure parsing step, split out for unit tests."""
    raw = content.strip()
    # Defensive: strip a markdown code fence if the model added one anyway.
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Qualification extraction: LLM did not return valid JSON (len=%d)", len(raw))
        return None
    if not isinstance(parsed, dict):
        logger.error("Qualification extraction: LLM JSON was not an object")
        return None

    result: dict = {}
    for key in EXTRACTED_KEYS:
        value = parsed.get(key)
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
        if value is None:
            continue
        result[key] = value
    return result
