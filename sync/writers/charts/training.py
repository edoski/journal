"""Training grid and bar renderers."""

from __future__ import annotations

from sync.constants import DAYS
from sync.dates import daterange, format_week_label
from sync.formatting import round_half_up

from .grid import GridRowBuilder


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
    mindful_count,
    workout_count,
    stretch_count,
    days_in_period,
    mindful_delta_labels=None,
    workout_delta_labels=None,
    stretch_delta_labels=None,
    current_date=None,
):
    """
    Render the monthly training grid as three stacked blocks (MINDFUL, WORKOUT, STRETCH)
    with per-week separators and deltas beneath the week labels.

    Example shape:
    ┌ MINDFUL
    │
    │ ■ · ■ ■ · ■ ■   …
    │ ─────────────   …
    │   DEC 01-07     …
    │       —         …

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

    mindful_symbols = []
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
            mindful_symbols.append("■" if entry.get("meditate") else "·")
            workout_symbols.append("■" if entry.get("workout") else "·")
            stretch_symbols.append("■" if entry.get("stretch") else "·")

    max_days = max(week_day_counts) if week_day_counts else 0
    week_width = max_days * 2 - 1 if max_days > 0 else 0

    # Use GridRowBuilder for shared row building logic
    grid = GridRowBuilder(
        week_day_counts=week_day_counts,
        week_width=week_width,
        week_labels=week_labels,
    )

    # Pre-compute arrow placement (shared by all activity blocks)
    arrow_col = None
    if current_date:
        for w_idx, (start, end) in enumerate(week_ranges):
            if start <= current_date <= end:
                day_idx = (current_date - start).days
                day_idx = min(day_idx, max(week_day_counts[w_idx] - 1, 0))
                arrow_col = len("│ ") + w_idx * (week_width + 3) + day_idx * 2
                break

    def _build_activity_block(title, symbols, deltas):
        symbol_row = grid.build_symbol_row(symbols)
        separator_row = grid.build_separator_row()
        label_row = grid.build_label_row()
        delta_row = grid.build_delta_row(deltas, prefix="└ ")

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
        _build_activity_block("MINDFUL", mindful_symbols, mindful_delta_labels)
    )
    lines.append("")  # blank line between activity blocks
    lines.extend(
        _build_activity_block("WORKOUT", workout_symbols, workout_delta_labels)
    )
    lines.append("")  # blank line between activity blocks
    lines.extend(
        _build_activity_block("STRETCH", stretch_symbols, stretch_delta_labels)
    )

    return lines


def render_weekly_training_grid(
    dates, daily_data, mindful_count, workout_count, stretch_count, current_date=None
):
    """
    Render a compact frequency grid showing mindful/workout/stretch activity for a single week.

    dates: list of 7 date objects (Monday-Sunday)
    daily_data: dict mapping date -> parsed daily note data
    mindful_count: total number of mindful days
    workout_count: total number of workout days
    stretch_count: total number of stretch days

    Returns list of lines for the frequency grid visualization.

    Format:
    │ MINDFUL:  ███ ░░░ ███ ███ ░░░ ███ ███   (5/7)
    │ WORKOUT:  ███ ░░░ ███ ███ ░░░ ███ ███   (5/7)
    │ STRETCH:  ░░░ ███ ███ ░░░ ███ ░░░ ███   (4/7)
    │           ─── ─── ─── ─── ─── ─── ───
    └           MON TUE WED THU FRI SAT SUN
    """
    lines = []

    # Build mindful, workout and stretch symbols
    mindful_symbols = []
    workout_symbols = []
    stretch_symbols = []

    for day in dates:
        entry = daily_data.get(day, {})
        has_mindful = entry.get("meditate", False)
        has_workout = entry.get("workout", False)
        has_stretch = entry.get("stretch", False)

        mindful_symbols.append("███" if has_mindful else "░░░")
        workout_symbols.append("███" if has_workout else "░░░")
        stretch_symbols.append("███" if has_stretch else "░░░")

    prefix_mindful = "│ MINDFUL:  "
    prefix_workout = "│ WORKOUT:  "
    prefix_stretch = "│ STRETCH:  "

    # Build the three main rows (each day takes 4 chars: 3-char block + 1 space)
    mindful_row = prefix_mindful + " ".join(mindful_symbols) + f"   ({mindful_count}/7)"
    workout_row = prefix_workout + " ".join(workout_symbols) + f"   ({workout_count}/7)"
    stretch_row = prefix_stretch + " ".join(stretch_symbols) + f"   ({stretch_count}/7)"

    # Arrow placement (only when current_date is within this week)
    arrow_line = None
    if current_date and dates[0] <= current_date <= dates[-1]:
        day_idx = (current_date - dates[0]).days
        day_idx = max(0, min(day_idx, 6))
        arrow_col = len(prefix_mindful) + day_idx * 4 + 1  # center of 3-char block
        width = len(mindful_row)
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

    lines.append(mindful_row)
    lines.append(workout_row)
    lines.append(stretch_row)

    # Build separator row (3 dashes per day)
    separator_row = "│           " + " ".join(["───"] * 7)
    lines.append(separator_row)

    # Build label row with day names (use bottom-left corner)
    label_row = "└           " + " ".join(DAYS)
    lines.append(label_row)

    return lines
