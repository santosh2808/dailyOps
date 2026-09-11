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
            language_code=settings.sarvam_language,
            speaker=settings.sarvam_voice,
            output_audio_codec="linear16",
            sample_rate=sample_rate,
        )
        await ws.convert(text)
        await ws.flush()

        async for message in ws:
            if isinstance(message, AudioOutput):
                yield base64.b64decode(message.data.audio)
            elif isinstance(message, EventResponse):
                if getattr(message.data, "event_type", None) == "final":
                    break
