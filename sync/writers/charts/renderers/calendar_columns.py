"""Calendar-density training chart renderer."""

from __future__ import annotations

from ..specs import (
    TrainingCalendarColumn,
    TrainingCalendarColumnsSpec,
    TrainingCalendarMonth,
    TrainingCalendarQuarter,
)


def _count_label(done: int, elapsed: int) -> str:
    return f"({done:02d}/{elapsed:02d})" if elapsed else "(00/00)"


def _month_line(month: TrainingCalendarMonth, month_width: int) -> str:
    symbols = month.symbols[:month_width].ljust(month_width)
    return f"│ {month.label} {symbols} {_count_label(month.done, month.elapsed)}"


def _quarter_line(quarter: TrainingCalendarQuarter) -> str:
    delta = f" {quarter.delta_label}" if quarter.delta_label else ""
    return f"┌ {quarter.label} {_count_label(quarter.done, quarter.elapsed)}{delta}"


def _column_lines(
    column: TrainingCalendarColumn, *, month_width: int, rule_char: str
) -> list[str]:
    lines = [f"{column.title} ({column.total_done}/{column.total_elapsed})"]
    lines.append(rule_char)

    for index, quarter in enumerate(column.quarters):
        if index:
            lines.append("")
        lines.append(_quarter_line(quarter))
        lines.extend(_month_line(month, month_width) for month in quarter.months)

    return lines


def _line_at(lines: list[str], index: int) -> str:
    return lines[index] if index < len(lines) else ""


def render_training_calendar_columns(
    spec: TrainingCalendarColumnsSpec,
) -> list[str]:
    """Render side-by-side calendar-density training columns."""
    columns = list(spec.columns)
    if not columns:
        return []
    if spec.month_width <= 0:
        raise ValueError("month_width must be positive")

    raw_columns = [
        _column_lines(
            column,
            month_width=spec.month_width,
            rule_char=spec.rule_char,
        )
        for column in columns
    ]
    column_width = max(
        len(line) for lines in raw_columns for line in lines if line != spec.rule_char
    )
    rendered_columns = [
        [
            spec.rule_char * column_width if line == spec.rule_char else line
            for line in lines
        ]
        for lines in raw_columns
    ]

    max_rows = max(len(lines) for lines in rendered_columns)
    output: list[str] = []
    for row_index in range(max_rows):
        row_parts = [_line_at(lines, row_index) for lines in rendered_columns]
        if all(part == "" for part in row_parts):
            output.append("")
            continue
        output.append(
            spec.column_gap.join(
                part.ljust(column_width) for part in row_parts
            ).rstrip()
        )

    return output
