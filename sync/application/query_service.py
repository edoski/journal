"""Read-only query service for period/metric exploration."""

from __future__ import annotations

import datetime
import os
import re

from sync.constants import IDEAL, JOURNAL_DIR, STUDY_TARGET_MIN
from sync.contracts.metrics import DailyAggregate, MetricValue
from sync.contracts.query import (
    BreakdownRow,
    DashboardCard,
    DashboardSnapshot,
    MetricDefinition,
    MetricHistoryPoint,
    MetricHistorySnapshot,
    PeriodDetailSnapshot,
    PeriodMetricRow,
    PeriodSnapshot,
)
from sync.dates import (
    daterange,
    quarter_of_date,
    shift_month,
    shift_quarter,
)
from sync.formatting import compute_percent_change
from sync.metrics import (
    aggregate_activity_totals,
    aggregate_interrupt_overrun,
    aggregate_screen_time,
    compute_period_metrics,
)
from sync.periods.windows import (
    build_month_window,
    build_quarter_window,
    build_week_window,
    build_year_window,
)
from sync.ports.daily_aggregates import DailyAggregateSource
from sync.target_policy import target_for_metric as resolve_target_for_metric
from sync.target_policy import training_type_target

_METRIC_DEFINITIONS: tuple[MetricDefinition, ...] = (
    MetricDefinition(
        key="study_minutes",
        label="Study",
        unit="min",
        precision=0,
        higher_is_better=True,
        target=float(STUDY_TARGET_MIN),
    ),
    MetricDefinition(
        key="sleep_minutes",
        label="Sleep",
        unit="min",
        precision=0,
        higher_is_better=True,
        target=float(IDEAL.sleep_minutes_nightly),
    ),
    MetricDefinition(
        key="mood",
        label="Mood",
        unit="score",
        precision=1,
        higher_is_better=True,
        target=float(IDEAL.mood_target),
    ),
    MetricDefinition(
        key="workout_count",
        label="Workout",
        unit="count",
        precision=0,
        higher_is_better=True,
        target=float(training_type_target(7, "workout")),
    ),
    MetricDefinition(
        key="stretch_count",
        label="Stretch",
        unit="count",
        precision=0,
        higher_is_better=True,
        target=float(training_type_target(7, "stretch")),
    ),
    MetricDefinition(
        key="mindful_count",
        label="Mindful",
        unit="count",
        precision=0,
        higher_is_better=True,
        target=float(training_type_target(7, "mindful")),
    ),
    MetricDefinition(
        key="interrupt_minutes",
        label="Interruptions",
        unit="min",
        precision=0,
        higher_is_better=False,
        target=0.0,
    ),
    MetricDefinition(
        key="overrun_minutes",
        label="Overruns",
        unit="min",
        precision=0,
        higher_is_better=False,
        target=0.0,
    ),
    MetricDefinition(
        key="screen_time_total",
        label="Screen Time",
        unit="min",
        precision=0,
        higher_is_better=False,
        target=None,
    ),
    MetricDefinition(
        key="training_sessions_total",
        label="Training Sessions",
        unit="count",
        precision=0,
        higher_is_better=True,
        target=None,
    ),
)

_MOVING_AVG_LOOKBACK = {
    "day": 7,
    "week": 4,
    "month": 3,
    "quarter": 4,
    "year": 3,
}

_METRIC_LAB_LOOKBACK = {
    "day": 14,
    "week": 12,
    "month": 12,
    "quarter": 8,
    "year": 5,
}


