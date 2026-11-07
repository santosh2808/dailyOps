"""D.O.T. call-result write-back — the voice-agent's single call into
DailyOps: submit one finished call's result, identified by Exotel's
CallSid, to `POST /api/v1/telephony/voice-agent/call-results`.

Replaces the earlier Phase 3B client, which logged in as an ordinary
DailyOps employee (and treated the login's HTTP 201 as a failure, so no
result was ever saved) and then guessed the lead by searching phone
numbers. Now:

- Auth is a shared service key in the `X-Voice-Agent-Key` header
  (VOICE_AGENT_SERVICE_KEY, same value on both services). No login, no JWT,
  no user — the key only works on this one DailyOps route.
- The call is identified by CallSid only. DailyOps decides which lead (if
  any) the result belongs to; this client never sends a phone number.
- Any 2xx (200 or 201) is success.
- Transient failures (network error, timeout, 408/425/429, 5xx) are retried
  a bounded number of times with backoff. Permanent failures (400, 401,
  403, 404, 409, 413, 422) are not retried. DailyOps treats a repeated
  submission for the same CallSid as a no-op, so a retry after an
  ambiguous failure can never create a duplicate.
- Never raises to the caller (the call has already ended; a reporting
  failure must not crash anything), and never logs the key, the request
  body, or response bodies — only the CallSid, attempt number and status.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Awaitable, Callable

import httpx

from .config import Settings

logger = logging.getLogger("voice-agent.dailyops")

RESULT_PATH = "/api/v1/telephony/voice-agent/call-results"
SERVICE_KEY_HEADER = "X-Voice-Agent-Key"

_TIMEOUT_SECONDS = 10.0
MAX_ATTEMPTS = 4
# Delay before attempt 2, 3, 4. Total worst case ~14 s of waiting plus
# request timeouts — bounded, never indefinite.
BACKOFF_SECONDS = (1.0, 3.0, 10.0)
_RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}


@dataclass(frozen=True)
class SubmitResult:
    delivered: bool
    attempts: int
    status_code: int | None = None
    # True when the final failure was a transient one that ran out of
    # attempts (as opposed to a permanent rejection like 401/404).
    gave_up_after_retries: bool = False


class DailyOpsClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self._settings = settings
        # Injectable for tests (httpx.MockTransport) — production uses the
        # default network transport.
        self._transport = transport
        self._sleep = sleep

    async def submit_call_result(self, payload: dict) -> SubmitResult:
        call_sid = payload.get("callSid")
        if not self._settings.dailyops_configured:
            logger.info("DailyOps result submission not configured — skipping (call_sid=%s)", call_sid)
            return SubmitResult(delivered=False, attempts=0)

        url = f"{self._settings.dailyops_api_base_url}{RESULT_PATH}"
        headers = {SERVICE_KEY_HEADER: self._settings.dailyops_service_key or ""}

        last_status: int | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            retryable = False
            try:
                async with httpx.AsyncClient(
                    timeout=_TIMEOUT_SECONDS, transport=self._transport, follow_redirects=False
                ) as client:
                    resp = await client.post(url, json=payload, headers=headers)
                last_status = resp.status_code
                if 200 <= resp.status_code < 300:
                    logger.info(
                        "DailyOps call result delivered: call_sid=%s outcome=%s http_status=%d attempt=%d",
                        call_sid,
                        payload.get("outcome"),
                        resp.status_code,
                        attempt,
                    )
                    return SubmitResult(delivered=True, attempts=attempt, status_code=resp.status_code)
                retryable = resp.status_code in _RETRYABLE_STATUS
                if 300 <= resp.status_code < 400:
                    # Redirects are deliberately NOT followed: that would send
                    # the service key to wherever the redirect points.
                    logger.error(
                        "DailyOps call result got a redirect (http_status=%d, call_sid=%s) — set "
                        "DAILYOPS_API_BASE_URL to the final https:// URL; redirects are not followed",
                        resp.status_code,
                        call_sid,
                    )
                logger.warning(
                    "DailyOps call result rejected: call_sid=%s http_status=%d attempt=%d retryable=%s",
                    call_sid,
                    resp.status_code,
                    attempt,
                    retryable,
                )
            except httpx.TransportError as exc:  # connect error, timeout, DNS, reset...
                retryable = True
                logger.warning(
                    "DailyOps call result request failed: call_sid=%s attempt=%d error=%s",
                    call_sid,
                    attempt,
                    type(exc).__name__,
                )
            except Exception as exc:  # noqa: BLE001 — never raise out of end-of-call reporting
                logger.error(
                    "DailyOps call result request error: call_sid=%s attempt=%d error=%s",
                    call_sid,
                    attempt,
                    type(exc).__name__,
                )
                return SubmitResult(delivered=False, attempts=attempt, status_code=last_status)

            if not retryable:
                logger.error(
                    "DailyOps call result NOT delivered (permanent rejection): call_sid=%s http_status=%s",
                    call_sid,
                    last_status,
                )
                return SubmitResult(delivered=False, attempts=attempt, status_code=last_status)
            if attempt < MAX_ATTEMPTS:
                await self._sleep(BACKOFF_SECONDS[attempt - 1])

        logger.error(
            "DailyOps call result NOT delivered after %d attempts: call_sid=%s last_http_status=%s",
            MAX_ATTEMPTS,
            call_sid,
            last_status,
        )
        return SubmitResult(delivered=False, attempts=MAX_ATTEMPTS, status_code=last_status, gave_up_after_retries=True)
