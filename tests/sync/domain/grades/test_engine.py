"""Tests for grades summary computations."""

from __future__ import annotations

from decimal import Decimal

from sync.contracts.grades import (
    GradeEntry,
    GradeKind,
    GradesDocument,
    OverallInput,
    YearGradeTable,
)
from sync.grades.engine import compute_grades


def _entry(
    exam: str,
    cfu: str,
    kind: GradeKind,
    grade_text: str,
    numeric_grade: int | None,
) -> GradeEntry:
    return GradeEntry(
        exam=exam,
        cfu=Decimal(cfu),
        kind=kind,
        grade_text=grade_text,
        numeric_grade=numeric_grade,
    )


def _realistic_document() -> GradesDocument:
    year1 = YearGradeTable(
        year=1,
        entries=(
            _entry("DIRITTO DI INTERNET", "6", "numeric", "28", 28),
            _entry("ECONOMIA AZIENDALE", "6", "numeric", "26", 26),
            _entry("MATEMATICA GENERALE", "12", "numeric", "25", 25),
            _entry("ARCHITETTURA DI INTERNET", "9", "numeric", "30", 30),
            _entry("ORGANIZZAZIONE AZIENDALE", "6", "numeric", "26", 26),
            _entry("PROGRAMMAZIONE INTERNET", "18", "numeric", "27", 27),
            _entry("ENGLISH B1", "3", "id", "ID", None),
        ),
    )
    year2 = YearGradeTable(
        year=2,
        entries=(
            _entry("FINANZA AZIENDALE", "6", "numeric", "24", 24),
            _entry("MICROECONOMIA", "6", "numeric", "26", 26),
            _entry("SISTEMI OPERATIVI", "15", "numeric", "29", 29),
            _entry("STATISTICA NUMERICA", "6", "numeric", "29", 29),
            _entry("STRATEGIA AZIENDALE", "6", "numeric", "26", 26),
            _entry("ALGORITMI", "12", "numeric", "29", 29),
            _entry("METODI NUMERICI", "6", "pending", "", None),
        ),
    )
    year3 = YearGradeTable(
        year=3,
        entries=(
            _entry(
                "STORIE E POLITICHE DEL DIGITALE",
                "6",
                "lode",
                "30L",
                30,
            ),
            _entry("BASI DI DATI", "9", "lode", "30L", 30),
            _entry("INGEGNERIA DEL SOFTWARE", "6", "numeric", "27", 27),
            _entry("CORPORATE GOVERNANCE", "8", "numeric", "30", 30),
            _entry("TECNOLOGIE WEB", "6", "numeric", "27", 27),
            _entry("LAB APPLICAZIONI MOBILI", "6", "pending", "", None),
        ),
    )
    return GradesDocument(
        years=(year1, year2, year3),
        overall=OverallInput(thesis=Decimal("6")),
    )


def test_compute_grades_realistic_precision_guard() -> None:
    result = compute_grades(_realistic_document(), status_bonus=0)

    assert result.total_weighted == Decimal("3963")
    assert result.total_graded_cfu == Decimal("143")
    assert result.total_cfu == Decimal("146")
    assert result.average_grade == Decimal("27.71")
    assert result.percent == Decimal("0.92")
    assert result.lode_count == 2
    assert result.bonus == 0
    assert result.final_grade == 108


def test_compute_grades_counts_bonus_every_three_lode() -> None:
    document = GradesDocument(
        years=(
            YearGradeTable(
                year=1,
                entries=(
                    _entry("A", "6", "lode", "30L", 30),
                    _entry("B", "6", "lode", "30L", 30),
                    _entry("C", "6", "lode", "30L", 30),
                ),
            ),
        ),
        overall=OverallInput(thesis=Decimal("0")),
    )

    result = compute_grades(document, status_bonus=0)

    assert result.lode_count == 3
    assert result.bonus == 1
    assert result.average_grade == Decimal("30.00")
    assert result.final_grade == 111


def test_compute_grades_pass_fail_counts_toward_cfu_only() -> None:
    document = GradesDocument(
        years=(
            YearGradeTable(
                year=1,
                entries=(
                    _entry("Exam", "6", "numeric", "28", 28),
                    _entry("English", "3", "id", "ID", None),
                ),
            ),
        ),
        overall=OverallInput(thesis=Decimal("0")),
    )

    result = compute_grades(document, status_bonus=0)

    assert result.total_cfu == Decimal("9")
    assert result.total_graded_cfu == Decimal("6")
    assert result.total_weighted == Decimal("168")


def test_compute_grades_without_numeric_exams_yields_no_average() -> None:
    document = GradesDocument(
        years=(
            YearGradeTable(
                year=1,
                entries=(_entry("English", "3", "id", "ID", None),),
            ),
        ),
        overall=OverallInput(thesis=Decimal("6")),
    )

    result = compute_grades(document, status_bonus=0)

    assert result.average_grade is None
    assert result.percent is None
    assert result.final_grade is None
    assert result.total_cfu == Decimal("3")
    assert result.total_graded_cfu == Decimal("0")
