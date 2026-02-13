"""TUI query repository that delegates to shared query service."""

from __future__ import annotations

import datetime
from typing import Protocol

from sync.contracts.metrics import MetricValue
from sync.contracts.query import (
    DashboardSnapshot,
    MetricDefinition,
    MetricHistorySnapshot,
    PeriodDetailSnapshot,
    PeriodSnapshot,
)


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
    ) -> tuple[PeriodSnapshot, MetricValue]: ...

    def metric_definitions(self) -> tuple[MetricDefinition, ...]: ...

    def query_period_detail(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> PeriodDetailSnapshot: ...

    def query_metric_history(
        self,
        metric: str,
        period: str,
        anchor_date: datetime.date,
        lookback: int,
    ) -> MetricHistorySnapshot: ...

    def query_dashboard(self, anchor_date: datetime.date) -> DashboardSnapshot: ...


class QueryRepository:
    """Read-only query facade used by the TUI views."""

    def __init__(self, query_service: QueryServiceLike) -> None:
        self.query_service = query_service
        self._cache: dict[tuple[str, object, object, object, object], object] = {}

    def invalidate_cache(self) -> None:
        """Drop all cached query responses."""
        self._cache.clear()

    def list_daily_dates(self) -> list[datetime.date]:
        cache_key = ("list_daily_dates", None, None, None, None)
        cached = self._cache.get(cache_key)
        if isinstance(cached, list):
            return list(cached)
        dates = self.query_service.list_daily_dates()
        self._cache[cache_key] = list(dates)
        return dates

    def period_bounds(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> tuple[datetime.date, datetime.date, str]:
        cache_key = ("period_bounds", period, anchor_date, None, None)
        cached = self._cache.get(cache_key)
        if isinstance(cached, tuple) and len(cached) == 3:
            start, end, label = cached
            if isinstance(start, datetime.date) and isinstance(end, datetime.date):
                return start, end, str(label)
        bounds = self.query_service.period_bounds(period, anchor_date)
        self._cache[cache_key] = bounds
        return bounds

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
        cache_key = ("query_by_period", period, anchor_date, None, None)
        cached = self._cache.get(cache_key)
        if isinstance(cached, PeriodSnapshot):
            return cached
        snapshot = self.query_service.query_by_period(period, anchor_date)
        self._cache[cache_key] = snapshot
        return snapshot

    def query_by_metric(
        self,
        metric: str,
        period: str,
        anchor_date: datetime.date,
    ) -> tuple[PeriodSnapshot, MetricValue]:
        cache_key = ("query_by_metric", metric, period, anchor_date, None)
        cached = self._cache.get(cache_key)
        if (
            isinstance(cached, tuple)
            and len(cached) == 2
            and isinstance(cached[0], PeriodSnapshot)
        ):
            return cached[0], cached[1]
        result = self.query_service.query_by_metric(metric, period, anchor_date)
        self._cache[cache_key] = result
        return result

    def metric_definitions(self) -> tuple[MetricDefinition, ...]:
        cache_key = ("metric_definitions", None, None, None, None)
        cached = self._cache.get(cache_key)
        if isinstance(cached, tuple):
            return cached
        definitions = self.query_service.metric_definitions()
        self._cache[cache_key] = definitions
        return definitions

    def query_period_detail(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> PeriodDetailSnapshot:
        cache_key = ("query_period_detail", period, anchor_date, None, None)
        cached = self._cache.get(cache_key)
        if isinstance(cached, PeriodDetailSnapshot):
            return cached
        detail = self.query_service.query_period_detail(period, anchor_date)
        self._cache[cache_key] = detail
        return detail

    def query_metric_history(
        self,
        metric: str,
        period: str,
        anchor_date: datetime.date,
        lookback: int,
    ) -> MetricHistorySnapshot:
        cache_key = ("query_metric_history", metric, period, anchor_date, lookback)
        cached = self._cache.get(cache_key)
        if isinstance(cached, MetricHistorySnapshot):
            return cached
        history = self.query_service.query_metric_history(
            metric,
            period,
            anchor_date,
            lookback,
        )
        self._cache[cache_key] = history
        return history

    def query_dashboard(self, anchor_date: datetime.date) -> DashboardSnapshot:
        cache_key = ("query_dashboard", anchor_date, None, None, None)
        cached = self._cache.get(cache_key)
        if isinstance(cached, DashboardSnapshot):
            return cached
        dashboard = self.query_service.query_dashboard(anchor_date)
        self._cache[cache_key] = dashboard
        return dashboard
