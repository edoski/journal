"""Study coverage grids and compression helpers."""

from __future__ import annotations

import datetime

from sync.constants import DAYS, MONTH_ABBR, RENDER, STUDY_TARGET_MIN
from sync.dates import daterange, format_week_label

from .grid import GridRowBuilder


def study_intensity_symbol(minutes):
    """Binary mapping: target met vs not met."""
    mins = minutes or 0
    return (
        RENDER.study_symbol_deep
        if mins >= STUDY_TARGET_MIN
        else RENDER.study_symbol_none
    )


def render_weekly_study_grid(dates, daily_data, current_date=None):
    """
    Weekly study coverage grid (single row, binary target).
    Uses training-style blocks: ███ (met), ░░░ (not met).
    """
    lines = []
    today = datetime.date.today()

    met_symbol = "███"
    none_symbol = "░░░"

    study_symbols = []
    for day in dates:
        minutes = daily_data.get(day, {}).get("study_minutes")
        if day > today:
            study_symbols.append(none_symbol)
        else:
            study_symbols.append(
                met_symbol if minutes and minutes >= STUDY_TARGET_MIN else none_symbol
            )

    study_done = sum(1 for sym in study_symbols if sym == met_symbol)
    study_total = len(dates)

    lines.append("┌ FULL STUDY DAYS")

    if current_date and dates[0] <= current_date <= dates[-1]:
        day_idx = (current_date - dates[0]).days
        day_idx = max(0, min(day_idx, len(dates) - 1))
        arrow_col = 3 + day_idx * 4  # center of 3-char block
        arrow_line = [" "] * (4 + len(study_symbols) * 4)
        arrow_line[0] = "│"
        if arrow_col < len(arrow_line):
            arrow_line[arrow_col] = "↓"
        lines.append("".join(arrow_line).rstrip())
    else:
        lines.append("│")

    lines.append("│ " + " ".join(study_symbols) + f"   ({study_done}/{study_total})")
    lines.append("│ " + " ".join(["───"] * 7))
    lines.append("└ " + " ".join(DAYS))
    lines.append("")
    lines.append(RENDER.study_legend.replace("█", "███").replace("·", "░░░"))
    return lines


def render_monthly_study_grid(
    week_ranges, daily_data, current_date=None, delta_labels=None
):
    """
    Monthly study coverage grid (single block, per-day symbols, per-week grouping).
    Mirrors the training monthly grid for spacing and arrow logic.
    """
    lines = []
    today = datetime.date.today()

    symbols = []
    week_labels = []
    week_day_counts = []
    total_done = 0
    total_elapsed = 0

    for start, end in week_ranges:
        week_days = list(daterange(start, end))
        week_day_counts.append(len(week_days))
        week_labels.append(format_week_label(start, end))

        for day in week_days:
            if day > today:
                symbols.append(RENDER.study_symbol_none)
            else:
                symbol = study_intensity_symbol(
                    daily_data.get(day, {}).get("study_minutes")
                )
                symbols.append(symbol)
                total_elapsed += 1
                if symbol == RENDER.study_symbol_deep:
                    total_done += 1

    max_days = max(week_day_counts) if week_day_counts else 0
    week_width = max_days * 2 - 1 if max_days > 0 else 0

    # Use GridRowBuilder for shared row building logic
    grid = GridRowBuilder(
        week_day_counts=week_day_counts,
        week_width=week_width,
        week_labels=week_labels,
    )

    arrow_col = None
    if current_date:
        for w_idx, (start, end) in enumerate(week_ranges):
            if start <= current_date <= end:
                day_idx = (current_date - start).days
                day_idx = min(day_idx, max(week_day_counts[w_idx] - 1, 0))
                arrow_col = len("│ ") + w_idx * (week_width + 3) + day_idx * 2
                break

    symbol_row = grid.build_symbol_row(symbols)
    separator_row = grid.build_separator_row()
    label_row = grid.build_label_row()
    delta_row = grid.build_delta_row(delta_labels)
    max_width = max(
        len(symbol_row),
        len(separator_row),
        len(label_row),
        len(delta_row) if delta_row else 0,
    )

    header_suffix = (
        f" ({total_done:02d}/{total_elapsed:02d})" if total_elapsed else " (00/00)"
    )
    lines.append(f"┌ FULL STUDY DAYS{header_suffix}")
    if arrow_col is not None:
        arrow_line = [" "] * max_width
        arrow_line[0] = "│"
        if arrow_col < max_width:
            arrow_line[arrow_col] = "↓"
        lines.append("".join(arrow_line).rstrip())
    else:
        lines.append("│")

    lines.append(symbol_row)
    lines.append(separator_row)
    lines.append(label_row)
    if delta_row:
        # Match training layout: use bottom-left corner on delta row
        lines.append(delta_row.replace("│ ", "└ ", 1))
    else:
        lines.append("└")
    lines.append("")
    lines.append(RENDER.study_legend)
    return lines


