from __future__ import annotations

import datetime

from sync.contracts.query import PeriodSnapshot
import tui.data.repository as repository


class _StubQueryService:
    def __init__(self) -> None:
        self.shift_calls = []

    def list_daily_dates(self):
        return [datetime.date(2026, 2, 1)]

    def period_bounds(self, period, anchor_date):
        _ = period, anchor_date
        return (
            datetime.date(2026, 2, 1),
            datetime.date(2026, 2, 7),
            "2026-W05",
        )

    def shift_anchor(self, period, anchor_date, delta):
        self.shift_calls.append((period, anchor_date, delta))
        return anchor_date + datetime.timedelta(days=delta)

    def query_by_period(self, period, anchor_date):
        _ = period, anchor_date
        return PeriodSnapshot(
            period="week",
            start=datetime.date(2026, 2, 1),
            end=datetime.date(2026, 2, 7),
            label="2026-W05",
            metrics={"study_minutes": 300, "training_sessions_total": 2},
        )

    def query_by_metric(self, metric, period, anchor_date):
        snapshot = self.query_by_period(period, anchor_date)
        return snapshot, snapshot.metrics.get(metric)


def test_query_by_metric_matches_period_snapshot():
    repo = repository.QueryRepository(_StubQueryService())

    anchor = datetime.date(2026, 2, 1)
    snapshot = repo.query_by_period("week", anchor)
    metric_snapshot, metric_value = repo.query_by_metric(
        "study_minutes", "week", anchor
    )

    assert metric_snapshot.label == snapshot.label
    assert metric_value == snapshot.metrics["study_minutes"]
    assert snapshot.metrics["training_sessions_total"] == 2


def test_shift_anchor_delegates_to_query_service():
    service = _StubQueryService()
    repo = repository.QueryRepository(service)
    anchor = datetime.date(2026, 2, 6)

    shifted = repo.shift_anchor("day", anchor, 1)

    assert shifted == datetime.date(2026, 2, 7)
    assert service.shift_calls == [("day", anchor, 1)]
