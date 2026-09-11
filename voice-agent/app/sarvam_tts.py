"""Streaming text-to-speech against Sarvam's WebSocket API (bulbul:v3), via
the officially documented `sarvamai` Python SDK — see
https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/streaming-api/web-socket.

One connection is opened per agent utterance rather than kept open for the
whole call: Sarvam's TTS WebSocket has no server-side cancel/clear message
(documented explicitly on the page above), so the recommended barge-in
pattern is "stop consuming locally, close the socket, open a fresh one for
the next reply" — which this module implements by making each call to
`synthesize()` its own short-lived connection. The caller (session.py)
handles barge-in by simply calling `.aclose()` on the async generator
returned here, which unwinds the `async with` block and closes the socket.
"""

from __future__ import annotations

import base64
import logging
from typing import AsyncIterator

from sarvamai import AsyncSarvamAI, AudioOutput, EventResponse

from .config import Settings

logger = logging.getLogger("voice-agent.tts")

# TEMPORARY DIAGNOSTIC (TTS 0-bytes investigation) — best-effort import of an
# SDK error/response type, if one exists under this name in the installed
# `sarvamai` version. Guarded so a missing/renamed type can't crash the
# module — remove this along with the other DIAGNOSTIC blocks below once the
# 0-byte-audio issue is root-caused.
try:
    from sarvamai import ErrorResponse  # type: ignore[attr-defined]
except ImportError:
    ErrorResponse = None  # type: ignore[assignment]


def _diagnostic_safe_repr(message: object, limit: int = 300) -> str:
    """TEMPORARY DIAGNOSTIC: a truncated repr() for logging — never touches
    settings/credentials (this only ever receives messages *from* the Sarvam
    WebSocket, not our request/config objects), but is truncated regardless
    so a large payload (e.g. base64 audio) can't flood the logs.
    """
    try:
        text = repr(message)
    except Exception as exc:  # noqa: BLE001 — diagnostic logging must not itself crash the call
        return f"<repr failed: {exc!r}>"
    if len(text) > limit:
        return text[:limit] + f"...<truncated, {len(text)} chars total>"
    return text


# TEMPORARY DIAGNOSTIC: key fragments that must never be logged, even if
# they turn up nested inside an SDK object's model_dump()/dict()/__dict__.
# Sarvam's own error payloads have no reason to echo our credentials back,
# but this redaction is applied unconditionally as a safety net regardless.
_DIAGNOSTIC_REDACT_KEY_FRAGMENTS = (
    "api_key",
    "apikey",
    "subscription_key",
    "authorization",
    "token",
    "secret",
    "credential",
    "password",
)


def _diagnostic_redact(value: object, _depth: int = 0) -> object:
    """TEMPORARY DIAGNOSTIC: recursively redact anything credential-shaped
    out of a dict/list structure before it's logged. Non-container values are
    returned as-is.
    """
    if _depth > 6:
        return "<diagnostic redaction depth limit reached>"
    if isinstance(value, dict):
        redacted = {}
        for key, val in value.items():
            if isinstance(key, str) and any(frag in key.lower() for frag in _DIAGNOSTIC_REDACT_KEY_FRAGMENTS):
                redacted[key] = "<redacted>"
            else:
                redacted[key] = _diagnostic_redact(val, _depth + 1)
        return redacted
    if isinstance(value, (list, tuple)):
        return [_diagnostic_redact(item, _depth + 1) for item in value]
    return value


def _diagnostic_dump(label: str, value: object) -> str:
    """TEMPORARY DIAGNOSTIC: redact + safe-repr a value for a single log line."""
    return f"{label}={_diagnostic_safe_repr(_diagnostic_redact(value), limit=2000)}"


