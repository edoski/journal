"""
Chart and table rendering utilities for the journal sync system.

Provides functions for rendering bar charts, summary tables, activity tables,
and training/study grids at various time scales.
"""
from __future__ import annotations

import datetime
from typing import Any

from .constants import (
    DAYS,
    MONTH_ABBR,
    STUDY_SYMBOL_DEEP,
    STUDY_SYMBOL_NONE,
    STUDY_LEGEND_LINE,
    STUDY_TARGET_MIN,
)
from .parsing import (
    format_minutes,
    format_training_ratio,
    format_mood_with_scale,
    format_ma_training_ratio,
    compute_percent_change,
    format_percent_change,
    round_half_up,
)
from .dates import daterange, format_week_label


def render_sleep_stats_table(
    sleep_avg: float | None,
    avg_awake: float | None,
    avg_awakenings: float | None,
) -> list[str]:
    """
    Render the SLEEP statistics table with average metrics.

    Args:
        sleep_avg: Average sleep duration in minutes.
        avg_awake: Average awake time during sleep in minutes.
        avg_awakenings: Average number of awakenings per night.

    Returns:
        List of markdown table lines.
    """
    lines: list[str] = []
    lines.append("| ACTIVITY | AVERAGE |")
    lines.append("| -------- | ------- |")
    lines.append(f"| **SLEEP**      | `{format_minutes(sleep_avg)}` |" if sleep_avg is not None else "| **SLEEP**      | |")
    lines.append(f"| **AWAKE**      | `{format_minutes(avg_awake)}` |" if avg_awake is not None else "| **AWAKE**      | |")
    if avg_awakenings is not None:
        awaken_val = f"{avg_awakenings:.1f}" if abs(avg_awakenings - round(avg_awakenings)) >= 0.05 else str(int(round(avg_awakenings)))
        lines.append(f"| **AWAKENINGS** | `{awaken_val}` |")
    else:
        lines.append("| **AWAKENINGS** | |")
    return lines


def render_activity_table(activity_totals: dict[str, float]) -> list[str]:
    """
    Render the ACTIVITY breakdown table with time and share percentages.

    Args:
        activity_totals: Dict mapping activity names to total minutes.

    Returns:
        List of markdown table lines sorted by time (descending).
    """
    lines: list[str] = []
    lines.append("| ACTIVITY | TIME | SHARE |")
    lines.append("| -------- | ---- | ----- |")
    total_activity = sum(activity_totals.values())
    if activity_totals:
        for activity, mins in sorted(activity_totals.items(), key=lambda x: x[1], reverse=True):
            share = f"{int(round((mins / total_activity) * 100))}%" if total_activity else "0%"
            lines.append(f"| **{activity}** | `{format_minutes(mins)}` | `{share}` |")
    else:
        lines.append("|  |  |  |")
    return lines


def render_interrupts_table(avg_interrupts: float, avg_overruns: float) -> list[str]:
    """
    Render the INTERRUPTS/OVERRUNS metrics table.

    Args:
        avg_interrupts: Average interrupt minutes per study day.
        avg_overruns: Average overrun minutes per study day.

    Returns:
        List of markdown table lines.
    """
    lines: list[str] = []
    lines.append("| METRIC | AVERAGE |")
    lines.append("| ------ | ------- |")
    lines.append(f"| **INTERRUPTS** | `{format_minutes(avg_interrupts, always_show_both=True)}/day` |")
    lines.append(f"| **OVERRUNS**   | `{format_minutes(avg_overruns, always_show_both=True)}/day` |")
    return lines


def wrap_code_block(lines):
    return ["```"] + lines + ["```"]
