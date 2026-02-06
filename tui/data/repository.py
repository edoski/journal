"""TUI query repository that delegates to shared query service."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class PeriodSnapshot:
    """Aggregated metrics view for a date period."""

    period: str
    start: datetime.date
    end: datetime.date
    label: str
    metrics: dict[str, float | int | None]


class QueryServiceLike(Protocol):
    """Protocol for application-level query services consumed by TUI."""

    def list_daily_dates(self) -> list[datetime.date]: ...

    def period_bounds(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> tuple[datetime.date, datetime.date, str]: ...

    def shift_anchor(
        self,
        period: str,
        anchor_date: datetime.date,
        delta: int,
    ) -> datetime.date: ...

    def query_by_period(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> PeriodSnapshot: ...

    def query_by_metric(
        self,
        metric: str,
        period: str,
        anchor_date: datetime.date,
    ) -> tuple[PeriodSnapshot, Any]: ...


class QueryRepository:
    """Read-only query facade used by the TUI views."""

    def __init__(self, query_service: QueryServiceLike) -> None:
        self.query_service = query_service

    def list_daily_dates(self) -> list[datetime.date]:
        return self.query_service.list_daily_dates()

    def period_bounds(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> tuple[datetime.date, datetime.date, str]:
        return self.query_service.period_bounds(period, anchor_date)

    def shift_anchor(
        self,
        period: str,
        anchor_date: datetime.date,
        delta: int,
    ) -> datetime.date:
        return self.query_service.shift_anchor(period, anchor_date, delta)

    def query_by_period(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> PeriodSnapshot:
        return self.query_service.query_by_period(period, anchor_date)

    def query_by_metric(
        self,
        metric: str,
        period: str,
        anchor_date: datetime.date,
    ) -> tuple[PeriodSnapshot, Any]:
        return self.query_service.query_by_metric(metric, period, anchor_date)
