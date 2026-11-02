"""Waterfall chart geometry."""

from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

from sync.writers.charts import WaterfallSpec, WaterfallStep, render_chart

FULL, STEP, MARKER = "█", "▒", "▏"


def _rows(lines: list[str]) -> list[tuple[str, str, str]]:
    """(label, cells, value) for each bar row of a rendered chart."""
    rows = []
    for line in lines[1:-1]:
        if "│" not in line:
            continue
        label, cells, value = line.split("│")
        rows.append((label.strip(), cells, value.strip()))
    return rows


def _span(cells: str) -> tuple[int, int]:
    filled = [i for i, ch in enumerate(cells) if ch != " "]
    return (filled[0], filled[-1] + 1) if filled else (-1, -1)


def test_nothing_to_draw_renders_no_chart() -> None:
    assert render_chart(WaterfallSpec("INCOME", 0, [], "LEFT")) == []
    assert (
        render_chart(WaterfallSpec("INCOME", 0, [WaterfallStep("X", 0)], "LEFT")) == []
    )


def test_spending_above_income_draws_left_below_zero() -> None:
    lines = render_chart(
        WaterfallSpec(
            "INCOME",
            100000,
            [WaterfallStep("TAXES", -120000), WaterfallStep("GROCERIES", -29095)],
            "LEFT",
        )
    )
    rows = _rows(lines)
    axis = lines[-3]
    zero = axis.index("┴") - axis.index("└") - 1
    income, left = rows[0], rows[-1]
    assert _span(income[1])[0] == zero
    assert _span(left[1]) == (0, zero)
    assert left[2] == "=-€491"
    assert lines[-2].split()[0:2] == ["-€491", "€0"]
    assert lines[-2].endswith("€1,000")


def test_no_income_puts_zero_at_the_right_end() -> None:
    lines = render_chart(
        WaterfallSpec("INCOME", 0, [WaterfallStep("RENT", -50000)], "LEFT")
    )
    rows = _rows(lines)
    assert rows[0][2] == "+€0" and _span(rows[0][1]) == (-1, -1)
    assert _span(rows[-1][1]) == (0, 40)
    assert "┴" not in lines[-3]
    assert lines[-2].strip().split() == ["-€500", "€0"]


def test_labels_and_values_line_up() -> None:
    lines = render_chart(
        WaterfallSpec(
            "INCOME",
            3000000,
            [WaterfallStep("A VERY LONG NAME", -100), WaterfallStep("B", -2000000)],
            "LEFT",
        )
    )
    bar_lines = [line for line in lines if line.count("│") == 2]
    assert len({line.index("│") for line in bar_lines}) == 1
    assert len({len(line) for line in bar_lines}) == 1
    assert bar_lines[0].index("│") == len("A VERY LONG NAME") + 1


def _cell(value: int, low: int, span: int, width: int = 40) -> int:
    return (2 * (value - low) * width + span) // (2 * span)


def test_less_than_a_euro_of_spread_draws_nothing() -> None:
    assert (
        render_chart(WaterfallSpec("INCOME", 0, [WaterfallStep("FEES", -40)], "LEFT"))
        == []
    )
    assert (
        render_chart(WaterfallSpec("INCOME", 0, [WaterfallStep("FEES", -100)], "LEFT"))
        != []
    )


def test_tiny_steps_after_a_large_one_become_markers_near_left() -> None:
    steps = [WaterfallStep("RENT", -3000)] + [
        WaterfallStep(f"T{i}", -2) for i in range(12)
    ]
    lines = render_chart(WaterfallSpec("INCOME", 10000, steps, "LEFT"))
    rows = _rows(lines)
    markers = [label for label, cells, _ in rows if MARKER in cells]
    assert markers and all(label.startswith("T") for label in markers)
    chain = min(
        _span(cells)[0] for label, cells, _ in rows[1:-1] if MARKER not in cells
    )
    left_end = _span(rows[-1][1])[1]
    assert abs(chain - left_end) <= 2


@settings(max_examples=400, deadline=None)
@given(
    start=st.integers(min_value=-500000, max_value=2000000),
    changes=st.lists(st.integers(min_value=-900000, max_value=200000), max_size=14),
)
def test_geometry_holds_for_any_amounts(start: int, changes: list[int]) -> None:
    steps = [WaterfallStep(f"S{i}", change) for i, change in enumerate(changes)]
    lines = render_chart(WaterfallSpec("INCOME", start, steps, "LEFT"))
    totals = [0, start]
    for change in changes:
        totals.append(totals[-1] + change)
    low, high = min(totals), max(totals)
    if high - low < 100:
        assert lines == []
        return
    assert lines[0] == lines[-1] == "```"
    rows = _rows(lines)
    assert all(len(cells) == 40 for _, cells, _ in rows)
    nonzero = [change for change in changes if change]
    assert len(rows) == 2 + len(nonzero)
    span = high - low
    # The chain: where the start bar ends, moved by every drawn (non-marker) step.
    start_a, start_b = _span(rows[0][1])
    edge = (
        start_b
        if start >= 0 and start_a != -1
        else (start_a if start_a != -1 else _cell(0, low, span))
    )
    for (label, cells, value), change in zip(rows[1:-1], nonzero):
        assert set(cells) <= {" ", STEP, MARKER}
        assert value.startswith("-" if change < 0 else "+")
        if MARKER in cells:
            assert cells.count(MARKER) == 1
            continue
        a, b = _span(cells)
        assert a != -1, "a step row is never empty"
        assert edge in (a, b)
        edge = a if change < 0 else b
    exact_end = _cell(totals[-1], low, span)
    assert abs(edge - exact_end) <= 2
