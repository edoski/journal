"""Contract tests for FlowStudySessionSource adapter."""

from __future__ import annotations

import datetime

from sync.adapters.flow_sessions import FlowStudySessionSource


def test_load_sessions_delegates_to_flow_db(monkeypatch):
    day = datetime.date(2026, 2, 6)
    expected = [
        {
            "pk": 1,
            "phase": "flow",
            "title": "Study",
        }
    ]

    def fake_get_sessions_for_day(target_day: datetime.date):
        assert target_day == day
        return expected

    monkeypatch.setattr(
        "sync.adapters.flow_sessions.get_sessions_for_day",
        fake_get_sessions_for_day,
    )

    adapter = FlowStudySessionSource()
    assert adapter.load_sessions(day) == expected
