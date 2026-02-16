"""Tests for sync.daily composition-root run-day orchestration."""

from __future__ import annotations

import datetime

import sync.daily.__main__ as daily_main
from sync.contracts.schedule import DayScheduleProfile


def _default_schedule() -> DayScheduleProfile:
    return DayScheduleProfile(
        study_start=datetime.time(8, 0),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(18, 0),
    )


def _patch_common_runtime(monkeypatch) -> None:
    monkeypatch.setattr(daily_main, "add_logging_cli_args", lambda parser: None)
    monkeypatch.setattr(
        daily_main,
        "resolve_logging_settings",
        lambda _args: ("INFO", "text"),
    )
    monkeypatch.setattr(daily_main, "configure_logging", lambda **_kwargs: None)
    monkeypatch.setattr(daily_main, "bootstrap_cache_layout", lambda: None)
    monkeypatch.setattr(
        daily_main,
        "get_logger",
        lambda _name: type("_Logger", (), {"exception": lambda *_a, **_k: None})(),
    )
    monkeypatch.setattr(daily_main, "MarkdownNoteStore", lambda: object())
    monkeypatch.setattr(daily_main, "MarkdownGoalStore", lambda: object())
    monkeypatch.setattr(daily_main, "MarkdownReminderRuleStore", lambda: object())
    monkeypatch.setattr(daily_main, "VaultContextSource", lambda: object())
    monkeypatch.setattr(daily_main, "JsonGoalCarryForwardCacheStore", lambda: object())
    monkeypatch.setattr(daily_main, "JsonGoalReconcileCacheStore", lambda: object())
    monkeypatch.setattr(daily_main, "JsonDailyTrainingCacheStore", lambda: object())
    monkeypatch.setattr(daily_main, "JsonDailyScreenTimeCacheStore", lambda: object())
    monkeypatch.setattr(daily_main, "GoalSyncService", lambda **_kwargs: object())


def test_main_syncs_non_today_days_first_then_today(monkeypatch):
    anchor_day = datetime.date.today()
    loaded_session_days: list[datetime.date] = []
    resolved_schedule_days: list[datetime.date] = []
    synced_days: list[tuple[datetime.date, list[dict[str, str]]]] = []

    _patch_common_runtime(monkeypatch)

    class _FakeSessionSource:
        def load_sessions(
            self,
            day: datetime.date,
            day_schedule: DayScheduleProfile,
        ) -> list[dict[str, str]]:
            loaded_session_days.append(day)
            assert day_schedule == _default_schedule()
            return [{"source_day": day.isoformat()}]

    class _FakeStatusSource:
        def __init__(self, *, screen_time_cache_store) -> None:
            _ = screen_time_cache_store

        def target_days(self, run_anchor: datetime.date) -> tuple[datetime.date, ...]:
            assert run_anchor == anchor_day
            return (
                run_anchor,
                run_anchor - datetime.timedelta(days=1),
                run_anchor - datetime.timedelta(days=2),
            )

    class _FakeDailySyncService:
        def __init__(self, **kwargs) -> None:
            _ = kwargs

        def sync_day(
            self,
            day: datetime.date,
            sessions: list[dict[str, str]],
            day_schedule: DayScheduleProfile,
        ):
            assert day_schedule == _default_schedule()
            synced_days.append((day, sessions))
            return True

    class _FakeScheduleSource:
        def resolve_day(self, day: datetime.date) -> DayScheduleProfile:
            resolved_schedule_days.append(day)
            return _default_schedule()

    monkeypatch.setattr(
        daily_main, "FlowStudySessionSource", lambda: _FakeSessionSource()
    )
    monkeypatch.setattr(daily_main, "ICloudDailyStatusSource", _FakeStatusSource)
    monkeypatch.setattr(daily_main, "DailySyncService", _FakeDailySyncService)
    monkeypatch.setattr(daily_main, "MarkdownScheduleSource", _FakeScheduleSource)

    daily_main.main([])

    expected_days = [
        anchor_day - datetime.timedelta(days=2),
        anchor_day - datetime.timedelta(days=1),
        anchor_day,
    ]
    assert loaded_session_days == expected_days
    assert resolved_schedule_days == expected_days
    assert [day for day, _sessions in synced_days] == expected_days
    assert [sessions for _day, sessions in synced_days] == [
        [{"source_day": day.isoformat()}] for day in expected_days
    ]


def test_main_syncs_today_only_when_no_backfill_targets(monkeypatch):
    anchor_day = datetime.date.today()
    loaded_session_days: list[datetime.date] = []
    resolved_schedule_days: list[datetime.date] = []
    synced_days: list[datetime.date] = []

    _patch_common_runtime(monkeypatch)

    class _FakeSessionSource:
        def load_sessions(
            self,
            day: datetime.date,
            day_schedule: DayScheduleProfile,
        ) -> list[dict]:
            loaded_session_days.append(day)
            assert day_schedule == _default_schedule()
            return []

    class _FakeStatusSource:
        def __init__(self, *, screen_time_cache_store) -> None:
            _ = screen_time_cache_store

        def target_days(self, run_anchor: datetime.date) -> tuple[datetime.date, ...]:
            assert run_anchor == anchor_day
            return (run_anchor,)

    class _FakeDailySyncService:
        def __init__(self, **kwargs) -> None:
            _ = kwargs

        def sync_day(
            self,
            day: datetime.date,
            sessions: list[dict],
            day_schedule: DayScheduleProfile,
        ):
            _ = sessions
            assert day_schedule == _default_schedule()
            synced_days.append(day)
            return True

    class _FakeScheduleSource:
        def resolve_day(self, day: datetime.date) -> DayScheduleProfile:
            resolved_schedule_days.append(day)
            return _default_schedule()

    monkeypatch.setattr(
        daily_main, "FlowStudySessionSource", lambda: _FakeSessionSource()
    )
    monkeypatch.setattr(daily_main, "ICloudDailyStatusSource", _FakeStatusSource)
    monkeypatch.setattr(daily_main, "DailySyncService", _FakeDailySyncService)
    monkeypatch.setattr(daily_main, "MarkdownScheduleSource", _FakeScheduleSource)

    daily_main.main([])

    assert loaded_session_days == [anchor_day]
    assert resolved_schedule_days == [anchor_day]
    assert synced_days == [anchor_day]
