"""Streaming speech-to-text against Sarvam's WebSocket API (saaras:v3),
via the officially documented `sarvamai` Python SDK — see
https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/streaming-api.

One SarvamSttSession per active phone call. Events (interim voice-activity
signals and final transcripts) are pushed onto an asyncio.Queue that
session.py drains, so the WebSocket-reading loop here never blocks the
caller.
"""

from __future__ import annotations

import asyncio
import base64
import logging
from dataclasses import dataclass

from sarvamai import AsyncSarvamAI

from .audio_utils import wrap_pcm_as_wav
from .config import Settings

logger = logging.getLogger("voice-agent.stt")


@dataclass
class SttEvent:
    # "speech_start" | "speech_end" | "transcript" | "error"
    kind: str
    text: str | None = None


class SarvamSttSession:
    """Wraps one Sarvam streaming-STT WebSocket for the lifetime of a call."""

    def __init__(self, settings: Settings, sample_rate: int = 8000):
        self._settings = settings
        self._sample_rate = sample_rate
        self._client = AsyncSarvamAI(api_subscription_key=settings.sarvam_api_key)
        self._ws_cm = None
        self._ws = None
        self.events: asyncio.Queue[SttEvent] = asyncio.Queue()
        self._reader_task: asyncio.Task | None = None
        self._closed = False

    async def start(self) -> None:
        self._ws_cm = self._client.speech_to_text_streaming.connect(
            model=self._settings.sarvam_stt_model,
            mode="transcribe",
            language_code=self._settings.sarvam_language,
            sample_rate=self._sample_rate,
            high_vad_sensitivity=True,
            vad_signals=True,
        )
        self._ws = await self._ws_cm.__aenter__()
        self._reader_task = asyncio.create_task(self._read_loop(), name="sarvam-stt-reader")

    async def send_pcm(self, pcm: bytes) -> None:
        """Send one chunk of raw 16-bit PCM audio for transcription.

        Wrapped as a minimal WAV per chunk — see audio_utils.wrap_pcm_as_wav
        docstring for why (the SDK's per-message encoding is fixed to
        "audio/wav").
        """
        if self._closed or self._ws is None:
            return
        wav_bytes = wrap_pcm_as_wav(pcm, sample_rate=self._sample_rate)
        audio_b64 = base64.b64encode(wav_bytes).decode("ascii")
        try:
            await self._ws.transcribe(audio=audio_b64, encoding="audio/wav", sample_rate=self._sample_rate)
        except Exception as exc:  # noqa: BLE001 — surfaced as an SttEvent, never crashes the call
            logger.error("Sarvam STT send failed: %s", exc)
            await self.events.put(SttEvent(kind="error", text=str(exc)))

    async def _read_loop(self) -> None:
        try:
            async for message in self._ws:
                msg_type = getattr(message, "type", None)
                data = getattr(message, "data", None)
                if msg_type == "events" and data is not None:
                    signal = getattr(data, "signal_type", None)
                    if signal == "START_SPEECH":
                        await self.events.put(SttEvent(kind="speech_start"))
                    elif signal == "END_SPEECH":
                        await self.events.put(SttEvent(kind="speech_end"))
                elif msg_type == "data" and data is not None:
                    transcript = getattr(data, "transcript", None)
                    if transcript:
                        await self.events.put(SttEvent(kind="transcript", text=transcript))
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — connection dropped/errored; surface, don't crash
            logger.error("Sarvam STT read loop ended: %s", exc)
            await self.events.put(SttEvent(kind="error", text=str(exc)))

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        if self._ws_cm is not None:
            try:
                await self._ws_cm.__aexit__(None, None, None)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Error closing Sarvam STT session: %s", exc)
