"""Read-only query service for period and metric exploration."""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field

from sync.application.query_metrics import (
    METRIC_DEFINITIONS,
    METRIC_LAB_LOOKBACK,
    MOVING_AVG_LOOKBACK,
    activity_breakdown,
    average_metric_values,
    build_metrics_map,
    delta_percent,
    metric_target,
)
from sync.application.query_periods import PeriodNavigator
from sync.constants import IDEAL, STUDY_TARGET_MIN
from sync.contracts.metrics import MetricValue
from sync.contracts.query import (
    DashboardCard,
    DashboardSnapshot,
    MetricDefinition,
    MetricHistoryPoint,
    MetricHistorySnapshot,
    PeriodDetailSnapshot,
    PeriodMetricRow,
    PeriodSnapshot,
)
from sync.dates import daterange
from sync.log import get_logger
from sync.ports.daily_aggregates import DailyAggregateSource
from sync.ports.schedule import ScheduleSource
from sync.application.query_metrics import screen_time_breakdown, training_breakdown

logger = get_logger(__name__)


@dataclass
class QueryService:
    """Read-only query facade over parsed daily-note aggregates."""

    aggregate_source: DailyAggregateSource
    schedule_source: ScheduleSource
    navigator: PeriodNavigator = field(default_factory=PeriodNavigator)

    def period_bounds(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> tuple[datetime.date, datetime.date, str]:
        return self.navigator.period_bounds(period, anchor_date)

    def shift_anchor(
        self,
        period: str,
        anchor_date: datetime.date,
        delta: int,
    ) -> datetime.date:
        return self.navigator.shift_anchor(period, anchor_date, delta)

    def metric_definitions(self) -> tuple[MetricDefinition, ...]:
        """Return canonical metric metadata used by explorer and metric lab."""
        return METRIC_DEFINITIONS

    def _moving_average_for_metric(
        self,
        metric: str,
        period: str,
        anchor_date: datetime.date,
    ) -> float | None:
        lookback = MOVING_AVG_LOOKBACK.get(period)
        if lookback is None:
            return None
        history_values: list[MetricValue] = []
        for offset in range(lookback, 0, -1):
            prior_anchor = self.shift_anchor(period, anchor_date, -offset)
            prior_snapshot = self.query_by_period(period, prior_anchor)
            history_values.append(prior_snapshot.metrics.get(metric))
        return average_metric_values(history_values)

    def query_by_period(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> PeriodSnapshot:
        """Return aggregated metrics keyed by metric ID for selected period."""
        start, end, label = self.period_bounds(period, anchor_date)
        dates = list(daterange(start, end))
        daily_data = self.aggregate_source.load_for_dates(dates)
        return PeriodSnapshot(
            period=period,
            start=start,
            end=end,
            label=label,
            metrics=build_metrics_map(dates, daily_data),
        )

    def query_by_metric(
        self,
        metric: str,
        period: str,
        anchor_date: datetime.date,
    ) -> tuple[PeriodSnapshot, MetricValue]:
        """Return selected period snapshot and metric value."""
        snapshot = self.query_by_period(period, anchor_date)
        return snapshot, snapshot.metrics.get(metric)

    def query_period_detail(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> PeriodDetailSnapshot:
        """Return period details with comparison rows and breakdown side-panels."""
        start, end, label = self.period_bounds(period, anchor_date)
        dates = list(daterange(start, end))
        daily_data = self.aggregate_source.load_for_dates(dates)
        current_metrics = build_metrics_map(dates, daily_data)
        previous_snapshot = self.query_by_period(
            period,
            self.shift_anchor(period, anchor_date, -1),
        )

        days_total = int(current_metrics.get("days_total") or len(dates))
        rows = tuple(
            PeriodMetricRow(
                key=definition.key,
                label=definition.label,
                current=(current_value := current_metrics.get(definition.key)),
                previous=(
                    previous_value := previous_snapshot.metrics.get(definition.key)
                ),
                delta_pct=delta_percent(current_value, previous_value),
                moving_avg=self._moving_average_for_metric(
                    definition.key,
                    period,
                    anchor_date,
                ),
                target=metric_target(
                    definition.key,
                    days_total=days_total,
                    dates=dates,
                    schedule_resolver=self.schedule_source.resolve_day,
                    logger=logger,
                ),
            )
            for definition in self.metric_definitions()
        )

        return PeriodDetailSnapshot(
            period=period,
            start=start,
            end=end,
            label=label,
            rows=rows,
            activity_breakdown=activity_breakdown(dates, daily_data),
            training_breakdown=training_breakdown(daily_data),
            screen_time_breakdown=screen_time_breakdown(dates, daily_data),
            days_total=days_total,
            days_with_data=len(daily_data),
        )

    def query_metric_history(
        self,
        metric: str,
        period: str,
        anchor_date: datetime.date,
        lookback: int,
    ) -> MetricHistorySnapshot:
        """Return historical points for a metric across prior periods."""
        if lookback <= 0:
            raise ValueError("lookback must be positive")

        today = datetime.date.today()
        points: list[MetricHistoryPoint] = []
        previous_value: MetricValue = None
        for offset in range(lookback - 1, -1, -1):
            point_anchor = self.shift_anchor(period, anchor_date, -offset)
            snapshot = self.query_by_period(period, point_anchor)
            value = snapshot.metrics.get(metric)
            points.append(
                MetricHistoryPoint(
                    label=snapshot.label,
                    start=snapshot.start,
                    end=snapshot.end,
                    value=value,
                    delta_pct=delta_percent(value, previous_value),
                    is_partial=snapshot.end > today,
                )
            )
            previous_value = value

        current_value = points[-1].value if points else None
        previous_point_value = points[-2].value if len(points) > 1 else None
        anchor_label = points[-1].label if points else ""
        return MetricHistorySnapshot(
            metric=metric,
            period=period,
            anchor_label=anchor_label,
            current=current_value,
            previous=previous_point_value,
            delta_pct=delta_percent(current_value, previous_point_value),
            points=tuple(points),
        )

    def query_dashboard(self, anchor_date: datetime.date) -> DashboardSnapshot:
        """Return dashboard cards, alerts, and trend strips for the shell home."""
        detail = self.query_period_detail("week", anchor_date)
        rows_by_key = {row.key: row for row in detail.rows}
        card_keys = (
            "study_minutes",
            "sleep_minutes",
            "mood",
            "workout_count",
            "stretch_count",
            "meditation_count",
            "interrupt_minutes",
            "screen_time_total",
        )
        cards = tuple(
            DashboardCard(
                key=key,
                label=rows_by_key[key].label,
                value=rows_by_key[key].current,
                delta_pct=rows_by_key[key].delta_pct,
                target=rows_by_key[key].target,
            )
            for key in card_keys
            if key in rows_by_key
        )

        alerts = self._build_dashboard_alerts(anchor_date)
        trend_period = "week"
        return DashboardSnapshot(
            anchor_date=anchor_date,
            period_label=detail.label,
            cards=cards,
            alerts=tuple(alerts),
            trend_study=self.query_metric_history(
                "study_minutes",
                trend_period,
                anchor_date,
                METRIC_LAB_LOOKBACK[trend_period],
            ).points,
            trend_sleep=self.query_metric_history(
                "sleep_minutes",
                trend_period,
                anchor_date,
                METRIC_LAB_LOOKBACK[trend_period],
            ).points,
            trend_mood=self.query_metric_history(
                "mood",
                trend_period,
                anchor_date,
                METRIC_LAB_LOOKBACK[trend_period],
            ).points,
        )

    def _build_dashboard_alerts(self, anchor_date: datetime.date) -> list[str]:
        alerts: list[str] = []
        day_data = self.aggregate_source.load_for_dates([anchor_date]).get(anchor_date)
        if day_data is None:
            alerts.append(f"Missing daily note for {anchor_date.isoformat()}.")
            return alerts

        sleep_minutes = day_data.get("sleep_minutes")
        mood = day_data.get("mood")
        study_minutes = float(day_data.get("study_minutes") or 0)

        if sleep_minutes is None or mood is None:
            alerts.append(f"Missing sleep or mood data for {anchor_date.isoformat()}.")
        if study_minutes < STUDY_TARGET_MIN:
            alerts.append(
                f"Study below target ({int(study_minutes)} < {STUDY_TARGET_MIN} min)."
            )
        if sleep_minutes is not None and sleep_minutes < IDEAL.sleep_minutes_nightly:
            alerts.append(
                "Sleep below target "
                f"({int(sleep_minutes)} < {IDEAL.sleep_minutes_nightly} min)."
            )
        if mood is not None and mood < IDEAL.mood_target:
            alerts.append(f"Mood below target ({mood:.1f} < {IDEAL.mood_target:.1f}).")
        return alerts
