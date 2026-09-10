"""Exotel Voicebot Applet WebSocket protocol — the wire-level layer only.

Message shapes and field names verified against Exotel's own docs
(https://docs.exotel.com/exotel-agentstream/voicebot-applet) and
cross-checked against pipecat-ai's open-source ExotelFrameSerializer
(https://reference-server.pipecat.ai/en/stable/_modules/pipecat/serializers/exotel.html),
which independently confirms the same snake_case field names
(`stream_sid`, not `streamSid`) and the `{"event": "media", "media":
{"payload": <base64>}}` / `{"event": "clear", "stream_sid": ...}` shapes.
Audio is raw/slin: 16-bit signed little-endian mono PCM, base64-encoded —
no container, no resampling needed as long as both sides agree on sample
rate (this service uses 8 kHz throughout to match Exotel's own default and
avoid a resampling dependency for this MVP).

This module knows nothing about STT/LLM/TTS — see agent.py for the
conversation logic that sits on top of it.
"""

from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass
from typing import AsyncIterator

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("voice-agent.session")


@dataclass
class StartInfo:
    stream_sid: str
    call_sid: str | None
    account_sid: str | None
    from_number: str | None
    to_number: str | None
    sample_rate: int
    custom_parameters: dict


@dataclass
class SessionEvent:
    # "connected" | "start" | "media" | "dtmf" | "stop" | "mark" | "closed"
    kind: str
    start: StartInfo | None = None
    audio: bytes | None = None
    digit: str | None = None
    reason: str | None = None
    mark_name: str | None = None


class ExotelSession:
    """One instance per Exotel WebSocket connection (= one phone call)."""

    def __init__(self, websocket: WebSocket):
        self._ws = websocket
        self.stream_sid: str | None = None
        self.call_sid: str | None = None

    async def accept(self) -> None:
        await self._ws.accept()

    async def events(self) -> AsyncIterator[SessionEvent]:
        """Yield high-level events parsed from Exotel's JSON WebSocket
        messages until the call ends or the connection drops."""
        try:
            while True:
                raw = await self._ws.receive_text()
                try:
                    message = json.loads(raw)
                except json.JSONDecodeError:
                    logger.warning("Ignoring non-JSON WebSocket frame from Exotel")
                    continue

                event = message.get("event")
                if event == "connected":
                    yield SessionEvent(kind="connected")
                elif event == "start":
                    start = message.get("start", {})
                    self.stream_sid = message.get("stream_sid") or start.get("stream_sid")
                    self.call_sid = start.get("call_sid")
                    media_format = start.get("media_format", {}) or {}
                    yield SessionEvent(
                        kind="start",
                        start=StartInfo(
                            stream_sid=self.stream_sid or "",
                            call_sid=self.call_sid,
                            account_sid=start.get("account_sid"),
                            from_number=start.get("from"),
                            to_number=start.get("to"),
                            sample_rate=int(media_format.get("sample_rate") or 8000),
                            custom_parameters=start.get("custom_parameters", {}) or {},
                        ),
                    )
                elif event == "media":
                    payload = (message.get("media") or {}).get("payload")
                    if payload:
                        yield SessionEvent(kind="media", audio=base64.b64decode(payload))
                elif event == "dtmf":
                    digit = (message.get("dtmf") or {}).get("digit")
                    yield SessionEvent(kind="dtmf", digit=digit)
                elif event == "mark":
                    name = (message.get("mark") or {}).get("name")
                    yield SessionEvent(kind="mark", mark_name=name)
                elif event == "stop":
                    reason = (message.get("stop") or {}).get("reason")
                    yield SessionEvent(kind="stop", reason=reason)
                    return
                else:
                    logger.debug("Unhandled Exotel event type: %s", event)
        except WebSocketDisconnect:
            yield SessionEvent(kind="closed", reason="websocket_disconnect")

    async def send_audio(self, pcm: bytes) -> None:
        """Send one chunk of raw 16-bit PCM audio to be played to the caller."""
        if not self.stream_sid:
            return
        payload = base64.b64encode(pcm).decode("ascii")
        await self._send({"event": "media", "stream_sid": self.stream_sid, "media": {"payload": payload}})

    async def send_clear(self) -> None:
        """Discard any audio already sent but not yet played — used on
        barge-in (customer starts speaking while Ananya is still talking)."""
        if not self.stream_sid:
            return
        await self._send({"event": "clear", "stream_sid": self.stream_sid})

    async def send_mark(self, name: str) -> None:
        """Ask Exotel to echo back a `mark` event once all audio sent so
        far has finished playing — used to know exactly when it's safe to
        close the socket after the goodbye line (Step 9's "terminate
        cleanly")."""
        if not self.stream_sid:
            return
        await self._send({"event": "mark", "stream_sid": self.stream_sid, "mark": {"name": name}})

    async def _send(self, message: dict) -> None:
        try:
            await self._ws.send_text(json.dumps(message))
        except Exception as exc:  # noqa: BLE001 — connection may have just dropped
            logger.warning("Failed to send WebSocket message to Exotel: %s", exc)

    async def close(self) -> None:
        try:
            await self._ws.close()
        except Exception:  # noqa: BLE001 — already closed / never opened
            pass