def _compress_symbols(symbols, target_width):
    """
    Compress a sequence of symbols into a fixed width by bucketing days.
    Chooses the highest-intensity symbol present in each bucket.
    """
    if target_width <= 0:
        return ""
    total = len(symbols)
    if total == 0:
        return RENDER.study_symbol_none * target_width
    if total <= target_width:
        return "".join(symbols) + RENDER.study_symbol_none * (target_width - total)

    # Use proportional mapping: each character covers (total / target_width) symbols
    # This ensures all characters represent actual days, no empty filler at end
    compressed = []
    for i in range(target_width):
        # Calculate which symbols fall into this bucket using float boundaries
        start_f = i * total / target_width
        end_f = (i + 1) * total / target_width
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


def compress_days_time_order(
    days,
    met_fn,
    target_width,
    *,
    allow_partial=False,
    fill_char="█",
    partial_char="░",
    empty_char="·",
    today=None,
):
    """
    Compress a time-ordered list of days into a fixed-width string.
    - days: list of date objects in chronological order
    - met_fn(day): returns True if the day meets the criterion
    - allow_partial: if True, use partial_char when some but not all observed days
      in the bucket meet the criterion
    - future days (day > today) are treated as not met and do not trigger partial
    """
    today = today or datetime.date.today()
    total = len(days)
    if target_width <= 0 or total == 0:
        return empty_char * max(target_width, 0)

    # Use proportional mapping: each character covers (total / target_width) days
    # This ensures all characters represent actual days, no empty filler at end
    symbols = []
    for i in range(target_width):
        # Calculate which days fall into this bucket using float boundaries
        start_f = i * total / target_width
        end_f = (i + 1) * total / target_width
        start = int(start_f)
        end = int(end_f) if end_f == int(end_f) else int(end_f) + 1
        end = min(end, total)

        bucket = days[start:end]
        if not bucket:
            symbols.append(empty_char)
            continue
        observed = [d for d in bucket if d <= today]
        if not observed:
            symbols.append(empty_char)
            continue
        hits = sum(1 for d in observed if met_fn(d))
        if hits == 0:
            symbols.append(empty_char)
        elif hits == len(observed):
            symbols.append(fill_char)
        else:
            symbols.append(partial_char if allow_partial else fill_char)
    return "".join(symbols)


def compress_activity_time_order(
    days, has_activity_fn, target_width, *, fill_char="■", empty_char="·", today=None
):
    """
    Time-ordered compression for binary activity (workout/stretch).
    """
    return compress_days_time_order(
        days,
        has_activity_fn,
        target_width,
        allow_partial=False,
        fill_char=fill_char,
        partial_char=fill_char,  # unused when allow_partial=False
        empty_char=empty_char,
        today=today,
    )


def render_quarterly_study_coverage(
    month_ranges, daily_data, today=None, delta_labels=None
):
    """
    Per-month study coverage rows (intensity symbols + counts).
    Optional delta_labels mirrors training monthly deltas (per-month percent change).
    """
    today = today or datetime.date.today()
    lines = []
    bars = []
    counts = []
    max_bar_len = 0
    max_count_len = 0
    total_done = 0
    total_elapsed = 0

    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        days = list(daterange(start, end))
        bar_chars = []
        done = 0
        elapsed_days = 0
        for d in days:
            if d > today:
                bar_chars.append(RENDER.study_symbol_none)
                continue
            symbol = study_intensity_symbol(daily_data.get(d, {}).get("study_minutes"))
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
        delta = delta_labels[idx] if delta_labels and idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""
        line = f"│ {label} {bar}{' ' * pad_between}{count_str.rjust(max_count_len)}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line.rstrip())
    lines.append("└")
    lines.append("")
    lines.append(RENDER.study_legend)
    return lines


def render_yearly_study_coverage(
    quarter_ranges,
    daily_data,
    today=None,
    bar_width=30,
    delta_labels=None,
    bars_override=None,
    legend_line=RENDER.study_legend,
):
    """
    Per-quarter study coverage rows (intensity symbols + counts).

    bar_width controls how many characters each quarter's bar occupies after
    compressing the days in that quarter. Higher values reduce quantization
    jitter while keeping the chart compact.
    delta_labels (optional) mirrors training bars: per-quarter percent-change
    strings aligned to the right of the counts.
    """
    today = today or datetime.date.today()
    lines = []
    bars = []
    counts = []
    max_bar_len = 0
    max_count_len = 0
    total_done = 0
    total_elapsed = 0

    for idx, (start, end) in enumerate(quarter_ranges):
        label = f"Q{idx + 1}"
        days = list(daterange(start, end))
        if bars_override:
            bar = bars_override[idx]
            elapsed_days = sum(1 for d in days if d <= today)
            done = sum(
                1
                for d in days
                if d <= today
                and study_intensity_symbol(daily_data.get(d, {}).get("study_minutes"))
                == RENDER.study_symbol_deep
            )
        else:
            bar_chars = []
            done = 0
            elapsed_days = 0
            for d in days:
                if d > today:
                    bar_chars.append(RENDER.study_symbol_none)
                    continue
                elapsed_days += 1
                symbol = study_intensity_symbol(
                    daily_data.get(d, {}).get("study_minutes")
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
        delta = delta_labels[idx] if delta_labels and idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""
        line = f"│ {label} {bar}{' ' * pad_between}{count_str.rjust(max_count_len)}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line.rstrip())
    lines.append("└")
    lines.append("")
    lines.append(legend_line)
    return lines
