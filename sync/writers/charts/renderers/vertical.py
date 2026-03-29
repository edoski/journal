"""Vertical-bar chart renderer."""

from __future__ import annotations

from dataclasses import dataclass

from ..layout import (
    anchor_text_start,
    axis_dash_count,
    bar_bounds,
    column_bounds,
    place_anchored_text,
    place_text,
    total_row_width,
)
from ..specs import AnchorRef, HAnchor, VerticalBarSpec


@dataclass(frozen=True)
class _ResolvedPlacement:
    anchor_pos: int
    clamp_left: int | None
    clamp_right: int | None


@dataclass(frozen=True)
class _ColumnGeometry:
    idx: int
    label: str
    value_label: str
    bar_start: int
    bar_height: int
    has_half_block: bool
    top_level: int
    natural_label_level: int
    overflow: bool
    chart_placement: _ResolvedPlacement
    overflow_placement: _ResolvedPlacement


@dataclass(frozen=True)
class _AnnotationRun:
    text: str
    label_len: int
    ref: AnchorRef
    anchor: HAnchor
    placement: _ResolvedPlacement


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


def _validate_vertical_spec_lengths(
    *,
    labels: list[str],
    values: list[float | None],
    value_labels: list[str],
    deltas: list[str],
    delta_labels_present: bool,
) -> None:
    if len(values) != len(labels) or len(value_labels) != len(labels):
        raise ValueError("labels, values, and value_labels must have the same length")
    if delta_labels_present and len(deltas) != len(labels):
        raise ValueError("delta_labels must have the same length as labels")


