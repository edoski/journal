"""
Shared section assembly helpers for weekly/monthly/quarterly/yearly notes.
"""

from __future__ import annotations

import datetime
from typing import Any

from sync.periods.media import build_media_section
from sync.metrics import (
    aggregate_interrupt_overrun,
    aggregate_training_type_session_stats,
)
from sync.notes.sections import trim_blank_lines
from sync.writers.charts import render_waterfall_chart, wrap_code_block
from sync.writers.tables import (
    render_interrupts_table,
    render_summary_table,
    render_training_type_sessions_table,
)


def append_summary_section(
    sections: list[list[str]],
    current_metrics: dict[str, Any],
    prev_metrics: dict[str, Any],
    current_label: str,
    prev_label: str,
    *,
    ma_metrics: dict[str, Any] | None,
    ma_label: str | None,
    ma_training_unit: str,
    period_type: str,
    total_days: int,
) -> None:
    """Render and append the SUMMARY section."""
    summary_lines = render_summary_table(
        current_metrics,
        prev_metrics,
        current_label,
        prev_label,
        ma_metrics=ma_metrics,
        ma_label=ma_label,
        ma_training_unit=ma_training_unit,
        period_type=period_type,
        total_days=total_days,
    )
    sections.append(trim_blank_lines(summary_lines))


def append_interrupts_table(
    study_lines: list[str],
    dates: list[datetime.date],
    daily_data: dict[datetime.date, dict[str, Any]],
) -> None:
    """Render and append INTERRUPTS/OVERRUNS rows to an existing STUDY section."""
    total_interrupts, total_overruns, study_day_count = aggregate_interrupt_overrun(
        dates, daily_data
    )
    avg_interrupts = total_interrupts / max(1, study_day_count)
    avg_overruns = total_overruns / max(1, study_day_count)
    study_lines.extend(render_interrupts_table(avg_interrupts, avg_overruns))
    study_lines.append("")


def append_training_type_table(
    training_lines: list[str],
    dates: list[datetime.date],
    daily_data: dict[datetime.date, dict[str, Any]],
) -> None:
    """Render and append the TYPE/SESSIONS/AVERAGE table to TRAINING section lines."""
    training_stats = aggregate_training_type_session_stats(dates, daily_data)
    training_lines.extend(render_training_type_sessions_table(training_stats))
    training_lines.append("")


def build_procrastination_section(
    screen_time_totals: dict[str, float],
    trend_lines: list[str],
) -> list[str]:
    """
    Build the shared PROCRASTINATION section scaffold.

    Returns an empty list when there is no screen-time data.
    """
    if not screen_time_totals:
        return []

    procrastination_lines = ["### **PROCRASTINATION**"]
    waterfall_lines = render_waterfall_chart(screen_time_totals)
    chart_body = [line for line in waterfall_lines if not line.startswith("### ")]
    procrastination_lines.extend(wrap_code_block(chart_body))
    procrastination_lines.append("")
    procrastination_lines.extend(trend_lines)
    return procrastination_lines


def append_media_section(
    sections: list[list[str]],
    start_date: datetime.date,
    end_date: datetime.date,
    period_type: str,
) -> None:
    """Render and append MEDIA section lines for the period."""
    media_lines = build_media_section(start_date, end_date, period_type)
    sections.append(trim_blank_lines(media_lines))
