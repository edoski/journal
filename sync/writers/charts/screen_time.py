"""Screen-time waterfall and trend-table renderers."""

from __future__ import annotations


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
        day_name = (
            DAYS[i]
            if period_label == "DAY" and i < len(DAYS)
            else d.strftime("%a").upper()
        )
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
