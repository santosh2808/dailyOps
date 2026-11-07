"""End-to-end (simulated) calls through the real ExotelSession + CallAgent:
what gets reported to DailyOps for successful calls, silent calls and every
kind of Sarvam/agent failure. Exotel is a fake WebSocket; Sarvam STT/LLM/TTS
and the DailyOps client are fakes. Nothing leaves the process."""

from __future__ import annotations

import asyncio
import base64
import json
import logging

import pytest
from fastapi import WebSocketDisconnect

import app.agent as agent_module
from app.agent import CallAgent
from app.prompts import CLOSING
from app.sarvam_llm import FALLBACK_REPLY
from app.sarvam_stt import SttEvent
from app.session import ExotelSession

from conftest import make_settings

CALL_SID = "SIMULATEDcall0042"
CUSTOMER = "+919000000999"
EXOPHONE = "+918000000888"


class FakeExotelWebSocket:
    """Plays a scripted list of (delay_seconds, frame_dict) like Exotel.
    Like a real socket, once the agent closes it, a pending receive ends
    with a disconnect instead of waiting for the next scripted frame."""

    def __init__(self, frames):
        self._frames = list(frames)
        self.sent: list[dict] = []
        self.closed = False
        self._closed_event = asyncio.Event()

    async def accept(self):
        return None

    async def receive_text(self) -> str:
        if self.closed or not self._frames:
            raise WebSocketDisconnect()
        delay, frame = self._frames.pop(0)
        try:
            await asyncio.wait_for(self._closed_event.wait(), timeout=delay)
        except asyncio.TimeoutError:
            return json.dumps(frame)
        raise WebSocketDisconnect()

    async def send_text(self, text: str):
        self.sent.append(json.loads(text))

    async def close(self):
        self.closed = True
        self._closed_event.set()


def exotel_frames(call_sid: str | None, stop_after: float):
    start = {
        "account_sid": "SIMULATEDaccount",
        "from": CUSTOMER,
        "to": EXOPHONE,
        "media_format": {"sample_rate": 8000},
        "custom_parameters": {},
    }
    if call_sid:
        start["call_sid"] = call_sid
    audio = base64.b64encode(b"\x00\x00" * 160).decode()
    return [
        (0, {"event": "connected"}),
        (0, {"event": "start", "stream_sid": "STREAM1", "start": start}),
        (0.01, {"event": "media", "media": {"payload": audio}}),
        (stop_after, {"event": "stop", "stop": {"reason": "callended"}}),
    ]


