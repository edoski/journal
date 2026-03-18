"""Grouped symbol-grid chart renderers."""

from __future__ import annotations

import datetime

from sync.contracts.metrics import DailyAggregate
from sync.constants import DAYS, RENDER, STUDY_TARGET_MIN
from sync.dates import daterange, format_week_label

from ..grid import GridRowBuilder
from .common import row_for_day, study_intensity_symbol
from ..specs import (
    MonthlyStudyGridSpec,
    MonthlyTrainingGridSpec,
    WeeklyStudyGridSpec,
    WeeklyTrainingGridSpec,
)


def _study_intensity_symbol(minutes: float | None) -> str:
    return study_intensity_symbol(
        minutes,
        deep_symbol=RENDER.study_symbol_deep,
        none_symbol=RENDER.study_symbol_none,
    )


def _row_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> DailyAggregate | None:
    return row_for_day(daily_data, day)


def render_weekly_study_grid(spec: WeeklyStudyGridSpec) -> list[str]:
    """Render weekly full-study-days grouped grid body."""
    dates = list(spec.dates)
    daily_data = spec.daily_data
    current_date = spec.current_date
    today = spec.today or datetime.date.today()

    lines: list[str] = []

    met_symbol = "███"
    none_symbol = "░░░"

    study_symbols: list[str] = []
    for day in dates:
        entry = _row_for_day(daily_data, day)
        minutes = entry["study_minutes"] if entry is not None else None
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
        arrow_col = 3 + day_idx * 4
        lines.append("│" + " " * (arrow_col - 1) + "↓")
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
    today = spec.today or datetime.date.today()
    delta_labels = list(spec.delta_labels) if spec.delta_labels else None

    lines: list[str] = []

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
                entry = _row_for_day(daily_data, day)
                symbol = _study_intensity_symbol(
                    entry["study_minutes"] if entry is not None else None
                )
                symbols.append(symbol)
                total_elapsed += 1
                if symbol == RENDER.study_symbol_deep:
                    total_done += 1

    if not week_day_counts:
        lines.append("┌ FULL STUDY DAYS (00/00)")
        lines.append("│")
        lines.append("│")
        lines.append("│")
        lines.append("│")
        lines.append("└")
        lines.append("")
        lines.append(RENDER.study_legend)
        return lines

    max_days = max(week_day_counts)
    week_width = max_days * 2 - 1

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
                arrow_col = len("│ ") + w_idx * (week_width + 3) + day_idx * 2
                break

    symbol_row = grid.build_symbol_row(symbols)
    separator_row = grid.build_separator_row()
    label_row = grid.build_label_row()
    delta_row = grid.build_delta_row(delta_labels)

    header_suffix = (
        f" ({total_done:02d}/{total_elapsed:02d})" if total_elapsed else " (00/00)"
    )
    lines.append(f"┌ FULL STUDY DAYS{header_suffix}")
    if arrow_col is not None:
        lines.append("│" + " " * (arrow_col - 1) + "↓")
    else:
        lines.append("│")

    lines.append(symbol_row)
    lines.append(separator_row)
    lines.append(label_row)
    if delta_row:
        lines.append(f"└ {delta_row[2:]}" if delta_row.startswith("│ ") else delta_row)
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
    meditation_delta_labels = (
        list(spec.meditation_delta_labels) if spec.meditation_delta_labels else None
    )
    workout_delta_labels = (
        list(spec.workout_delta_labels) if spec.workout_delta_labels else None
    )
    stretch_delta_labels = (
        list(spec.stretch_delta_labels) if spec.stretch_delta_labels else None
    )

    lines: list[str] = []

    meditation_symbols: list[str] = []
    workout_symbols: list[str] = []
    stretch_symbols: list[str] = []
    week_labels: list[str] = []
    week_day_counts: list[int] = []

    for start, end in week_ranges:
        week_days = list(daterange(start, end))
        week_day_counts.append(len(week_days))
        week_labels.append(format_week_label(start, end))

        for day in week_days:
            entry = _row_for_day(daily_data, day)
            meditation_symbols.append("■" if entry and entry.get("meditate") else "·")
            workout_symbols.append("■" if entry and entry.get("workout") else "·")
            stretch_symbols.append("■" if entry and entry.get("stretch") else "·")

    if not week_day_counts:
        return [
            "┌ MEDITATION",
            "│",
            "│",
            "│",
            "│",
            "",
            "┌ WORKOUT",
            "│",
            "│",
            "│",
            "│",
            "",
            "┌ STRETCH",
            "│",
            "│",
            "│",
            "│",
        ]

    max_days = max(week_day_counts)
    week_width = max_days * 2 - 1

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
                arrow_col = len("│ ") + w_idx * (week_width + 3) + day_idx * 2
                break

    def _build_activity_block(
        title: str, symbols: list[str], deltas: list[str] | None
    ) -> list[str]:
        symbol_row = grid.build_symbol_row(symbols)
        separator_row = grid.build_separator_row()
        label_row = grid.build_label_row()
        delta_row = grid.build_delta_row(deltas, prefix="└ ")

        block = [f"┌ {title}"]
        if arrow_col is not None:
            block.append("│" + " " * (arrow_col - 1) + "↓")
        else:
            block.append("│")

        block.append(symbol_row)
        block.append(separator_row)
        block.append(label_row)
        if delta_row:
            block.append(delta_row)
        return block

    lines.extend(
        _build_activity_block(
            "MEDITATION",
            meditation_symbols,
            meditation_delta_labels,
        )
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
    meditation_count = spec.meditation_count
    workout_count = spec.workout_count
    stretch_count = spec.stretch_count
    current_date = spec.current_date

    lines: list[str] = []

    meditation_symbols: list[str] = []
    workout_symbols: list[str] = []
    stretch_symbols: list[str] = []

    for day in dates:
        entry = _row_for_day(daily_data, day)
        has_meditation = bool(entry and entry.get("meditate"))
        has_workout = bool(entry and entry.get("workout"))
        has_stretch = bool(entry and entry.get("stretch"))

        meditation_symbols.append("███" if has_meditation else "░░░")
        workout_symbols.append("███" if has_workout else "░░░")
        stretch_symbols.append("███" if has_stretch else "░░░")

    label_width = max(len("MEDITATION"), len("WORKOUT"), len("STRETCH"))

    def _prefix(label: str) -> str:
        padding = " " * (label_width - len(label) + 2)
        return f"│ {label}{padding}"

    prefix_meditation = _prefix("MEDITATION")
    prefix_workout = _prefix("WORKOUT")
    prefix_stretch = _prefix("STRETCH")

    meditation_row = (
        prefix_meditation + " ".join(meditation_symbols) + f"   ({meditation_count}/7)"
    )
    workout_row = prefix_workout + " ".join(workout_symbols) + f"   ({workout_count}/7)"
    stretch_row = prefix_stretch + " ".join(stretch_symbols) + f"   ({stretch_count}/7)"

    arrow_line: str | None = None
    if current_date and dates and dates[0] <= current_date <= dates[-1]:
        day_idx = (current_date - dates[0]).days
        arrow_col = len(prefix_meditation) + day_idx * 4 + 1
        arrow_line = "┌" + " " * (arrow_col - 1) + "↓"

    if arrow_line is not None:
        lines.append(arrow_line)
    else:
        lines.append("┌")

    lines.append(meditation_row)
    lines.append(workout_row)
    lines.append(stretch_row)
    axis_prefix = "│ " + " " * (label_width + 3)
    footer_prefix = "└ " + " " * (label_width + 3)
    lines.append(axis_prefix + " ".join(["───"] * 7))
    lines.append(footer_prefix + " ".join(DAYS))

    return lines
