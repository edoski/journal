from __future__ import annotations

import datetime

from sync.contracts.query import (
    DashboardSnapshot,
    MetricDefinition,
    MetricHistorySnapshot,
    PeriodDetailSnapshot,
    PeriodMetricRow,
    PeriodSnapshot,
)
from tui.data.repository import QueryRepository


class _StubQueryService:
    def __init__(self) -> None:
        self.calls: dict[str, int] = {}

    def _hit(self, key: str) -> None:
        self.calls[key] = self.calls.get(key, 0) + 1

    def list_daily_dates(self):
        self._hit("list_daily_dates")
        return [datetime.date(2026, 2, 1)]

    def period_bounds(self, period, anchor_date):
        self._hit("period_bounds")
        _ = period, anchor_date
        return (
            datetime.date(2026, 2, 1),
            datetime.date(2026, 2, 7),
            "2026-W05",
        )

    def shift_anchor(self, period, anchor_date, delta):
        self._hit("shift_anchor")
        _ = period
        return anchor_date + datetime.timedelta(days=delta)

    def query_by_period(self, period, anchor_date):
        self._hit("query_by_period")
        _ = period, anchor_date
        return PeriodSnapshot(
            period="week",
            start=datetime.date(2026, 2, 1),
            end=datetime.date(2026, 2, 7),
            label="2026-W05",
            metrics={"study_minutes": 300},
        )

    def query_by_metric(self, metric, period, anchor_date):
        self._hit("query_by_metric")
        snapshot = self.query_by_period(period, anchor_date)
        return snapshot, snapshot.metrics.get(metric)

    def metric_definitions(self):
        self._hit("metric_definitions")
        return (MetricDefinition("study_minutes", "Study", "min", 0, True, 360.0),)

    def query_period_detail(self, period, anchor_date):
        self._hit("query_period_detail")
        _ = period, anchor_date
        return PeriodDetailSnapshot(
            period="week",
            start=datetime.date(2026, 2, 1),
            end=datetime.date(2026, 2, 7),
            label="2026-W05",
            rows=(
                PeriodMetricRow(
                    key="study_minutes",
                    label="Study",
                    current=300.0,
                    previous=280.0,
                    delta_pct=7.0,
                    moving_avg=290.0,
                    target=2520.0,
                ),
            ),
            activity_breakdown=tuple(),
            training_breakdown=tuple(),
            screen_time_breakdown=tuple(),
            days_total=7,
            days_with_data=7,
        )

    def query_metric_history(self, metric, period, anchor_date, lookback):
        self._hit("query_metric_history")
        _ = metric, period, anchor_date, lookback
        return MetricHistorySnapshot(
            metric="study_minutes",
            period="week",
            anchor_label="2026-W05",
            current=300.0,
            previous=280.0,
            delta_pct=7.0,
            points=tuple(),
        )

    def query_dashboard(self, anchor_date):
        self._hit("query_dashboard")
        _ = anchor_date
        return DashboardSnapshot(
            anchor_date=datetime.date(2026, 2, 1),
            period_label="2026-W05",
            cards=tuple(),
            alerts=tuple(),
            trend_study=tuple(),
            trend_sleep=tuple(),
            trend_mood=tuple(),
        )


def test_repository_caches_read_queries_and_invalidates():
    service = _StubQueryService()
    repo = QueryRepository(service)
    anchor = datetime.date(2026, 2, 6)

    repo.query_by_period("week", anchor)
    repo.query_by_period("week", anchor)
    assert service.calls["query_by_period"] == 1

    repo.query_period_detail("week", anchor)
    repo.query_period_detail("week", anchor)
    assert service.calls["query_period_detail"] == 1

    repo.query_metric_history("study_minutes", "week", anchor, 12)
    repo.query_metric_history("study_minutes", "week", anchor, 12)
    assert service.calls["query_metric_history"] == 1

    repo.invalidate_cache()
    repo.query_by_period("week", anchor)
    assert service.calls["query_by_period"] == 2


def test_shift_anchor_delegates_without_cache():
    service = _StubQueryService()
    repo = QueryRepository(service)
    anchor = datetime.date(2026, 2, 6)

    shifted = repo.shift_anchor("day", anchor, 1)
    assert shifted == datetime.date(2026, 2, 7)
    assert service.calls["shift_anchor"] == 1
