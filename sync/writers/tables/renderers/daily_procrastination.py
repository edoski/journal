"""Renderer for daily procrastination section table."""

from __future__ import annotations

from sync.formatting import format_minutes

from ..layout import render_simple_grid_table
from ..specs import DailyProcrastinationTableSpec


def render_daily_procrastination(spec: DailyProcrastinationTableSpec) -> list[str]:
    """Render daily procrastination section lines."""
    lines: list[str] = []
    if spec.include_section_title:
        lines.append("### **PROCRASTINATION**")

    screen_time_data = spec.screen_time_data
    deviation_data = spec.deviation_data

    if not screen_time_data:
        lines.append("")
        lines.append("_No screen time data available._")
        return lines

    total_deviation = deviation_data.total_minutes if deviation_data else 0.0
    screen_total = screen_time_data.total_minutes
    non_phone_deviation = max(0.0, total_deviation - screen_total)

    if not screen_time_data.entries and non_phone_deviation == 0:
        lines.append("")
        lines.extend(
            render_simple_grid_table(
                headers=["SOURCE      ", "DURATION    "],
                rows=[["**TOTAL**", "**`+0m`**"]],
                divider_cells=["-----------", "-----------"],
            )
        )
        return lines

    rows: list[list[str]] = []
    sortable_rows: list[tuple[str, float]] = []

    for entry in screen_time_data.entries:
        sortable_rows.append((entry.app, entry.minutes))

    if non_phone_deviation > 0:
        sortable_rows.append(("DEVIATIONS", non_phone_deviation))

    sortable_rows.sort(key=lambda item: item[1], reverse=True)

    for name, minutes in sortable_rows:
        rows.append([name, f"`+{format_minutes(minutes)}`"])

    total_minutes = screen_total + non_phone_deviation
    rows.append(["**TOTAL**", f"**`{format_minutes(total_minutes)}`**"])

    lines.append("")
    lines.extend(
        render_simple_grid_table(
            headers=["SOURCE      ", "DURATION    "],
            rows=rows,
            divider_cells=["-----------", "-----------"],
        )
    )
    return lines
