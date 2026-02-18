"""Shared helpers for study/training chart renderers."""

from __future__ import annotations

import datetime

from sync.constants import STUDY_TARGET_MIN
from sync.contracts.metrics import DailyAggregate


def study_intensity_symbol(
    minutes: float | None,
    *,
    deep_symbol: str,
    none_symbol: str,
) -> str:
    """Map study minutes to deep/none symbol."""
    mins = minutes or 0
    return deep_symbol if mins >= STUDY_TARGET_MIN else none_symbol


def row_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> DailyAggregate | None:
    """Return the aggregate row for a day if present."""
    return daily_data.get(day)


def compress_coverage_symbols(
    symbols: list[str],
    target_width: int,
    *,
    deep_symbol: str,
    none_symbol: str,
) -> str:
    """Compress symbols while preserving deep-activity if any source bucket has it."""
    if target_width < 0:
        raise ValueError("target_width must be non-negative")
    if target_width == 0:
        return ""
    total = len(symbols)
    if total == 0:
        return none_symbol * target_width
    if total + 1 <= target_width:
        return "".join(symbols) + none_symbol * (target_width - total)
    if total == target_width:
        return "".join(symbols)

    compressed: list[str] = []
    for idx in range(target_width):
        start = (idx * total) // target_width
        end = ((idx + 1) * total + target_width - 1) // target_width
        end = min(total, end)
        bucket = symbols[start:end]
        if deep_symbol in bucket:
            compressed.append(deep_symbol)
        else:
            compressed.append(none_symbol)
    return "".join(compressed)
