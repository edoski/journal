"""Property-based tests for formatting and parsing invariants."""

from __future__ import annotations

import math

from hypothesis import given, settings, strategies as st

from sync.formatting import compute_percent_change, format_minutes, round_half_up
from sync.readers.common import parse_duration_to_minutes


@settings(max_examples=200, deadline=None)
@given(
    st.floats(
        min_value=0,
        max_value=1_000_000,
        allow_nan=False,
        allow_infinity=False,
    )
)
def test_format_minutes_round_trip_always_show_both(total_minutes: float) -> None:
    rendered = format_minutes(total_minutes, always_show_both=True)
    parsed = parse_duration_to_minutes(rendered)
    assert parsed == float(round_half_up(total_minutes))


@settings(max_examples=200, deadline=None)
@given(
    hours=st.integers(min_value=0, max_value=500),
    minutes=st.integers(min_value=0, max_value=59),
    seconds=st.integers(min_value=0, max_value=59),
)
def test_parse_duration_composed_string(
    hours: int,
    minutes: int,
    seconds: int,
) -> None:
    rendered = f"{hours}h{minutes:02d}m{seconds:02d}s"
    parsed = parse_duration_to_minutes(rendered)
    expected = float(hours * 60 + minutes) + (seconds / 60.0)
    assert parsed is not None
    assert math.isclose(parsed, expected, rel_tol=1e-12, abs_tol=1e-12)


@settings(max_examples=300, deadline=None)
@given(
    current=st.floats(
        min_value=-1_000_000,
        max_value=1_000_000,
        allow_nan=False,
        allow_infinity=False,
    ),
    previous=st.floats(
        min_value=-1_000_000,
        max_value=1_000_000,
        allow_nan=False,
        allow_infinity=False,
    ),
)
def test_compute_percent_change_matches_contract(
    current: float,
    previous: float,
) -> None:
    result = compute_percent_change(current, previous)
    if previous == 0:
        if current == 0:
            assert result == 0
        else:
            assert result is None
        return
    expected = ((current - previous) / previous) * 100
    assert result is not None
    assert math.isclose(result, expected, rel_tol=1e-12, abs_tol=1e-9)
