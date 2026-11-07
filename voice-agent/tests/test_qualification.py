"""Post-call extraction parsing: honest failure (None), no silent coercion."""

from __future__ import annotations

import asyncio

from datetime import datetime, timezone

from app.qualification import _date_context, extract_qualification, parse_extraction

from conftest import make_settings


def test_valid_json_is_passed_through_with_only_known_keys():
    out = parse_extraction(
        '{"qualification": "WARM", "summary": " Needs fans. ", "quantity": 8, "city": "Pune", '
        '"state": null, "siteVisitRequested": false, "unexpected": "dropped"}'
    )
    assert out == {"qualification": "WARM", "summary": "Needs fans.", "quantity": 8, "city": "Pune", "siteVisitRequested": False}


def test_invalid_qualification_is_not_turned_into_cold():
    # DailyOps validates it and records it as rejected; the agent must not
    # invent a COLD the LLM never said.
    assert parse_extraction('{"qualification": "SUPER_HOT"}') == {"qualification": "SUPER_HOT"}


def test_code_fence_is_stripped():
    assert parse_extraction('```json\n{"qualification": "COLD"}\n```') == {"qualification": "COLD"}


def test_non_json_or_non_object_returns_none_instead_of_a_fake_result():
    assert parse_extraction("The customer seemed interested.") is None
    assert parse_extraction('["HOT"]') is None


def test_no_history_returns_none_without_calling_sarvam():
    assert asyncio.run(extract_qualification(make_settings(), [])) is None


def test_date_context_gives_today_in_ist_and_requires_the_offset():
    # 20:00 UTC on 7 Nov is already 8 Nov in India.
    text = _date_context(datetime(2026, 11, 7, 20, 0, tzinfo=timezone.utc))
    assert "2026-11-08" in text
    assert "+05:30" in text
