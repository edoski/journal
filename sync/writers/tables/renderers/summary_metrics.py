"""Renderer for period summary metrics table section."""

from __future__ import annotations

from collections.abc import Mapping

from sync.contracts.metrics import MetricValue
from sync.formatting import (
    compute_pace,
    format_ma_training_ratio,
    format_summary_change_label,
    format_minutes,
    format_training_ratio,
)

from ..specs import SummaryMetricsTableSpec


def _metric_float(metrics: Mapping[str, MetricValue], key: str) -> float | None:
    value = metrics.get(key)
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _metric_int(metrics: Mapping[str, MetricValue], key: str) -> int | None:
    value = metrics.get(key)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _metric_float_or(
    metrics: Mapping[str, MetricValue],
    key: str,
    default: float,
) -> float:
    value = _metric_float(metrics, key)
    if value is None:
        return default
    return value


def _metric_int_or(
    metrics: Mapping[str, MetricValue],
    key: str,
    default: int,
) -> int:
    value = _metric_int(metrics, key)
    if value is None:
        return default
    return value


def _append_summary_row(
    lines: list[str],
    *,
    show_ma: bool,
    metric_label: str,
    current: str,
    previous: str,
    change: str,
    ma_value: str = "—",
) -> None:
    if show_ma:
        lines.append(
            f"| **{metric_label}** | `{current}` | `{previous}` | `{change}` | `{ma_value}` |"
        )
        return
    lines.append(f"| **{metric_label}** | `{current}` | `{previous}` | `{change}` |")


def _format_optional_minutes_per_night(value: float | None) -> str:
    if value is None:
        return "—"
    return format_minutes(value, always_show_both=True) + "/night"


