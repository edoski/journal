"""
Chart and table rendering utilities for the journal sync system.

Provides functions for rendering bar charts, summary tables, activity tables,
and training/study grids at various time scales.
"""

from __future__ import annotations

import datetime

from dataclasses import dataclass

from sync.constants import DAYS, MONTH_ABBR, STUDY_TARGET_MIN, RENDER
from sync.formatting import round_half_up
from sync.dates import daterange, format_week_label


# ─────────────────────────────────────────────────────────────────────────────
# Bar Chart Presets
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class BarChartPreset:
    """Configuration for a specific bar chart layout."""

    height: int
    y_max: float
    bar_width: int
    col_spacing: int
    label_prefix: str
    axis_trim: int = 2  # Subtracted from col_spacing * labels for axis length
    left_pad: int | None = None  # None = auto-center bars in column
    center_labels_on_bars: bool = False
    delta_label_offset: int = 0  # Horizontal character shift for delta labels (negative = left)


# Weekly charts (7 days: MON-SUN)
WEEKLY_7DAY_CHART = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=8,
    label_prefix="   ",
)

WEEKLY_7DAY_MOOD = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=8,
    label_prefix="   ",
    center_labels_on_bars=True,
)

# Monthly charts (4-5 weeks, axis dynamically sized)
MONTHLY_WEEK_STUDY = BarChartPreset(
    height=10,
    y_max=40,
    bar_width=6,
    col_spacing=12,
    label_prefix=" ",
    left_pad=2,
)

MONTHLY_WEEK_METRIC = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=12,
    label_prefix=" ",
    left_pad=2,
)

MONTHLY_WEEK_MOOD = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=12,
    label_prefix=" ",
    left_pad=2,
    center_labels_on_bars=True,
)

# Quarterly charts (3 months: JAN/FEB/MAR etc.)
QUARTERLY_3MONTH_STUDY = BarChartPreset(
    height=12,
    y_max=240,
    bar_width=7,
    col_spacing=11,
    label_prefix="     ",
    left_pad=2,
)

QUARTERLY_3MONTH_METRIC = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=12,
    label_prefix="    ",
    axis_trim=5,
    left_pad=2,
)

QUARTERLY_3MONTH_MOOD = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=12,
    label_prefix="    ",
    axis_trim=5,
    left_pad=2,
    center_labels_on_bars=True,
)

# Yearly charts (4 quarters: Q1-Q4)
YEARLY_4QTR_STUDY = BarChartPreset(
    height=12,
    y_max=720,
    bar_width=7,
    col_spacing=11,
    label_prefix="    ",
    left_pad=2,
    delta_label_offset=-1,
)

YEARLY_4QTR_METRIC = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=11,
    label_prefix="    ",
    axis_trim=4,
    left_pad=2,
    delta_label_offset=-1,
)

YEARLY_4QTR_MOOD = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=11,
    label_prefix="    ",
    axis_trim=4,
    left_pad=2,
    center_labels_on_bars=True,
    delta_label_offset=-1,
)

# Test preset (used in unit tests)
TEST_CHART = BarChartPreset(
    height=10,
    y_max=10,
    bar_width=5,
    col_spacing=12,
    label_prefix=" ",
    axis_trim=3,  # 12 * 3 - 3 = 33 for 3 labels
)


def wrap_code_block(lines):
    return ["```"] + lines + ["```"]


