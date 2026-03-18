"""Service-level tests for query service and rich query contracts."""

from __future__ import annotations

import datetime

from sync.application.query_service import QueryService
from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.query import (
    MetricHistoryPoint,
    MetricHistorySnapshot,
    PeriodDetailSnapshot,
    PeriodMetricRow,
    PeriodSnapshot,
)
from sync.target_policy import training_type_target


class _StubAggregateSource:
    def __init__(self) -> None:
        self.by_day: dict[datetime.date, dict] = {}

    def load_for_dates(self, dates: list[datetime.date]):
        return {day: self.by_day[day] for day in dates if day in self.by_day}


class _StubScheduleSource:
    def resolve_day(self, _day: datetime.date) -> DayScheduleProfile:
        return DayScheduleProfile(
            study_start=datetime.time(8, 0),
            study_end=datetime.time(18, 0),
            lunch_start=datetime.time(13, 0),
            lunch_end=datetime.time(14, 0),
            workout_start=datetime.time(18, 0),
            is_off_day=False,
        )


def _service_with_data() -> tuple[QueryService, _StubAggregateSource]:
    source = _StubAggregateSource()
    service = QueryService(
        aggregate_source=source,
        schedule_source=_StubScheduleSource(),
    )
    return service, source


def test_metric_definitions_expose_expected_keys():
    service, _ = _service_with_data()
    keys = [item.key for item in service.metric_definitions()]
    assert "study_minutes" in keys
    assert "sleep_minutes" in keys
    assert "mood" in keys
    assert "screen_time_total" in keys


