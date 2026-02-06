"""Service-level tests for query service."""

from __future__ import annotations

import datetime

from sync.application.query_service import QueryService


class _StubAggregateSource:
    def load_for_dates(self, dates: list[datetime.date]):
        return {
            day: {"training_type_sessions": {"Workout": 2}}
            for day in dates
            if day == datetime.date(2026, 2, 1)
        }


def test_query_by_metric_matches_period_snapshot(monkeypatch):
    service = QueryService(aggregate_source=_StubAggregateSource())

    monkeypatch.setattr(
        "sync.application.query_service.compute_period_metrics",
        lambda _dates, _data: {
            "study_total_minutes": 300,
            "sleep_avg_minutes": 480,
            "mood_avg": 7.2,
            "workout_count": 4,
            "stretch_count": 5,
            "mindful_count": 6,
            "total_days": 7,
            "days_up_to_today": 7,
        },
    )
    monkeypatch.setattr(
        "sync.application.query_service.aggregate_interrupt_overrun",
        lambda _dates, _data: (12.0, 8.0, 1),
    )
    monkeypatch.setattr(
        "sync.application.query_service.aggregate_screen_time",
        lambda _dates, _data: {"YouTube": 30.0, "X": 15.0},
    )

    anchor = datetime.date(2026, 2, 1)
    snapshot = service.query_by_period("week", anchor)
    metric_snapshot, metric_value = service.query_by_metric(
        "study_minutes", "week", anchor
    )

    assert metric_snapshot.label == snapshot.label
    assert metric_value == snapshot.metrics["study_minutes"]
    assert snapshot.metrics["training_sessions_total"] == 2


def test_shift_anchor_supports_all_periods():
    service = QueryService(aggregate_source=_StubAggregateSource())
    anchor = datetime.date(2026, 2, 6)

    assert service.shift_anchor("day", anchor, 1) == datetime.date(2026, 2, 7)
    assert service.shift_anchor("week", anchor, -1) == datetime.date(2026, 1, 30)
    assert service.shift_anchor("month", anchor, 1) == datetime.date(2026, 3, 1)
    assert service.shift_anchor("quarter", anchor, 1) == datetime.date(2026, 4, 1)
    assert service.shift_anchor("year", anchor, 1) == datetime.date(2027, 1, 1)
