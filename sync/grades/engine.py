"""Pure computations for GRADES.md summary fields."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from sync.contracts.grades import (
    GradeEntry,
    GradesComputation,
    GradesDocument,
    YearGradeStats,
)


def _quantize_two(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _round_half_up_int(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _is_graded(entry: GradeEntry) -> bool:
    return entry.kind in {"numeric", "lode"}


def _is_done(entry: GradeEntry) -> bool:
    return entry.kind != "pending"


def compute_grades(
    document: GradesDocument,
    *,
    status_bonus: int = 0,
) -> GradesComputation:
    """Compute yearly and overall grade metrics from parsed GRADES.md content."""
    year_stats: list[YearGradeStats] = []

    total_cfu = Decimal("0")
    total_graded_cfu = Decimal("0")
    total_weighted = Decimal("0")
    lode_count = 0

    for table in document.years:
        cfu_done = sum(
            (entry.cfu for entry in table.entries if _is_done(entry)), Decimal("0")
        )
        graded_done_cfu = sum(
            (entry.cfu for entry in table.entries if _is_graded(entry)), Decimal("0")
        )
        weighted_total = sum(
            (
                entry.cfu * Decimal(entry.numeric_grade)
                for entry in table.entries
                if _is_graded(entry) and entry.numeric_grade is not None
            ),
            Decimal("0"),
        )

        year_average = (
            _quantize_two(weighted_total / graded_done_cfu)
            if graded_done_cfu > 0
            else None
        )
        year_lode_count = sum(1 for entry in table.entries if entry.kind == "lode")

        year_stats.append(
            YearGradeStats(
                year=table.year,
                cfu_done=cfu_done,
                graded_done_cfu=graded_done_cfu,
                weighted_total=weighted_total,
                average_grade=year_average,
                lode_count=year_lode_count,
            )
        )

        total_cfu += cfu_done
        total_graded_cfu += graded_done_cfu
        total_weighted += weighted_total
        lode_count += year_lode_count

    average_raw: Decimal | None = None
    average_grade: Decimal | None = None
    percent: Decimal | None = None
    final_grade: int | None = None

    if total_graded_cfu > 0:
        average_raw = total_weighted / total_graded_cfu
        average_grade = _quantize_two(average_raw)
        percent = _quantize_two(average_raw / Decimal("30"))

    bonus = lode_count // 3
    thesis = document.overall.thesis

    if average_raw is not None:
        final_raw = (
            Decimal("110") * (average_raw / Decimal("30"))
            + Decimal(bonus)
            + thesis
            + Decimal(status_bonus)
        )
        final_grade = _round_half_up_int(final_raw)

    return GradesComputation(
        year_stats=tuple(year_stats),
        average_grade=average_grade,
        percent=percent,
        total_cfu=total_cfu,
        total_graded_cfu=total_graded_cfu,
        total_weighted=total_weighted,
        lode_count=lode_count,
        bonus=bonus,
        thesis=thesis,
        final_grade=final_grade,
        status_bonus=status_bonus,
    )
