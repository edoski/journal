"""Deterministic markdown rendering for GRADES.md."""

from __future__ import annotations

from decimal import Decimal

from sync.contracts.grades import (
    GradesComputation,
    GradesDocument,
    OVERALL_TABLE_HEADERS,
    YEAR_TABLE_HEADERS,
)
from sync.writers.tables import SimpleGridTableSpec, render_table


def _format_decimal(value: Decimal) -> str:
    normalized = value.normalize()
    text = format(normalized, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text if text else "0"


def _format_cfu(value: Decimal) -> str:
    if value == value.to_integral_value():
        return str(int(value))
    return _format_decimal(value)


def _format_two_decimals(value: Decimal | None) -> str:
    if value is None:
        return "-"
    return f"{value:.2f}"


def _render_year_sections(document: GradesDocument) -> list[str]:
    lines: list[str] = []
    for idx, table in enumerate(sorted(document.years, key=lambda item: item.year)):
        if idx > 0:
            lines.append("")
        lines.append(f"## YEAR {table.year}")
        year_rows = [
            [
                entry.exam,
                _format_cfu(entry.cfu),
                entry.grade_text,
            ]
            for entry in table.entries
        ]
        lines.extend(
            render_table(
                SimpleGridTableSpec(headers=YEAR_TABLE_HEADERS, rows=year_rows)
            )
        )
    return lines


def _render_overall_section(computation: GradesComputation) -> list[str]:
    row = [
        _format_two_decimals(computation.average_grade),
        _format_two_decimals(computation.percent),
        _format_cfu(computation.total_cfu),
        str(computation.lode_count),
        str(computation.bonus),
        _format_decimal(computation.thesis),
        "-" if computation.final_grade is None else str(computation.final_grade),
    ]
    lines = ["## OVERALL"]
    lines.extend(
        render_table(
            SimpleGridTableSpec(
                headers=OVERALL_TABLE_HEADERS,
                rows=[row],
            )
        )
    )
    return lines


def render_grades_note(
    document: GradesDocument, computation: GradesComputation
) -> list[str]:
    """Render the full normalized GRADES.md note from parsed and computed data."""
    year_lines = _render_year_sections(document)
    overall_lines = _render_overall_section(computation)
    if year_lines and year_lines[-1].strip() != "":
        year_lines.append("")
    return year_lines + overall_lines + [""]
