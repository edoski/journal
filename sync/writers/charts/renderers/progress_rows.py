"""Progress-row chart renderers."""

from __future__ import annotations

import datetime

from sync.contracts.metrics import DailyAggregate
from sync.constants import MONTH_ABBR, RENDER, STUDY_TARGET_MIN
from sync.dates import daterange
from sync.formatting import round_half_up

from .common import compress_coverage_symbols, row_for_day
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
) -> DailyAggregate | None:
    return row_for_day(daily_data, day)


def _study_minutes_for_day(
    daily_data: dict[datetime.date, DailyAggregate],
    day: datetime.date,
) -> float | None:
    entry = _row_for_day(daily_data, day)
    return entry["study_minutes"] if entry is not None else None


def _compress_symbols(symbols: list[str], target_width: int) -> str:
    return compress_coverage_symbols(
        symbols,
        target_width,
        deep_symbol=RENDER.study_symbol_deep,
        none_symbol=RENDER.study_symbol_none,
    )


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
    if len(labels) != len(counts):
        raise ValueError("labels and counts must have the same length")
    if bars_override is not None and len(bars_override) != len(counts):
        raise ValueError("bars_override and counts must have the same length")
    if not labels:
        return []

    lines: list[str] = []
    max_label_len = max(len(label) for label in labels)
    count_strs = [
        f"({done:02d}/{elapsed:02d})" if elapsed else "(00/00)"
        for done, elapsed in counts
    ]
    max_count_len = max(len(text) for text in count_strs)
    bars: list[str] = []

    for idx, (done, elapsed) in enumerate(counts):
        if bars_override is not None:
            bar = bars_override[idx]
        else:
            elapsed = max(elapsed, 0)
            done = max(0, min(done, elapsed))
            bar_len = round_half_up((done / elapsed) * bar_width) if elapsed > 0 else 0
            bar_len = min(bar_width, max(0, bar_len))
            bar = fill_char * bar_len + empty_char * (bar_width - bar_len)
        bars.append(bar)

    max_bar_len = max(len(bar) for bar in bars)

    for idx, label in enumerate(labels):
        bar = bars[idx]
        count_str = count_strs[idx].rjust(max_count_len)
        delta = delta_labels[idx] if idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""

        line = f"│ {label.ljust(max_label_len)} {bar.ljust(max_bar_len)}"
        if count_str:
            line += f" {count_str}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line)

    return lines


def render_training_block_rows(spec: TrainingBlockRowsSpec) -> list[str]:
    """Render rows in compact training-block mode."""
    labels = list(spec.labels)
    counts = list(spec.counts)
    delta_labels = list(spec.delta_labels or [])
    bars_override = list(spec.bars_override) if spec.bars_override is not None else None
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
                if section.bars_override is not None
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
            symbol = _study_intensity_symbol(_study_minutes_for_day(daily_data, day))
            bar_chars.append(symbol)
            if symbol != RENDER.study_symbol_none:
                done += 1
            elapsed_days += 1

        bar = "".join(bar_chars)
        bars.append((label, bar, done, elapsed_days))
        count_str = f"({done:02d}/{elapsed_days:02d})" if elapsed_days else "(00/00)"
        counts.append(count_str)
        total_done += done
        total_elapsed += elapsed_days

    if not bars:
        return ["┌ FULL STUDY DAYS (00/00)", "│", "└", "", RENDER.study_legend]

    max_bar_len = max(len(bar) for _, bar, _, _ in bars)

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
        line = f"│ {label} {bar}{' ' * pad_between}{count_str}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line)

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
                and _study_intensity_symbol(_study_minutes_for_day(daily_data, day))
                == RENDER.study_symbol_deep
            )
        else:
            observed_days = [day for day in days if day <= today]
            future_days = len(days) - len(observed_days)
            bar_chars: list[str] = []
            done = 0
            elapsed_days = len(observed_days)
            for day in observed_days:
                symbol = _study_intensity_symbol(
                    _study_minutes_for_day(daily_data, day)
                )
                bar_chars.append(symbol)
                if symbol != RENDER.study_symbol_none:
                    done += 1
            bar_chars.extend([RENDER.study_symbol_none] * future_days)
            bar = _compress_symbols(bar_chars, bar_width)

        bars.append((label, bar, done, elapsed_days))
        count_str = f"({done:02d}/{elapsed_days:02d})" if elapsed_days else "(00/00)"
        counts.append(count_str)
        total_done += done
        total_elapsed += elapsed_days

    if not bars:
        return ["┌ FULL STUDY DAYS (00/00)", "│", "└", "", legend_line]

    max_bar_len = max(len(bar) for _, bar, _, _ in bars)

    header = f"┌ FULL STUDY DAYS ({total_done:02d}/{total_elapsed:02d})"
    lines.append(header)
    lines.append("│")

    for idx, ((label, bar, _, _), count_str) in enumerate(zip(bars, counts)):
        pad_between = (max_bar_len - len(bar)) + 1
        delta = delta_labels[idx] if idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""
        line = f"│ {label} {bar}{' ' * pad_between}{count_str}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line)

    lines.append("└")
    lines.append("")
    lines.append(legend_line)
    return lines
