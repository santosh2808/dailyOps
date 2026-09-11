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
        # TEMPORARY DIAGNOSTIC (STT pipeline investigation): running counters
        # for inbound Exotel PCM actually reaching send_pcm() — see below.
        self._pcm_frame_count = 0
        self._pcm_bytes_total = 0
        # BUFFERING FIX: accumulate raw PCM here instead of wrapping/sending
        # every ~20ms/320-byte Exotel frame independently. Flushed in
        # ~200ms chunks by send_pcm() below, and any partial remainder is
        # flushed on close() so trailing audio is never silently discarded.
        self._pcm_buffer = bytearray()
        # 200ms of 16-bit mono PCM at self._sample_rate — e.g. 3200 bytes at
        # 8kHz (8000 samples/sec * 0.2 sec * 2 bytes/sample). Computed from
        # sample_rate rather than hardcoded so it stays correct if the
        # negotiated sample rate ever differs from 8kHz.
        self._chunk_bytes = int(self._sample_rate * 0.2) * 2
        # TEMPORARY DIAGNOSTIC: counters for what's actually been sent to
        # Sarvam, as opposed to what's been received from Exotel above.
        self._sarvam_chunk_count = 0
        self._sarvam_bytes_sent_total = 0

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
        """Buffer one incoming ~20ms/320-byte Exotel PCM frame, and flush the
        buffer to Sarvam in ~200ms chunks (self._chunk_bytes) rather than
        sending every tiny frame independently. Each flushed chunk still
        goes through the exact same WAV-wrap + ws.transcribe() call as
        before (see _send_chunk) — only the batching/timing changed.
        """
        # TEMPORARY DIAGNOSTIC (STT pipeline investigation): confirm inbound
        # Exotel PCM actually reaches this method, and how much — never logs
        # the audio payload itself, only byte counts.
        self._pcm_frame_count += 1
        self._pcm_bytes_total += len(pcm)

        if self._closed:
            logger.warning(
                "STT send_pcm() ignoring frame: session already closed (frame_count=%d)",
                self._pcm_frame_count,
            )
            return

        self._pcm_buffer.extend(pcm)
        # BUFFERING FIX / DIAGNOSTIC: buffer size after each incoming frame,
        # as requested — shows the buffer filling toward self._chunk_bytes.
        logger.info(
            "STT send_pcm() called: frame_bytes=%d frame_count=%d cumulative_bytes=%d buffer_bytes=%d",
            len(pcm),
            self._pcm_frame_count,
            self._pcm_bytes_total,
            len(self._pcm_buffer),
        )

        while len(self._pcm_buffer) >= self._chunk_bytes:
            chunk = bytes(self._pcm_buffer[: self._chunk_bytes])
            del self._pcm_buffer[: self._chunk_bytes]
            await self._send_chunk(chunk)

    async def _send_chunk(self, pcm_chunk: bytes) -> None:
        """Wrap one accumulated PCM chunk as a minimal WAV and send it to
        Sarvam via the existing ws.transcribe() call — unchanged from the
        prior per-frame implementation, just now called with a ~200ms
        chunk instead of a single ~20ms Exotel frame. See
        audio_utils.wrap_pcm_as_wav docstring for why WAV-wrapping is used
        (the SDK's per-message encoding is fixed to "audio/wav").
        """
        if self._closed or self._ws is None:
            # TEMPORARY DIAGNOSTIC: this early-return was previously silent —
            # if it's firing, a full chunk was buffered but never actually
            # sent to Sarvam at all.
            logger.warning(
                "STT _send_chunk() dropped chunk: closed=%s ws_is_none=%s chunk_bytes=%d",
                self._closed,
                self._ws is None,
                len(pcm_chunk),
            )
            return
        wav_bytes = wrap_pcm_as_wav(pcm_chunk, sample_rate=self._sample_rate)
        audio_b64 = base64.b64encode(wav_bytes).decode("ascii")
        self._sarvam_chunk_count += 1
        # BUFFERING FIX / DIAGNOSTIC: exact byte counts of the accumulated
        # chunk about to be sent to Sarvam, plus running totals of what's
        # actually been sent (as opposed to what's been received above).
        logger.info(
            "STT sending buffered chunk to Sarvam: raw_pcm_bytes=%d wav_bytes=%d base64_len=%d "
            "sample_rate=%s chunk_count=%d",
            len(pcm_chunk),
            len(wav_bytes),
            len(audio_b64),
            self._sample_rate,
            self._sarvam_chunk_count,
        )
        try:
            await self._ws.transcribe(audio=audio_b64, encoding="audio/wav", sample_rate=self._sample_rate)
            self._sarvam_bytes_sent_total += len(pcm_chunk)
            # TEMPORARY DIAGNOSTIC: confirms the send call itself completed
            # without raising — does not confirm Sarvam accepted/used it.
            logger.info(
                "STT buffered chunk sent to Sarvam successfully: wav_bytes=%d chunk_count=%d "
                "cumulative_raw_bytes_sent=%d",
                len(wav_bytes),
                self._sarvam_chunk_count,
                self._sarvam_bytes_sent_total,
            )
        except Exception as exc:  # noqa: BLE001 — surfaced as an SttEvent, never crashes the call
            # TEMPORARY DIAGNOSTIC: logger.exception() for the full traceback,
            # in addition to the existing error-event behavior (unchanged).
            logger.exception(
                "Sarvam STT send failed (wav_bytes=%d chunk_count=%d)", len(wav_bytes), self._sarvam_chunk_count
            )
            await self.events.put(SttEvent(kind="error", text=str(exc)))

    async def _flush_buffer(self) -> None:
        """Send any partially-filled buffer (less than one full ~200ms
        chunk) so trailing audio isn't silently discarded when the call
        ends or the STT session closes — requirement 9."""
        if not self._pcm_buffer:
            return
        remaining = bytes(self._pcm_buffer)
        self._pcm_buffer.clear()
        logger.info("STT flushing remaining buffered audio on close: remaining_bytes=%d", len(remaining))
        await self._send_chunk(remaining)

    async def _read_loop(self) -> None:
        try:
            async for message in self._ws:
                msg_type = getattr(message, "type", None)
                data = getattr(message, "data", None)
                # TEMPORARY DIAGNOSTIC (STT pipeline investigation): confirm
                # any response/event is coming back from Sarvam at all,
                # regardless of shape.
                logger.info("STT message received from Sarvam: type=%s", msg_type)
                if msg_type == "events" and data is not None:
                    signal = getattr(data, "signal_type", None)
                    logger.info("STT event signal_type=%s", signal)
                    if signal == "START_SPEECH":
                        await self.events.put(SttEvent(kind="speech_start"))
                    elif signal == "END_SPEECH":
                        await self.events.put(SttEvent(kind="speech_end"))
                elif msg_type == "data" and data is not None:
                    transcript = getattr(data, "transcript", None)
                    # TEMPORARY DIAGNOSTIC: transcript LENGTH only — never the
                    # actual customer speech content.
                    logger.info(
                        "STT transcript data received: transcript_len=%d",
                        len(transcript) if transcript else 0,
                    )
                    if transcript:
                        await self.events.put(SttEvent(kind="transcript", text=transcript))
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — connection dropped/errored; surface, don't crash
            # TEMPORARY DIAGNOSTIC: logger.exception() for the full traceback,
            # in addition to the existing error-event behavior (unchanged).
            logger.exception("Sarvam STT read loop ended with an exception")
            await self.events.put(SttEvent(kind="error", text=str(exc)))

    async def close(self) -> None:
        if self._closed:
            return
        # BUFFERING FIX (requirement 9): flush any partial buffered chunk
        # BEFORE marking the session closed, since _send_chunk()/send_pcm()
        # both check self._closed and would otherwise silently drop this
        # trailing audio.
        await self._flush_buffer()
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