def _adjust_center_anchor(
    anchor_x: int,
    text: str,
    ref: AnchorRef,
    h_anchor: HAnchor,
    *,
    label_len: int,
    bar_width: int,
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


def _resolve_placement(
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
    text: str,
) -> _ResolvedPlacement:
    anchor, clamp_left, clamp_right = _resolve_anchor(
        ref=ref,
        h_anchor=h_anchor,
        idx=idx,
        labels=labels,
        label_starts=label_starts,
        prefix_len=prefix_len,
        col_width=col_width,
        bar_left_gutter=bar_left_gutter,
        bar_width=bar_width,
    )
    return _ResolvedPlacement(
        anchor_pos=_adjust_center_anchor(
            anchor,
            text,
            ref,
            h_anchor,
            label_len=len(labels[idx]),
            bar_width=bar_width,
        ),
        clamp_left=clamp_left,
        clamp_right=clamp_right,
    )


def _text_start(
    *,
    run: _AnnotationRun,
    keep_left_rail: bool,
) -> int:
    start = anchor_text_start(run.placement.anchor_pos, len(run.text), run.anchor)
    if run.placement.clamp_left is not None:
        start = max(start, run.placement.clamp_left)
    if run.placement.clamp_right is not None:
        start = min(start, run.placement.clamp_right - len(run.text) + 1)
    if keep_left_rail:
        start = max(start, 1)
    return start


def _visible_span(
    *,
    row_width: int,
    run: _AnnotationRun,
    keep_left_rail: bool,
) -> tuple[int, int] | None:
    start = _text_start(run=run, keep_left_rail=keep_left_rail)
    left = max(start, 0)
    right = min(start + len(run.text) - 1, row_width - 1)
    if left > right:
        return None
    return left, right


def _spans_overlap(left: tuple[int, int], right: tuple[int, int]) -> bool:
    return not (left[1] < right[0] or right[1] < left[0])


def _pack_top_runs(
    runs: list[_AnnotationRun],
    *,
    row_width: int,
) -> list[list[_AnnotationRun]]:
    packed_rows: list[list[_AnnotationRun]] = []
    packed_spans: list[list[tuple[int, int]]] = []

    for run in runs:
        span = _visible_span(row_width=row_width, run=run, keep_left_rail=True)
        if span is None:
            continue

        for row_runs, row_spans in zip(packed_rows, packed_spans):
            if any(_spans_overlap(span, placed_span) for placed_span in row_spans):
                continue
            row_runs.append(run)
            row_spans.append(span)
            break
        else:
            packed_rows.append([run])
            packed_spans.append([span])

    return packed_rows


def _make_chart_row(width: int, y_axis: str) -> list[str]:
    row = [" "] * width
    if row:
        row[0] = y_axis
    return row


def _place_run(row: list[str], run: _AnnotationRun, *, keep_left_rail: bool) -> None:
    place_text(row, run.text, _text_start(run=run, keep_left_rail=keep_left_rail))


def _column_geometries(
    *,
    labels: list[str],
    values: list[float | None],
    value_labels: list[str],
    height: int,
    y_max: float,
    col_width: int,
    bar_width: int,
    bar_left_gutter: int,
    value_anchor_ref: AnchorRef,
    value_anchor_h: HAnchor,
    label_starts_chart: list[int],
) -> list[_ColumnGeometry]:
    scale = height / y_max if y_max > 0 else 1.0
    geometries: list[_ColumnGeometry] = []

    for idx, value in enumerate(values):
        value_num = 0.0 if value is None else max(0.0, float(value))
        scaled = value_num * scale
        full_height = int(scaled)
        fractional = scaled - full_height
        bar_height = min(height, max(0, full_height))
        has_half = fractional >= 0.5 and bar_height != height
        top_level = bar_height + 1 if has_half else bar_height
        natural_label_level = top_level + 1
        overflow = (
            height > 0 and bool(value_labels[idx]) and natural_label_level > height
        )

        bar_start, _bar_end = bar_bounds(
            prefix_len=1,
            column_width=col_width,
            bar_left_gutter=bar_left_gutter,
            bar_width=bar_width,
            column_index=idx,
        )
        geometries.append(
            _ColumnGeometry(
                idx=idx,
                label=labels[idx],
                value_label=value_labels[idx],
                bar_start=bar_start,
                bar_height=bar_height,
                has_half_block=has_half,
                top_level=top_level,
                natural_label_level=natural_label_level,
                overflow=overflow,
                chart_placement=_resolve_placement(
                    ref=value_anchor_ref,
                    h_anchor=value_anchor_h,
                    idx=idx,
                    labels=labels,
                    label_starts=label_starts_chart,
                    prefix_len=1,
                    col_width=col_width,
                    bar_left_gutter=bar_left_gutter,
                    bar_width=bar_width,
                    text=value_labels[idx],
                ),
                overflow_placement=_resolve_placement(
                    ref=value_anchor_ref,
                    h_anchor=value_anchor_h,
                    idx=idx,
                    labels=labels,
                    label_starts=label_starts_chart,
                    prefix_len=1,
                    col_width=col_width,
                    bar_left_gutter=bar_left_gutter,
                    bar_width=bar_width,
                    text=value_labels[idx],
                ),
            )
        )

    return geometries


def render_vertical_bar(spec: VerticalBarSpec) -> list[str]:
    """Render a vertical bar chart from ``VerticalBarSpec``."""
    profile = spec.profile
    labels = [str(label) for label in spec.labels]
    values = list(spec.values)
    value_labels = [
        str(label).strip("`") if label else "" for label in spec.value_labels
    ]
    raw_deltas = spec.delta_labels
    deltas = [str(delta) for delta in (raw_deltas or [])]

    _validate_vertical_spec_lengths(
        labels=labels,
        values=values,
        value_labels=value_labels,
        deltas=deltas,
        delta_labels_present=raw_deltas is not None,
    )

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

    label_starts_chart = _label_starts(labels, prefix_len=1, col_width=col_width)
    label_starts_d = _label_starts(labels, prefix_len=d_prefix_len, col_width=col_width)

    geometries = _column_geometries(
        labels=labels,
        values=values,
        value_labels=value_labels,
        height=height,
        y_max=y_max,
        col_width=col_width,
        bar_width=bar_width,
        bar_left_gutter=bar_left_gutter,
        value_anchor_ref=profile.value_anchor_ref,
        value_anchor_h=profile.value_anchor_h,
        label_starts_chart=label_starts_chart,
    )

    top_runs = [
        _AnnotationRun(
            text=geometry.value_label,
            label_len=len(geometry.label),
            ref=profile.value_anchor_ref,
            anchor=profile.value_anchor_h,
            placement=geometry.overflow_placement,
        )
        for geometry in geometries
        if geometry.overflow and geometry.value_label
    ]

    lines: list[str] = []
    for packed_row in _pack_top_runs(top_runs, row_width=width):
        row = _make_chart_row(width, glyphs.y_axis)
        for run in packed_row:
            _place_run(row, run, keep_left_rail=True)
        lines.append("".join(row).rstrip())

    for level in range(height, 0, -1):
        row = _make_chart_row(width, glyphs.y_axis)

        for geometry in geometries:
            if geometry.bar_height == height:
                _draw_bar_segment(row, geometry.bar_start, bar_width, glyphs.bar_fill)
            elif geometry.has_half_block and level == geometry.bar_height + 1:
                _draw_bar_segment(row, geometry.bar_start, bar_width, glyphs.bar_half)
            elif geometry.bar_height and level <= geometry.bar_height:
                _draw_bar_segment(row, geometry.bar_start, bar_width, glyphs.bar_fill)

            if (
                not geometry.overflow
                and geometry.value_label
                and geometry.natural_label_level <= height
                and level == geometry.natural_label_level
            ):
                _place_run(
                    row,
                    _AnnotationRun(
                        text=geometry.value_label,
                        label_len=len(geometry.label),
                        ref=profile.value_anchor_ref,
                        anchor=profile.value_anchor_h,
                        placement=geometry.chart_placement,
                    ),
                    keep_left_rail=False,
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
                    bar_width=bar_width,
                ),
                anchor=profile.delta_anchor_h,
            )
        lines.append("".join(d_row).rstrip())

    return lines
