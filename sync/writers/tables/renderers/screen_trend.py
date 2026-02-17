"""Renderer for period screen-time trend markdown tables."""

from __future__ import annotations

import datetime

from sync.constants import DAYS
from sync.dates import daterange
from sync.formatting import format_minutes

from ..layout import render_simple_grid_table
from ..specs import ScreenTrendMode, ScreenTrendTableSpec


def _daily_rows(spec: ScreenTrendTableSpec) -> list[list[str]]:
    rows: list[list[str]] = []
    dates = list(spec.dates or [])
    daily_data = spec.daily_data
    today = datetime.date.today()

    total_minutes = 0.0
    for idx, day in enumerate(dates):
        if spec.period_label == "DAY" and idx < len(DAYS):
            day_name = DAYS[idx]
        else:
            day_name = day.strftime("%a").upper()

        label = f"**[[{day.isoformat()}\\|{day_name}]]**"
        data = daily_data.get(day, {})
        screen_time = data.get("screen_time_totals", {})
        day_total = sum(screen_time.values()) if screen_time else 0

        if day > today:
            duration_str = "—"
        elif day_total > 0:
            duration_str = f"`+{format_minutes(day_total)}`"
            total_minutes += day_total
        else:
            duration_str = "`0m`"

        rows.append([label, duration_str])

    if spec.include_total_row:
        total_str = f"`{format_minutes(total_minutes)}`" if total_minutes else "`0m`"
        rows.append(["**TOTAL**", f"**{total_str}**"])

    return rows


def _period_rows(spec: ScreenTrendTableSpec) -> list[list[str]]:
    rows: list[list[str]] = []
    period_ranges = list(spec.period_ranges or [])
    daily_data = spec.daily_data
    labels = list(spec.labels or [])
    wikilinks = list(spec.wikilinks or [])
    today = datetime.date.today()

    total_minutes = 0.0
    for idx, (start, end) in enumerate(period_ranges):
        if idx < len(wikilinks):
            display_label = wikilinks[idx]
        elif idx < len(labels):
            display_label = labels[idx]
        else:
            display_label = (
                f"W{idx + 1}" if spec.period_label == "WEEK" else f"M{idx + 1}"
            )

        period_total = 0.0
        for day in daterange(start, end):
            data = daily_data.get(day, {})
            screen_time = data.get("screen_time_totals", {})
            period_total += sum(screen_time.values()) if screen_time else 0

        if start > today:
            duration_str = "—"
        elif period_total > 0:
            duration_str = f"`+{format_minutes(period_total)}`"
            total_minutes += period_total
        else:
            duration_str = "`0m`"

        rows.append([f"**{display_label}**", duration_str])

    if spec.include_total_row:
        total_str = f"`{format_minutes(total_minutes)}`" if total_minutes else "`0m`"
        rows.append(["**TOTAL**", f"**{total_str}**"])

    return rows


def render_screen_trend(spec: ScreenTrendTableSpec) -> list[str]:
    """Render period screen-time trend table."""
    headers = [spec.period_label, "SCREEN"]
    divider_cells = ["-----", "--------"]
    if spec.mode is ScreenTrendMode.DAILY:
        rows = _daily_rows(spec)
    else:
        rows = _period_rows(spec)
    return render_simple_grid_table(headers, rows, divider_cells=divider_cells)