def render_summary_table(
    current_metrics,
    previous_metrics,
    current_label,
    previous_label,
    ma_metrics=None,
    ma_label=None,
    ma_training_unit="7",
):
    """
    Generate markdown summary table with averages, previous values, MA, and % change.
    
    current_metrics and previous_metrics are dicts with keys:
    - study_avg_minutes: daily average study in minutes
    - study_total_minutes: total study in minutes
    - sleep_avg_minutes: average sleep in minutes
    - mood_avg: average mood
    - workout_count: number of workout days
    - stretch_count: number of stretch days
    - total_days: number of days in period
    
    ma_metrics (optional) is a dict with keys:
    - study_avg_minutes: MA of daily average study
    - sleep_avg_minutes: MA of sleep average
    - mood_avg: MA of mood average
    - workout_avg: MA of workout count per period
    - stretch_avg: MA of stretch count per period
    
    ma_label: Column header like "4-WK AVG", "3-MO AVG", etc.
    ma_training_unit: Unit for training MA formatting ("7", "mo", "qtr", "yr")
    
    previous_label should be a wiki link like "[[2025-W50\\|LAST WEEK]]"
    Order: STUDY → SLEEP → WORKOUT → STRETCH → MOOD
    """
    lines = ["### **SUMMARY**", ""]
    
    # Determine if we're showing MA column
    show_ma = ma_metrics is not None and ma_label is not None
    
    # Table header
    if show_ma:
        lines.append(f"| METRIC | {current_label} | {previous_label} | CHANGE | {ma_label} |")
        lines.append("| ------ | ----------- | ----------------------- | ------ | ---------- |")
    else:
        lines.append(f"| METRIC | {current_label} | {previous_label} | CHANGE |")
        lines.append("| ------ | ----------- | ----------------------- | ------ |")
    
    # STUDY row (daily average)
    curr_study_total = current_metrics.get("study_total_minutes") or 0
    prev_study_total = previous_metrics.get("study_total_minutes") or 0
    # Use days_up_to_today for accurate daily average (not counting future days)
    curr_days_for_avg = current_metrics.get("days_up_to_today") or current_metrics.get("total_days", 7)
    prev_days_for_avg = previous_metrics.get("days_up_to_today") or previous_metrics.get("total_days", 7)
    curr_total_days = current_metrics.get("total_days", 7)
    prev_total_days = previous_metrics.get("total_days", 7)
    
    # Always show study average, even if zero
    curr_study_avg_mins = curr_study_total / max(1, curr_days_for_avg)
    curr_study_avg = format_minutes(curr_study_avg_mins, always_show_both=True) + "/day"
    
    prev_study_avg_mins = prev_study_total / max(1, prev_days_for_avg)
    prev_study_avg = format_minutes(prev_study_avg_mins, always_show_both=True) + "/day"
    
    # MA for study
    ma_study_str = "—"
    if show_ma and ma_metrics.get("study_avg_minutes") is not None:
        ma_study_str = format_minutes(ma_metrics["study_avg_minutes"], always_show_both=True) + "/day"
    
    # Compute percentage change (show dash only if both are zero)
    if curr_study_avg_mins > 0 or prev_study_avg_mins > 0:
        study_pct = compute_percent_change(curr_study_avg_mins, prev_study_avg_mins)
        study_pct_str = format_percent_change(study_pct)
    else:
        study_pct_str = "—"
    
    if show_ma:
        lines.append(f"| **STUDY** | `{curr_study_avg}` | `{prev_study_avg}` | `{study_pct_str}` | `{ma_study_str}` |")
    else:
        lines.append(f"| **STUDY** | `{curr_study_avg}` | `{prev_study_avg}` | `{study_pct_str}` |")
    
    # SLEEP row (with /night suffix)
    curr_sleep_avg = current_metrics.get("sleep_avg_minutes") or 0
    prev_sleep_avg = previous_metrics.get("sleep_avg_minutes") or 0
    
    # Always show sleep average, even if zero
    curr_sleep = format_minutes(curr_sleep_avg, always_show_both=True) + "/night"
    prev_sleep = format_minutes(prev_sleep_avg, always_show_both=True) + "/night"
    
    # MA for sleep
    ma_sleep_str = "—"
    if show_ma and ma_metrics.get("sleep_avg_minutes") is not None:
        ma_sleep_str = format_minutes(ma_metrics["sleep_avg_minutes"], always_show_both=True) + "/night"
    
    # Compute percentage change (show dash only if both are zero)
    if curr_sleep_avg > 0 or prev_sleep_avg > 0:
        sleep_pct = compute_percent_change(curr_sleep_avg, prev_sleep_avg)
        sleep_pct_str = format_percent_change(sleep_pct)
    else:
        sleep_pct_str = "—"
    
    if show_ma:
        lines.append(f"| **SLEEP** | `{curr_sleep}` | `{prev_sleep}` | `{sleep_pct_str}` | `{ma_sleep_str}` |")
    else:
        lines.append(f"| **SLEEP** | `{curr_sleep}` | `{prev_sleep}` | `{sleep_pct_str}` |")
    
    # WORKOUT row
    curr_workout_count = current_metrics.get("workout_count", 0)
    prev_workout_count = previous_metrics.get("workout_count", 0)
    
    # Always show workout ratio, even if zero
    curr_workout = format_training_ratio(curr_workout_count, curr_total_days)
    prev_workout = format_training_ratio(prev_workout_count, prev_total_days)
    
    # MA for workout
    ma_workout_str = "—"
    if show_ma and ma_metrics.get("workout_avg") is not None:
        ma_workout_str = format_ma_training_ratio(ma_metrics["workout_avg"], ma_training_unit)
    
    # Compute percentage change (show dash only if both are zero)
    if curr_workout_count > 0 or prev_workout_count > 0:
        workout_pct = compute_percent_change(curr_workout_count, prev_workout_count)
        workout_pct_str = format_percent_change(workout_pct)
    else:
        workout_pct_str = "—"
    
    if show_ma:
        lines.append(f"| **WORKOUT** | `{curr_workout}` | `{prev_workout}` | `{workout_pct_str}` | `{ma_workout_str}` |")
    else:
        lines.append(f"| **WORKOUT** | `{curr_workout}` | `{prev_workout}` | `{workout_pct_str}` |")
    
    # STRETCH row
    curr_stretch_count = current_metrics.get("stretch_count", 0)
    prev_stretch_count = previous_metrics.get("stretch_count", 0)
    
    # Always show stretch ratio, even if zero
    curr_stretch = format_training_ratio(curr_stretch_count, curr_total_days)
    prev_stretch = format_training_ratio(prev_stretch_count, prev_total_days)
    
    # MA for stretch
    ma_stretch_str = "—"
    if show_ma and ma_metrics.get("stretch_avg") is not None:
        ma_stretch_str = format_ma_training_ratio(ma_metrics["stretch_avg"], ma_training_unit)
    
    # Compute percentage change (show dash only if both are zero)
    if curr_stretch_count > 0 or prev_stretch_count > 0:
        stretch_pct = compute_percent_change(curr_stretch_count, prev_stretch_count)
        stretch_pct_str = format_percent_change(stretch_pct)
    else:
        stretch_pct_str = "—"
    
    if show_ma:
        lines.append(f"| **STRETCH** | `{curr_stretch}` | `{prev_stretch}` | `{stretch_pct_str}` | `{ma_stretch_str}` |")
    else:
        lines.append(f"| **STRETCH** | `{curr_stretch}` | `{prev_stretch}` | `{stretch_pct_str}` |")
    
    # MOOD row (with /10.0 suffix)
    curr_mood_avg = current_metrics.get("mood_avg") or 0
    prev_mood_avg = previous_metrics.get("mood_avg") or 0
    
    # Always show mood value, even if zero
    curr_mood = format_mood_with_scale(curr_mood_avg)
    prev_mood = format_mood_with_scale(prev_mood_avg)
    
    # MA for mood
    ma_mood_str = "—"
    if show_ma and ma_metrics.get("mood_avg") is not None:
        ma_mood_str = format_mood_with_scale(ma_metrics["mood_avg"])
    
    # Compute percentage change (show dash only if both are zero)
    if curr_mood_avg > 0 or prev_mood_avg > 0:
        mood_pct = compute_percent_change(curr_mood_avg, prev_mood_avg)
        mood_pct_str = format_percent_change(mood_pct)
    else:
        mood_pct_str = "—"
    
    if show_ma:
        lines.append(f"| **MOOD** | `{curr_mood}` | `{prev_mood}` | `{mood_pct_str}` | `{ma_mood_str}` |")
    else:
        lines.append(f"| **MOOD** | `{curr_mood}` | `{prev_mood}` | `{mood_pct_str}` |")
    
    lines.append("")
    return lines