async def synthesize_speech(settings: Settings, text: str, sample_rate: int = 8000) -> AsyncIterator[bytes]:
    """Yield raw 16-bit PCM audio chunks for `text`, spoken as Meera.

    Requests linear16 (raw PCM) output at `sample_rate` so no resampling is
    needed before handing chunks straight to Exotel's `media` event — see
    session.py.
    """
    client = AsyncSarvamAI(api_subscription_key=settings.sarvam_api_key)
    async with client.text_to_speech_streaming.connect(
        model=settings.sarvam_tts_model, send_completion_event=True
    ) as ws:
        await ws.configure(
            target_language_code=settings.sarvam_language,
            speaker=settings.sarvam_voice,
            output_audio_codec="linear16",
            speech_sample_rate=sample_rate,
        )
        await ws.convert(text)
        await ws.flush()

        async for message in ws:
            # TEMPORARY DIAGNOSTIC: log every message's type + a safe repr,
            # regardless of what kind of message it turns out to be.
            logger.info(
                "TTS diagnostic: received message type=%s repr=%s",
                type(message).__name__,
                _diagnostic_safe_repr(message),
            )

            if isinstance(message, AudioOutput):
                audio_bytes = base64.b64decode(message.data.audio)
                # TEMPORARY DIAGNOSTIC: exact decoded length of each chunk —
                # this is the number we expect to sum to > 0.
                logger.info("TTS diagnostic: AudioOutput decoded_bytes=%d", len(audio_bytes))
                yield audio_bytes
            elif isinstance(message, EventResponse):
                event_type = getattr(message.data, "event_type", None)
                # TEMPORARY DIAGNOSTIC: which control events Sarvam actually sends.
                logger.info("TTS diagnostic: EventResponse event_type=%s", event_type)
                if event_type == "final":
                    break
            elif ErrorResponse is not None and isinstance(message, ErrorResponse):
                # TEMPORARY DIAGNOSTIC: the plain error/code/message getattr
                # above came back all-None, so dig into every representation
                # the SDK object offers to find where the real detail lives.
                logger.error("TTS diagnostic: ErrorResponse full repr=%s", _diagnostic_safe_repr(message, limit=2000))

                if hasattr(message, "model_dump"):
                    try:
                        dumped = message.model_dump()
                    except Exception as exc:  # noqa: BLE001 — diagnostic introspection must not crash the call
                        dumped = f"<model_dump() raised: {exc!r}>"
                    logger.error("TTS diagnostic: %s", _diagnostic_dump("ErrorResponse.model_dump()", dumped))

                if hasattr(message, "dict"):
                    try:
                        as_dict = message.dict()
                    except Exception as exc:  # noqa: BLE001 — diagnostic introspection must not crash the call
                        as_dict = f"<dict() raised: {exc!r}>"
                    logger.error("TTS diagnostic: %s", _diagnostic_dump("ErrorResponse.dict()", as_dict))

                if hasattr(message, "__dict__"):
                    logger.error("TTS diagnostic: %s", _diagnostic_dump("ErrorResponse.__dict__", message.__dict__))

                if hasattr(message, "data"):
                    error_data = message.data
                    logger.error("TTS diagnostic: ErrorResponse.data repr=%s", _diagnostic_safe_repr(error_data, limit=2000))
                    if hasattr(error_data, "__dict__"):
                        logger.error("TTS diagnostic: %s", _diagnostic_dump("ErrorResponse.data.__dict__", error_data.__dict__))

                # TEMPORARY DIAGNOSTIC: targeted recursive look at exactly the
                # fields we care about, however deep the SDK actually nests them.
                for field_name in ("error", "code", "message", "request_id", "type", "data"):
                    field_value = getattr(message, field_name, "<attribute not present>")
                    logger.error(
                        "TTS diagnostic: ErrorResponse.%s=%s",
                        field_name,
                        _diagnostic_safe_repr(_diagnostic_redact(field_value), limit=2000),
                    )
            else:
                # TEMPORARY DIAGNOSTIC: anything else Sarvam sends that this
                # code doesn't otherwise branch on (possible undocumented
                # error/status shape for this SDK version).
                logger.warning(
                    "TTS diagnostic: unhandled message type=%s repr=%s",
                    type(message).__name__,
                    _diagnostic_safe_repr(message),
                )