class QueryService:
    """Read-only query facade over parsed daily-note aggregates."""

    def __init__(
        self,
        *,
        aggregate_source: DailyAggregateSource,
        journal_dir: str = JOURNAL_DIR,
    ) -> None:
        self.aggregate_source = aggregate_source
        self.journal_dir = journal_dir

    def list_daily_dates(self) -> list[datetime.date]:
        """List all daily note dates available in journal directory."""
        dates: list[datetime.date] = []
        if not os.path.isdir(self.journal_dir):
            return dates

        for name in os.listdir(self.journal_dir):
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.md", name):
                continue
            try:
                dates.append(datetime.date.fromisoformat(name[:-3]))
            except ValueError:
                continue

        dates.sort()
        return dates

    def period_bounds(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> tuple[datetime.date, datetime.date, str]:
        """Resolve start/end/label for the given period key."""
        if period == "day":
            return anchor_date, anchor_date, anchor_date.isoformat()
        if period == "week":
            week_window = build_week_window(anchor_date)
            return (
                week_window.start,
                week_window.end,
                f"{week_window.year}-W{week_window.week_num:02d}",
            )
        if period == "month":
            month_start = datetime.date(anchor_date.year, anchor_date.month, 1)
            month_window = build_month_window(month_start)
            return (
                month_window.start,
                month_window.end,
                f"{month_window.year}-{month_window.month:02d}",
            )
        if period == "quarter":
            year, quarter_num = quarter_of_date(anchor_date)
            quarter_window = build_quarter_window(year, quarter_num)
            return (
                quarter_window.start,
                quarter_window.end,
                f"{quarter_window.year}-Q{quarter_window.quarter}",
            )
        if period == "year":
            year_window = build_year_window(anchor_date.year)
            return year_window.start, year_window.end, f"{year_window.year}"

        raise ValueError(f"Unsupported period: {period}")

    def shift_anchor(
        self,
        period: str,
        anchor_date: datetime.date,
        delta: int,
    ) -> datetime.date:
        """Shift anchor by N units of the selected period."""
        if period == "day":
            return anchor_date + datetime.timedelta(days=delta)
        if period == "week":
            return anchor_date + datetime.timedelta(days=delta * 7)
        if period == "month":
            year, month = shift_month(anchor_date.year, anchor_date.month, delta)
            return datetime.date(year, month, 1)
        if period == "quarter":
            year, quarter_num = quarter_of_date(anchor_date)
            new_year, new_quarter = shift_quarter(year, quarter_num, delta)
            return build_quarter_window(new_year, new_quarter).start
        if period == "year":
            new_year = anchor_date.year + delta
            return build_year_window(new_year).start
        raise ValueError(f"Unsupported period: {period}")

    def metric_definitions(self) -> tuple[MetricDefinition, ...]:
        """Return canonical metric metadata used by explorer and metric lab."""
        return _METRIC_DEFINITIONS

    @staticmethod
    def _metric_value_as_float(value: MetricValue) -> float | None:
        if value is None:
            return None
        return float(value)

    @staticmethod
    def _average_metric_values(values: list[MetricValue]) -> float | None:
        cleaned: list[float] = []
        for value in values:
            parsed = QueryService._metric_value_as_float(value)
            if parsed is not None:
                cleaned.append(parsed)
        if not cleaned:
            return None
        return sum(cleaned) / len(cleaned)

    @staticmethod
    def _build_breakdown_rows(totals: dict[str, float]) -> tuple[BreakdownRow, ...]:
        if not totals:
            return tuple()

        total_value = sum(float(value or 0) for value in totals.values())
        rows = sorted(
            (
                (label, float(value or 0))
                for label, value in totals.items()
                if float(value or 0) > 0
            ),
            key=lambda item: (-item[1], item[0].casefold()),
        )

        if not rows:
            return tuple()

        return tuple(
            BreakdownRow(
                label=label,
                value=value,
                percent=(value / total_value) if total_value > 0 else None,
            )
            for label, value in rows
        )

    @staticmethod
    def _training_totals_by_type(
        daily_data: dict[datetime.date, DailyAggregate],
    ) -> dict[str, float]:
        totals: dict[str, float] = {}
        for payload in daily_data.values():
            for label, value in payload.get("training_type_minutes", {}).items():
                amount = float(value or 0)
                if amount <= 0:
                    continue
                totals[label] = totals.get(label, 0.0) + amount
        return totals

    def _build_metrics_map(
        self,
        dates: list[datetime.date],
        daily_data: dict[datetime.date, DailyAggregate],
    ) -> dict[str, MetricValue]:
        period_metrics = compute_period_metrics(dates, daily_data)
        interrupt_total, overrun_total, _ = aggregate_interrupt_overrun(
            dates, daily_data
        )
        screen_time_total = sum(aggregate_screen_time(dates, daily_data).values())

        training_sessions_total = 0
        for payload in daily_data.values():
            sessions_map = payload.get("training_type_sessions", {})
            if isinstance(sessions_map, dict):
                training_sessions_total += sum(
                    int(value or 0) for value in sessions_map.values()
                )

        return {
            "study_minutes": period_metrics["study_total_minutes"],
            "sleep_minutes": period_metrics["sleep_avg_minutes"],
            "mood": period_metrics["mood_avg"],
            "workout_count": period_metrics["workout_count"],
            "stretch_count": period_metrics["stretch_count"],
            "mindful_count": period_metrics["mindful_count"],
            "interrupt_minutes": interrupt_total,
            "overrun_minutes": overrun_total,
            "screen_time_total": screen_time_total,
            "training_sessions_total": training_sessions_total,
            "days_total": period_metrics["total_days"],
            "days_elapsed": period_metrics["days_up_to_today"],
        }

    def _moving_average_for_metric(
        self,
        metric: str,
        period: str,
        anchor_date: datetime.date,
    ) -> float | None:
        lookback = _MOVING_AVG_LOOKBACK.get(period)
        if lookback is None:
            return None
        history_values: list[MetricValue] = []
        for offset in range(lookback, 0, -1):
            prior_anchor = self.shift_anchor(period, anchor_date, -offset)
            prior_snapshot = self.query_by_period(period, prior_anchor)
            history_values.append(prior_snapshot.metrics.get(metric))
        return self._average_metric_values(history_values)

    def query_by_period(
        self,
        period: str,
        anchor_date: datetime.date,
    ) -> PeriodSnapshot:
        """Return aggregated metrics keyed by metric ID for selected period."""
        start, end, label = self.period_bounds(period, anchor_date)
        dates = list(daterange(start, end))
        daily_data = self.aggregate_source.load_for_dates(dates)
        metrics = self._build_metrics_map(dates, daily_data)

        return PeriodSnapshot(
            period=period,
            start=start,
            end=end,
            label=label,
            metrics=metrics,
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
        current_metrics = self._build_metrics_map(dates, daily_data)

        prev_anchor = self.shift_anchor(period, anchor_date, -1)
        previous_snapshot = self.query_by_period(period, prev_anchor)

        days_total = int(current_metrics.get("days_total") or len(dates))
        rows: list[PeriodMetricRow] = []
        for definition in self.metric_definitions():
            current_value = current_metrics.get(definition.key)
            previous_value = previous_snapshot.metrics.get(definition.key)
            rows.append(
                PeriodMetricRow(
                    key=definition.key,
                    label=definition.label,
                    current=current_value,
                    previous=previous_value,
                    delta_pct=compute_percent_change(
                        self._metric_value_as_float(current_value),
                        self._metric_value_as_float(previous_value),
                    ),
                    moving_avg=self._moving_average_for_metric(
                        definition.key,
                        period,
                        anchor_date,
                    ),
                    target=resolve_target_for_metric(definition.key, days_total),
                )
            )

        activity_breakdown = self._build_breakdown_rows(
            aggregate_activity_totals(dates, daily_data)
        )
        training_breakdown = self._build_breakdown_rows(
            self._training_totals_by_type(daily_data)
        )
        screen_time_breakdown = self._build_breakdown_rows(
            aggregate_screen_time(dates, daily_data)
        )

        return PeriodDetailSnapshot(
            period=period,
            start=start,
            end=end,
            label=label,
            rows=tuple(rows),
            activity_breakdown=activity_breakdown,
            training_breakdown=training_breakdown,
            screen_time_breakdown=screen_time_breakdown,
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
                    delta_pct=compute_percent_change(
                        self._metric_value_as_float(value),
                        self._metric_value_as_float(previous_value),
                    ),
                    is_partial=snapshot.end > today,
                )
            )
            previous_value = value

        current_value = points[-1].value if points else None
        previous_point_value = points[-2].value if len(points) > 1 else None
        delta = compute_percent_change(
            self._metric_value_as_float(current_value),
            self._metric_value_as_float(previous_point_value),
        )
        anchor_label = points[-1].label if points else ""
        return MetricHistorySnapshot(
            metric=metric,
            period=period,
            anchor_label=anchor_label,
            current=current_value,
            previous=previous_point_value,
            delta_pct=delta,
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
            "mindful_count",
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

        alerts: list[str] = []
        day_data = self.aggregate_source.load_for_dates([anchor_date]).get(anchor_date)
        if day_data is None:
            alerts.append(f"Missing daily note for {anchor_date.isoformat()}.")
        else:
            sleep_minutes = day_data.get("sleep_minutes")
            mood = day_data.get("mood")
            study_minutes = float(day_data.get("study_minutes") or 0)

            if sleep_minutes is None or mood is None:
                alerts.append(
                    f"Missing sleep or mood data for {anchor_date.isoformat()}."
                )
            if study_minutes < STUDY_TARGET_MIN:
                alerts.append(
                    f"Study below target ({int(study_minutes)} < {STUDY_TARGET_MIN} min)."
                )
            if (
                sleep_minutes is not None
                and sleep_minutes < IDEAL.sleep_minutes_nightly
            ):
                alerts.append(
                    "Sleep below target "
                    f"({int(sleep_minutes)} < {IDEAL.sleep_minutes_nightly} min)."
                )
            if mood is not None and mood < IDEAL.mood_target:
                alerts.append(
                    f"Mood below target ({mood:.1f} < {IDEAL.mood_target:.1f})."
                )

        trend_period = "week"
        trend_study = self.query_metric_history(
            "study_minutes",
            trend_period,
            anchor_date,
            _METRIC_LAB_LOOKBACK[trend_period],
        ).points
        trend_sleep = self.query_metric_history(
            "sleep_minutes",
            trend_period,
            anchor_date,
            _METRIC_LAB_LOOKBACK[trend_period],
        ).points
        trend_mood = self.query_metric_history(
            "mood",
            trend_period,
            anchor_date,
            _METRIC_LAB_LOOKBACK[trend_period],
        ).points

        return DashboardSnapshot(
            anchor_date=anchor_date,
            period_label=detail.label,
            cards=cards,
            alerts=tuple(alerts),
            trend_study=trend_study,
            trend_sleep=trend_sleep,
            trend_mood=trend_mood,
        )
