"""Conversation orchestration for one phone call: wires session.py's Exotel
protocol layer to Sarvam STT/LLM/TTS. This is where "Meera" actually talks
— the persona/script content itself lives in prompts.py, this module just
drives turn-taking, barge-in, and the call time budget around it.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone

from .config import Settings
from .dailyops_client import DailyOpsClient
from .prompts import CLOSING, GREETING
from .qualification import extract_qualification
from .sarvam_llm import generate_reply_with_status
from .sarvam_stt import SarvamSttSession
from .sarvam_tts import synthesize_speech
from .session import ExotelSession

logger = logging.getLogger("voice-agent.agent")

_GOODBYE_MARK = "goodbye_complete"
_MARK_WAIT_TIMEOUT_SECONDS = 5
# Upper bound on the one post-call Sarvam LLM extraction. Without it a hung
# Sarvam request would hold the result (and this handler) forever. On
# timeout the result is still submitted — honestly, with no qualification.
EXTRACTION_TIMEOUT_SECONDS = 20


class CallAgent:
    """Owns the full lifecycle of one Exotel Voicebot WebSocket connection."""

    def __init__(self, session: ExotelSession, settings: Settings):
        self._session = session
        self._settings = settings
        self._sample_rate = 8000
        self._stt: SarvamSttSession | None = None
        self._history: list[dict[str, str]] = []
        self._speaking_task: asyncio.Task | None = None
        self._call_start: float | None = None
        self._ended = asyncio.Event()
        self._mark_events: dict[str, asyncio.Event] = {}

        # D.O.T. call-result write-back: captured from Exotel's "start"
        # event and used only at end-of-call to report this call's result to
        # DailyOps, identified by CallSid. The caller's phone number is
        # deliberately NOT kept — DailyOps decides which lead (if any) the
        # result belongs to from its own record of the call.
        self._call_sid: str | None = None
        self._account_sid: str | None = None
        self._call_started_at: datetime | None = None
        self._result_submitted = False
        # Which components failed during the call ("stt", "llm", "tts",
        # "agent"). Any in-call failure makes the reported outcome
        # AGENT_ERROR, so a technical failure is never reported as an
        # answered/qualified call.
        self._agent_errors: set[str] = set()

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
                    self._call_started_at = datetime.now(timezone.utc)
                    self._call_sid = event.start.call_sid
                    self._account_sid = event.start.account_sid
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
                        logger.info("STT start returned successfully")
                    except BaseException:  # noqa: BLE001 — diagnostic visibility only; always re-raised below
                        logger.exception("STT start failed")
                        self._agent_errors.add("stt")
                        raise
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
                    # The digit itself is not logged — callers may key in
                    # account or phone numbers.
                    logger.info("DTMF digit received (ignored)")

                elif event.kind == "mark" and event.mark_name:
                    waiter = self._mark_events.get(event.mark_name)
                    if waiter:
                        waiter.set()

                elif event.kind in ("stop", "closed"):
                    logger.info("Call ended by provider: reason=%s", event.reason)
                    break
        except Exception:  # noqa: BLE001 — Step 9: handle errors, never let one crash the process
            logger.exception("Unhandled error in call session")
            self._agent_errors.add("agent")
        finally:
            await self._cleanup()

    async def _watch_stt_events(self) -> None:
        assert self._stt is not None
        while not self._ended.is_set():
            try:
                event = await asyncio.wait_for(self._stt.events.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            if self._ended.is_set():
                # The call is over: anything STT reports now (e.g. an error
                # from flushing/closing its socket at hang-up) is not an
                # in-call failure and must not change the reported outcome.
                break

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
                self._agent_errors.add("stt")

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

        # Phase 3B: the new opening line is a natural qualification opener,
        # not a yes/no "can you hear me?" question, so every turn (including
        # the first) goes straight to the LLM — the old canned
        # affirmative-word special case was specific to the Phase 2B test
        # script's yes/no opener and no longer applies.
        reply_text, llm_ok = await generate_reply_with_status(self._settings, self._history)
        if not llm_ok:
            self._agent_errors.add("llm")

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
            if total_bytes == 0:
                # Sarvam answered with an error/empty stream (sarvam_tts.py
                # only logs ErrorResponse) — the customer heard nothing.
                self._agent_errors.add("tts")
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
            self._agent_errors.add("tts")
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

        try:
            await self._speak(CLOSING)
        except Exception:  # noqa: BLE001 — already recorded by _speak(); still hang up below
            logger.warning("Closing line could not be spoken — ending the call anyway")

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
        await self._submit_result()
        logger.info("Call session cleaned up")

    def _call_outcome(self) -> str:
        """What happened on the agent's side of this answered call. Kept
        separate from Meera's qualification of the lead:
          AGENT_ERROR            — STT/LLM/TTS or the agent itself failed
                                   during the call; never qualified.
          NO_CONVERSATION        — connected, but the customer said nothing
                                   the agent heard.
          CONVERSATION_COMPLETED — a conversation happened with no failures.
        """
        if self._agent_errors:
            return "AGENT_ERROR"
        if not any(turn.get("role") == "user" for turn in self._history):
            return "NO_CONVERSATION"
        return "CONVERSATION_COMPLETED"

    async def _build_result_payload(self) -> dict:
        ended_at = datetime.now(timezone.utc)
        outcome = self._call_outcome()
        payload: dict = {
            "callSid": self._call_sid,
            "accountSid": self._account_sid,
            "outcome": outcome,
            "startedAt": self._call_started_at.isoformat() if self._call_started_at else None,
            "endedAt": ended_at.isoformat(),
            "durationSeconds": (
                max(0, round((ended_at - self._call_started_at).total_seconds())) if self._call_started_at else None
            ),
        }
        agent_errors = set(self._agent_errors)
        if outcome == "CONVERSATION_COMPLETED":
            try:
                extracted = await asyncio.wait_for(
                    extract_qualification(self._settings, self._history), timeout=EXTRACTION_TIMEOUT_SECONDS
                )
            except asyncio.TimeoutError:
                logger.error(
                    "Qualification extraction timed out after %ss (call_sid=%s)", EXTRACTION_TIMEOUT_SECONDS, self._call_sid
                )
                extracted = None
            if extracted is None:
                # The conversation happened but the post-call extraction
                # failed: report it honestly — no qualification, no guessed
                # COLD — and note the LLM failure for troubleshooting.
                agent_errors.add("llm")
            else:
                payload.update(extracted)
        if agent_errors:
            payload["agentErrors"] = sorted(agent_errors)
        return {k: v for k, v in payload.items() if v is not None}

    async def _submit_result(self) -> None:
        """Best-effort, run-once, end-of-call report to DailyOps, identified
        by CallSid. Never raises — by this point the call is already over.
        DailyOps (not this agent) decides which lead, if any, the result
        belongs to, and never changes Lead.status/priority/assignment.
        """
        if self._result_submitted:
            return
        self._result_submitted = True

        if not self._settings.dailyops_configured:
            logger.info("DailyOps result submission not configured — skipping (call_sid=%s)", self._call_sid)
            return
        if not self._call_sid:
            # Without the CallSid the result can't be tied to a call, and
            # it is never guessed from a phone number.
            logger.warning("No CallSid captured for this call — result not submitted")
            return

        try:
            payload = await self._build_result_payload()
            await DailyOpsClient(self._settings).submit_call_result(payload)
        except Exception:  # noqa: BLE001 — end-of-call reporting must never raise out of _cleanup()
            logger.exception("Unhandled error while submitting the call result to DailyOps (call_sid=%s)", self._call_sid)
