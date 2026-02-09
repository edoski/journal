"""Unit tests for shortcut status parser helpers."""

from __future__ import annotations

import datetime

import pytest

from sync.adapters.status_parsers import (
    parse_activity_payload,
    parse_sleep_payload,
    parse_training_payload,
)


def test_parse_sleep_payload_accepts_canonical_payload() -> None:
    day = datetime.date(2026, 2, 7)
    payload = {
        "date": "2026-02-07",
        "start": "2026-02-06T23:30:00+0000",
        "end": "2026-02-07T06:30:00+0000",
        "sleep_min": 420,
        "awake_min": 15,
        "awake_count": 2,
    }
    parsed = parse_sleep_payload(payload, day)
    assert parsed is not None
    assert parsed.sleep_min == 420
    assert parsed.awake_count == 2


def test_parse_sleep_payload_rejects_missing_keys() -> None:
    day = datetime.date(2026, 2, 7)
    payload = {"date": "2026-02-07", "start": "x", "end": "y"}
    with pytest.raises(ValueError, match="missing keys"):
        parse_sleep_payload(payload, day)


def test_parse_sleep_payload_date_mismatch_returns_none() -> None:
    day = datetime.date(2026, 2, 7)
    payload = {
        "date": "2026-02-06",
        "start": "x",
        "end": "y",
        "sleep_min": 420,
        "awake_min": 15,
        "awake_count": 2,
    }
    assert parse_sleep_payload(payload, day) is None


def test_parse_training_payload_accepts_object_or_list() -> None:
    day = datetime.date(2026, 2, 7)
    single = {
        "date": "2026-02-07",
        "start": "18:00",
        "end": "19:00",
        "duration": 52,
    }
    parsed_single = parse_training_payload(single, "workout", day)
    assert len(parsed_single) == 1
    assert parsed_single[0].type == "Workout"

    multi = [
        {
            "date": "2026-02-07",
            "start": "07:00",
            "end": "07:30",
            "duration": 20,
            "type": "Stretching",
        },
        {"date": "2026-02-06", "duration": 10},
    ]
    parsed_multi = parse_training_payload(multi, "stretching", day)
    assert len(parsed_multi) == 1
    assert parsed_multi[0].type == "Stretching"


def test_parse_training_payload_rejects_non_object_entries() -> None:
    day = datetime.date(2026, 2, 7)
    with pytest.raises(ValueError, match="array entries must be objects"):
        parse_training_payload(["bad"], "workout", day)


def test_parse_activity_payload_validates_date_and_shape() -> None:
    day = datetime.date(2026, 2, 7)
    payload = {
        "date": "2026-02-07",
        "activity_ipad": "YouTube (30m)",
        "activity_iphone": "Instagram (12m)",
    }
    parsed = parse_activity_payload(payload, day)
    assert parsed is not None
    assert parsed.activity_ipad.startswith("YouTube")

    mismatch = {
        "date": "2026-02-06",
        "activity_ipad": "YouTube (30m)",
        "activity_iphone": "",
    }
    assert parse_activity_payload(mismatch, day) is None

    with pytest.raises(ValueError, match="expected JSON object"):
        parse_activity_payload([], day)
