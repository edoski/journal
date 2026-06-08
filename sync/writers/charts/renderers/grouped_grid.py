"""Grouped symbol-grid chart renderers."""

from __future__ import annotations

from sync.constants import DAYS, RENDER

from ..grid import GridRowBuilder
from ..specs import (
    MonthlyStudyGridSpec,
    MonthlyTrainingGridSpec,
    WeeklyStudyGridSpec,
    WeeklyTrainingGridSpec,
)


def render_weekly_study_grid(spec: WeeklyStudyGridSpec) -> list[str]:
    """Render weekly full-study-days grouped grid body."""
    study_symbols = list(spec.symbols)
    current_index = spec.current_index

    lines: list[str] = []

    lines.append("┌ FULL STUDY DAYS")

    if current_index is not None and 0 <= current_index < len(study_symbols):
        arrow_col = 3 + current_index * 4
        lines.append("│" + " " * (arrow_col - 1) + "↓")
    else:
        lines.append("│")

    lines.append(
        "│ " + " ".join(study_symbols) + f"   ({spec.done_count}/{spec.total_count})"
    )
    lines.append("│ " + " ".join(["───"] * 7))
    lines.append("└ " + " ".join(DAYS))
    lines.append("")
    lines.append(RENDER.study_legend.replace("█", "███").replace("·", "░░░"))
    return lines


def render_monthly_study_grid(spec: MonthlyStudyGridSpec) -> list[str]:
    """Render monthly full-study-days grouped grid body."""
    week_labels = list(spec.week_labels)
    week_day_counts = list(spec.week_day_counts)
    symbols = list(spec.symbols)
    delta_labels = list(spec.delta_labels) if spec.delta_labels else None

    lines: list[str] = []

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
    if spec.current_week_index is not None and spec.current_day_index is not None:
        arrow_col = (
            len("│ ")
            + spec.current_week_index * (week_width + 3)
            + spec.current_day_index * 2
        )

    symbol_row = grid.build_symbol_row(symbols)
    separator_row = grid.build_separator_row()
    label_row = grid.build_label_row()
    delta_row = grid.build_delta_row(delta_labels)

    header_suffix = (
        f" ({spec.total_done:02d}/{spec.total_elapsed:02d})"
        if spec.total_elapsed
        else " (00/00)"
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
    week_labels = list(spec.week_labels)
    week_day_counts = list(spec.week_day_counts)
    meditation_symbols = list(spec.meditation_symbols)
    workout_symbols = list(spec.workout_symbols)
    stretch_symbols = list(spec.stretch_symbols)
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
    if spec.current_week_index is not None and spec.current_day_index is not None:
        arrow_col = (
            len("│ ")
            + spec.current_week_index * (week_width + 3)
            + spec.current_day_index * 2
        )

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
    meditation_symbols = list(spec.meditation_symbols)
    workout_symbols = list(spec.workout_symbols)
    stretch_symbols = list(spec.stretch_symbols)
    meditation_count = spec.meditation_count
    workout_count = spec.workout_count
    stretch_count = spec.stretch_count
    current_index = spec.current_index

    lines: list[str] = []

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
    if current_index is not None and 0 <= current_index < len(meditation_symbols):
        arrow_col = len(prefix_meditation) + current_index * 4 + 1
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
