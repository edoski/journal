"""Progress-row chart renderers."""

from __future__ import annotations

import datetime
from typing import Any, cast

from sync.contracts.metrics import DailyAggregate
from sync.constants import MONTH_ABBR, RENDER, STUDY_TARGET_MIN
from sync.dates import daterange
from sync.formatting import round_half_up

from ..specs import (
    QuarterlyStudyCoverageRowsSpec,
    TrainingBlockRowsSpec,
    TrainingSectionsRowsSpec,
    YearlyStudyCoverageRowsSpec,
)


def _study_intensity_symbol(minutes: float | None) -> str:
    mins = minutes or 0
    return (
        RENDER.study_symbol_deep
        if mins >= STUDY_TARGET_MIN
        else RENDER.study_symbol_none
    )


def _row_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> dict[str, Any]:
    payload = daily_data.get(day)
    return cast(dict[str, Any], payload) if payload is not None else {}


def _compress_symbols(symbols: list[str], target_width: int) -> str:
    if target_width <= 0:
        return ""
    total = len(symbols)
    if total == 0:
        return RENDER.study_symbol_none * target_width
    if total <= target_width:
        return "".join(symbols) + RENDER.study_symbol_none * (target_width - total)

    compressed: list[str] = []
    for idx in range(target_width):
        start_f = idx * total / target_width
        end_f = (idx + 1) * total / target_width
        start = int(start_f)
        end = int(end_f) if end_f == int(end_f) else int(end_f) + 1
        end = min(end, total)

        bucket = symbols[start:end]
        if not bucket:
            compressed.append(RENDER.study_symbol_none)
            continue
        if RENDER.study_symbol_deep in bucket:
            compressed.append(RENDER.study_symbol_deep)
        else:
            compressed.append(RENDER.study_symbol_none)
    return "".join(compressed)


def _render_training_rows(
    *,
    labels: list[str],
    counts: list[tuple[int, int]],
    delta_labels: list[str],
    bar_width: int,
    bars_override: list[str] | None,
    fill_char: str,
    empty_char: str,
) -> list[str]:
    """Render rows in label + bar + count + delta layout."""
    lines: list[str] = []
    max_label_len = max((len(label) for label in labels), default=0)
    count_strs = [
        f"({done:02d}/{elapsed:02d})" if elapsed else "(00/00)"
        for done, elapsed in counts
    ]
    max_count_len = max((len(text) for text in count_strs), default=0)
    bars: list[str] = []

    for idx, (done, elapsed) in enumerate(counts):
        if bars_override:
            bar = bars_override[idx]
        else:
            elapsed = max(elapsed, 0)
            done = max(0, min(done, elapsed))
            bar_len = round_half_up((done / elapsed) * bar_width) if elapsed > 0 else 0
            bar_len = min(bar_width, max(0, bar_len))
            bar = fill_char * bar_len + empty_char * (bar_width - bar_len)
        bars.append(bar)

    max_bar_len = max((len(bar) for bar in bars), default=0)

    for idx, (label, (done, elapsed)) in enumerate(zip(labels, counts)):
        _ = done, elapsed
        bar = bars[idx]
        count_str = count_strs[idx].rjust(max_count_len)
        delta = delta_labels[idx] if idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""

        line = f"│ {label.ljust(max_label_len)} {bar.ljust(max_bar_len)}"
        if count_str:
            line += f" {count_str}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line.rstrip())

    return lines


def render_training_block_rows(spec: TrainingBlockRowsSpec) -> list[str]:
    """Render rows in compact training-block mode."""
    labels = list(spec.labels)
    counts = list(spec.counts)
    delta_labels = list(spec.delta_labels or [])
    bars_override = list(spec.bars_override) if spec.bars_override else None
    return _render_training_rows(
        labels=labels,
        counts=counts,
        delta_labels=delta_labels,
        bar_width=spec.bar_width,
        bars_override=bars_override,
        fill_char=spec.fill_char,
        empty_char=spec.empty_char,
    )


def render_training_sections_rows(spec: TrainingSectionsRowsSpec) -> list[str]:
    """Render multi-section training rows body."""
    sections = list(spec.sections)
    lines: list[str] = []
    for idx, section in enumerate(sections):
        lines.append(
            f"┌ {section.title} ({section.total_done:02d}/{section.total_elapsed:02d})"
        )
        lines.append("│")
        lines.extend(
            _render_training_rows(
                labels=list(section.labels),
                counts=list(section.counts),
                delta_labels=list(section.delta_labels or []),
                bar_width=section.bar_width,
                bars_override=list(section.bars_override)
                if section.bars_override
                else None,
                fill_char=section.fill_char,
                empty_char=section.empty_char,
            )
        )
        lines.append("└")
        if idx < len(sections) - 1:
            lines.append("")
    return lines