def test_query_by_metric_matches_period_snapshot(monkeypatch):
    service, _ = _service_with_data()

    monkeypatch.setattr(
        "sync.application.query_service.compute_period_metrics",
        lambda _dates, _data: {
            "study_total_minutes": 300,
            "sleep_avg_minutes": 480,
            "mood_avg": 7.2,
            "workout_count": 4,
            "stretch_count": 5,
            "meditation_count": 6,
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
    assert snapshot.metrics["training_sessions_total"] == 0


def test_query_period_detail_contains_sorted_breakdowns():
    service, source = _service_with_data()
    anchor = datetime.date(2026, 2, 6)
    source.by_day[anchor] = {
        "study_minutes": 420.0,
        "sleep_minutes": 470.0,
        "mood": 6.5,
        "workout": True,
        "stretch": False,
        "meditate": True,
        "awake_minutes": 18.0,
        "awakenings": 1,
        "activity_totals": {"Writing": 180.0, "Reading": 90.0},
        "interrupt_minutes": 15.0,
        "overrun_minutes": 10.0,
        "planned_break_minutes": 30.0,
        "training_type_minutes": {"Workout": 50.0, "Stretch": 20.0},
        "training_type_sessions": {"Workout": 2, "Stretch": 1},
        "screen_time_totals": {"YouTube": 40.0, "X": 12.0},
    }

    detail = service.query_period_detail("week", anchor)

    assert isinstance(detail, PeriodDetailSnapshot)
    assert detail.days_total == 7
    assert detail.days_with_data == 1
    assert detail.rows[0].key == "study_minutes"
    study_row = next(row for row in detail.rows if row.key == "study_minutes")
    assert study_row.target == 2520.0
    assert detail.activity_breakdown[0].label == "Writing"
    assert detail.training_breakdown[0].label == "Workout"
    assert detail.screen_time_breakdown[0].label == "YouTube"


def test_query_period_detail_sets_study_target_none_when_schedule_fails():
    class _RaisingScheduleSource:
        def resolve_day(self, _day: datetime.date) -> DayScheduleProfile:
            raise ValueError("invalid schedule")

    source = _StubAggregateSource()
    service = QueryService(
        aggregate_source=source,
        schedule_source=_RaisingScheduleSource(),
    )
    anchor = datetime.date(2026, 2, 6)
    source.by_day[anchor] = {
        "study_minutes": 420.0,
        "sleep_minutes": 470.0,
        "mood": 6.5,
        "workout": True,
        "stretch": False,
        "meditate": True,
        "awake_minutes": 18.0,
        "awakenings": 1,
        "activity_totals": {"Writing": 180.0},
        "interrupt_minutes": 15.0,
        "overrun_minutes": 10.0,
        "planned_break_minutes": 30.0,
        "training_type_minutes": {"Workout": 50.0},
        "training_type_sessions": {"Workout": 2},
        "screen_time_totals": {"YouTube": 40.0},
    }

    detail = service.query_period_detail("week", anchor)
    study_row = next(row for row in detail.rows if row.key == "study_minutes")
    assert study_row.target is None


def test_query_metric_history_returns_lookback_points(monkeypatch):
    service, _ = _service_with_data()
    anchor = datetime.date(2026, 2, 8)

    values_by_anchor = {
        datetime.date(2026, 1, 25): 100.0,
        datetime.date(2026, 2, 1): 120.0,
        datetime.date(2026, 2, 8): 90.0,
    }

    def _fake_query_by_period(
        period: str, anchor_date: datetime.date
    ) -> PeriodSnapshot:
        assert period == "week"
        value = values_by_anchor[anchor_date]
        return PeriodSnapshot(
            period=period,
            start=anchor_date,
            end=anchor_date + datetime.timedelta(days=6),
            label=f"{anchor_date.isoformat()}-W",
            metrics={"study_minutes": value},
        )

    monkeypatch.setattr(service, "query_by_period", _fake_query_by_period)

    history = service.query_metric_history(
        "study_minutes",
        "week",
        anchor,
        lookback=3,
    )

    assert len(history.points) == 3
    assert isinstance(history.points[0], MetricHistoryPoint)
    assert history.current == 90.0
    assert history.previous == 120.0
    assert history.delta_pct is not None and history.delta_pct < 0


def test_query_dashboard_emits_missing_note_alert(monkeypatch):
    service, _ = _service_with_data()
    anchor = datetime.date(2026, 2, 8)

    workout_target = float(training_type_target(7, "workout"))
    stretch_target = float(training_type_target(7, "stretch"))
    meditation_target = float(training_type_target(7, "meditation"))

    detail = PeriodDetailSnapshot(
        period="week",
        start=anchor - datetime.timedelta(days=6),
        end=anchor,
        label="2026-W06",
        rows=(
            PeriodMetricRow(
                "study_minutes", "Study", 300.0, 250.0, 20.0, 280.0, 2520.0
            ),
            PeriodMetricRow("sleep_minutes", "Sleep", 470.0, 460.0, 2.0, 465.0, 480.0),
            PeriodMetricRow("mood", "Mood", 6.0, 6.5, -8.0, 6.2, 6.0),
            PeriodMetricRow(
                "workout_count",
                "Workout",
                4,
                3,
                33.0,
                3.5,
                workout_target,
            ),
            PeriodMetricRow(
                "stretch_count",
                "Stretch",
                4,
                5,
                -20.0,
                4.5,
                stretch_target,
            ),
            PeriodMetricRow(
                "meditation_count",
                "Meditation",
                5,
                4,
                25.0,
                4.5,
                meditation_target,
            ),
            PeriodMetricRow(
                "interrupt_minutes",
                "Interruptions",
                40.0,
                30.0,
                33.0,
                35.0,
                0.0,
            ),
            PeriodMetricRow(
                "screen_time_total",
                "Screen Time",
                140.0,
                130.0,
                8.0,
                135.0,
                None,
            ),
        ),
        activity_breakdown=tuple(),
        training_breakdown=tuple(),
        screen_time_breakdown=tuple(),
        days_total=7,
        days_with_data=0,
    )

    monkeypatch.setattr(service, "query_period_detail", lambda _period, _anchor: detail)

    def _fake_history(
        metric: str,
        period: str,
        anchor_date: datetime.date,
        lookback: int,
    ) -> MetricHistorySnapshot:
        return MetricHistorySnapshot(
            metric=metric,
            period=period,
            anchor_label=detail.label,
            current=1.0,
            previous=1.0,
            delta_pct=0.0,
            points=tuple(
                MetricHistoryPoint(
                    label=f"P{idx}",
                    start=anchor_date,
                    end=anchor_date,
                    value=float(idx),
                    delta_pct=0.0,
                    is_partial=False,
                )
                for idx in range(lookback)
            ),
        )

    monkeypatch.setattr(
        service,
        "query_metric_history",
        _fake_history,
    )

    snapshot = service.query_dashboard(anchor)
    assert snapshot.period_label == "2026-W06"
    assert snapshot.cards
    assert snapshot.alerts
    assert snapshot.alerts[0].startswith("Missing daily note for")


def test_shift_anchor_supports_all_periods():
    service, _ = _service_with_data()
    anchor = datetime.date(2026, 2, 6)

    assert service.shift_anchor("day", anchor, 1) == datetime.date(2026, 2, 7)
    assert service.shift_anchor("week", anchor, -1) == datetime.date(2026, 1, 30)
    assert service.shift_anchor("month", anchor, 1) == datetime.date(2026, 3, 1)
    assert service.shift_anchor("quarter", anchor, 1) == datetime.date(2026, 4, 1)
    assert service.shift_anchor("year", anchor, 1) == datetime.date(2027, 1, 1)
