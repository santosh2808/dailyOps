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
"""

from __future__ import annotations

import json
import logging

from sarvamai import AsyncSarvamAI

from .config import Settings

logger = logging.getLogger("voice-agent.qualification")

# Mirrors backend Prisma enum AiQualification (HOT/WARM/COLD/NOT_INTERESTED)
# and AiLeadStatus (only QUALIFIED/NOT_INTERESTED are ever emitted here —
# ANSWERED/FAILED/etc. are set directly by agent.py for calls that never
# produced a real conversation, not by this extraction step).
_VALID_QUALIFICATIONS = {"HOT", "WARM", "COLD", "NOT_INTERESTED"}

_EXTRACTION_SYSTEM_PROMPT = """You just finished listening to a phone call transcript between "Meera", a \
voice assistant for Spyro Fans (an Indian HVLS industrial fan company), and a \
customer who had enquired about HVLS fans. Your job is ONLY to extract a \
structured summary of that call as JSON — you are not talking to the \
customer, you are analyzing a finished conversation.

Output ONLY a single valid JSON object, no prose, no markdown code fences, \
with exactly these keys:

{
  "qualification": one of "HOT", "WARM", "COLD", "NOT_INTERESTED",
  "summary": a short factual 1-3 sentence summary of what the customer said,
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

QUALIFICATION RULES:
- "HOT": the customer has a clear, current requirement (fan count and/or \
application known), sounds ready to move forward soon, and agreed to a \
site visit or a quotation/callback.
- "WARM": genuine interest and some real requirement detail, but no \
concrete near-term commitment yet (e.g. "just exploring", vague timeline).
- "COLD": very little real interest or detail — vague, non-committal, or \
mostly small talk with no real requirement surfaced.
- "NOT_INTERESTED": the customer explicitly said they are not interested, \
already bought elsewhere, or asked not to be contacted again.

CRITICAL RULES — DO NOT VIOLATE:
- NEVER invent or guess a value the customer did not actually state. If \
something was not clearly said, its value MUST be null (or false for the \
two boolean fields).
- Base "summary" only on what was actually said in the transcript.
- Output ONLY the JSON object — nothing before or after it.
"""


def _safe_bool(value) -> bool:
    return bool(value) if isinstance(value, bool) else False


def _safe_int(value) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_str(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


async def extract_qualification(settings: Settings, history: list[dict[str, str]]) -> dict:
    """Returns a dict already shaped as the Phase 3A DTO's fields
    (status/qualification/summary/quantity/application/city/state/
    timeline/siteVisitRequested/callbackRequested/callbackAt). Never
    raises — falls back to a safe, mostly-empty COLD result (logged) if
    the LLM call or JSON parsing fails, since a bad extraction must never
    block the caller (agent.py's _cleanup()) from finishing."""
    fallback = {
        "status": "QUALIFIED",
        "qualification": "COLD",
        "summary": "Automated qualification extraction failed; call transcript available in logs only.",
        "quantity": None,
        "application": None,
        "city": None,
        "state": None,
        "timeline": None,
        "siteVisitRequested": False,
        "callbackRequested": False,
        "callbackAt": None,
    }

    if not history:
        return fallback

    client = AsyncSarvamAI(api_subscription_key=settings.sarvam_api_key)
    transcript_lines = [f'{turn.get("role", "user")}: {turn.get("content", "")}' for turn in history]
    messages = [
        {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": "Transcript:\n" + "\n".join(transcript_lines)},
    ]

    try:
        response = await client.chat.completions(messages=messages, model=settings.sarvam_llm_model)
        choice = response.choices[0]
        content = getattr(choice.message, "content", None) if hasattr(choice, "message") else None
        if not content:
            logger.error("Qualification extraction: empty LLM response")
            return fallback
    except Exception as exc:  # noqa: BLE001 — never crash end-of-call cleanup over this
        logger.error("Qualification extraction: LLM call failed: %s", exc)
        return fallback

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
        return fallback

    qualification = str(parsed.get("qualification") or "").strip().upper()
    if qualification not in _VALID_QUALIFICATIONS:
        logger.warning("Qualification extraction: unrecognized qualification value — defaulting to COLD")
        qualification = "COLD"

    # Deterministic status<->qualification pairing (do not trust the LLM to
    # get this right on its own): NOT_INTERESTED qualification always means
    # AiLeadStatus.NOT_INTERESTED; HOT/WARM/COLD always mean QUALIFIED (the
    # call was successfully completed and qualified, whatever the outcome).
    status = "NOT_INTERESTED" if qualification == "NOT_INTERESTED" else "QUALIFIED"

    return {
        "status": status,
        "qualification": qualification,
        "summary": _safe_str(parsed.get("summary")),
        "quantity": _safe_int(parsed.get("quantity")),
        "application": _safe_str(parsed.get("application")),
        "city": _safe_str(parsed.get("city")),
        "state": _safe_str(parsed.get("state")),
        "timeline": _safe_str(parsed.get("timeline")),
        "siteVisitRequested": _safe_bool(parsed.get("siteVisitRequested")),
        "callbackRequested": _safe_bool(parsed.get("callbackRequested")),
        "callbackAt": _safe_str(parsed.get("callbackAt")),
    }