def render_quarterly_study_coverage_rows(
    spec: QuarterlyStudyCoverageRowsSpec,
) -> list[str]:
    """Render quarterly study-coverage rows body."""
    month_ranges = list(spec.month_ranges)
    daily_data = spec.daily_data
    delta_labels = list(spec.delta_labels or [])
    today = spec.today or datetime.date.today()

    lines: list[str] = []
    bars: list[tuple[str, str, int, int]] = []
    counts: list[str] = []
    max_bar_len = 0
    max_count_len = 0
    total_done = 0
    total_elapsed = 0

    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        days = list(daterange(start, end))
        bar_chars: list[str] = []
        done = 0
        elapsed_days = 0
        for day in days:
            if day > today:
                bar_chars.append(RENDER.study_symbol_none)
                continue
            symbol = _study_intensity_symbol(
                _row_for_day(daily_data, day).get("study_minutes")
            )
            bar_chars.append(symbol)
            if symbol != RENDER.study_symbol_none:
                done += 1
            elapsed_days += 1

        bar = "".join(bar_chars)
        bars.append((label, bar, done, elapsed_days))
        count_str = f"({done:02d}/{elapsed_days:02d})" if elapsed_days else "(00/00)"
        counts.append(count_str)
        max_bar_len = max(max_bar_len, len(bar))
        max_count_len = max(max_count_len, len(count_str))
        total_done += done
        total_elapsed += elapsed_days

    header = (
        f"┌ FULL STUDY DAYS ({total_done:02d}/{total_elapsed:02d})"
        if total_elapsed
        else "┌ FULL STUDY DAYS (00/00)"
    )
    lines.append(header)
    lines.append("│")

    for idx, ((label, bar, _, _), count_str) in enumerate(zip(bars, counts)):
        pad_between = (max_bar_len - len(bar)) + 1
        delta = delta_labels[idx] if idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""
        line = f"│ {label} {bar}{' ' * pad_between}{count_str.rjust(max_count_len)}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line.rstrip())

    lines.append("└")
    lines.append("")
    lines.append(RENDER.study_legend)
    return lines


def render_yearly_study_coverage_rows(spec: YearlyStudyCoverageRowsSpec) -> list[str]:
    """Render yearly study-coverage rows body."""
    quarter_ranges = list(spec.quarter_ranges)
    daily_data = spec.daily_data
    delta_labels = list(spec.delta_labels or [])
    today = spec.today or datetime.date.today()
    bar_width = spec.bar_width
    bars_override = list(spec.bars_override) if spec.bars_override else None
    legend_line = spec.legend_line or RENDER.study_legend

    lines: list[str] = []
    bars: list[tuple[str, str, int, int]] = []
    counts: list[str] = []
    max_bar_len = 0
    max_count_len = 0
    total_done = 0
    total_elapsed = 0

    for idx, (start, end) in enumerate(quarter_ranges):
        label = f"Q{idx + 1}"
        days = list(daterange(start, end))

        if bars_override:
            bar = bars_override[idx]
            elapsed_days = sum(1 for day in days if day <= today)
            done = sum(
                1
                for day in days
                if day <= today
                and _study_intensity_symbol(
                    _row_for_day(daily_data, day).get("study_minutes")
                )
                == RENDER.study_symbol_deep
            )
        else:
            bar_chars: list[str] = []
            done = 0
            elapsed_days = 0
            for day in days:
                if day > today:
                    bar_chars.append(RENDER.study_symbol_none)
                    continue
                elapsed_days += 1
                symbol = _study_intensity_symbol(
                    _row_for_day(daily_data, day).get("study_minutes")
                )
                bar_chars.append(symbol)
                if symbol != RENDER.study_symbol_none:
                    done += 1
            bar = _compress_symbols(bar_chars, bar_width)

        bars.append((label, bar, done, elapsed_days))
        count_str = f"({done:02d}/{elapsed_days:02d})" if elapsed_days else "(00/00)"
        counts.append(count_str)
        max_bar_len = max(max_bar_len, len(bar))
        max_count_len = max(max_count_len, len(count_str))
        total_done += done
        total_elapsed += elapsed_days

    header = f"┌ FULL STUDY DAYS ({total_done:02d}/{total_elapsed:02d})"
    lines.append(header)
    lines.append("│")

    for idx, ((label, bar, _, _), count_str) in enumerate(zip(bars, counts)):
        pad_between = (max_bar_len - len(bar)) + 1
        delta = delta_labels[idx] if idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""
        line = f"│ {label} {bar}{' ' * pad_between}{count_str.rjust(max_count_len)}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line.rstrip())

    lines.append("└")
    lines.append("")
    lines.append(legend_line)
    return lines
