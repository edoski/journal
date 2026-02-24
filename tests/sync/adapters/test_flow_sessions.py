"""Contract tests for FlowStudySessionSource adapter."""

from __future__ import annotations

import datetime

from sync.adapters.flow_sessions import FlowStudySessionSource
from sync.contracts.schedule import DayScheduleProfile


def test_load_sessions_delegates_to_flow_db(monkeypatch):
    day = datetime.date(2026, 2, 6)
    day_schedule = DayScheduleProfile(
        study_start=datetime.time(8, 0),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(18, 0),
        is_off_day=False,
    )
    expected = [
        {
            "pk": 1,
            "phase": "flow",
            "title": "Study",
        }
    ]

    def fake_get_sessions_for_day(
        target_day: datetime.date, target_schedule: DayScheduleProfile
    ):
        assert target_day == day
        assert target_schedule == day_schedule
        return expected

    monkeypatch.setattr(
        "sync.adapters.flow_sessions.get_sessions_for_day",
        fake_get_sessions_for_day,
    )

    adapter = FlowStudySessionSource()
    assert adapter.load_sessions(day, day_schedule) == expected