def render_bar_chart(
    labels: list[str],
    values: list[float | None],
    value_labels: list[str],
    *,
    preset: BarChartPreset,
    delta_labels: list[str] | None = None,
) -> list[str]:
    """
    Unified bar chart renderer for all time spans (weekly, monthly, quarterly, yearly).

    Args:
        labels: X-axis labels (e.g., ["MON", "TUE", ...] or ["DEC 01-07", ...])
        values: Numeric values for bar heights (None/0 = no bar)
        value_labels: Formatted strings to display above bars
        preset: BarChartPreset configuration for this chart type
        delta_labels: Optional list of delta strings to show below x-axis labels

    Returns:
        List of strings representing the chart lines.

    Note:
        Uses floor-based bar heights with half-block (▄) for 0.5+ fractional values,
        providing visual precision to 0.5 increments (e.g., 30-minute intervals for time).

        For time-based charts (sleep/study), callers should pre-round values to nearest
        0.5 using: round(hours * 2) / 2. This ensures 7h57m (7.95h) displays as 8 bars
        rather than 7+half, giving proportionally accurate visuals while labels stay exact.
    """
    bar_char = "█"
    half_bar_char = "▄"

    # Extract preset values
    height = preset.height
    y_max = preset.y_max
    bar_width = preset.bar_width
    col_spacing = preset.col_spacing
    left_pad = preset.left_pad
    label_prefix = preset.label_prefix
    center_labels_on_bars = preset.center_labels_on_bars
    delta_label_offset = preset.delta_label_offset

    # Compute left_pad if not specified (center bars in column)
    if left_pad is None:
        computed_left_pad = (col_spacing - bar_width) // 2
    else:
        computed_left_pad = left_pad

    # Scale values to visual height using floor + half-block for 0.5+ fractional
    scale = height / y_max if y_max > 0 else 1
    bar_heights: list[int] = []
    has_half_block: list[bool] = []
    for val in values:
        if val is None or val == 0:
            bar_heights.append(0)
            has_half_block.append(False)
        else:
            scaled = val * scale
            full_height = int(scaled)  # floor
            fractional = scaled - full_height
            has_half = fractional >= 0.5
            # Cap at height (full blocks can't exceed height)
            bar_heights.append(min(height, max(0, full_height)))
            has_half_block.append(has_half and full_height < height)

    lines: list[str] = []
    bar_rows: list[str] = []

    # Check if any value is at max (needs overflow line for label)
    has_max_value = any(bar_h == height and bar_h > 0 for bar_h in bar_heights)
    if has_max_value:
        overflow_row = label_prefix
        for bar_h, label in zip(bar_heights, value_labels):
            if bar_h == height:
                label_str = str(label).strip("`") if label else ""
                if center_labels_on_bars and left_pad is None:
                    # Center label on bar when bars are centered
                    lbl_left_pad = computed_left_pad + (bar_width - len(label_str)) // 2
                else:
                    lbl_left_pad = computed_left_pad + (
                        1 if center_labels_on_bars else 0
                    )
                overflow_row += (
                    " " * lbl_left_pad
                    + label_str
                    + " " * (col_spacing - lbl_left_pad - len(label_str))
                )
            else:
                overflow_row += " " * col_spacing
        lines.append(overflow_row.rstrip())

    # Y-axis and bars with value labels on top
    for level in range(height, 0, -1):
        row = "│"
        for idx, (bar_h, label) in enumerate(zip(bar_heights, value_labels)):
            label_str = str(label).strip("`") if label else ""
            bar_has_half = has_half_block[idx]

            # Compute label padding
            if center_labels_on_bars and left_pad is None:
                # Center label on bar
                lbl_left_pad = computed_left_pad + (bar_width - len(label_str)) // 2
            elif center_labels_on_bars:
                lbl_left_pad = computed_left_pad + 1
            elif left_pad is None:
                # Center label in column
                lbl_left_pad = (col_spacing - len(label_str)) // 2
            else:
                lbl_left_pad = computed_left_pad

            # Determine the effective top level (including half-block)
            top_level = bar_h + 1 if bar_has_half else bar_h
            label_level = top_level + 1 if top_level < height else None

            if bar_h == 0 and not bar_has_half and level == 1:
                # Zero value - show label at level 1, no blocks
                row += (
                    " " * lbl_left_pad
                    + label_str
                    + " " * (col_spacing - lbl_left_pad - len(label_str))
                )
            elif bar_h == height and level <= height:
                # Max value - blocks fill all levels (label on overflow line)
                row += (
                    " " * computed_left_pad
                    + bar_char * bar_width
                    + " " * (col_spacing - computed_left_pad - bar_width)
                )
            elif label_level is not None and level == label_level and top_level < height:
                # One level above top of bar (non-max) - show label
                row += (
                    " " * lbl_left_pad
                    + label_str
                    + " " * (col_spacing - lbl_left_pad - len(label_str))
                )
            elif bar_has_half and level == bar_h + 1:
                # Half-block level - show ▄
                row += (
                    " " * computed_left_pad
                    + half_bar_char * bar_width
                    + " " * (col_spacing - computed_left_pad - bar_width)
                )
            elif bar_h > 0 and level <= bar_h:
                # Full bar level - show block
                row += (
                    " " * computed_left_pad
                    + bar_char * bar_width
                    + " " * (col_spacing - computed_left_pad - bar_width)
                )
            else:
                # Empty space
                row += " " * col_spacing
        row = row.rstrip()
        bar_rows.append(row)

    # Axis row (length computed from labels count and preset spacing)
    axis_dashes = preset.col_spacing * len(labels) - preset.axis_trim
    axis_row = "└" + "─" * axis_dashes

    lines.extend(bar_rows)
    lines.append(axis_row)

    # X-axis labels row
    label_row = label_prefix
    for label in labels:
        label_str = str(label)
        label_row += label_str + " " * (col_spacing - len(label_str))
    lines.append(label_row.rstrip())

    # Delta labels row (if provided)
    if delta_labels:
        delta_row = label_prefix
        for idx, delta in enumerate(delta_labels):
            delta_str = str(delta) if delta is not None else ""
            label_len = len(str(labels[idx])) if idx < len(labels) else col_spacing
            center_pad = (label_len - len(delta_str)) // 2
            delta_left_pad = max(center_pad + delta_label_offset, 0)
            remaining = col_spacing - delta_left_pad - len(delta_str)
            if remaining < 0:
                remaining = 0
            delta_row += " " * delta_left_pad + delta_str + " " * remaining
        lines.append(delta_row.rstrip())

    return lines


