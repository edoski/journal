"""Grouped symbol-grid chart renderers."""

from __future__ import annotations

import datetime

from sync.constants import DAYS, RENDER, STUDY_TARGET_MIN
from sync.dates import daterange, format_week_label

from ..grid import GridRowBuilder
from ..specs import (
    MonthlyStudyGridSpec,
    MonthlyTrainingGridSpec,
    WeeklyStudyGridSpec,
    WeeklyTrainingGridSpec,
)


def _study_intensity_symbol(minutes: float | None) -> str:
    mins = minutes or 0
    return (
        RENDER.study_symbol_deep
        if mins >= STUDY_TARGET_MIN
        else RENDER.study_symbol_none
    )


def render_weekly_study_grid(spec: WeeklyStudyGridSpec) -> list[str]:
    """Render weekly full-study-days grouped grid body."""
    dates = list(spec.dates)
    daily_data = spec.daily_data
    current_date = spec.current_date

    lines: list[str] = []
    today = datetime.date.today()

    met_symbol = "███"
    none_symbol = "░░░"

    study_symbols: list[str] = []
    for day in dates:
        minutes = daily_data.get(day, {}).get("study_minutes")
        if day > today:
            study_symbols.append(none_symbol)
        else:
            study_symbols.append(
                met_symbol if minutes and minutes >= STUDY_TARGET_MIN else none_symbol
            )

    study_done = sum(1 for sym in study_symbols if sym == met_symbol)
    study_total = len(dates)

    lines.append("┌ FULL STUDY DAYS")

    if current_date and dates and dates[0] <= current_date <= dates[-1]:
        day_idx = (current_date - dates[0]).days
        day_idx = max(0, min(day_idx, len(dates) - 1))
        arrow_col = 3 + day_idx * 4
        arrow_line = [" "] * (4 + len(study_symbols) * 4)
        arrow_line[0] = "│"
        if arrow_col < len(arrow_line):
            arrow_line[arrow_col] = "↓"
        lines.append("".join(arrow_line).rstrip())
    else:
        lines.append("│")

    lines.append("│ " + " ".join(study_symbols) + f"   ({study_done}/{study_total})")
    lines.append("│ " + " ".join(["───"] * 7))
    lines.append("└ " + " ".join(DAYS))
    lines.append("")
    lines.append(RENDER.study_legend.replace("█", "███").replace("·", "░░░"))
    return lines


def render_monthly_study_grid(spec: MonthlyStudyGridSpec) -> list[str]:
    """Render monthly full-study-days grouped grid body."""
    week_ranges = list(spec.week_ranges)
    daily_data = spec.daily_data
    current_date = spec.current_date
    delta_labels = list(spec.delta_labels) if spec.delta_labels else None

    lines: list[str] = []
    today = datetime.date.today()

    symbols: list[str] = []
    week_labels: list[str] = []
    week_day_counts: list[int] = []
    total_done = 0
    total_elapsed = 0

    for start, end in week_ranges:
        week_days = list(daterange(start, end))
        week_day_counts.append(len(week_days))
        week_labels.append(format_week_label(start, end))

        for day in week_days:
            if day > today:
                symbols.append(RENDER.study_symbol_none)
            else:
                symbol = _study_intensity_symbol(
                    daily_data.get(day, {}).get("study_minutes")
                )
                symbols.append(symbol)
                total_elapsed += 1
                if symbol == RENDER.study_symbol_deep:
                    total_done += 1

    max_days = max(week_day_counts) if week_day_counts else 0
    week_width = max_days * 2 - 1 if max_days > 0 else 0

    grid = GridRowBuilder(
        week_day_counts=week_day_counts,
        week_width=week_width,
        week_labels=week_labels,
    )

    arrow_col = None
    if current_date:
        for w_idx, (start, end) in enumerate(week_ranges):
            if start <= current_date <= end:
                day_idx = (current_date - start).days
                day_idx = min(day_idx, max(week_day_counts[w_idx] - 1, 0))
                arrow_col = len("│ ") + w_idx * (week_width + 3) + day_idx * 2
                break

    symbol_row = grid.build_symbol_row(symbols)
    separator_row = grid.build_separator_row()
    label_row = grid.build_label_row()
    delta_row = grid.build_delta_row(delta_labels)
    max_width = max(
        len(symbol_row),
        len(separator_row),
        len(label_row),
        len(delta_row) if delta_row else 0,
    )

    header_suffix = (
        f" ({total_done:02d}/{total_elapsed:02d})" if total_elapsed else " (00/00)"
    )
    lines.append(f"┌ FULL STUDY DAYS{header_suffix}")
    if arrow_col is not None:
        arrow_line = [" "] * max_width
        arrow_line[0] = "│"
        if arrow_col < max_width:
            arrow_line[arrow_col] = "↓"
        lines.append("".join(arrow_line).rstrip())
    else:
        lines.append("│")

    lines.append(symbol_row)
    lines.append(separator_row)
    lines.append(label_row)
    if delta_row:
        lines.append(delta_row.replace("│ ", "└ ", 1))
    else:
        lines.append("└")
    lines.append("")
    lines.append(RENDER.study_legend)
    return lines