def run_call(
    monkeypatch,
    *,
    transcripts=("We need eight fans for our warehouse in Pune",),
    stt_start_fails=False,
    stt_error_midcall=False,
    stt_error_on_close=False,
    llm_ok=True,
    tts_empty=False,
    extraction=None,
    extraction_fails=False,
    extraction_delay=0.0,
    closing_tts_fails=False,
    call_sid=CALL_SID,
    stop_after=0.4,
    settings=None,
    observe=None,
):
    submitted: list[dict] = []
    extraction_calls: list[int] = []
    default_extraction = {"qualification": "WARM", "summary": "Needs 8 fans.", "quantity": 8, "city": "Pune"}

    class FakeStt:
        def __init__(self, settings, sample_rate=8000):
            self.events: asyncio.Queue = asyncio.Queue()

        async def start(self):
            if stt_start_fails:
                raise RuntimeError("simulated Sarvam STT auth failure")

            async def feed():
                await asyncio.sleep(0.1)
                if stt_error_midcall:
                    await self.events.put(SttEvent(kind="error", text="simulated STT socket drop"))
                for text in transcripts:
                    await self.events.put(SttEvent(kind="transcript", text=text))
                    await asyncio.sleep(0.1)

            asyncio.get_running_loop().create_task(feed())

        async def send_pcm(self, pcm: bytes):
            return None

        async def close(self):
            if stt_error_on_close:
                # Like a flush failing on an already-dropped socket at hang-up.
                await self.events.put(SttEvent(kind="error", text="simulated socket closed"))
                await asyncio.sleep(0.05)

    spoken: list[str] = []

    async def fake_tts(settings, text, sample_rate=8000):
        spoken.append(text)
        if closing_tts_fails and text == CLOSING:
            raise RuntimeError("simulated Sarvam TTS failure on the closing line")
        if not tts_empty:
            yield b"\x01\x00" * 40

    async def fake_llm(settings, history):
        return ("How many fans do you need?", True) if llm_ok else (FALLBACK_REPLY, False)

    async def fake_extract(settings, history):
        extraction_calls.append(len(history))
        if extraction_delay:
            await asyncio.sleep(extraction_delay)
        if extraction_fails:
            return None
        return default_extraction if extraction is None else extraction

    class FakeDailyOpsClient:
        def __init__(self, settings):
            pass

        async def submit_call_result(self, payload):
            submitted.append(payload)

    monkeypatch.setattr(agent_module, "SarvamSttSession", FakeStt)
    monkeypatch.setattr(agent_module, "synthesize_speech", fake_tts)
    monkeypatch.setattr(agent_module, "generate_reply_with_status", fake_llm)
    monkeypatch.setattr(agent_module, "extract_qualification", fake_extract)
    monkeypatch.setattr(agent_module, "DailyOpsClient", FakeDailyOpsClient)

    ws = FakeExotelWebSocket(exotel_frames(call_sid, stop_after))
    agent = CallAgent(ExotelSession(ws), settings or make_settings())
    asyncio.run(agent.run())
    if observe is not None:
        observe.update(spoken=spoken, ws=ws)
    return submitted, extraction_calls


def test_successful_conversation_reports_completed_with_extracted_fields(monkeypatch):
    submitted, extraction_calls = run_call(monkeypatch)
    assert len(submitted) == 1
    payload = submitted[0]
    assert payload["callSid"] == CALL_SID
    assert payload["accountSid"] == "SIMULATEDaccount"
    assert payload["outcome"] == "CONVERSATION_COMPLETED"
    assert payload["qualification"] == "WARM"
    assert payload["quantity"] == 8
    assert "agentErrors" not in payload
    assert isinstance(payload["durationSeconds"], int)
    assert extraction_calls == [2]  # one user turn + one Meera reply


def test_result_never_carries_a_phone_number(monkeypatch):
    submitted, _ = run_call(monkeypatch)
    text = json.dumps(submitted)
    assert CUSTOMER not in text and CUSTOMER[3:] not in text
    assert EXOPHONE not in text
    for key in ("from", "to", "phone", "fromNumber"):
        assert key not in submitted[0]


def test_sarvam_stt_start_failure_is_agent_error_not_answered_or_qualified(monkeypatch):
    submitted, extraction_calls = run_call(monkeypatch, stt_start_fails=True)
    payload = submitted[0]
    assert payload["outcome"] == "AGENT_ERROR"
    assert "stt" in payload["agentErrors"]
    assert "qualification" not in payload and "summary" not in payload
    assert extraction_calls == []  # no LLM extraction after a failure


def test_stt_error_mid_call_is_agent_error(monkeypatch):
    submitted, _ = run_call(monkeypatch, stt_error_midcall=True)
    assert submitted[0]["outcome"] == "AGENT_ERROR"
    assert submitted[0]["agentErrors"] == ["stt"]
    assert "qualification" not in submitted[0]


def test_stt_error_while_closing_after_hang_up_does_not_mark_a_good_call_failed(monkeypatch):
    submitted, _ = run_call(monkeypatch, stt_error_on_close=True)
    assert submitted[0]["outcome"] == "CONVERSATION_COMPLETED"
    assert "agentErrors" not in submitted[0]


def test_llm_failure_during_the_call_is_agent_error(monkeypatch):
    submitted, _ = run_call(monkeypatch, llm_ok=False)
    assert submitted[0]["outcome"] == "AGENT_ERROR"
    assert submitted[0]["agentErrors"] == ["llm"]
    assert "qualification" not in submitted[0]


