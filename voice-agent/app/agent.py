"""Conversation orchestration for one phone call: wires session.py's Exotel
protocol layer to Sarvam STT/LLM/TTS. This is where "Meera" actually talks
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
                    # TEMPORARY DIAGNOSTIC (silent-failure investigation): this is
                    # the one unaudited await between "Call started" and "Starting
                    # greeting task" — instrumented in isolation, no behavior change.
                    logger.info("Calling STT start")
                    try:
                        await self._stt.start()
                    except BaseException as exc:  # noqa: BLE001 — diagnostic visibility only; always re-raised below
                        logger.exception("STT start raised %s", type(exc).__name__)
                        raise
                    logger.info("STT start returned successfully")
                    asyncio.create_task(self._watch_stt_events(), name="stt-event-watcher")
                    asyncio.create_task(self._watch_time_budget(), name="call-time-budget")
                    # TEMPORARY DIAGNOSTIC (silent-failure investigation): confirm
                    # this line is actually reached before the greeting task is created.
                    logger.info("Starting greeting task")
                    self._speaking_task = asyncio.create_task(self._speak(GREETING), name="speak-greeting")
                    # TEMPORARY DIAGNOSTIC: see _log_speaking_task_result — without
                    # this, an exception raised inside a fire-and-forget
                    # create_task() call only ever surfaces (if at all) as an
                    # easy-to-miss "Task exception was never retrieved" warning
                    # whenever the Task object happens to be garbage-collected.
                    self._speaking_task.add_done_callback(self._log_speaking_task_result)

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
                # supported"): stop whatever Meera is currently saying and
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
            # Meera is already replying to a previous turn; let barge-in
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
        # TEMPORARY DIAGNOSTIC: same visibility as the greeting task below —
        # logging before create_task() plus the done-callback below.
        logger.info("Starting reply speaking task")
        self._speaking_task = asyncio.create_task(self._speak(reply_text), name="speak-reply")
        self._speaking_task.add_done_callback(self._log_speaking_task_result)

    async def _speak(self, text: str) -> None:
        # TEMPORARY DIAGNOSTIC (silent-failure investigation): confirm this
        # coroutine actually starts running once its create_task() is
        # scheduled — text content itself is not logged, only its length.
        logger.info("TTS speak started: text_len=%d sample_rate=%s", len(text), self._sample_rate)

        total_bytes = 0
        # TEMPORARY DIAGNOSTIC: confirm synthesize_speech() is actually reached
        # and called (as opposed to, e.g., an earlier await never returning).
        logger.info("Calling synthesize_speech()")
        agen = synthesize_speech(self._settings, text, self._sample_rate)
        try:
            async for chunk in agen:
                total_bytes += len(chunk)
                # TEMPORARY DIAGNOSTIC: every chunk's size + running total —
                # this is what should have summed to 136400 in the standalone
                # test; here we see whether any chunk (or the loop itself)
                # is ever actually reached on a live Exotel call.
                logger.info(
                    "TTS audio chunk received: chunk_bytes=%d cumulative_bytes=%d",
                    len(chunk),
                    total_bytes,
                )
                logger.info("Calling session.send_audio(): chunk_bytes=%d", len(chunk))
                await self._session.send_audio(chunk)
                logger.info("session.send_audio() succeeded: chunk_bytes=%d cumulative_bytes=%d", len(chunk), total_bytes)
            # TEMPORARY DIAGNOSTIC: reached only on normal (non-cancelled,
            # non-exception) completion of the loop above.
            logger.info("TTS speak completed: total_bytes=%d", total_bytes)
        except asyncio.CancelledError:
            # Expected on barge-in (see _watch_stt_events) — not an error, but
            # still logged so a cancellation is never confused with silence.
            logger.info("TTS speak cancelled: total_bytes_sent_so_far=%d", total_bytes)
            raise
        except Exception:
            # TEMPORARY DIAGNOSTIC: this is the "any exception logged with
            # full traceback and then re-raised" requirement — logger.exception()
            # captures the current exception's traceback automatically.
            logger.exception("TTS speak failed with an unhandled exception: total_bytes_sent_so_far=%d", total_bytes)
            raise
        finally:
            await agen.aclose()

    def _log_speaking_task_result(self, task: asyncio.Task) -> None:
        """TEMPORARY DIAGNOSTIC (silent-failure investigation): done-callback
        attached to every `_speak()` create_task() call. Without this,
        asyncio only ever surfaces an exception raised inside a
        fire-and-forget task as a "Task exception was never retrieved"
        warning — and only if/when that Task object is garbage-collected,
        which may be long after the fact or never while the task is still
        referenced (as `self._speaking_task` is here). This callback makes
        that exception visible immediately, every time, with a full
        traceback, without changing what the task itself does.
        """
        if task.cancelled():
            logger.info("Speaking task %r ended: cancelled (expected on barge-in)", task.get_name())
            return
        exc = task.exception()
        if exc is not None:
            logger.error("Speaking task %r ended with an unhandled exception", task.get_name(), exc_info=exc)
        else:
            logger.info("Speaking task %r ended normally", task.get_name())

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
