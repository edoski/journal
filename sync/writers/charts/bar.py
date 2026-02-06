"""Generic bar-chart renderer used by weekly/monthly/quarterly/yearly metrics."""

from __future__ import annotations

from .presets import BarChartPreset


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
            elif (
                label_level is not None and level == label_level and top_level < height
            ):
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
