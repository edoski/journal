"""Contract tests for ICloudDailyStatusSource adapter."""

from __future__ import annotations

import datetime

import pytest

from sync.adapters.json_daily_cache import JsonDailyScreenTimeCacheStore
from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.models.screen_time import DailyScreenTimeData, ScreenTimeEntry


def _build_adapter(tmp_path):
    return ICloudDailyStatusSource(
        screen_time_cache_store=JsonDailyScreenTimeCacheStore(
            cache_dir=str(tmp_path / "cache" / "daily" / "screen_time"),
            lock_root=str(tmp_path / "cache" / "locks" / "state"),
        )
    )


def test_load_training_reads_three_shortcut_files(monkeypatch, tmp_path):
    day = datetime.date(2026, 2, 6)
    payloads = {
        "workout_status.json": (True, {"start": "18:00"}),
        "stretching_status.json": (False, None),
        "meditation_status.json": (True, {"duration": 15}),
    }

    def fake_load_status_file(name: str):
        return payloads[name]

    monkeypatch.setattr(
        "sync.adapters.icloud_status.load_status_file",
        fake_load_status_file,
    )

    adapter = _build_adapter(tmp_path)
    bundle = adapter.load_training(day)

    assert bundle.workout_done is True
    assert bundle.stretch_done is False
    assert bundle.meditate_done is True
    assert bundle.workout_payload == {"start": "18:00"}
    assert bundle.stretch_payload is None
    assert bundle.meditate_payload == {"duration": 15}


def test_load_sleep_returns_dict_payload(monkeypatch, tmp_path):
    day = datetime.date(2026, 2, 6)
    expected = {
        "date": "2026-02-06",
        "start": "2026-02-05T23:30:00+0000",
        "end": "2026-02-06T06:30:00+0000",
        "sleep_min": 420,
        "awake_min": 15,
        "awake_count": 2,
    }
    monkeypatch.setattr(
        "sync.adapters.icloud_status.load_status_file",
        lambda _name: (True, expected),
    )

    adapter = _build_adapter(tmp_path)
    assert adapter.load_sleep(day) == expected


def test_load_sleep_rejects_legacy_payload_keys(monkeypatch, tmp_path):
    day = datetime.date(2026, 2, 6)
    legacy_payload = {
        "SleepBegin": "05 Feb 2026 at 23:30",
        "SleepEnd": "06 Feb 2026 at 06:30",
        "SleepMinutes": 420,
        "AwakeMinutes": 15,
        "AwakeCount": 2,
    }
    monkeypatch.setattr(
        "sync.adapters.icloud_status.load_status_file",
        lambda _name: (True, legacy_payload),
    )

    adapter = _build_adapter(tmp_path)
    with pytest.raises(ValueError, match="Legacy sleep payload keys are not supported"):
        adapter.load_sleep(day)


def test_load_screen_time_uses_iso_day(monkeypatch, tmp_path):
    day = datetime.date(2026, 2, 6)
    expected = DailyScreenTimeData(entries=[ScreenTimeEntry(app="X", minutes=10)])

    def fake_load_screen_time_data(day_str: str, *, screen_time_cache_store):
        assert day_str == "2026-02-06"
        assert screen_time_cache_store is not None
        return expected

    monkeypatch.setattr(
        "sync.adapters.icloud_status.load_screen_time_data",
        fake_load_screen_time_data,
    )

    adapter = _build_adapter(tmp_path)
    assert adapter.load_screen_time(day) == expected


def test_write_study_times_uses_iso_day(monkeypatch, tmp_path):
    day = datetime.date(2026, 2, 6)
    sessions = [{"start": datetime.datetime(2026, 2, 6, 8, 0)}]
    calls: list[tuple[list[dict], str]] = []

    def fake_write_study_times(payload_sessions, today_str: str):
        calls.append((payload_sessions, today_str))

    monkeypatch.setattr(
        "sync.adapters.icloud_status.write_study_times_to_icloud",
        fake_write_study_times,
    )

    adapter = _build_adapter(tmp_path)
    adapter.write_study_times(day, sessions)

    assert calls == [(sessions, "2026-02-06")]
