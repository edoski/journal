"""Tests for strict GRADES.md parsing."""

from __future__ import annotations

import pytest

from sync.readers.grades import parse_grades_lines


def _sample_lines() -> list[str]:
    return [
        "## YEAR 1",
        "| EXAM | CFU | GRADE |",
        "| ---- | --- | ----- |",
        "| MATEMATICA | 12 | 28 |",
        "| ENGLISH B1 | 3 | ID |",
        "| METODI NUMERICI | 6 | |",
        "",
        "## YEAR 2",
        "| EXAM | CFU | GRADE |",
        "| ---- | --- | ----- |",
        "| BASI DI DATI | 9 | 30L |",
        "",
        "## OVERALL",
        "| AVERAGE GRADE | % | CFU | LODE | BONUS | THESIS | FINAL |",
        "| ------------- | - | --- | ---- | ----- | ------ | ----- |",
        "| 0 | 0 | 0 | 0 | 0 | 6 | 0 |",
        "",
    ]


def test_parse_grades_lines_valid_document() -> None:
    document = parse_grades_lines(_sample_lines())

    assert len(document.years) == 2
    assert document.years[0].year == 1
    assert document.years[1].year == 2
    assert document.years[0].entries[0].kind == "numeric"
    assert document.years[0].entries[1].kind == "id"
    assert document.years[0].entries[2].kind == "pending"
    assert document.years[1].entries[0].kind == "lode"
    assert document.overall.thesis == 6


def test_parse_requires_overall_section() -> None:
    lines = _sample_lines()
    lines = [line for line in lines if line.strip() != "## OVERALL"]

    with pytest.raises(ValueError, match="must contain a '## OVERALL' section"):
        parse_grades_lines(lines)


def test_parse_rejects_non_contiguous_years() -> None:
    lines = _sample_lines()
    lines[7] = "## YEAR 3"

    with pytest.raises(ValueError, match="contiguous and start at 1"):
        parse_grades_lines(lines)


def test_parse_rejects_out_of_range_numeric_grade() -> None:
    lines = _sample_lines()
    lines[3] = "| MATEMATICA | 12 | 31 |"

    with pytest.raises(ValueError, match="between 18 and 30"):
        parse_grades_lines(lines)


def test_parse_rejects_invalid_grade_token() -> None:
    lines = _sample_lines()
    lines[3] = "| MATEMATICA | 12 | 24.5 |"

    with pytest.raises(ValueError, match="must be integer 18-30, 30L, or ID"):
        parse_grades_lines(lines)


def test_parse_rejects_id_with_suffix() -> None:
    lines = _sample_lines()
    lines[4] = "| ENGLISH B1 | 3 | IDONEITA |"

    with pytest.raises(ValueError, match="must be integer 18-30, 30L, or ID"):
        parse_grades_lines(lines)


def test_parse_rejects_noncanonical_year_header() -> None:
    lines = _sample_lines()
    lines[0] = "## ANNO 1"
    lines[7] = "## ANNO 2"

    with pytest.raises(ValueError, match="at least one '## YEAR n' section"):
        parse_grades_lines(lines)


def test_parse_rejects_invalid_year_table_header() -> None:
    lines = _sample_lines()
    lines[1] = "| EXAM | CFU | DONE | GRADE |"

    with pytest.raises(ValueError, match="table header must be exactly"):
        parse_grades_lines(lines)


def test_parse_rejects_invalid_overall_table_header() -> None:
    lines = _sample_lines()
    lines[13] = "| AVERAGE | % | CFU | LODE | BONUS | THESIS | FINAL |"

    with pytest.raises(ValueError, match="OVERALL table header must be exactly"):
        parse_grades_lines(lines)
