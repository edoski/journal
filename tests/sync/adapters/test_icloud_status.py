"""Contract tests for ICloudDailyStatusSource adapter."""

from __future__ import annotations

import datetime

from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.status import TrainingStatus


def _default_schedule() -> DayScheduleProfile:
    return DayScheduleProfile(
        study_start=datetime.time(8, 0),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(18, 0),
        is_off_day=False,
    )


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
        "meditation_status.json": (
            True,
            {"date": "2026-02-13", "duration": 15},
            "/tmp/m",
        ),
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
        "meditation_status.json",
        "sleep_status.json",
    ]
    assert finalized == [
        ("workout_status.json", "/tmp/w"),
        ("meditation_status.json", "/tmp/m"),
        ("sleep_status.json", "/tmp/s"),
    ]
    assert quarantined == []

    backfill_training = adapter.load_training(datetime.date(2026, 2, 12))
    today_training = adapter.load_training(datetime.date(2026, 2, 13))
    assert isinstance(backfill_training, TrainingStatus)
    assert backfill_training.workout_done is True
    assert backfill_training.meditate_done is False
    assert today_training.workout_done is False
    assert today_training.meditate_done is True
    assert adapter.load_sleep(datetime.date(2026, 2, 12)) is not None
    assert adapter.load_sleep(datetime.date(2026, 2, 13)) is None
    assert len(read_calls) == 4


def test_target_days_quarantines_future_dated_payload(monkeypatch):
    anchor_day = datetime.date(2026, 2, 13)
    payloads = {
        "workout_status.json": (
            True,
            {"date": "2026-02-14", "start": "18:00"},
            "/tmp/w",
        ),
        "stretching_status.json": (False, None, None),
        "meditation_status.json": (False, None, None),
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
        "meditation_status.json": (False, None, None),
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
        "meditation_status.json",
        "sleep_status.json",
    ]
    assert finalized == [("workout_status.json", "/tmp/w")]


def test_write_study_times_uses_iso_day(monkeypatch):
    day = datetime.date(2026, 2, 6)
    sessions = [{"start": datetime.datetime(2026, 2, 6, 8, 0)}]
    calls: list[tuple[list[dict], str, DayScheduleProfile]] = []

    def fake_write_study_times(
        payload_sessions, today_str: str, day_schedule: DayScheduleProfile
    ):
        calls.append((payload_sessions, today_str, day_schedule))

    monkeypatch.setattr(
        "sync.adapters.icloud_status.write_study_times_to_icloud",
        fake_write_study_times,
    )

    adapter = ICloudDailyStatusSource()
    adapter.write_study_times(day, sessions, _default_schedule())

    assert calls == [(sessions, "2026-02-06", _default_schedule())]
