"""Contract tests for ICloudDailyStatusSource adapter."""

from __future__ import annotations

import datetime

from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.contracts.status import TrainingStatus


def _payload_files(payloads):
    def fake_read_status_files(name: str):
        success, payload, path = payloads[name]
        if not success or payload is None or path is None:
            return []
        return [(payload, path)]

    return fake_read_status_files


def test_target_days_stages_payload_dates_and_anchor(monkeypatch):
    anchor_day = datetime.date(2026, 2, 13)
    payloads = {
        "workout_status.json": (
            True,
            {"date": "2026-02-12", "start": "18:00"},
            "/tmp/w",
        ),
        "stretching_status.json": (False, None, None),
        "sleep_status.json": (
            True,
            {
                "date": "2026-02-12",
                "start": "2026-02-11T23:30:00+0000",
                "end": "2026-02-12T06:30:00+0000",
                "sleep_min": 420,
                "awake_min": 15,
            },
            "/tmp/s",
        ),
    }
    read_calls: list[str] = []

    def fake_read_status_files(name: str):
        read_calls.append(name)
        success, payload, path = payloads[name]
        if not success or payload is None or path is None:
            return []
        return [(payload, path)]

    monkeypatch.setattr(
        "sync.adapters.icloud_status.read_status_files",
        fake_read_status_files,
    )
    finalized: list[tuple[str, str | None]] = []
    monkeypatch.setattr(
        "sync.adapters.icloud_status.finalize_status_file",
        lambda filename, path: finalized.append((filename, path)),
    )
    quarantined: list[tuple[str, str | None]] = []
    monkeypatch.setattr(
        "sync.adapters.icloud_status.quarantine_status_file",
        lambda filename, path: quarantined.append((filename, path)),
    )

    adapter = ICloudDailyStatusSource()
    days = adapter.target_days(anchor_day)

    assert days == (
        datetime.date(2026, 2, 12),
        datetime.date(2026, 2, 13),
    )
    assert read_calls == [
        "workout_status.json",
        "stretching_status.json",
        "sleep_status.json",
    ]
    assert finalized == [
        ("workout_status.json", "/tmp/w"),
        ("sleep_status.json", "/tmp/s"),
    ]
    assert quarantined == []

    backfill_training = adapter.load_training(datetime.date(2026, 2, 12))
    today_training = adapter.load_training(datetime.date(2026, 2, 13))
    assert isinstance(backfill_training, TrainingStatus)
    assert backfill_training.workout_done is True
    assert today_training.workout_done is False
    assert adapter.load_sleep(datetime.date(2026, 2, 12)) is not None
    assert adapter.load_sleep(datetime.date(2026, 2, 13)) is None
    assert len(read_calls) == 3


def test_target_days_quarantines_future_dated_payload(monkeypatch):
    anchor_day = datetime.date(2026, 2, 13)
    payloads = {
        "workout_status.json": (
            True,
            {"date": "2026-02-14", "start": "18:00"},
            "/tmp/w",
        ),
        "stretching_status.json": (False, None, None),
        "sleep_status.json": (False, None, None),
    }
    monkeypatch.setattr(
        "sync.adapters.icloud_status.read_status_files",
        _payload_files(payloads),
    )
    finalized: list[tuple[str, str | None]] = []
    monkeypatch.setattr(
        "sync.adapters.icloud_status.finalize_status_file",
        lambda filename, path: finalized.append((filename, path)),
    )
    quarantined: list[tuple[str, str | None]] = []
    monkeypatch.setattr(
        "sync.adapters.icloud_status.quarantine_status_file",
        lambda filename, path: quarantined.append((filename, path)),
    )

    adapter = ICloudDailyStatusSource()
    assert adapter.target_days(anchor_day) == (anchor_day,)
    assert quarantined == [("workout_status.json", "/tmp/w")]
    assert finalized == []
    assert adapter.load_training(datetime.date(2026, 2, 14)).workout_done is False


def test_target_days_is_idempotent_per_anchor_day(monkeypatch):
    anchor_day = datetime.date(2026, 2, 13)
    payloads = {
        "workout_status.json": (
            True,
            {"date": "2026-02-12", "start": "18:00"},
            "/tmp/w",
        ),
        "stretching_status.json": (False, None, None),
        "sleep_status.json": (False, None, None),
    }
    read_calls: list[str] = []

    def fake_read_status_files(name: str):
        read_calls.append(name)
        success, payload, path = payloads[name]
        if not success or payload is None or path is None:
            return []
        return [(payload, path)]

    monkeypatch.setattr(
        "sync.adapters.icloud_status.read_status_files",
        fake_read_status_files,
    )
    finalized: list[tuple[str, str | None]] = []
    monkeypatch.setattr(
        "sync.adapters.icloud_status.finalize_status_file",
        lambda filename, path: finalized.append((filename, path)),
    )

    adapter = ICloudDailyStatusSource()
    first = adapter.target_days(anchor_day)
    second = adapter.target_days(anchor_day)

    assert first == second == (datetime.date(2026, 2, 12), anchor_day)
    assert read_calls == [
        "workout_status.json",
        "stretching_status.json",
        "sleep_status.json",
    ]
    assert finalized == [("workout_status.json", "/tmp/w")]