def test_tts_producing_no_audio_is_agent_error(monkeypatch):
    submitted, _ = run_call(monkeypatch, tts_empty=True)
    assert submitted[0]["outcome"] == "AGENT_ERROR"
    assert "tts" in submitted[0]["agentErrors"]


def test_silent_customer_is_no_conversation_without_qualification(monkeypatch):
    submitted, extraction_calls = run_call(monkeypatch, transcripts=())
    assert submitted[0]["outcome"] == "NO_CONVERSATION"
    assert "qualification" not in submitted[0]
    assert extraction_calls == []


def test_failed_extraction_reports_no_qualification_instead_of_a_guessed_cold(monkeypatch):
    submitted, extraction_calls = run_call(monkeypatch, extraction_fails=True)
    payload = submitted[0]
    assert extraction_calls == [2]
    assert payload["outcome"] == "CONVERSATION_COMPLETED"
    assert payload["agentErrors"] == ["llm"]
    assert "qualification" not in payload
    assert "summary" not in payload


def test_missing_call_sid_means_no_submission(monkeypatch):
    submitted, _ = run_call(monkeypatch, call_sid=None)
    assert submitted == []


def test_not_configured_means_no_submission(monkeypatch):
    submitted, _ = run_call(monkeypatch, settings=make_settings(dailyops_service_key=None))
    assert submitted == []


@pytest.mark.parametrize("scenario", ["success", "stt_failure"])
def test_logs_never_contain_phone_numbers(monkeypatch, caplog, scenario):
    caplog.set_level(logging.DEBUG)
    run_call(monkeypatch, stt_start_fails=(scenario == "stt_failure"))
    text = caplog.text
    assert "Call started" in text  # logging was captured
    for number in (CUSTOMER, CUSTOMER[3:], EXOPHONE, EXOPHONE[3:]):
        assert number not in text


def test_extraction_timeout_still_submits_without_a_qualification(monkeypatch):
    monkeypatch.setattr(agent_module, "EXTRACTION_TIMEOUT_SECONDS", 0.05)
    submitted, extraction_calls = run_call(monkeypatch, extraction_delay=5)
    assert extraction_calls == [2]
    assert len(submitted) == 1
    payload = submitted[0]
    assert payload["outcome"] == "CONVERSATION_COMPLETED"
    assert payload["agentErrors"] == ["llm"]
    assert "qualification" not in payload


def test_time_budget_speaks_the_closing_line_hangs_up_and_submits(monkeypatch):
    monkeypatch.setattr(agent_module, "_MARK_WAIT_TIMEOUT_SECONDS", 0.05)
    seen: dict = {}
    submitted, _ = run_call(monkeypatch, settings=make_settings(max_call_seconds=1), stop_after=30, observe=seen)
    assert seen["spoken"][-1] == CLOSING
    assert seen["ws"].closed  # the agent hung up; Exotel never had to send "stop"
    assert any(m.get("event") == "mark" for m in seen["ws"].sent)
    assert len(submitted) == 1
    assert submitted[0]["outcome"] == "CONVERSATION_COMPLETED"


def test_closing_line_failure_still_hangs_up_and_reports_agent_error(monkeypatch):
    monkeypatch.setattr(agent_module, "_MARK_WAIT_TIMEOUT_SECONDS", 0.05)
    seen: dict = {}
    submitted, _ = run_call(
        monkeypatch,
        settings=make_settings(max_call_seconds=1),
        stop_after=30,
        closing_tts_fails=True,
        observe=seen,
    )
    assert seen["spoken"][-1] == CLOSING
    assert seen["ws"].closed  # previously the call was left open here
    assert len(submitted) == 1
    assert submitted[0]["outcome"] == "AGENT_ERROR"
    assert "tts" in submitted[0]["agentErrors"]
