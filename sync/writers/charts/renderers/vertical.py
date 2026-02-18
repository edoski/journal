"""Vertical-bar chart renderer."""

from __future__ import annotations

from ..layout import (
    axis_dash_count,
    bar_bounds,
    column_bounds,
    place_anchored_text,
    place_text,
    total_row_width,
)
from ..specs import AnchorRef, HAnchor, VerticalBarSpec


def _resolve_anchor(
    *,
    ref: AnchorRef,
    h_anchor: HAnchor,
    idx: int,
    labels: list[str],
    label_starts: list[int],
    prefix_len: int,
    col_width: int,
    bar_left_gutter: int,
    bar_width: int,
) -> tuple[int, int | None, int | None]:
    """Return anchor x and optional clamp interval for text placement."""
    col_start, col_end = column_bounds(
        prefix_len=prefix_len,
        column_width=col_width,
        column_index=idx,
    )

    if ref is AnchorRef.BAR:
        bar_start, bar_end = bar_bounds(
            prefix_len=prefix_len,
            column_width=col_width,
            bar_left_gutter=bar_left_gutter,
            bar_width=bar_width,
            column_index=idx,
        )
        if h_anchor is HAnchor.START:
            return bar_start, col_start, col_end
        if h_anchor is HAnchor.END:
            return bar_end, col_start, col_end
        # Use geometric midpoint (right-biased for even widths).
        return bar_start + (bar_width // 2), col_start, col_end

    if ref is AnchorRef.LABEL:
        label_start = label_starts[idx]
        label_end = label_start + len(labels[idx]) - 1 if labels[idx] else label_start
        if h_anchor is HAnchor.START:
            return label_start, label_start, label_end
        if h_anchor is HAnchor.END:
            return label_end, label_start, label_end
        return (label_start + label_end) // 2, label_start, label_end

    # COLUMN
    if h_anchor is HAnchor.START:
        return col_start, col_start, col_end
    if h_anchor is HAnchor.END:
        return col_end, col_start, col_end
    return (col_start + col_end) // 2, col_start, col_end


def _label_starts(labels: list[str], *, prefix_len: int, col_width: int) -> list[int]:
    starts: list[int] = []
    for idx, _label in enumerate(labels):
        col_start, _ = column_bounds(
            prefix_len=prefix_len,
            column_width=col_width,
            column_index=idx,
        )
        starts.append(col_start)
    return starts


def _draw_bar_segment(row: list[str], start: int, width: int, char: str) -> None:
    for pos in range(start, start + width):
        if 0 <= pos < len(row):
            row[pos] = char


def render_vertical_bar(spec: VerticalBarSpec) -> list[str]:
    """Render a vertical bar chart from ``VerticalBarSpec``."""
    profile = spec.profile
    labels = [str(label) for label in spec.labels]
    values = list(spec.values)
    value_labels = [
        str(label).strip("`") if label else "" for label in spec.value_labels
    ]
    deltas = [str(delta) for delta in (spec.delta_labels or [])]

    height = profile.height
    y_max = profile.y_max
    track = profile.track
    glyphs = profile.glyphs
    col_width = track.column_width
    bar_width = track.bar_width
    bar_left_gutter = track.bar_left_gutter

    x_prefix = track.x_label_prefix
    d_prefix = track.delta_label_prefix
    x_prefix_len = len(x_prefix)
    d_prefix_len = len(d_prefix)

    width_x = total_row_width(
        prefix_len=x_prefix_len, column_width=col_width, count=len(labels)
    )
    width_d = total_row_width(
        prefix_len=d_prefix_len, column_width=col_width, count=len(labels)
    )
    width = max(width_x, width_d)

    scale = height / y_max if y_max > 0 else 1.0
    bar_heights: list[int] = []
    has_half_block: list[bool] = []

    for value in values:
        value_num = 0.0 if value is None else max(0.0, float(value))
        scaled = value_num * scale
        full_height = int(scaled)
        fractional = scaled - full_height
        bar_height = min(height, max(0, full_height))
        bar_heights.append(bar_height)
        has_half_block.append(fractional >= 0.5 and bar_height != height)

    label_starts_overflow = _label_starts(
        labels, prefix_len=x_prefix_len, col_width=col_width
    )
    label_starts_bar = _label_starts(labels, prefix_len=1, col_width=col_width)
    label_starts_d = _label_starts(labels, prefix_len=d_prefix_len, col_width=col_width)

    lines: list[str] = []
    has_max_value = any(bar_h == height and bar_h > 0 for bar_h in bar_heights)

    def _adjust_center_anchor(
        anchor_x: int,
        text: str,
        ref: AnchorRef,
        h_anchor: HAnchor,
        *,
        label_len: int,
    ) -> int:
        # For even-width bar lanes, this keeps text visually centered in the lane.
        if (
            ref is AnchorRef.BAR
            and h_anchor is HAnchor.CENTER
            and bar_width % 2 == 0
            and len(text) % 2 == 0
        ):
            return anchor_x - 1
        # For long label tracks (monthly/period labels), match center math parity.
        if (
            ref is AnchorRef.LABEL
            and h_anchor is HAnchor.CENTER
            and label_len >= 5
            and len(text) % 2 == 0
        ):
            return anchor_x - 1
        return anchor_x

    if has_max_value:
        overflow = [" "] * width
        place_text(overflow, x_prefix, 0)
        for idx, bar_h in enumerate(bar_heights):
            if bar_h != height:
                continue
            label = value_labels[idx]
            if not label:
                continue
            anchor, clamp_left, clamp_right = _resolve_anchor(
                ref=profile.value_anchor_ref,
                h_anchor=profile.value_anchor_h,
                idx=idx,
                labels=labels,
                label_starts=label_starts_overflow,
                prefix_len=x_prefix_len,
                col_width=col_width,
                bar_left_gutter=bar_left_gutter,
                bar_width=bar_width,
            )
            place_anchored_text(
                overflow,
                label,
                anchor_pos=_adjust_center_anchor(
                    anchor,
                    label,
                    profile.value_anchor_ref,
                    profile.value_anchor_h,
                    label_len=len(labels[idx]),
                ),
                anchor=profile.value_anchor_h,
                clamp_left=clamp_left,
                clamp_right=clamp_right,
            )
        lines.append("".join(overflow).rstrip())

    for level in range(height, 0, -1):
        row = [" "] * width
        if row:
            row[0] = glyphs.y_axis

        for idx, bar_h in enumerate(bar_heights):
            label = value_labels[idx]
            has_half = has_half_block[idx]
            top_level = bar_h + 1 if has_half else bar_h
            draw_label_level = top_level + 1

            bar_start, _bar_end = bar_bounds(
                prefix_len=1,
                column_width=col_width,
                bar_left_gutter=bar_left_gutter,
                bar_width=bar_width,
                column_index=idx,
            )

            if bar_h == height:
                _draw_bar_segment(row, bar_start, bar_width, glyphs.bar_fill)
            elif has_half and level == bar_h + 1:
                _draw_bar_segment(row, bar_start, bar_width, glyphs.bar_half)
            elif bar_h and level <= bar_h:
                _draw_bar_segment(row, bar_start, bar_width, glyphs.bar_fill)

            if draw_label_level <= height and level == draw_label_level:
                anchor, clamp_left, clamp_right = _resolve_anchor(
                    ref=profile.value_anchor_ref,
                    h_anchor=profile.value_anchor_h,
                    idx=idx,
                    labels=labels,
                    label_starts=label_starts_bar,
                    prefix_len=1,
                    col_width=col_width,
                    bar_left_gutter=bar_left_gutter,
                    bar_width=bar_width,
                )
                place_anchored_text(
                    row,
                    label,
                    anchor_pos=_adjust_center_anchor(
                        anchor,
                        label,
                        profile.value_anchor_ref,
                        profile.value_anchor_h,
                        label_len=len(labels[idx]),
                    ),
                    anchor=profile.value_anchor_h,
                    clamp_left=clamp_left,
                    clamp_right=clamp_right,
                )

        lines.append("".join(row).rstrip())

    axis_count = axis_dash_count(
        column_width=col_width,
        count=len(labels),
        axis_trim=track.axis_trim,
    )
    lines.append(glyphs.axis_left + glyphs.axis_fill * axis_count)

    x_row = [" "] * width
    place_text(x_row, x_prefix, 0)
    for idx, label in enumerate(labels):
        if not label:
            continue
        col_start, _col_end = column_bounds(
            prefix_len=x_prefix_len,
            column_width=col_width,
            column_index=idx,
        )
        place_anchored_text(
            x_row,
            label,
            anchor_pos=col_start,
            anchor=profile.x_label_anchor_h,
        )
    lines.append("".join(x_row).rstrip())

    if deltas:
        d_row = [" "] * width
        place_text(d_row, d_prefix, 0)
        for idx, delta in enumerate(deltas):
            if not delta:
                continue
            anchor, _clamp_left, _clamp_right = _resolve_anchor(
                ref=profile.delta_anchor_ref,
                h_anchor=profile.delta_anchor_h,
                idx=idx,
                labels=labels,
                label_starts=label_starts_d,
                prefix_len=d_prefix_len,
                col_width=col_width,
                bar_left_gutter=bar_left_gutter,
                bar_width=bar_width,
            )
            place_anchored_text(
                d_row,
                delta,
                anchor_pos=_adjust_center_anchor(
                    anchor,
                    delta,
                    profile.delta_anchor_ref,
                    profile.delta_anchor_h,
                    label_len=len(labels[idx]),
                ),
                anchor=profile.delta_anchor_h,
            )
        lines.append("".join(d_row).rstrip())

    return lines
