"""Shared chart layout primitives and geometry helpers."""

from __future__ import annotations

import datetime
from collections.abc import Callable, Sequence

from .specs import HAnchor


def anchor_text_start(anchor_pos: int, text_len: int, anchor: HAnchor) -> int:
    """Return starting column for a text run given anchor position and mode."""
    if text_len == 0:
        return anchor_pos
    if anchor is HAnchor.START:
        return anchor_pos
    if anchor is HAnchor.END:
        return anchor_pos - text_len + 1
    # CENTER
    return anchor_pos - (text_len - 1) // 2


def place_text(row: list[str], text: str, start: int) -> None:
    """Place text into a mutable row buffer with clipping."""
    if not text:
        return
    width = len(row)
    for idx, ch in enumerate(text):
        pos = start + idx
        if 0 <= pos < width:
            row[pos] = ch


def place_anchored_text(
    row: list[str],
    text: str,
    *,
    anchor_pos: int,
    anchor: HAnchor,
    clamp_left: int | None = None,
    clamp_right: int | None = None,
) -> None:
    """Place text anchored at an x position, optionally clamped to an interval."""
    if not text:
        return
    start = anchor_text_start(anchor_pos, len(text), anchor)
    if clamp_left is not None:
        start = max(start, clamp_left)
    if clamp_right is not None:
        start = min(start, clamp_right - len(text) + 1)
    place_text(row, text, start)


def column_bounds(
    *,
    prefix_len: int,
    column_width: int,
    column_index: int,
) -> tuple[int, int]:
    """Compute inclusive [start, end] bounds for a column."""
    start = prefix_len + column_index * column_width
    end = start + column_width - 1
    return start, end


def bar_bounds(
    *,
    prefix_len: int,
    column_width: int,
    bar_left_gutter: int,
    bar_width: int,
    column_index: int,
) -> tuple[int, int]:
    """Compute inclusive [start, end] bounds for a bar lane inside one column."""
    col_start, _ = column_bounds(
        prefix_len=prefix_len,
        column_width=column_width,
        column_index=column_index,
    )
    start = col_start + bar_left_gutter
    end = start + bar_width - 1
    return start, end


def total_row_width(*, prefix_len: int, column_width: int, count: int) -> int:
    """Row width used by prefix+columns rows."""
    return prefix_len + column_width * count


def axis_dash_count(*, column_width: int, count: int, axis_trim: int) -> int:
    """Dash count for an axis row."""
    return max(column_width * count - axis_trim, 0)


def centered_pad(width: int, text_len: int) -> int:
    """Left padding for centered text in a fixed-width segment."""
    return max((width - text_len) // 2, 0)


def compress_symbols(
    symbols: Sequence[str], target_width: int, empty_symbol: str
) -> str:
    """Compress a sequence of symbols to a fixed width using proportional bucketing."""
    if target_width < 0:
        raise ValueError("target_width must be non-negative")
    if target_width == 0:
        return ""
    total = len(symbols)
    if total == 0:
        return empty_symbol * target_width
    if total + 1 <= target_width:
        return "".join(symbols) + empty_symbol * (target_width - total)
    if total == target_width:
        return "".join(symbols)
    compressed: list[str] = []
    for idx in range(target_width):
        start = (idx * total) // target_width
        compressed.append(symbols[start])
    return "".join(compressed)


def compress_days_time_order(
    days: Sequence[datetime.date],
    met_fn: Callable[[datetime.date], bool],
    target_width: int,
    *,
    allow_partial: bool = False,
    fill_char: str = "█",
    partial_char: str = "░",
    empty_char: str = "·",
    today: datetime.date | None = None,
) -> str:
    """Compress time-ordered day flags into fixed width glyphs."""
    anchor_day = today if today is not None else datetime.date.today()
    total = len(days)
    if target_width < 0:
        raise ValueError("target_width must be non-negative")
    if target_width == 0:
        return ""
    if total == 0:
        return empty_char * target_width

    symbols: list[str] = []
    for idx in range(target_width):
        start = (idx * total) // target_width
        end = ((idx + 1) * total + target_width - 1) // target_width
        end = min(total, end)
        bucket = days[start:end]

        observed = [day for day in bucket if day <= anchor_day]
        if not observed:
            symbols.append(empty_char)
            continue

        hits = sum(1 for day in observed if met_fn(day))
        if hits == 0:
            symbols.append(empty_char)
        elif hits == len(observed):
            symbols.append(fill_char)
        else:
            symbols.append(partial_char if allow_partial else fill_char)

    return "".join(symbols)


def compress_activity_time_order(
    days: Sequence[datetime.date],
    has_activity_fn: Callable[[datetime.date], bool],
    target_width: int,
    *,
    fill_char: str = "■",
    empty_char: str = "·",
    today: datetime.date | None = None,
) -> str:
    """Binary activity specialization for ``compress_days_time_order``."""
    return compress_days_time_order(
        days,
        has_activity_fn,
        target_width,
        allow_partial=False,
        fill_char=fill_char,
        partial_char=fill_char,
        empty_char=empty_char,
        today=today,
    )
