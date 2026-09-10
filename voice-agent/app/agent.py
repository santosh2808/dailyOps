"""Conversation orchestration for one phone call: wires session.py's Exotel
protocol layer to Sarvam STT/LLM/TTS. This is where "Ananya" actually talks
— the persona/script content itself lives in prompts.py, this module just
drives turn-taking, barge-in, and the call time budget around it.
"""

from __future__ import annotations

import asyncio
import logging
import time

from .config import Settings
from .prompts import AFFIRMATIVE_FOLLOWUP, CLOSING, GREETING
from .sarvam_llm import generate_reply
from .sarvam_stt import SarvamSttSession
from .sarvam_tts import synthesize_speech
from .session import ExotelSession

logger = logging.getLogger("voice-agent.agent")

_AFFIRMATIVE_WORDS = ("yes", "yeah", "yep", "yup", "clearly", "sure", "i can hear", "loud and clear")

_GOODBYE_MARK = "goodbye_complete"
_MARK_WAIT_TIMEOUT_SECONDS = 5


class CallAgent:
    """Owns the full lifecycle of one Exotel Voicebot WebSocket connection."""

    def __init__(self, session: ExotelSession, settings: Settings):
        self._session = session
        self._settings = settings
        self._sample_rate = 8000
        self._stt: SarvamSttSession | None = None
        self._history: list[dict[str, str]] = []
        self._speaking_task: asyncio.Task | None = None
        self._greeting_answered = False
        self._call_start: float | None = None
        self._ended = asyncio.Event()
        self._mark_events: dict[str, asyncio.Event] = {}

    async def run(self) -> None:
        if not self._settings.sarvam_configured:
            logger.error("SARVAM_API_KEY is not configured — refusing to start a call session.")
            await self._session.close()
            return

        try:
            async for event in self._session.events():
                if self._ended.is_set():
                    break

                if event.kind == "connected":
                    logger.info("Exotel WebSocket connected")

                elif event.kind == "start" and event.start:
                    self._sample_rate = event.start.sample_rate or 8000
                    self._call_start = time.monotonic()
                    logger.info(
                        "Call started: call_sid=%s stream_sid=%s sample_rate=%s",
                        event.start.call_sid,
                        event.start.stream_sid,
                        self._sample_rate,
                    )
                    self._stt = SarvamSttSession(self._settings, sample_rate=self._sample_rate)
                    await self._stt.start()
                    asyncio.create_task(self._watch_stt_events(), name="stt-event-watcher")
                    asyncio.create_task(self._watch_time_budget(), name="call-time-budget")
                    self._speaking_task = asyncio.create_task(self._speak(GREETING), name="speak-greeting")

                elif event.kind == "media" and event.audio and self._stt:
                    await self._stt.send_pcm(event.audio)

                elif event.kind == "dtmf":
                    logger.info("DTMF digit received: %s (ignored in Phase 2B)", event.digit)

                elif event.kind == "mark" and event.mark_name:
                    waiter = self._mark_events.get(event.mark_name)
                    if waiter:
                        waiter.set()

                elif event.kind in ("stop", "closed"):
                    logger.info("Call ended by provider: reason=%s", event.reason)
                    break
        except Exception:  # noqa: BLE001 — Step 9: handle errors, never let one crash the process
            logger.exception("Unhandled error in call session")
        finally:
            await self._cleanup()

    async def _watch_stt_events(self) -> None:
        assert self._stt is not None
        while not self._ended.is_set():
            try:
                event = await asyncio.wait_for(self._stt.events.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            if event.kind == "speech_start":
                # Barge-in (Step 9 "handle customer interruption where
                # supported"): stop whatever Ananya is currently saying and
                # clear any audio Exotel has buffered but not yet played.
                if self._speaking_task and not self._speaking_task.done():
                    self._speaking_task.cancel()
                    await self._session.send_clear()
            elif event.kind == "transcript" and event.text:
                await self._handle_user_turn(event.text)
            elif event.kind == "error":
                logger.warning("STT error event: %s", event.text)

    async def _watch_time_budget(self) -> None:
        while not self._ended.is_set():
            await asyncio.sleep(1)
            if self._call_start is None:
                continue
            elapsed = time.monotonic() - self._call_start
            if elapsed >= self._settings.max_call_seconds:
                logger.info("Call time budget reached (%ss) — wrapping up", self._settings.max_call_seconds)
                await self._end_call_gracefully()
                return

    async def _handle_user_turn(self, transcript: str) -> None:
        if self._ended.is_set():
            return

        if self._speaking_task and not self._speaking_task.done():
            # Ananya is already replying to a previous turn; let barge-in
            # (speech_start) be the thing that interrupts her, not a second
            # transcript arriving mid-reply.
            return

        self._history.append({"role": "user", "content": transcript})

        if not self._greeting_answered:
            self._greeting_answered = True
            if any(word in transcript.lower() for word in _AFFIRMATIVE_WORDS):
                reply_text = AFFIRMATIVE_FOLLOWUP
            else:
                reply_text = await generate_reply(self._settings, self._history)
        else:
            reply_text = await generate_reply(self._settings, self._history)

        self._history.append({"role": "assistant", "content": reply_text})
        self._speaking_task = asyncio.create_task(self._speak(reply_text), name="speak-reply")

    async def _speak(self, text: str) -> None:
        agen = synthesize_speech(self._settings, text, self._sample_rate)
        try:
            async for chunk in agen:
                await self._session.send_audio(chunk)
        except asyncio.CancelledError:
            raise
        finally:
            await agen.aclose()

    async def _end_call_gracefully(self) -> None:
        if self._ended.is_set():
            return
        if self._speaking_task and not self._speaking_task.done():
            self._speaking_task.cancel()
            await self._session.send_clear()

        await self._speak(CLOSING)

        mark_event = asyncio.Event()
        self._mark_events[_GOODBYE_MARK] = mark_event
        await self._session.send_mark(_GOODBYE_MARK)
        try:
            await asyncio.wait_for(mark_event.wait(), timeout=_MARK_WAIT_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            logger.info("No mark ack from Exotel within %ss — closing anyway", _MARK_WAIT_TIMEOUT_SECONDS)

        self._ended.set()
        await self._session.close()

    async def _cleanup(self) -> None:
        self._ended.set()
        if self._speaking_task and not self._speaking_task.done():
            self._speaking_task.cancel()
        if self._stt:
            await self._stt.close()
        logger.info("Call session cleaned up")
