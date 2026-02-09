"""Contract tests for ICloudDailyStatusSource adapter."""

from __future__ import annotations

import datetime

from sync.adapters.json_daily_cache import JsonDailyScreenTimeCacheStore
from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.models.screen_time import DailyScreenTimeData, ScreenTimeEntry
from sync.models.status import CanonicalActivityPayload, CanonicalTrainingStatus


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
        "workout_status.json": (
            True,
            {"date": "2026-02-06", "start": "18:00"},
            "/tmp/w",
        ),
        "stretching_status.json": (False, None, None),
        "meditation_status.json": (
            True,
            {"date": "2026-02-06", "duration": 15},
            "/tmp/m",
        ),
    }

    def fake_read_status_file(name: str):
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
    bundle = adapter.load_training(day)

    assert isinstance(bundle, CanonicalTrainingStatus)
    assert bundle.workout_done is True
    assert bundle.stretch_done is False
    assert bundle.meditate_done is True
    assert len(bundle.workout_entries) == 1
    assert bundle.workout_entries[0].start == "18:00"
    assert len(bundle.meditation_entries) == 1
    assert finalized == [
        ("workout_status.json", "/tmp/w"),
        ("meditation_status.json", "/tmp/m"),
    ]


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
        "sync.adapters.icloud_status.read_status_file",
        lambda _name: (True, expected, "/tmp/s"),
    )
    finalized: list[tuple[str, str | None]] = []
    monkeypatch.setattr(
        "sync.adapters.icloud_status.finalize_status_file",
        lambda filename, path: finalized.append((filename, path)),
    )

    adapter = _build_adapter(tmp_path)
    payload = adapter.load_sleep(day)
    assert payload is not None
    assert payload.date == "2026-02-06"
    assert payload.sleep_min == 420
    assert finalized == [("sleep_status.json", "/tmp/s")]


def test_load_sleep_invalid_payload_is_quarantined(monkeypatch, tmp_path):
    day = datetime.date(2026, 2, 6)
    invalid_payload = {"date": "2026-02-06", "start": "x"}
    monkeypatch.setattr(
        "sync.adapters.icloud_status.read_status_file",
        lambda _name: (True, invalid_payload, "/tmp/sleep.json"),
    )
    quarantined: list[tuple[str, str | None]] = []
    monkeypatch.setattr(
        "sync.adapters.icloud_status.quarantine_status_file",
        lambda filename, path: quarantined.append((filename, path)),
    )

    adapter = _build_adapter(tmp_path)
    assert adapter.load_sleep(day) is None
    assert quarantined == [("sleep_status.json", "/tmp/sleep.json")]


def test_load_training_invalid_payload_is_quarantined(monkeypatch, tmp_path):
    day = datetime.date(2026, 2, 6)
    payloads = {
        "workout_status.json": (True, {"start": "18:00"}, "/tmp/w"),
        "stretching_status.json": (
            True,
            {"date": "2026-02-06", "duration": 20},
            "/tmp/s",
        ),
        "meditation_status.json": (False, None, None),
    }

    monkeypatch.setattr(
        "sync.adapters.icloud_status.read_status_file",
        lambda name: payloads[name],
    )
    quarantined: list[tuple[str, str | None]] = []
    monkeypatch.setattr(
        "sync.adapters.icloud_status.quarantine_status_file",
        lambda filename, path: quarantined.append((filename, path)),
    )

    adapter = _build_adapter(tmp_path)
    bundle = adapter.load_training(day)
    assert bundle.workout_done is False
    assert bundle.stretch_done is True
    assert quarantined == [("workout_status.json", "/tmp/w")]


def test_load_screen_time_uses_iso_day(monkeypatch, tmp_path):
    day = datetime.date(2026, 2, 6)
    expected = DailyScreenTimeData(entries=[ScreenTimeEntry(app="X", minutes=10)])

    def fake_load_screen_time_data(
        day_str: str,
        *,
        activity_payload,
        screen_time_cache_store,
    ):
        assert day_str == "2026-02-06"
        assert isinstance(activity_payload, CanonicalActivityPayload)
        assert screen_time_cache_store is not None
        return expected

    monkeypatch.setattr(
        "sync.adapters.icloud_status.load_screen_time_data",
        fake_load_screen_time_data,
    )
    monkeypatch.setattr(
        "sync.adapters.icloud_status.read_status_file",
        lambda _name: (
            True,
            {
                "date": "2026-02-06",
                "activity_ipad": "X (10m)",
                "activity_iphone": "",
            },
            "/tmp/activity.json",
        ),
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