def render_training_quarter_block(
    labels,
    counts,
    delta_labels=None,
    bar_width=30,
    bars_override=None,
    fill_char="■",
    empty_char="·",
):
    """
    Render per-quarter training rows (no header/footer), aligned counts and deltas.
    counts: list of (done, elapsed) tuples.
    """
    lines = []
    max_label_len = max((len(label) for label in labels), default=0)
    count_strs = (
        [
            f"({done:02d}/{elapsed:02d})" if elapsed else "(00/00)"
            for done, elapsed in counts
        ]
        if counts
        else []
    )
    max_count_len = max((len(s) for s in count_strs), default=0)

    for idx, (label, (done, elapsed)) in enumerate(zip(labels, counts)):
        if bars_override:
            bar = bars_override[idx]
            bar_len = len(bar)
        else:
            elapsed = max(elapsed, 0)
            done = max(0, min(done, elapsed))
            bar_len = round_half_up((done / elapsed) * bar_width) if elapsed > 0 else 0
            bar_len = min(bar_width, max(0, bar_len))
            bar = fill_char * bar_len + empty_char * (bar_width - bar_len)
        count_str = count_strs[idx].rjust(max_count_len) if count_strs else ""
        delta = delta_labels[idx] if delta_labels and idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""

        line = f"│ {label.ljust(max_label_len)} {bar}"
        if count_str:
            line += f" {count_str}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line.rstrip())

    return lines


