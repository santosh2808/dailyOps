"""DailyOps result submission: service-key auth, 200/201 success, bounded
retries for transient failures only, and no secrets/phones in logs."""

from __future__ import annotations

import asyncio
import json
import logging

import httpx

from app.dailyops_client import BACKOFF_SECONDS, MAX_ATTEMPTS, RESULT_PATH, SERVICE_KEY_HEADER, DailyOpsClient

from conftest import TEST_SERVICE_KEY, make_settings

PAYLOAD = {"callSid": "SIMULATEDcall0001", "outcome": "CONVERSATION_COMPLETED", "qualification": "WARM"}


class Recorder:
    """httpx.MockTransport handler returning a scripted sequence of responses
    (an int status, or an exception instance to raise)."""

    def __init__(self, *script):
        self.script = list(script)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        step = self.script.pop(0) if self.script else 200
        if isinstance(step, Exception):
            raise step
        return httpx.Response(step, json={"ok": True})


def run(client: DailyOpsClient, payload=PAYLOAD):
    return asyncio.run(client.submit_call_result(dict(payload)))


def client_for(recorder: Recorder, sleeps: list | None = None, **settings_overrides) -> DailyOpsClient:
    async def fake_sleep(seconds: float) -> None:
        if sleeps is not None:
            sleeps.append(seconds)

    return DailyOpsClient(
        make_settings(**settings_overrides), transport=httpx.MockTransport(recorder), sleep=fake_sleep
    )


def test_http_200_is_success():
    rec = Recorder(200)
    result = run(client_for(rec))
    assert result.delivered and result.attempts == 1 and result.status_code == 200


def test_http_201_is_success_not_an_auth_failure():
    # The old client treated NestJS's 201 from POST /auth/login as a login
    # failure, so no result was ever saved.
    rec = Recorder(201)
    result = run(client_for(rec))
    assert result.delivered and result.status_code == 201
    assert len(rec.requests) == 1


def test_sends_service_key_header_to_the_result_endpoint_and_no_login():
    rec = Recorder(200)
    run(client_for(rec))
    (req,) = rec.requests
    assert req.method == "POST"
    assert req.url.path == RESULT_PATH
    assert req.headers[SERVICE_KEY_HEADER] == TEST_SERVICE_KEY
    assert "authorization" not in req.headers
    assert json.loads(req.content) == PAYLOAD


def test_invalid_credentials_401_is_not_retried():
    rec = Recorder(401, 200)
    result = run(client_for(rec))
    assert not result.delivered and result.status_code == 401 and result.attempts == 1
    assert len(rec.requests) == 1


def test_unknown_call_404_and_bad_request_400_are_not_retried():
    for status in (400, 403, 404, 409, 422):
        rec = Recorder(status, 200)
        result = run(client_for(rec))
        assert not result.delivered and len(rec.requests) == 1, status


def test_temporary_failure_is_retried_then_succeeds():
    sleeps: list[float] = []
    rec = Recorder(503, httpx.ConnectError("connection refused"), 200)
    result = run(client_for(rec, sleeps))
    assert result.delivered and result.attempts == 3
    assert sleeps == [BACKOFF_SECONDS[0], BACKOFF_SECONDS[1]]


def test_retries_are_bounded():
    sleeps: list[float] = []
    rec = Recorder(*([500] * 20))
    result = run(client_for(rec, sleeps))
    assert not result.delivered and result.gave_up_after_retries
    assert len(rec.requests) == MAX_ATTEMPTS
    assert len(sleeps) == MAX_ATTEMPTS - 1


def test_timeout_is_treated_as_temporary():
    rec = Recorder(httpx.ReadTimeout("timed out"), 200)
    assert run(client_for(rec)).delivered


def test_not_configured_makes_no_request():
    rec = Recorder(200)
    result = run(client_for(rec, dailyops_service_key=None))
    assert not result.delivered and result.attempts == 0
    assert rec.requests == []


def test_logs_never_contain_the_key_or_payload(caplog):
    caplog.set_level(logging.DEBUG)
    rec = Recorder(500, 401)
    run(client_for(rec), {**PAYLOAD, "summary": "Customer at 9000000999 wants fans"})
    text = caplog.text
    assert TEST_SERVICE_KEY not in text
    assert "9000000999" not in text
    assert "Customer at" not in text
    assert "SIMULATEDcall0001" in text  # the safe identifier is logged


def test_redirect_is_not_followed_and_not_retried(caplog):
    caplog.set_level(logging.DEBUG)
    rec = Recorder(301, 200)
    result = run(client_for(rec))
    assert not result.delivered and result.status_code == 301
    assert len(rec.requests) == 1  # the key was not re-sent anywhere
    assert "redirect" in caplog.text
