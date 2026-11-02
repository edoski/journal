"""Horizontal money waterfall renderer.

Geometry, for any data:

- The scale runs from the lowest to the highest running total, zero always
  included, over `width` cells; a value maps to the nearest cell boundary
  (half up). With less than one euro between the lowest and the highest total
  nothing is drawn.
- The start and end totals are drawn from zero to their value, on the side of
  zero where the value lies, at least one cell wide unless the value is zero.
- Each step starts where the previous one ended and is at least one cell wide,
  as long as that keeps the chain within two cells of the step's exact place
  and there is room before the chart's wall; otherwise the step is a thin
  marker (▏) at the chain's edge and does not move it. Labels always carry the exact amounts.
- The end total is drawn at its exact value, never moved to where the chain
  ends; the chain ends at most two cells from it.
- Axis labels: the lowest value under the first cell, the highest ending under
  the last; when zero lies strictly inside, a tick marks it on the axis and
  "€0" is printed under it if it fits between the other two labels.
"""

from __future__ import annotations

from sync.formatting import format_eur_whole

from ..specs import WaterfallSpec

AXIS_LEFT = "└"
AXIS_RIGHT = "┘"
AXIS_FILL = "─"
AXIS_ZERO = "┴"
BAR_EDGE = "│"
MARKER = "▏"
MAX_DRIFT = 2  # cells a step may sit from its exact place before it becomes a marker
MIN_SPREAD_CENTS = 100  # below one euro of spread there is nothing worth drawing


def _cell(value: int, low: int, span: int, width: int) -> int:
    return (2 * (value - low) * width + span) // (2 * span)


def _signed(cents: int) -> str:
    """Whole euros with the direction of the amount, even below one euro."""
    return f"{'-' if cents < 0 else '+'}{format_eur_whole(abs(cents))}"


def _total_bar(value: int, zero: int, at: int, width: int) -> tuple[int, int]:
    """Cells of a bar drawn from zero to `at` (the value's cell)."""
    if value == 0:
        return zero, zero
    if value > 0:
        end = max(at, zero + 1)
        start = zero
        if end > width:
            start, end = width - 1, width
        return start, end
    start = min(at, zero - 1)
    end = zero
    if start < 0:
        start, end = 0, 1
    return start, end


def render_waterfall(spec: WaterfallSpec) -> list[str]:
    """Render waterfall rows, the axis and its labels (without the fence)."""
    width = spec.width
    if width < 8:
        raise ValueError("waterfall width must be at least 8")
    totals = [0, spec.start_cents]
    running = spec.start_cents
    for step in spec.steps:
        running += step.change_cents
        totals.append(running)
    end_cents = running
    low, high = min(totals), max(totals)
    if high - low < MIN_SPREAD_CENTS:
        return []
    span = high - low
    zero = _cell(0, low, span, width)

    rows: list[tuple[str, int, int, str, str]] = []
    start, stop = _total_bar(
        spec.start_cents, zero, _cell(spec.start_cents, low, span, width), width
    )
    rows.append(
        (spec.start_label, start, stop, spec.total_glyph, _signed(spec.start_cents))
    )
    edge = stop if spec.start_cents >= 0 else start
    running = spec.start_cents
    for step in spec.steps:
        if step.change_cents == 0:
            continue
        running += step.change_cents
        target = _cell(running, low, span, width)
        if step.change_cents < 0:
            begin = max(0, min(target, edge - 1))
            if begin == edge or begin < target - MAX_DRIFT:  # no room left, or drifting
                at = max(0, edge - 1)
                rows.append(
                    (step.label, at, at + 1, MARKER, _signed(step.change_cents))
                )
                continue
            rows.append(
                (step.label, begin, edge, spec.step_glyph, _signed(step.change_cents))
            )
            edge = begin
        else:
            finish = min(width, max(target, edge + 1))
            if (
                finish == edge or finish > target + MAX_DRIFT
            ):  # no room left, or drifting
                at = min(width - 1, edge)
                rows.append(
                    (step.label, at, at + 1, MARKER, _signed(step.change_cents))
                )
                continue
            rows.append(
                (step.label, edge, finish, spec.step_glyph, _signed(step.change_cents))
            )
            edge = finish
    start, stop = _total_bar(end_cents, zero, _cell(end_cents, low, span, width), width)
    rows.append(
        (
            spec.end_label,
            start,
            stop,
            spec.total_glyph,
            f"={format_eur_whole(end_cents)}",
        )
    )

    label_width = max(len(label) for label, *_ in rows) + 1
    value_width = max(len(value) for *_, value in rows)
    lines = [
        f"{label:<{label_width}}{BAR_EDGE}{' ' * a}{glyph * (b - a)}{' ' * (width - b)}"
        f"{BAR_EDGE} {value:>{value_width}}"
        for label, a, b, glyph, value in rows
    ]
    border = [AXIS_FILL] * width
    inside = 0 < zero < width
    if inside:
        border[zero] = AXIS_ZERO
    lines.append(f"{'':<{label_width}}{AXIS_LEFT}{''.join(border)}{AXIS_RIGHT}")

    cells = [" "] * width
    left_label = format_eur_whole(low)
    right_label = format_eur_whole(high)
    for index, char in enumerate(left_label):
        cells[index] = char
    for index, char in enumerate(right_label):
        cells[width - len(right_label) + index] = char
    zero_label = "€0"
    if (
        inside
        and len(left_label) < zero
        and zero + len(zero_label) < width - len(right_label)
    ):
        for index, char in enumerate(zero_label):
            cells[zero + index] = char
    lines.append(f"{'':<{label_width}} {''.join(cells)}".rstrip())
    return lines
