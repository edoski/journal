from __future__ import annotations

import datetime

import tui.data.repository as repository


def test_query_by_metric_matches_period_snapshot(monkeypatch):
    repo = repository.QueryRepository()

    monkeypatch.setattr(
        repository,
        "load_daily_data_for_dates",
        lambda _dates: {
            datetime.date(2026, 2, 1): {
                "training_type_sessions": {"Workout": 2},
            }
        },
    )
    monkeypatch.setattr(
        repository,
        "compute_period_metrics",
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
        repository,
        "aggregate_interrupt_overrun",
        lambda _dates, _data: (12.0, 8.0, 1),
    )
    monkeypatch.setattr(
        repository,
        "aggregate_screen_time",
        lambda _dates, _data: {"YouTube": 30.0, "X": 15.0},
    )

    anchor = datetime.date(2026, 2, 1)
    snapshot = repo.query_by_period("week", anchor)
    metric_snapshot, metric_value = repo.query_by_metric(
        "study_minutes", "week", anchor
    )

    assert metric_snapshot.label == snapshot.label
    assert metric_value == snapshot.metrics["study_minutes"]
    assert snapshot.metrics["training_sessions_total"] == 2


def test_shift_anchor_supports_all_periods():
    repo = repository.QueryRepository()
    anchor = datetime.date(2026, 2, 6)

    assert repo.shift_anchor("day", anchor, 1) == datetime.date(2026, 2, 7)
    assert repo.shift_anchor("week", anchor, -1) == datetime.date(2026, 1, 30)
    assert repo.shift_anchor("month", anchor, 1) == datetime.date(2026, 3, 1)
    assert repo.shift_anchor("quarter", anchor, 1) == datetime.date(2026, 4, 1)
    assert repo.shift_anchor("year", anchor, 1) == datetime.date(2027, 1, 1)