def render_training_frequency_grid(
    week_ranges,
    daily_data,
    workout_count,
    stretch_count,
    days_in_period,
    workout_delta_labels=None,
    stretch_delta_labels=None,
    current_date=None,
):
    """
    Render the monthly training grid as two stacked blocks (WORKOUT, STRETCH)
    with per-week separators and deltas beneath the week labels.

    Example shape:
    ┌ WORKOUT
    │
    │ ■ · ■ ■ · ■ ■   …
    │ ─────────────   …
    │   DEC 01-07     …
    │       —         …

    ┌ STRETCH
    │
    │ · · · · · · ·   …
    │ ─────────────   …
    │   DEC 01-07     …
    │       —         …
    """
    lines = []

    workout_symbols = []
    stretch_symbols = []
    week_labels = []
    week_day_counts = []

    for start, end in week_ranges:
        week_days = list(daterange(start, end))
        week_day_counts.append(len(week_days))
        week_labels.append(format_week_label(start, end))

        for day in week_days:
            entry = daily_data.get(day, {})
            workout_symbols.append("■" if entry.get("workout") else "·")
            stretch_symbols.append("■" if entry.get("stretch") else "·")

    max_days = max(week_day_counts) if week_day_counts else 0
    week_width = max_days * 2 - 1 if max_days > 0 else 0

    def _build_symbol_row(symbols):
        row = "│ "
        idx = 0
        for pos, day_count in enumerate(week_day_counts):
            week = " ".join(symbols[idx : idx + day_count])
            row += week.ljust(week_width)
            idx += day_count
            if pos < len(week_day_counts) - 1:
                row += "   "
        return row.rstrip()

    def _build_separator_row():
        row = "│ "
        for pos in range(len(week_day_counts)):
            row += "─" * week_width
            if pos < len(week_day_counts) - 1:
                row += "   "
        return row.rstrip()

    def _build_label_row():
        row = "│ "
        for pos, label in enumerate(week_labels):
            left_pad = max((week_width - len(label)) // 2, 0)
            row += (
                " " * left_pad
                + label
                + " " * max(week_width - left_pad - len(label), 0)
            )
            if pos < len(week_labels) - 1:
                row += "   "
        return row.rstrip()

    def _build_delta_row(deltas, prefix="│ "):
        if not deltas:
            return None
        row = prefix
        any_label = False
        for pos in range(len(week_day_counts)):
            label_str = (deltas[pos] if pos < len(deltas) else "") or ""
            if label_str:
                any_label = True
            left_pad = max((week_width - len(label_str)) // 2, 0)
            row += (
                " " * left_pad
                + label_str
                + " " * max(week_width - left_pad - len(label_str), 0)
            )
            if pos < len(week_day_counts) - 1:
                row += "   "
        return row.rstrip() if any_label else None

    # Pre-compute arrow placement (shared by workout/stretch blocks)
    arrow_col = None
    if current_date:
        for w_idx, (start, end) in enumerate(week_ranges):
            if start <= current_date <= end:
                day_idx = (current_date - start).days
                day_idx = min(day_idx, max(week_day_counts[w_idx] - 1, 0))
                arrow_col = len("│ ") + w_idx * (week_width + 3) + day_idx * 2
                break

    def _build_activity_block(title, symbols, deltas):
        symbol_row = _build_symbol_row(symbols)
        separator_row = _build_separator_row()
        label_row = _build_label_row()
        delta_row = _build_delta_row(deltas, prefix="└ ")

        max_width = max(
            len(symbol_row),
            len(separator_row),
            len(label_row),
            len(delta_row) if delta_row else 0,
        )

        block = [f"┌ {title}"]
        # Arrow line (or blank spacer) under the header
        if arrow_col is not None:
            arrow_line = [" "] * max_width
            arrow_line[0] = "│"
            if arrow_col < max_width:
                arrow_line[arrow_col] = "↓"
            block.append("".join(arrow_line).rstrip())
        else:
            block.append("│")

        block.append(symbol_row)
        block.append(separator_row)
        block.append(label_row)
        if delta_row:
            block.append(delta_row)
        return block

    lines.extend(
        _build_activity_block("WORKOUT", workout_symbols, workout_delta_labels)
    )
    lines.append("")  # blank line between activity blocks
    lines.extend(
        _build_activity_block("STRETCH", stretch_symbols, stretch_delta_labels)
    )

    return lines


def render_weekly_training_grid(
    dates, daily_data, workout_count, stretch_count, current_date=None
):
    """
    Render a compact frequency grid showing workout/stretch activity for a single week.

    dates: list of 7 date objects (Monday-Sunday)
    daily_data: dict mapping date -> parsed daily note data
    workout_count: total number of workout days
    stretch_count: total number of stretch days

    Returns list of lines for the frequency grid visualization.

    Format:
    │ WORKOUT:  ███ ░░░ ███ ███ ░░░ ███ ███   (5/7)
    │ STRETCH:  ░░░ ███ ███ ░░░ ███ ░░░ ███   (4/7)
    │           ─── ─── ─── ─── ─── ─── ───
    │           MON TUE WED THU FRI SAT SUN
    """
    lines = []

    # Build workout and stretch symbols
    workout_symbols = []
    stretch_symbols = []

    for day in dates:
        entry = daily_data.get(day, {})
        has_workout = entry.get("workout", False)
        has_stretch = entry.get("stretch", False)

        workout_symbols.append("███" if has_workout else "░░░")
        stretch_symbols.append("███" if has_stretch else "░░░")

    prefix_workout = "│ WORKOUT:  "
    prefix_stretch = "│ STRETCH:  "

    # Build the two main rows (each day takes 4 chars: 3-char block + 1 space)
    workout_row = prefix_workout + " ".join(workout_symbols) + f"   ({workout_count}/7)"
    stretch_row = prefix_stretch + " ".join(stretch_symbols) + f"   ({stretch_count}/7)"

    # Arrow placement (only when current_date is within this week)
    arrow_line = None
    if current_date and dates[0] <= current_date <= dates[-1]:
        day_idx = (current_date - dates[0]).days
        day_idx = max(0, min(day_idx, 6))
        arrow_col = len(prefix_workout) + day_idx * 4 + 1  # center of 3-char block
        width = len(workout_row)
        if arrow_col >= width:
            width = arrow_col + 1
        arrow_chars = [" "] * width
        arrow_chars[0] = "┌"
        if arrow_col < len(arrow_chars):
            arrow_chars[arrow_col] = "↓"
        arrow_line = "".join(arrow_chars).rstrip()

    if arrow_line:
        lines.append(arrow_line)
    else:
        lines.append("┌")

    lines.append(workout_row)
    lines.append(stretch_row)

    # Build separator row (3 dashes per day)
    separator_row = "│           " + " ".join(["───"] * 7)
    lines.append(separator_row)

    # Build label row with day names (use bottom-left corner)
    label_row = "└           " + " ".join(DAYS)
    lines.append(label_row)

    return lines


def study_intensity_symbol(minutes):
    """Binary mapping: target met vs not met."""
    mins = minutes or 0
    return RENDER.study_symbol_deep if mins >= STUDY_TARGET_MIN else RENDER.study_symbol_none


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

    def _build_symbol_row():
        row = "│ "
        idx = 0
        for pos, day_count in enumerate(week_day_counts):
            week = " ".join(symbols[idx : idx + day_count])
            row += week.ljust(week_width)
            idx += day_count
            if pos < len(week_day_counts) - 1:
                row += "   "
        return row.rstrip()

    def _build_separator_row():
        row = "│ "
        for pos in range(len(week_day_counts)):
            row += "─" * week_width
            if pos < len(week_day_counts) - 1:
                row += "   "
        return row.rstrip()

    def _build_label_row():
        row = "│ "
        for pos, label in enumerate(week_labels):
            left_pad = max((week_width - len(label)) // 2, 0)
            row += (
                " " * left_pad
                + label
                + " " * max(week_width - left_pad - len(label), 0)
            )
            if pos < len(week_labels) - 1:
                row += "   "
        return row.rstrip()

    def _build_delta_row():
        if not delta_labels:
            return None
        row = "│ "
        any_label = False
        for pos in range(len(week_day_counts)):
            label_str = (delta_labels[pos] if pos < len(delta_labels) else "") or ""
            if label_str:
                any_label = True
            left_pad = max((week_width - len(label_str)) // 2, 0)
            row += (
                " " * left_pad
                + label_str
                + " " * max(week_width - left_pad - len(label_str), 0)
            )
            if pos < len(week_day_counts) - 1:
                row += "   "
        return row.rstrip() if any_label else None

    arrow_col = None
    if current_date:
        for w_idx, (start, end) in enumerate(week_ranges):
            if start <= current_date <= end:
                day_idx = (current_date - start).days
                day_idx = min(day_idx, max(week_day_counts[w_idx] - 1, 0))
                arrow_col = len("│ ") + w_idx * (week_width + 3) + day_idx * 2
                break

    symbol_row = _build_symbol_row()
    separator_row = _build_separator_row()
    label_row = _build_label_row()
    delta_row = _build_delta_row()
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


def _compress_days_time_order(
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
    return _compress_days_time_order(
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


def render_waterfall_chart(
    app_totals: dict[str, float],
    *,
    bar_width: int = 40,
    fill_char: str = "█",
) -> list[str]:
    """
    Render a horizontal waterfall chart showing screen time by app.

    Apps are sorted by duration descending. Each app shows a proportional
    bar offset from previous apps, with duration and percentage.

    Args:
        app_totals: Dict mapping app names to total minutes.
        bar_width: Width of the bar area (default 40).
        fill_char: Character for filled bars.

    Returns:
        List of lines for the chart, including header and total row.
    """
    from sync.formatting import format_minutes

    lines = ["### **PROCRASTINATION**"]

    if not app_totals:
        lines.append("")
        lines.append("_No screen time data available._")
        return lines

    # Sort by duration descending
    sorted_apps = sorted(app_totals.items(), key=lambda x: x[1], reverse=True)
    total_minutes = sum(app_totals.values())

    if total_minutes == 0:
        lines.append("")
        lines.append("_No screen time data available._")
        return lines

    lines.append("┌")

    # Find max app name length for alignment
    max_name_len = max(len(app) for app, _ in sorted_apps)
    max_name_len = max(max_name_len, 5)  # At least "TOTAL" width

    # Calculate percentages using largest remainder method (ensures sum = 100%)
    exact_pcts = [
        (minutes / total_minutes * 100) if total_minutes > 0 else 0
        for _, minutes in sorted_apps
    ]
    floored = [int(pct) for pct in exact_pcts]
    remainders = [(i, pct - floored[i]) for i, pct in enumerate(exact_pcts)]
    remainder_needed = 100 - sum(floored)

    # Sort by remainder descending, add 1 to top entries
    remainders.sort(key=lambda x: x[1], reverse=True)
    for i in range(min(remainder_needed, len(remainders))):
        floored[remainders[i][0]] += 1

    # Build waterfall rows - first pass to calculate bars and total_width
    bar_rows = []
    offset = 0
    for idx, (app, minutes) in enumerate(sorted_apps):
        # Calculate bar width proportional to total
        bar_len = round(minutes / total_minutes * bar_width) if total_minutes > 0 else 0
        bar_len = max(1, min(bar_width - offset, bar_len))  # At least 1 char

        # Use pre-calculated percentage from largest remainder method
        pct = floored[idx]

        # Build the bar with offset
        bar = " " * offset + fill_char * bar_len

        # Format duration and percentage
        duration_str = format_minutes(minutes)
        pct_str = f"({pct}%)"

        bar_rows.append((app, bar, duration_str, pct_str))
        offset += bar_len

    # total_width is the sum of all individual bars
    total_width = offset

    # Second pass: output rows with consistent alignment to total_width
    for app, bar, duration_str, pct_str in bar_rows:
        bar_padded = bar.ljust(total_width)
        line = f"│ {app.ljust(max_name_len)} {bar_padded} {duration_str.rjust(6)} {pct_str.rjust(5)}"
        lines.append(line.rstrip())

    # Separator and total row
    separator = "━" * total_width
    lines.append(f"│ {' ' * max_name_len} {separator}")
    total_str = format_minutes(total_minutes)
    total_bar = fill_char * total_width
    lines.append(f"└ {'TOTAL'.ljust(max_name_len)} {total_bar} {total_str.rjust(6)}")

    return lines


def render_screen_time_trend_table(
    dates: list,
    daily_data: dict,
    period_label: str = "DAY",
) -> list[str]:
    """
    Render a trend table showing daily screen time.

    Args:
        dates: List of date objects.
        daily_data: Dict mapping dates to parsed daily note data.
        period_label: Label for the first column (DAY/WEEK/MONTH/QTR).

    Returns:
        List of markdown table lines.
    """
    from sync.formatting import format_minutes
    from sync.constants import DAYS
    import datetime

    today = datetime.date.today()
    lines = []
    lines.append(f"| {period_label} | SCREEN |")
    lines.append("| ----- | -------- |")

    total_minutes = 0.0
    for i, d in enumerate(dates):
        day_name = DAYS[i] if period_label == "DAY" and i < len(DAYS) else d.strftime("%a").upper()
        # Wikilink to daily note: [[2025-01-06\|MON]]
        label = f"[[{d.isoformat()}\\|{day_name}]]"
        data = daily_data.get(d, {})
        screen_time = data.get("screen_time_totals", {})
        day_total = sum(screen_time.values()) if screen_time else 0

        if d > today:
            duration_str = "—"
        elif day_total > 0:
            duration_str = f"`+{format_minutes(day_total)}`"
            total_minutes += day_total
        else:
            duration_str = "`0m`"

        lines.append(f"| **{label}** | {duration_str} |")

    # Total row
    total_str = f"`{format_minutes(total_minutes)}`" if total_minutes else "`0m`"
    lines.append(f"| **TOTAL** | **{total_str}** |")

    return lines


def render_screen_time_period_table(
    period_ranges: list[tuple],
    daily_data: dict,
    period_label: str = "WEEK",
    labels: list[str] | None = None,
    wikilinks: list[str] | None = None,
) -> list[str]:
    """
    Render a trend table showing screen time aggregated by period (week/month/quarter).

    Args:
        period_ranges: List of (start_date, end_date) tuples for each period.
        daily_data: Dict mapping dates to parsed daily note data.
        period_label: Label for the first column (WEEK/MONTH/QTR).
        labels: Optional list of labels for each period. If None, uses W1/W2/etc.
        wikilinks: Optional list of pre-built wikilinks for each period.
                   If provided, these are used instead of plain labels.

    Returns:
        List of markdown table lines.
    """
    from sync.formatting import format_minutes
    from sync.dates import daterange
    import datetime

    today = datetime.date.today()
    lines = []
    lines.append(f"| {period_label} | SCREEN |")
    lines.append("| ----- | -------- |")

    total_minutes = 0.0
    for i, (start, end) in enumerate(period_ranges):
        # Use wikilink if provided, otherwise plain label
        if wikilinks and i < len(wikilinks):
            display_label = wikilinks[i]
        elif labels and i < len(labels):
            display_label = labels[i]
        else:
            display_label = f"W{i + 1}" if period_label == "WEEK" else f"M{i + 1}"

        period_total = 0.0
        for d in daterange(start, end):
            data = daily_data.get(d, {})
            screen_time = data.get("screen_time_totals", {})
            period_total += sum(screen_time.values()) if screen_time else 0

        if start > today:
            duration_str = "—"
        elif period_total > 0:
            duration_str = f"`+{format_minutes(period_total)}`"
            total_minutes += period_total
        else:
            duration_str = "`0m`"

        lines.append(f"| **{display_label}** | {duration_str} |")

    # Total row
    total_str = f"`{format_minutes(total_minutes)}`" if total_minutes else "`0m`"
    lines.append(f"| **TOTAL** | **{total_str}** |")

    return lines


