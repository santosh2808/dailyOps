"""D.O.T. AI Lead Assistant — Phase 3B. A small, best-effort HTTP client the
voice-agent uses at the end of a call to report Meera's qualification result
back to the EXISTING DailyOps Phase 3A backend endpoint
(`POST /api/v1/leads/:id/ai-call-history`).

Deliberately minimal and self-contained:
- No new backend code, no new DailyOps auth mechanism — logs in as an
  ordinary DailyOps user (a dedicated service account, created manually via
  Admin > Users) through the existing, unmodified `POST /auth/login`.
- No retry engine, no queue, no persistence. If a call to DailyOps fails
  (network error, 401, 404, 400, ...), it is logged and swallowed — this
  module NEVER raises out to agent.py, since a DailyOps reporting failure
  must never affect (or crash) the live voice call it happened during, and
  by the time this runs the call has already ended anyway.
- Never logs API keys, passwords, bearer tokens, phone numbers, or full
  response bodies — only status codes, lead ids, and enum values, matching
  this codebase's existing diagnostic-logging convention (see sarvam_stt.py
  / session.py's "log length/counts, never payload content" pattern).
"""

from __future__ import annotations

import logging

import httpx

from .config import Settings

logger = logging.getLogger("voice-agent.dailyops")

_TIMEOUT_SECONDS = 10.0


class DailyOpsClient:
    """One instance per voice-agent process (created lazily, reused across
    calls). Holds a cached JWT in memory only — never persisted to disk."""

    def __init__(self, settings: Settings):
        self._settings = settings
        self._token: str | None = None

    async def _login(self) -> str | None:
        assert self._settings.dailyops_configured
        url = f"{self._settings.dailyops_api_base_url}/auth/login"
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
                resp = await client.post(
                    url,
                    json={
                        "identifier": self._settings.dailyops_api_username,
                        "password": self._settings.dailyops_api_password,
                    },
                )
            if resp.status_code != 200:
                logger.error("DailyOps login failed: status=%d", resp.status_code)
                return None
            token = (resp.json() or {}).get("accessToken")
            if not token:
                logger.error("DailyOps login response had no accessToken")
                return None
            self._token = token
            logger.info("DailyOps login succeeded")
            return token
        except Exception as exc:  # noqa: BLE001 — never crash the caller over a login failure
            logger.error("DailyOps login request failed: %s", exc)
            return None

    async def _ensure_token(self) -> str | None:
        if self._token:
            return self._token
        return await self._login()

    async def _authed_request(self, method: str, path: str, **kwargs) -> httpx.Response | None:
        """One request, with exactly one relogin-and-retry if the cached
        token has expired (401) — no further retries beyond that."""
        token = await self._ensure_token()
        if not token:
            return None

        url = f"{self._settings.dailyops_api_base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
                resp = await client.request(method, url, headers={"Authorization": f"Bearer {token}"}, **kwargs)
        except Exception as exc:  # noqa: BLE001 — network error, DNS, timeout, etc.
            logger.error("DailyOps request failed: method=%s path=%s error=%s", method, path, exc)
            return None

        if resp.status_code == 401:
            logger.info("DailyOps token expired/invalid — re-logging in once")
            self._token = None
            token = await self._ensure_token()
            if not token:
                return None
            try:
                async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
                    resp = await client.request(method, url, headers={"Authorization": f"Bearer {token}"}, **kwargs)
            except Exception as exc:  # noqa: BLE001
                logger.error("DailyOps retry request failed: method=%s path=%s error=%s", method, path, exc)
                return None

        return resp

    async def find_lead_by_phone(self, phone: str) -> str | None:
        """Looks up a Lead via the existing, unmodified
        `GET /api/v1/leads?search=<phone>` endpoint. Returns the most
        recently created matching Lead's id, or None if there is no match
        (or the lookup itself failed) — logged either way, never raised."""
        resp = await self._authed_request(
            "GET",
            "/api/v1/leads",
            params={"search": phone, "page": 1, "limit": 5, "sortBy": "createdAt", "sortOrder": "desc"},
        )
        if resp is None:
            return None
        if resp.status_code != 200:
            logger.error("DailyOps lead lookup failed: status=%d", resp.status_code)
            return None

        body = resp.json() or {}
        rows = body.get("data") if isinstance(body, dict) else None
        if rows is None and isinstance(body, list):
            rows = body
        if not rows:
            logger.info("DailyOps lead lookup: no matching Lead found for caller phone number")
            return None

        # Most recent match — see the sortBy/sortOrder above, but sort
        # defensively again client-side in case the endpoint ignores those
        # params (its documented default order is unspecified).
        def _created_at(row: dict) -> str:
            return row.get("createdAt") or ""

        rows_sorted = sorted(rows, key=_created_at, reverse=True)
        lead_id = rows_sorted[0].get("id")
        logger.info("DailyOps lead lookup: matched a Lead (count=%d)", len(rows))
        return lead_id

    async def submit_ai_qualification(self, lead_id: str, payload: dict) -> bool:
        """POSTs to the existing, unmodified
        `POST /api/v1/leads/:id/ai-call-history` endpoint using the Phase
        3A DTO's own field names (status/qualification/summary/quantity/
        application/city/state/timeline/siteVisitRequested/
        callbackRequested/callbackAt/...). Returns True on a 2xx response,
        False otherwise — never raises."""
        resp = await self._authed_request("POST", f"/api/v1/leads/{lead_id}/ai-call-history", json=payload)
        if resp is None:
            return False
        if 200 <= resp.status_code < 300:
            logger.info(
                "DailyOps qualification submitted: lead_id=%s status=%s qualification=%s",
                lead_id,
                payload.get("status"),
                payload.get("qualification"),
            )
            return True

        logger.error(
            "DailyOps qualification submission rejected: lead_id=%s http_status=%d",
            lead_id,
            resp.status_code,
        )
        return False
