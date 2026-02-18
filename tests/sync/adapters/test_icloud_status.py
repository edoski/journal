"""Contract tests for ICloudDailyStatusSource adapter."""

from __future__ import annotations

import datetime

from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.adapters.json_daily_cache import JsonDailyScreenTimeCacheStore
from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.screen_time import DailyScreenTimeData, ScreenTimeEntry
from sync.contracts.status import ActivityPayload, TrainingStatus


def _build_adapter(tmp_path):
    return ICloudDailyStatusSource(
        screen_time_cache_store=JsonDailyScreenTimeCacheStore(
            cache_dir=str(tmp_path / "cache" / "daily" / "screen_time"),
            lock_root=str(tmp_path / "cache" / "locks" / "state"),
        )
    )


def _default_schedule() -> DayScheduleProfile:
    return DayScheduleProfile(
        study_start=datetime.time(8, 0),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(18, 0),
    )


def test_target_days_stages_payload_dates_and_anchor(monkeypatch, tmp_path):
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
                "awake_count": 2,
            },
            "/tmp/s",
        ),
        "activity_status.json": (
            True,
            {
                "date": "2026-02-13",
                "activity_ipad": "X (10m)",
                "activity_iphone": "",
            },
            "/tmp/a",
        ),
    }
    read_calls: list[str] = []

    def fake_read_status_file(name: str):
        read_calls.append(name)
        return payloads[name]

    monkeypatch.setattr(
        "sync.adapters.icloud_status.read_status_file",
        fake_read_status_file,
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

    adapter = _build_adapter(tmp_path)
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
        "activity_status.json",
    ]
    assert finalized == [
        ("workout_status.json", "/tmp/w"),
        ("meditation_status.json", "/tmp/m"),
        ("sleep_status.json", "/tmp/s"),
        ("activity_status.json", "/tmp/a"),
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

    # Loading staged data must not re-read source files.
    assert len(read_calls) == 5


def test_load_screen_time_routes_only_matching_payload_day(monkeypatch, tmp_path):
    anchor_day = datetime.date(2026, 2, 13)
    payload_day = datetime.date(2026, 2, 12)
    payloads = {
        "workout_status.json": (False, None, None),
        "stretching_status.json": (False, None, None),
        "meditation_status.json": (False, None, None),
        "sleep_status.json": (False, None, None),
        "activity_status.json": (
            True,
            {
                "date": "2026-02-12",
                "activity_ipad": "X (10m)",
                "activity_iphone": "",
            },
            "/tmp/activity.json",
        ),
    }
    monkeypatch.setattr(
        "sync.adapters.icloud_status.read_status_file",
        lambda name: payloads[name],
    )
    finalized: list[tuple[str, str | None]] = []
    monkeypatch.setattr(
        "sync.adapters.icloud_status.finalize_status_file",
        lambda filename, path: finalized.append((filename, path)),
    )
    calls: list[tuple[str, ActivityPayload | None]] = []
    expected_payload_day = DailyScreenTimeData(
        entries=[ScreenTimeEntry(app="X", minutes=10)]
    )
    expected_anchor_day = DailyScreenTimeData(entries=[])

    def fake_load_screen_time_data(
        day_str: str,
        *,
        activity_payload,
        screen_time_cache_store,
    ):
        assert screen_time_cache_store is not None
        calls.append((day_str, activity_payload))
        if day_str == "2026-02-12":
            assert isinstance(activity_payload, ActivityPayload)
            assert activity_payload.date == "2026-02-12"
            return expected_payload_day
        assert day_str == "2026-02-13"
        assert activity_payload is None
        return expected_anchor_day

    monkeypatch.setattr(
        "sync.adapters.icloud_status.load_screen_time_data",
        fake_load_screen_time_data,
    )

    adapter = _build_adapter(tmp_path)
    assert adapter.target_days(anchor_day) == (payload_day, anchor_day)
    assert adapter.load_screen_time(payload_day) == expected_payload_day
    assert adapter.load_screen_time(anchor_day) == expected_anchor_day
    assert finalized == [("activity_status.json", "/tmp/activity.json")]
    assert calls == [
        ("2026-02-12", ActivityPayload("2026-02-12", "X (10m)", "")),
        ("2026-02-13", None),
    ]


def test_target_days_quarantines_future_dated_payload(monkeypatch, tmp_path):
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
        "activity_status.json": (False, None, None),
    }
    monkeypatch.setattr(
        "sync.adapters.icloud_status.read_status_file",
        lambda name: payloads[name],
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

    adapter = _build_adapter(tmp_path)
    assert adapter.target_days(anchor_day) == (anchor_day,)
    assert quarantined == [("workout_status.json", "/tmp/w")]
    assert finalized == []
    assert adapter.load_training(datetime.date(2026, 2, 14)).workout_done is False


def test_target_days_quarantines_activity_payload_missing_date(monkeypatch, tmp_path):
    anchor_day = datetime.date(2026, 2, 13)
    payloads = {
        "workout_status.json": (False, None, None),
        "stretching_status.json": (False, None, None),
        "meditation_status.json": (False, None, None),
        "sleep_status.json": (False, None, None),
        "activity_status.json": (
            True,
            {
                "activity_ipad": "X (10m)",
                "activity_iphone": "",
            },
            "/tmp/activity.json",
        ),
    }
    monkeypatch.setattr(
        "sync.adapters.icloud_status.read_status_file",
        lambda name: payloads[name],
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
    calls: list[ActivityPayload | None] = []

    def fake_load_screen_time_data(
        day_str: str,
        *,
        activity_payload,
        screen_time_cache_store,
    ):
        _ = day_str, screen_time_cache_store
        calls.append(activity_payload)
        return None

    monkeypatch.setattr(
        "sync.adapters.icloud_status.load_screen_time_data",
        fake_load_screen_time_data,
    )

    adapter = _build_adapter(tmp_path)
    assert adapter.target_days(anchor_day) == (anchor_day,)
    assert adapter.load_screen_time(anchor_day) is None
    assert quarantined == [("activity_status.json", "/tmp/activity.json")]
    assert finalized == []
    assert calls == [None]


def test_target_days_is_idempotent_per_anchor_day(monkeypatch, tmp_path):
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
        "activity_status.json": (False, None, None),
    }
    read_calls: list[str] = []

    def fake_read_status_file(name: str):
        read_calls.append(name)
        return payloads[name]

    monkeypatch.setattr(
        "sync.adapters.icloud_status.read_status_file",
        fake_read_status_file,
    )
    finalized: list[tuple[str, str | None]] = []
    monkeypatch.setattr(
        "sync.adapters.icloud_status.finalize_status_file",
        lambda filename, path: finalized.append((filename, path)),
    )

    adapter = _build_adapter(tmp_path)
    first = adapter.target_days(anchor_day)
    second = adapter.target_days(anchor_day)

    assert first == second == (datetime.date(2026, 2, 12), anchor_day)
    assert read_calls == [
        "workout_status.json",
        "stretching_status.json",
        "meditation_status.json",
        "sleep_status.json",
        "activity_status.json",
    ]
    assert finalized == [("workout_status.json", "/tmp/w")]


def test_write_study_times_uses_iso_day(monkeypatch, tmp_path):
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

    adapter = _build_adapter(tmp_path)
    adapter.write_study_times(day, sessions, _default_schedule())

    assert calls == [(sessions, "2026-02-06", _default_schedule())]