def render_summary_metrics(spec: SummaryMetricsTableSpec) -> list[str]:
    """Render markdown summary section and table."""
    current_metrics = spec.current_metrics
    previous_metrics = spec.previous_metrics
    current_label = spec.current_label
    previous_label = spec.previous_label
    ma_metrics = spec.ma_metrics
    ma_label = spec.ma_label
    ma_training_unit = spec.ma_training_unit

    lines = ["### **SUMMARY**", ""]

    show_ma = ma_metrics is not None and ma_label is not None

    if show_ma:
        lines.append(
            f"| METRIC | {current_label} | {previous_label} | CHANGE | {ma_label} |"
        )
        lines.append(
            "| ------ | ------------- | ----------------------- | ------ | ---------- |"
        )
    else:
        lines.append(f"| METRIC | {current_label} | {previous_label} | CHANGE |")
        lines.append("| ------ | ------------- | ----------------------- | ------ |")

    curr_study_total = _metric_float_or(current_metrics, "study_total_minutes", 0.0)
    prev_study_total = _metric_float_or(previous_metrics, "study_total_minutes", 0.0)
    curr_days_for_avg = _metric_int_or(
        current_metrics, "days_up_to_today", 0
    ) or _metric_int_or(
        current_metrics,
        "total_days",
        7,
    )
    prev_days_for_avg = _metric_int_or(
        previous_metrics,
        "days_up_to_today",
        0,
    ) or _metric_int_or(previous_metrics, "total_days", 7)
    prev_total_days = _metric_int_or(previous_metrics, "total_days", 7)

    curr_study_avg_mins = compute_pace(curr_study_total, curr_days_for_avg)
    curr_study_avg = format_minutes(curr_study_avg_mins, always_show_both=True) + "/day"
    prev_study_avg_mins = compute_pace(prev_study_total, prev_days_for_avg)
    prev_study_avg = format_minutes(prev_study_avg_mins, always_show_both=True) + "/day"

    ma_study_str = "—"
    ma_study_minutes = (
        _metric_float(ma_metrics, "study_avg_minutes") if ma_metrics else None
    )
    if show_ma and ma_study_minutes is not None:
        ma_study_str = format_minutes(ma_study_minutes, always_show_both=True) + "/day"

    study_pct_str = format_summary_change_label(
        curr_study_avg_mins, prev_study_avg_mins
    )

    _append_summary_row(
        lines,
        show_ma=show_ma,
        metric_label="STUDY",
        current=curr_study_avg,
        previous=prev_study_avg,
        change=study_pct_str,
        ma_value=ma_study_str,
    )

    curr_sleep_avg = _metric_float(current_metrics, "sleep_avg_minutes")
    prev_sleep_avg = _metric_float(previous_metrics, "sleep_avg_minutes")
    curr_sleep = _format_optional_minutes_per_night(curr_sleep_avg)
    prev_sleep = _format_optional_minutes_per_night(prev_sleep_avg)

    ma_sleep_str = "—"
    ma_sleep_avg = (
        _metric_float(ma_metrics, "sleep_avg_minutes") if ma_metrics else None
    )
    if show_ma and ma_sleep_avg is not None:
        ma_sleep_str = format_minutes(ma_sleep_avg, always_show_both=True) + "/night"

    sleep_pct_str = format_summary_change_label(curr_sleep_avg, prev_sleep_avg)

    _append_summary_row(
        lines,
        show_ma=show_ma,
        metric_label="SLEEP",
        current=curr_sleep,
        previous=prev_sleep,
        change=sleep_pct_str,
        ma_value=ma_sleep_str,
    )

    curr_meditation_count = _metric_int_or(current_metrics, "meditation_count", 0)
    prev_meditation_count = _metric_int_or(previous_metrics, "meditation_count", 0)
    curr_meditation = format_training_ratio(curr_meditation_count, curr_days_for_avg)
    prev_meditation = format_training_ratio(prev_meditation_count, prev_total_days)

    ma_meditation_str = "—"
    ma_meditation_avg = (
        _metric_float(ma_metrics, "meditation_avg") if ma_metrics else None
    )
    if show_ma and ma_meditation_avg is not None:
        ma_meditation_str = format_ma_training_ratio(
            ma_meditation_avg, ma_training_unit
        )

    curr_meditation_rate = compute_pace(curr_meditation_count, curr_days_for_avg)
    prev_meditation_rate = compute_pace(prev_meditation_count, prev_days_for_avg)
    meditation_pct_str = format_summary_change_label(
        curr_meditation_rate, prev_meditation_rate
    )

    _append_summary_row(
        lines,
        show_ma=show_ma,
        metric_label="MEDITATION",
        current=curr_meditation,
        previous=prev_meditation,
        change=meditation_pct_str,
        ma_value=ma_meditation_str,
    )

    curr_workout_count = _metric_int_or(current_metrics, "workout_count", 0)
    prev_workout_count = _metric_int_or(previous_metrics, "workout_count", 0)
    curr_workout = format_training_ratio(curr_workout_count, curr_days_for_avg)
    prev_workout = format_training_ratio(prev_workout_count, prev_total_days)

    ma_workout_str = "—"
    ma_workout_avg = _metric_float(ma_metrics, "workout_avg") if ma_metrics else None
    if show_ma and ma_workout_avg is not None:
        ma_workout_str = format_ma_training_ratio(ma_workout_avg, ma_training_unit)

    curr_workout_rate = compute_pace(curr_workout_count, curr_days_for_avg)
    prev_workout_rate = compute_pace(prev_workout_count, prev_days_for_avg)
    workout_pct_str = format_summary_change_label(curr_workout_rate, prev_workout_rate)

    _append_summary_row(
        lines,
        show_ma=show_ma,
        metric_label="WORKOUT",
        current=curr_workout,
        previous=prev_workout,
        change=workout_pct_str,
        ma_value=ma_workout_str,
    )

    curr_stretch_count = _metric_int_or(current_metrics, "stretch_count", 0)
    prev_stretch_count = _metric_int_or(previous_metrics, "stretch_count", 0)
    curr_stretch = format_training_ratio(curr_stretch_count, curr_days_for_avg)
    prev_stretch = format_training_ratio(prev_stretch_count, prev_total_days)

    ma_stretch_str = "—"
    ma_stretch_avg = _metric_float(ma_metrics, "stretch_avg") if ma_metrics else None
    if show_ma and ma_stretch_avg is not None:
        ma_stretch_str = format_ma_training_ratio(ma_stretch_avg, ma_training_unit)

    curr_stretch_rate = compute_pace(curr_stretch_count, curr_days_for_avg)
    prev_stretch_rate = compute_pace(prev_stretch_count, prev_days_for_avg)
    stretch_pct_str = format_summary_change_label(curr_stretch_rate, prev_stretch_rate)

    _append_summary_row(
        lines,
        show_ma=show_ma,
        metric_label="STRETCH",
        current=curr_stretch,
        previous=prev_stretch,
        change=stretch_pct_str,
        ma_value=ma_stretch_str,
    )

    lines.append("")
    return lines
