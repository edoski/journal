"""Typed contracts for GRADES.md parsing and computation."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

YEAR_TABLE_HEADERS: tuple[str, ...] = ("EXAM", "CFU", "GRADE")
OVERALL_TABLE_HEADERS: tuple[str, ...] = (
    "AVERAGE GRADE",
    "%",
    "CFU",
    "LODE",
    "BONUS",
    "THESIS",
    "FINAL",
)

GradeKind = Literal["numeric", "lode", "id", "pending"]


@dataclass(frozen=True)
class GradeEntry:
    """Single exam row parsed from a yearly grades table."""

    exam: str
    cfu: Decimal
    kind: GradeKind
    grade_text: str
    numeric_grade: int | None


@dataclass(frozen=True)
class YearGradeTable:
    """One ``## YEAR n`` block parsed from GRADES.md."""

    year: int
    entries: tuple[GradeEntry, ...]


@dataclass(frozen=True)
class OverallInput:
    """User-editable inputs in ``## OVERALL`` used by the compute engine."""

    thesis: Decimal


@dataclass(frozen=True)
class GradesDocument:
    """Canonical parsed GRADES.md representation."""

    years: tuple[YearGradeTable, ...]
    overall: OverallInput


@dataclass(frozen=True)
class YearGradeStats:
    """Computed grade aggregates for a single academic year block."""

    year: int
    cfu_done: Decimal
    graded_done_cfu: Decimal
    weighted_total: Decimal
    average_grade: Decimal | None
    lode_count: int


@dataclass(frozen=True)
class GradesComputation:
    """Computed summary values rendered into ``## OVERALL``."""

    year_stats: tuple[YearGradeStats, ...]
    average_grade: Decimal | None
    percent: Decimal | None
    total_cfu: Decimal
    total_graded_cfu: Decimal
    total_weighted: Decimal
    lode_count: int
    bonus: int
    thesis: Decimal
    final_grade: int | None
    status_bonus: int
