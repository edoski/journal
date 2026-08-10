"""Strict parser for GRADES.md yearly and overall tables."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
import re

from sync.contracts.grades import (
    GradeKind,
    GradeEntry,
    GradesDocument,
    OverallInput,
    OVERALL_TABLE_HEADERS,
    YEAR_TABLE_HEADERS,
    YearGradeTable,
)
from sync.notes.markdown_tables import TableSchema, parse_markdown_table

_YEAR_SECTION_RE = re.compile(r"^## YEAR (\d+)$")
_LODE_TOKEN_RE = re.compile(r"^30\s*(?:L|E\s*LODE)$", re.IGNORECASE)
_INT_TOKEN_RE = re.compile(r"^\d+$")


class _ParseError(ValueError):
    pass


def _section_end(lines: list[str], start_idx: int) -> int:
    for idx in range(start_idx + 1, len(lines)):
        if lines[idx].strip().startswith("## "):
            return idx
    return len(lines)


def _find_table_start(
    lines: list[str],
    section_start: int,
    section_end: int,
    *,
    section_label: str,
) -> int:
    for idx in range(section_start + 1, section_end):
        if lines[idx].strip().startswith("|"):
            return idx
    raise _ParseError(f"{section_label} must contain a markdown table")


def _parse_decimal(
    raw: str,
    *,
    line_no: int,
    column: str,
    positive_or_zero: bool = True,
) -> Decimal:
    token = raw.strip().replace(",", ".")
    if not token:
        raise _ParseError(f"GRADES.md line {line_no}: {column} cannot be empty")

    try:
        value = Decimal(token)
    except InvalidOperation as exc:
        raise _ParseError(
            f"GRADES.md line {line_no}: {column} must be numeric, got {raw!r}"
        ) from exc

    if positive_or_zero and value < 0:
        raise _ParseError(
            f"GRADES.md line {line_no}: {column} must be >= 0, got {raw!r}"
        )
    return value


def _parse_grade(
    *,
    raw: str,
    line_no: int,
) -> tuple[GradeKind, str, int | None]:
    token = raw.strip()
    if not token:
        return "pending", "", None

    token_upper = token.upper()
    if token_upper == "ID":
        return "id", "ID", None

    if _LODE_TOKEN_RE.fullmatch(token):
        return "lode", "30L", 30

    if not _INT_TOKEN_RE.fullmatch(token):
        raise _ParseError(
            f"GRADES.md line {line_no}: GRADE must be integer 18-30, 30L, or ID"
        )

    value = int(token)
    if value < 18 or value > 30:
        raise _ParseError(
            f"GRADES.md line {line_no}: GRADE must be between 18 and 30, got {value}"
        )
    return "numeric", str(value), value


def _parse_year_table(
    lines: list[str],
    *,
    year: int,
    section_start: int,
    section_end: int,
) -> YearGradeTable:
    section_label = f"## YEAR {year}"
    table_start = _find_table_start(
        lines,
        section_start,
        section_end,
        section_label=section_label,
    )

    try:
        table = parse_markdown_table(
            lines,
            table_start,
            schema=TableSchema(headers=YEAR_TABLE_HEADERS),
        )
    except ValueError as exc:
        raise _ParseError(
            f"{section_label} table header must be exactly: | EXAM | CFU | GRADE |"
        ) from exc

    entries: list[GradeEntry] = []
    for row_offset, row in enumerate(table.rows):
        line_no = table_start + 3 + row_offset
        if len(row) != len(YEAR_TABLE_HEADERS):
            raise _ParseError(
                f"GRADES.md line {line_no}: expected {len(YEAR_TABLE_HEADERS)} cells, got {len(row)}"
            )

        exam, cfu_raw, grade_raw = row
        exam_name = exam.strip()
        if not exam_name:
            raise _ParseError(f"GRADES.md line {line_no}: EXAM cannot be empty")

        cfu = _parse_decimal(cfu_raw, line_no=line_no, column="CFU")
        kind, grade_text, numeric_grade = _parse_grade(
            raw=grade_raw,
            line_no=line_no,
        )

        entries.append(
            GradeEntry(
                exam=exam_name,
                cfu=cfu,
                kind=kind,
                grade_text=grade_text,
                numeric_grade=numeric_grade,
            )
        )

    return YearGradeTable(year=year, entries=tuple(entries))


def _parse_overall(lines: list[str], overall_idx: int) -> OverallInput:
    section_end = _section_end(lines, overall_idx)
    table_start = _find_table_start(
        lines,
        overall_idx,
        section_end,
        section_label="## OVERALL",
    )

    try:
        table = parse_markdown_table(
            lines,
            table_start,
            schema=TableSchema(headers=OVERALL_TABLE_HEADERS),
        )
    except ValueError as exc:
        raise _ParseError(
            "## OVERALL table header must be exactly: "
            "| AVERAGE GRADE | % | CFU | LODE | BONUS | THESIS | FINAL |"
        ) from exc

    if not table.rows:
        raise _ParseError("## OVERALL table must contain one data row")
    if len(table.rows) > 1:
        raise _ParseError("## OVERALL table must contain exactly one data row")

    row = table.rows[0]
    line_no = table_start + 3
    if len(row) != len(OVERALL_TABLE_HEADERS):
        raise _ParseError(
            f"GRADES.md line {line_no}: expected {len(OVERALL_TABLE_HEADERS)} cells, got {len(row)}"
        )

    thesis = _parse_decimal(row[5], line_no=line_no, column="THESIS")
    return OverallInput(thesis=thesis)


def parse_grades_lines(lines: list[str]) -> GradesDocument:
    """Parse canonical ``GRADES.md`` lines into typed grade contracts."""
    years_found: list[tuple[int, int]] = []

    for idx, line in enumerate(lines):
        match = _YEAR_SECTION_RE.fullmatch(line.strip())
        if match is None:
            continue
        years_found.append((idx, int(match.group(1))))

    if not years_found:
        raise _ParseError("GRADES.md must contain at least one '## YEAR n' section")

    year_numbers = [year for _idx, year in years_found]
    if len(set(year_numbers)) != len(year_numbers):
        raise _ParseError("GRADES.md contains duplicate YEAR section numbers")

    sorted_numbers = sorted(year_numbers)
    expected_numbers = list(range(1, sorted_numbers[-1] + 1))
    if sorted_numbers != expected_numbers:
        raise _ParseError(
            "YEAR sections must be contiguous and start at 1 "
            f"(expected {expected_numbers}, got {sorted_numbers})"
        )

    tables: list[YearGradeTable] = []
    for section_start, year in sorted(years_found, key=lambda item: item[1]):
        section_end = _section_end(lines, section_start)
        tables.append(
            _parse_year_table(
                lines,
                year=year,
                section_start=section_start,
                section_end=section_end,
            )
        )

    overall_idx = -1
    for idx, line in enumerate(lines):
        if line.strip() == "## OVERALL":
            overall_idx = idx
            break
    if overall_idx == -1:
        raise _ParseError("GRADES.md must contain a '## OVERALL' section")

    overall = _parse_overall(lines, overall_idx)
    return GradesDocument(years=tuple(tables), overall=overall)
