"""Unit tests for shortcut status parser helpers."""

from __future__ import annotations

import pytest

from sync.adapters.status_parsers import (
    parse_activity_payload,
    parse_sleep_payload,
    parse_training_payload,
)


def test_parse_sleep_payload_accepts_canonical_payload() -> None:
    payload = {
        "date": "2026-02-07",
        "start": "2026-02-06T23:30:00+0000",
        "end": "2026-02-07T06:30:00+0000",
        "sleep_min": 420,
        "awake_min": 15,
        "awake_count": 2,
    }
    parsed = parse_sleep_payload(payload)
    assert parsed.sleep_min == 420
    assert parsed.awake_count == 2


def test_parse_sleep_payload_rejects_missing_keys() -> None:
    payload = {"date": "2026-02-07", "start": "x", "end": "y"}
    with pytest.raises(ValueError, match="missing keys"):
        parse_sleep_payload(payload)


def test_parse_sleep_payload_rejects_invalid_date() -> None:
    payload = {
        "date": "2026-99-99",
        "start": "x",
        "end": "y",
        "sleep_min": 420,
        "awake_min": 15,
        "awake_count": 2,
    }
    with pytest.raises(ValueError, match="date must be YYYY-MM-DD"):
        parse_sleep_payload(payload)


def test_parse_training_payload_accepts_object_or_list() -> None:
    single = {
        "date": "2026-02-07",
        "start": "18:00",
        "end": "19:00",
        "duration": 52,
    }
    parsed_single = parse_training_payload(single, "workout")
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
    parsed_multi = parse_training_payload(multi, "stretching")
    assert len(parsed_multi) == 2
    assert parsed_multi[0].type == "Stretching"


def test_parse_training_payload_rejects_non_object_entries() -> None:
    with pytest.raises(ValueError, match="array entries must be objects"):
        parse_training_payload(["bad"], "workout")


def test_parse_training_payload_rejects_missing_or_invalid_date() -> None:
    with pytest.raises(ValueError, match="date must be a non-empty YYYY-MM-DD string"):
        parse_training_payload({"duration": 20}, "workout")
    with pytest.raises(ValueError, match="date must be YYYY-MM-DD"):
        parse_training_payload({"date": "2026-02-99", "duration": 20}, "workout")


def test_parse_activity_payload_validates_date_and_shape() -> None:
    payload = {
        "date": "2026-02-07",
        "activity_ipad": "YouTube (30m)",
        "activity_iphone": "Instagram (12m)",
    }
    parsed = parse_activity_payload(payload)
    assert parsed.activity_ipad.startswith("YouTube")

    with pytest.raises(ValueError, match="expected JSON object"):
        parse_activity_payload([])

    with pytest.raises(ValueError, match="date must be a non-empty YYYY-MM-DD string"):
        parse_activity_payload(
            {"activity_ipad": "YouTube (30m)", "activity_iphone": ""}
        )

    with pytest.raises(ValueError, match="date must be YYYY-MM-DD"):
        parse_activity_payload(
            {
                "date": "2026-14-02",
                "activity_ipad": "YouTube (30m)",
                "activity_iphone": "",
            }
        )
