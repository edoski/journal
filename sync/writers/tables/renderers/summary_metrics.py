"""Renderer for period summary metrics table section."""

from __future__ import annotations

from collections.abc import Mapping

from sync.constants import RENDER
from sync.contracts.metrics import MetricValue
from sync.formatting import (
    compute_pace,
    format_ma_training_ratio,
    format_summary_change_label,
    format_minutes,
    format_mood_with_scale,
    format_progress_bar,
    format_training_ratio,
)
from sync.target_policy import study_target_label as format_study_target_label
from sync.target_policy import summary_targets

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
    target: str,
    progress: str,
    ma_value: str = "—",
) -> None:
    if show_ma:
        lines.append(
            f"| **{metric_label}** | `{current}` | `{previous}` | `{change}` | `{ma_value}` | `{target}` | {progress} |"
        )
        return
    lines.append(
        f"| **{metric_label}** | `{current}` | `{previous}` | `{change}` | `{target}` | {progress} |"
    )


def _format_progress_cell(value: float, target: float) -> str:
    """Render summary-table progress as one inline code span."""
    bar, progress_pct = format_progress_bar(
        value,
        target,
        RENDER.progress_bar_width,
        RENDER.progress_filled,
        RENDER.progress_empty,
    )
    return f"`{bar} {progress_pct}%`"


def render_summary_metrics(spec: SummaryMetricsTableSpec) -> list[str]:
    """Render markdown summary section and table."""
    current_metrics = spec.current_metrics
    previous_metrics = spec.previous_metrics
    current_label = spec.current_label
    previous_label = spec.previous_label
    ma_metrics = spec.ma_metrics
    ma_label = spec.ma_label
    ma_training_unit = spec.ma_training_unit
    period_type = spec.period_type
    total_days = spec.total_days
    study_target_minutes = spec.study_target_minutes

    lines = ["### **SUMMARY**", ""]

    show_ma = ma_metrics is not None and ma_label is not None

    targets = summary_targets(period_type, total_days)
    sleep_target_minutes = targets.sleep_minutes
    meditation_target = targets.training.meditation
    workout_target = targets.training.workout
    stretch_target = targets.training.stretch
    mood_target = targets.mood

    study_target_label = format_study_target_label(period_type, study_target_minutes)
    sleep_target_label = targets.sleep_label
    mood_target_label = targets.mood_label
    meditation_target_label = targets.training.meditation_label
    workout_target_label = targets.training.workout_label
    stretch_target_label = targets.training.stretch_label

    if show_ma:
        lines.append(
            f"| METRIC | {current_label} | {previous_label} | CHANGE | {ma_label} | TARGET | PROGRESS |"
        )
        lines.append(
            "| ------ | ------------- | ----------------------- | ------ | ---------- | ------ | -------- |"
        )
    else:
        lines.append(
            f"| METRIC | {current_label} | {previous_label} | CHANGE | TARGET | PROGRESS |"
        )
        lines.append(
            "| ------ | ------------- | ----------------------- | ------ | ------ | -------- |"
        )

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

    if study_target_minutes is None:
        study_progress_cell = "`—`"
    else:
        study_progress_cell = _format_progress_cell(
            curr_study_total,
            float(study_target_minutes),
        )

    _append_summary_row(
        lines,
        show_ma=show_ma,
        metric_label="STUDY",
        current=curr_study_avg,
        previous=prev_study_avg,
        change=study_pct_str,
        ma_value=ma_study_str,
        target=study_target_label,
        progress=study_progress_cell,
    )

    curr_sleep_avg = _metric_float_or(current_metrics, "sleep_avg_minutes", 0.0)
    prev_sleep_avg = _metric_float_or(previous_metrics, "sleep_avg_minutes", 0.0)
    curr_sleep = format_minutes(curr_sleep_avg, always_show_both=True) + "/night"
    prev_sleep = format_minutes(prev_sleep_avg, always_show_both=True) + "/night"

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
        target=sleep_target_label,
        progress=_format_progress_cell(curr_sleep_avg, sleep_target_minutes),
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
        target=meditation_target_label,
        progress=_format_progress_cell(curr_meditation_count, meditation_target),
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
        target=workout_target_label,
        progress=_format_progress_cell(curr_workout_count, workout_target),
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
        target=stretch_target_label,
        progress=_format_progress_cell(curr_stretch_count, stretch_target),
    )

    curr_mood_avg = _metric_float_or(current_metrics, "mood_avg", 0.0)
    prev_mood_avg = _metric_float_or(previous_metrics, "mood_avg", 0.0)
    curr_mood = format_mood_with_scale(curr_mood_avg)
    prev_mood = format_mood_with_scale(prev_mood_avg)

    ma_mood_str = "—"
    ma_mood_avg = _metric_float(ma_metrics, "mood_avg") if ma_metrics else None
    if show_ma and ma_mood_avg is not None:
        ma_mood_str = format_mood_with_scale(ma_mood_avg)

    mood_pct_str = format_summary_change_label(curr_mood_avg, prev_mood_avg)

    _append_summary_row(
        lines,
        show_ma=show_ma,
        metric_label="MOOD",
        current=curr_mood,
        previous=prev_mood,
        change=mood_pct_str,
        ma_value=ma_mood_str,
        target=mood_target_label,
        progress=_format_progress_cell(curr_mood_avg, mood_target),
    )

    lines.append("")
    return lines