def render_monthly_training_grid(spec: MonthlyTrainingGridSpec) -> list[str]:
    """Render monthly training grouped grid body."""
    week_ranges = list(spec.week_ranges)
    daily_data = spec.daily_data
    current_date = spec.current_date
    mindful_delta_labels = (
        list(spec.mindful_delta_labels) if spec.mindful_delta_labels else None
    )
    workout_delta_labels = (
        list(spec.workout_delta_labels) if spec.workout_delta_labels else None
    )
    stretch_delta_labels = (
        list(spec.stretch_delta_labels) if spec.stretch_delta_labels else None
    )

    _ = spec.mindful_count, spec.workout_count, spec.stretch_count, spec.days_in_period

    lines: list[str] = []

    mindful_symbols: list[str] = []
    workout_symbols: list[str] = []
    stretch_symbols: list[str] = []
    week_labels: list[str] = []
    week_day_counts: list[int] = []

    for start, end in week_ranges:
        week_days = list(daterange(start, end))
        week_day_counts.append(len(week_days))
        week_labels.append(format_week_label(start, end))

        for day in week_days:
            entry = daily_data.get(day, {})
            mindful_symbols.append("■" if entry.get("meditate") else "·")
            workout_symbols.append("■" if entry.get("workout") else "·")
            stretch_symbols.append("■" if entry.get("stretch") else "·")

    max_days = max(week_day_counts) if week_day_counts else 0
    week_width = max_days * 2 - 1 if max_days > 0 else 0

    grid = GridRowBuilder(
        week_day_counts=week_day_counts,
        week_width=week_width,
        week_labels=week_labels,
    )

    arrow_col = None
    if current_date:
        for w_idx, (start, end) in enumerate(week_ranges):
            if start <= current_date <= end:
                day_idx = (current_date - start).days
                day_idx = min(day_idx, max(week_day_counts[w_idx] - 1, 0))
                arrow_col = len("│ ") + w_idx * (week_width + 3) + day_idx * 2
                break

    def _build_activity_block(
        title: str, symbols: list[str], deltas: list[str] | None
    ) -> list[str]:
        symbol_row = grid.build_symbol_row(symbols)
        separator_row = grid.build_separator_row()
        label_row = grid.build_label_row()
        delta_row = grid.build_delta_row(deltas, prefix="└ ")

        max_width = max(
            len(symbol_row),
            len(separator_row),
            len(label_row),
            len(delta_row) if delta_row else 0,
        )

        block = [f"┌ {title}"]
        if arrow_col is not None:
            arrow_line = [" "] * max_width
            arrow_line[0] = "│"
            if arrow_col < max_width:
                arrow_line[arrow_col] = "↓"
            block.append("".join(arrow_line).rstrip())
        else:
            block.append("│")

        block.append(symbol_row)
        block.append(separator_row)
        block.append(label_row)
        if delta_row:
            block.append(delta_row)
        return block

    lines.extend(
        _build_activity_block("MINDFUL", mindful_symbols, mindful_delta_labels)
    )
    lines.append("")
    lines.extend(
        _build_activity_block("WORKOUT", workout_symbols, workout_delta_labels)
    )
    lines.append("")
    lines.extend(
        _build_activity_block("STRETCH", stretch_symbols, stretch_delta_labels)
    )

    return lines


def render_weekly_training_grid(spec: WeeklyTrainingGridSpec) -> list[str]:
    """Render weekly training grouped grid body."""
    dates = list(spec.dates)
    daily_data = spec.daily_data
    mindful_count = spec.mindful_count
    workout_count = spec.workout_count
    stretch_count = spec.stretch_count
    current_date = spec.current_date

    lines: list[str] = []

    mindful_symbols: list[str] = []
    workout_symbols: list[str] = []
    stretch_symbols: list[str] = []

    for day in dates:
        entry = daily_data.get(day, {})
        has_mindful = entry.get("meditate", False)
        has_workout = entry.get("workout", False)
        has_stretch = entry.get("stretch", False)

        mindful_symbols.append("███" if has_mindful else "░░░")
        workout_symbols.append("███" if has_workout else "░░░")
        stretch_symbols.append("███" if has_stretch else "░░░")

    prefix_mindful = "│ MINDFUL:  "
    prefix_workout = "│ WORKOUT:  "
    prefix_stretch = "│ STRETCH:  "

    mindful_row = prefix_mindful + " ".join(mindful_symbols) + f"   ({mindful_count}/7)"
    workout_row = prefix_workout + " ".join(workout_symbols) + f"   ({workout_count}/7)"
    stretch_row = prefix_stretch + " ".join(stretch_symbols) + f"   ({stretch_count}/7)"

    arrow_line = None
    if current_date and dates and dates[0] <= current_date <= dates[-1]:
        day_idx = (current_date - dates[0]).days
        day_idx = max(0, min(day_idx, 6))
        arrow_col = len(prefix_mindful) + day_idx * 4 + 1
        width = len(mindful_row)
        if arrow_col >= width:
            width = arrow_col + 1
        arrow_chars = [" "] * width
        arrow_chars[0] = "┌"
        if arrow_col < len(arrow_chars):
            arrow_chars[arrow_col] = "↓"
        arrow_line = "".join(arrow_chars).rstrip()

    if arrow_line:
        lines.append(arrow_line)
    else:
        lines.append("┌")

    lines.append(mindful_row)
    lines.append(workout_row)
    lines.append(stretch_row)
    lines.append("│           " + " ".join(["───"] * 7))
    lines.append("└           " + " ".join(DAYS))

    return lines
