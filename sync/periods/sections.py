"""
Shared section assembly helpers for weekly/monthly/quarterly/yearly notes.
"""

from __future__ import annotations

import datetime
from typing import cast

from sync.contracts.media import MediaBundle
from sync.contracts.metrics import (
    DailyAggregate,
    MetricValue,
    MovingAverageAggregate,
    PeriodAggregate,
)
from sync.contracts.targets import PeriodType
from sync.formatting import format_minutes
from sync.metrics import (
    aggregate_interrupt_overrun,
    aggregate_training_type_session_stats,
)
from sync.notes.sections import trim_blank_lines
from sync.writers.charts import WaterfallSpec, render_chart
from sync.writers.tables import (
    SimpleGridTableSpec,
    SummaryMetricsTableSpec,
    render_table,
)


def append_summary_section(
    sections: list[list[str]],
    current_metrics: PeriodAggregate,
    prev_metrics: PeriodAggregate,
    current_label: str,
    prev_label: str,
    study_target_minutes: int | None,
    *,
    ma_metrics: MovingAverageAggregate | None,
    ma_label: str | None,
    ma_training_unit: str,
    period_type: PeriodType,
    total_days: int,
) -> None:
    """Render and append the SUMMARY section."""
    current_metrics_map = cast(dict[str, MetricValue], dict(current_metrics))
    previous_metrics_map = cast(dict[str, MetricValue], dict(prev_metrics))
    ma_metrics_map = (
        cast(dict[str, MetricValue], dict(ma_metrics))
        if ma_metrics is not None
        else None
    )

    summary_lines = render_table(
        SummaryMetricsTableSpec(
            current_metrics=current_metrics_map,
            previous_metrics=previous_metrics_map,
            current_label=current_label,
            previous_label=prev_label,
            study_target_minutes=study_target_minutes,
            ma_metrics=ma_metrics_map,
            ma_label=ma_label,
            ma_training_unit=ma_training_unit,
            period_type=period_type,
            total_days=total_days,
        )
    )
    sections.append(trim_blank_lines(summary_lines))


def append_interrupts_table(
    study_lines: list[str],
    dates: list[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
) -> None:
    """Render and append INTERRUPTS/OVERRUNS rows to an existing STUDY section."""
    total_interrupts, total_overruns, study_day_count = aggregate_interrupt_overrun(
        dates, daily_data
    )
    avg_interrupts = total_interrupts / max(1, study_day_count)
    avg_overruns = total_overruns / max(1, study_day_count)

    table_lines = render_table(
        SimpleGridTableSpec(
            headers=["METRIC", "AVERAGE"],
            divider_cells=["------", "-------"],
            rows=[
                [
                    "**INTERRUPTS**",
                    f"`{format_minutes(avg_interrupts, always_show_both=True)}/day`",
                ],
                [
                    "**OVERRUNS**  ",
                    f"`{format_minutes(avg_overruns, always_show_both=True)}/day`",
                ],
            ],
        )
    )
    study_lines.extend(table_lines)
    study_lines.append("")


def append_training_type_table(
    training_lines: list[str],
    dates: list[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
) -> None:
    """Render and append the TYPE/SESSIONS/DURATION/SCHEDULE table."""
    training_stats = aggregate_training_type_session_stats(dates, daily_data)

    rows: list[list[str]] = []
    if training_stats:
        for row in training_stats:
            label = row["type"].strip()
            sessions = int(row["sessions"])
            target = int(row["target"])
            avg_minutes = float(row["average_minutes"])
            avg_label = f"{format_minutes(avg_minutes, pad_minutes=True)}/session"
            schedule_label = f"{row['average_start_time']} - {row['average_end_time']}"
            rows.append(
                [
                    f"**{label}**",
                    f"`{sessions}/{target}`",
                    f"`{avg_label}`",
                    f"`{schedule_label}`",
                ]
            )
    else:
        rows.append(["", "", "", ""])

    table_lines = render_table(
        SimpleGridTableSpec(
            headers=["TYPE", "SESSIONS", "DURATION", "SCHEDULE"],
            divider_cells=["----", "--------", "--------", "--------"],
            rows=rows,
        )
    )
    training_lines.extend(table_lines)
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
    waterfall_lines = render_chart(WaterfallSpec(app_totals=screen_time_totals))
    procrastination_lines.extend(waterfall_lines)
    procrastination_lines.append("")
    procrastination_lines.extend(trend_lines)
    return procrastination_lines


def append_media_section(
    sections: list[list[str]],
    media_bundle: MediaBundle,
) -> None:
    """Render and append MEDIA section lines for the period."""
    if not media_bundle.books and not media_bundle.podcasts:
        return

    rows: list[list[str]] = []
    for book in media_bundle.books:
        rows.append(["**BOOK**", f"[[{book.title}]]", f"`{book.completed:%Y-%m-%d}`"])
    for podcast in media_bundle.podcasts:
        rows.append(
            ["**PODCAST**", f"[[{podcast.title}]]", f"`{podcast.date:%Y-%m-%d}`"]
        )

    media_lines: list[str] = ["### **MEDIA**", ""]
    media_lines.extend(
        render_table(
            SimpleGridTableSpec(
                headers=["TYPE", "TITLE", "DATE"],
                divider_cells=["----", "-----", "----"],
                rows=rows,
            )
        )
    )
    media_lines.append("")
    sections.append(trim_blank_lines(media_lines))