def render_bar_chart(
    labels: list[str],
    values: list[float | None],
    value_labels: list[str],
    *,
    height: int = 10,
    y_max: float | None = None,
    bar_width: int = 5,
    col_spacing: int = 12,
    left_pad: int | None = None,
    label_prefix: str = " ",
    axis_trim: int | None = 3,
    center_labels_on_bars: bool = False,
    delta_labels: list[str] | None = None,
) -> list[str]:
    """
    Unified bar chart renderer for all time spans (weekly, monthly, quarterly, yearly).

    Args:
        labels: X-axis labels (e.g., ["MON", "TUE", ...] or ["DEC 01-07", ...])
        values: Numeric values for bar heights (None/0 = no bar)
        value_labels: Formatted strings to display above bars
        height: Number of visual rows for bars (default 10)
        y_max: Maximum value on Y-axis for scaling (default same as height)
        bar_width: Number of █ characters per bar (default 5)
        col_spacing: Spacing between column starts (default 12)
        left_pad: Spaces before bar in column (None = center bars)
        label_prefix: Prefix string for label/delta rows (default " ")
        axis_trim: Characters to trim from axis (None = dynamic to match widest row)
        center_labels_on_bars: If True, center value labels on bars (default False)
        delta_labels: Optional list of delta strings to show below x-axis labels

    Returns:
        List of strings representing the chart lines.
    """
    bar_char = "█"

    if y_max is None:
        y_max = height

    # Compute left_pad if not specified (center bars in column)
    if left_pad is None:
        computed_left_pad = (col_spacing - bar_width) // 2
    else:
        computed_left_pad = left_pad

    # Scale values to visual height
    scale = height / y_max if y_max > 0 else 1
    bar_heights: list[int] = []
    for val in values:
        if val is None or val == 0:
            bar_heights.append(0)
        else:
            bar_heights.append(min(height, max(0, round_half_up(val * scale))))

    lines: list[str] = []
    bar_rows: list[str] = []
    max_bar_row_len = 0

    # Check if any value is at max (needs overflow line for label)
    has_max_value = any(bar_h == height and bar_h > 0 for bar_h in bar_heights)
    if has_max_value:
        overflow_row = label_prefix
        for bar_h, label in zip(bar_heights, value_labels):
            if bar_h == height:
                label_str = str(label).strip('`') if label else ""
                if center_labels_on_bars and left_pad is None:
                    # Center label on bar when bars are centered
                    lbl_left_pad = computed_left_pad + (bar_width - len(label_str)) // 2
                else:
                    lbl_left_pad = computed_left_pad + (1 if center_labels_on_bars else 0)
                overflow_row += " " * lbl_left_pad + label_str + " " * (col_spacing - lbl_left_pad - len(label_str))
            else:
                overflow_row += " " * col_spacing
        lines.append(overflow_row.rstrip())

    # Y-axis and bars with value labels on top
    for level in range(height, 0, -1):
        row = "│"
        for bar_h, label in zip(bar_heights, value_labels):
            label_str = str(label).strip('`') if label else ""

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

            if bar_h == 0 and level == 1:
                # Zero value - show label at level 1, no blocks
                row += " " * lbl_left_pad + label_str + " " * (col_spacing - lbl_left_pad - len(label_str))
            elif bar_h == height and level <= height:
                # Max value - blocks fill all levels (label on overflow line)
                row += " " * computed_left_pad + bar_char * bar_width + " " * (col_spacing - computed_left_pad - bar_width)
            elif bar_h > 0 and bar_h < height and level == bar_h + 1:
                # One level above top of bar (non-max) - show label
                row += " " * lbl_left_pad + label_str + " " * (col_spacing - lbl_left_pad - len(label_str))
            elif bar_h > 0 and level <= bar_h:
                # Bar level - show block
                row += " " * computed_left_pad + bar_char * bar_width + " " * (col_spacing - computed_left_pad - bar_width)
            else:
                # Empty space
                row += " " * col_spacing
        row = row.rstrip()
        max_bar_row_len = max(max_bar_row_len, len(row))
        bar_rows.append(row)

    # Axis row
    if axis_trim is None:
        # Dynamic: match widest bar row (original render_quarter_bar_chart behavior)
        # max_bar_row_len includes the │, so subtract 1 for dashes after └
        axis_dashes = max_bar_row_len - 1 if max_bar_row_len > 0 else col_spacing * len(labels)
    else:
        # Fixed trim: dashes = col_spacing * labels - axis_trim
        axis_dashes = col_spacing * len(labels) - axis_trim
    axis_row = "└" + "─" * max(0, axis_dashes)

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
            delta_left_pad = max((label_len - len(delta_str)) // 2, 0)
            remaining = col_spacing - delta_left_pad - len(delta_str)
            if remaining < 0:
                remaining = 0
            delta_row += " " * delta_left_pad + delta_str + " " * remaining
        lines.append(delta_row.rstrip())

    return lines
def render_training_quarter_block(labels, counts, delta_labels=None, bar_width=30, bars_override=None, fill_char="■", empty_char="·"):
    """
    Render per-quarter training rows (no header/footer), aligned counts and deltas.
    counts: list of (done, elapsed) tuples.
    """
    lines = []
    max_label_len = max((len(l) for l in labels), default=0)
    count_strs = [f"({done:02d}/{elapsed:02d})" if elapsed else "(00/00)" for done, elapsed in counts] if counts else []
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
            week = " ".join(symbols[idx:idx + day_count])
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
            row += " " * left_pad + label + " " * max(week_width - left_pad - len(label), 0)
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
            row += " " * left_pad + label_str + " " * max(week_width - left_pad - len(label_str), 0)
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

        max_width = max(len(symbol_row), len(separator_row), len(label_row), len(delta_row) if delta_row else 0)

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

    lines.extend(_build_activity_block("WORKOUT", workout_symbols, workout_delta_labels))
    lines.append("")  # blank line between activity blocks
    lines.extend(_build_activity_block("STRETCH", stretch_symbols, stretch_delta_labels))

    return lines


def render_weekly_training_grid(dates, daily_data, workout_count, stretch_count, current_date=None):
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
    return STUDY_SYMBOL_DEEP if mins >= STUDY_TARGET_MIN else STUDY_SYMBOL_NONE


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
            study_symbols.append(met_symbol if minutes and minutes >= STUDY_TARGET_MIN else none_symbol)

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
    lines.append(STUDY_LEGEND_LINE.replace("█", "███").replace("·", "░░░"))
    return lines


def render_monthly_study_grid(week_ranges, daily_data, current_date=None, delta_labels=None):
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
                symbols.append(STUDY_SYMBOL_NONE)
            else:
                symbol = study_intensity_symbol(daily_data.get(day, {}).get("study_minutes"))
                symbols.append(symbol)
                total_elapsed += 1
                if symbol == STUDY_SYMBOL_DEEP:
                    total_done += 1

    max_days = max(week_day_counts) if week_day_counts else 0
    week_width = max_days * 2 - 1 if max_days > 0 else 0

    def _build_symbol_row():
        row = "│ "
        idx = 0
        for pos, day_count in enumerate(week_day_counts):
            week = " ".join(symbols[idx:idx + day_count])
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
            row += " " * left_pad + label + " " * max(week_width - left_pad - len(label), 0)
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
            row += " " * left_pad + label_str + " " * max(week_width - left_pad - len(label_str), 0)
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
    max_width = max(len(symbol_row), len(separator_row), len(label_row), len(delta_row) if delta_row else 0)

    header_suffix = f" ({total_done:02d}/{total_elapsed:02d})" if total_elapsed else " (00/00)"
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
    lines.append(STUDY_LEGEND_LINE)
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
        return STUDY_SYMBOL_NONE * target_width
    if total <= target_width:
        return "".join(symbols) + STUDY_SYMBOL_NONE * (target_width - total)

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
            compressed.append(STUDY_SYMBOL_NONE)
            continue
        if STUDY_SYMBOL_DEEP in bucket:
            compressed.append(STUDY_SYMBOL_DEEP)
        else:
            compressed.append(STUDY_SYMBOL_NONE)
    return "".join(compressed)


def _compress_days_time_order(days, met_fn, target_width, *, allow_partial=False, fill_char="█", partial_char="░", empty_char="·", today=None):
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


def compress_activity_time_order(days, has_activity_fn, target_width, *, fill_char="■", empty_char="·", today=None):
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


def render_quarterly_study_coverage(month_ranges, daily_data, today=None, delta_labels=None):
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
                bar_chars.append(STUDY_SYMBOL_NONE)
                continue
            symbol = study_intensity_symbol(daily_data.get(d, {}).get("study_minutes"))
            bar_chars.append(symbol)
            if symbol != STUDY_SYMBOL_NONE:
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

    header = f"┌ FULL STUDY DAYS ({total_done:02d}/{total_elapsed:02d})" if total_elapsed else "┌ FULL STUDY DAYS (00/00)"
    lines.append(header)
    lines.append("│")

    for idx, ((label, bar, _, _), count_str) in enumerate(zip(bars, counts)):
        pad_between = (max_bar_len - len(bar)) + 1
        delta = delta_labels[idx] if delta_labels and idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""
        line = (
            f"│ {label} {bar}"
            f"{' ' * pad_between}"
            f"{count_str.rjust(max_count_len)}"
        )
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line.rstrip())
    lines.append("└")
    lines.append("")
    lines.append(STUDY_LEGEND_LINE)
    return lines


def render_yearly_study_coverage(quarter_ranges, daily_data, today=None, bar_width=30, delta_labels=None, bars_override=None, legend_line=STUDY_LEGEND_LINE):
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
                if d <= today and study_intensity_symbol(daily_data.get(d, {}).get("study_minutes")) == STUDY_SYMBOL_DEEP
            )
        else:
            bar_chars = []
            done = 0
            elapsed_days = 0
            for d in days:
                if d > today:
                    bar_chars.append(STUDY_SYMBOL_NONE)
                    continue
                elapsed_days += 1
                symbol = study_intensity_symbol(daily_data.get(d, {}).get("study_minutes"))
                bar_chars.append(symbol)
                if symbol != STUDY_SYMBOL_NONE:
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
        line = (
            f"│ {label} {bar}"
            f"{' ' * pad_between}"
            f"{count_str.rjust(max_count_len)}"
        )
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line.rstrip())
    lines.append("└")
    lines.append("")
    lines.append(STUDY_LEGEND_LINE)
    return lines
