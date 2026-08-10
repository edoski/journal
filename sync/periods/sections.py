"""
Shared section assembly helpers for weekly/monthly/yearly notes.
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
from sync.formatting import format_minutes
from sync.metrics import aggregate_training_type_session_stats
from sync.notes.sections import trim_blank_lines
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
    *,
    ma_metrics: MovingAverageAggregate | None,
    ma_label: str | None,
    ma_training_unit: str,
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
            ma_metrics=ma_metrics_map,
            ma_label=ma_label,
            ma_training_unit=ma_training_unit,
        )
    )
    sections.append(trim_blank_lines(summary_lines))


def append_training_type_table(
    training_lines: list[str],
    dates: list[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
) -> None:
    """Render and append the TIME/ACTIVITY/DURATION/INTERRUPT table."""
    training_stats = aggregate_training_type_session_stats(dates, daily_data)
    if not training_stats:
        return

    rows: list[list[str]] = []
    for row in training_stats:
        label = row["type"].strip()
        avg_minutes = float(row["average_minutes"])
        avg_label = f"{format_minutes(avg_minutes, pad_minutes=True)}/session"
        interrupt_minutes = float(row["average_interrupt_minutes"])
        interrupt_label = f"+{format_minutes(interrupt_minutes, pad_minutes=True)}"
        start, end = row["schedule_range"]
        schedule_label = f"{start} - {end}"
        rows.append(
            [
                f"`{schedule_label}`",
                label,
                f"`{avg_label}`",
                f"`{interrupt_label}/session`",
            ]
        )

    table_lines = render_table(
        SimpleGridTableSpec(
            headers=["TIME", "ACTIVITY", "DURATION", "INTERRUPT"],
            divider_cells=["----", "--------", "--------", "---------"],
            rows=rows,
        )
    )
    training_lines.extend(table_lines)
    training_lines.append("")


def append_media_section(
    sections: list[list[str]],
    media_bundle: MediaBundle,
) -> None:
    """Render and append MEDIA section lines for the period."""
    if not media_bundle.items:
        return

    rows = [
        [f"**{item.kind}**", f"[[{item.title}]]", f"`{item.date:%Y-%m-%d}`"]
        for item in media_bundle.items
    ]

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
