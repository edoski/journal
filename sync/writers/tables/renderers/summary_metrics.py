"""Renderer for period summary metrics table section."""

from __future__ import annotations

from sync.contracts.finance import SpentSummary
from sync.formatting import (
    compute_pace,
    format_eur_whole,
    format_ma_training_ratio,
    format_minutes,
    format_training_ratio,
)

from ..specs import SummaryMetricsTableSpec


def _append_summary_row(
    lines: list[str],
    *,
    show_ma: bool,
    metric_label: str,
    current: str,
    previous: str,
    ma_value: str = "—",
) -> None:
    if show_ma:
        lines.append(
            f"| **{metric_label}** | `{current}` | `{previous}` | `{ma_value}` |"
        )
        return
    lines.append(f"| **{metric_label}** | `{current}` | `{previous}` |")


def _format_optional_minutes(value: float | None) -> str:
    if value is None:
        return "—"
    return format_minutes(value, always_show_both=True)


def _append_spent_row(lines: list[str], spent: SpentSummary, *, show_ma: bool) -> None:
    def amount(cents: int | None) -> str:
        return "—" if cents is None else format_eur_whole(cents)

    average = (
        "—"
        if spent.average_cents is None
        else f"{format_eur_whole(spent.average_cents)}/{spent.average_unit}"
    )
    _append_summary_row(
        lines,
        show_ma=show_ma,
        metric_label="SPENT",
        current=amount(spent.current_cents),
        previous=amount(spent.previous_cents),
        ma_value=average,
    )


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
        lines.append(f"| METRIC | {current_label} | {previous_label} | {ma_label} |")
        lines.append(
            "| ------ | ------------- | ----------------------- | ---------- |"
        )
    else:
        lines.append(f"| METRIC | {current_label} | {previous_label} |")
        lines.append("| ------ | ------------- | ----------------------- |")

    curr_study_total = current_metrics["study_total_minutes"]
    prev_study_total = previous_metrics["study_total_minutes"]
    curr_days_for_avg = (
        current_metrics["days_up_to_today"] or current_metrics["total_days"]
    )
    prev_days_for_avg = (
        previous_metrics["days_up_to_today"] or previous_metrics["total_days"]
    )
    prev_total_days = previous_metrics["total_days"]

    curr_study_avg_mins = compute_pace(curr_study_total, curr_days_for_avg)
    curr_study_avg = format_minutes(curr_study_avg_mins, always_show_both=True) + "/day"
    prev_study_avg_mins = compute_pace(prev_study_total, prev_days_for_avg)
    prev_study_avg = format_minutes(prev_study_avg_mins, always_show_both=True) + "/day"

    ma_study_str = "—"
    ma_study_minutes = ma_metrics["study_avg_minutes"] if ma_metrics else None
    if show_ma and ma_study_minutes is not None:
        ma_study_str = format_minutes(ma_study_minutes, always_show_both=True) + "/day"

    _append_summary_row(
        lines,
        show_ma=show_ma,
        metric_label="STUDY",
        current=curr_study_avg,
        previous=prev_study_avg,
        ma_value=ma_study_str,
    )

    curr_sleep_avg = current_metrics["sleep_avg_minutes"]
    prev_sleep_avg = previous_metrics["sleep_avg_minutes"]
    curr_sleep = _format_optional_minutes(curr_sleep_avg)
    prev_sleep = _format_optional_minutes(prev_sleep_avg)

    ma_sleep_str = "—"
    ma_sleep_avg = ma_metrics["sleep_avg_minutes"] if ma_metrics else None
    if show_ma and ma_sleep_avg is not None:
        ma_sleep_str = format_minutes(ma_sleep_avg, always_show_both=True)

    _append_summary_row(
        lines,
        show_ma=show_ma,
        metric_label="SLEEP",
        current=curr_sleep,
        previous=prev_sleep,
        ma_value=ma_sleep_str,
    )

    curr_workout_count = current_metrics["workout_count"]
    prev_workout_count = previous_metrics["workout_count"]
    curr_workout = format_training_ratio(curr_workout_count, curr_days_for_avg)
    prev_workout = format_training_ratio(prev_workout_count, prev_total_days)

    ma_workout_str = "—"
    ma_workout_avg = ma_metrics["workout_avg"] if ma_metrics else None
    if show_ma and ma_workout_avg is not None:
        ma_workout_str = format_ma_training_ratio(ma_workout_avg, ma_training_unit)

    _append_summary_row(
        lines,
        show_ma=show_ma,
        metric_label="WORKOUT",
        current=curr_workout,
        previous=prev_workout,
        ma_value=ma_workout_str,
    )

    curr_stretch_count = current_metrics["stretch_count"]
    prev_stretch_count = previous_metrics["stretch_count"]
    curr_stretch = format_training_ratio(curr_stretch_count, curr_days_for_avg)
    prev_stretch = format_training_ratio(prev_stretch_count, prev_total_days)

    ma_stretch_str = "—"
    ma_stretch_avg = ma_metrics["stretch_avg"] if ma_metrics else None
    if show_ma and ma_stretch_avg is not None:
        ma_stretch_str = format_ma_training_ratio(ma_stretch_avg, ma_training_unit)

    _append_summary_row(
        lines,
        show_ma=show_ma,
        metric_label="STRETCH",
        current=curr_stretch,
        previous=prev_stretch,
        ma_value=ma_stretch_str,
    )

    if spec.spent is not None:
        _append_spent_row(lines, spec.spent, show_ma=show_ma)

    lines.append("")
    return lines
