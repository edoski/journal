"""Unit tests for chart layout primitives."""

from __future__ import annotations

import datetime

import pytest

from sync.writers.charts import layout as layout_module
from sync.writers.charts.layout import (
    anchor_text_start,
    axis_dash_count,
    bar_bounds,
    centered_pad,
    compress_activity_time_order,
    compress_days_time_order,
    column_bounds,
    compress_symbols,
    place_anchored_text,
    place_text,
    total_row_width,
)
from sync.writers.charts.specs import HAnchor


class TestAnchoring:
    def test_anchor_text_start_modes(self):
        assert anchor_text_start(10, 3, HAnchor.START) == 10
        assert anchor_text_start(10, 3, HAnchor.CENTER) == 9
        assert anchor_text_start(10, 3, HAnchor.END) == 8

    def test_anchor_text_start_zero_length(self):
        assert anchor_text_start(10, 0, HAnchor.CENTER) == 10

    def test_anchor_text_start_single_char_center_and_end(self):
        assert anchor_text_start(10, 1, HAnchor.CENTER) == 10
        assert anchor_text_start(10, 1, HAnchor.END) == 10


class TestPlacement:
    def test_place_text_clips_left_and_right(self):
        row = list(".....")
        place_text(row, "ABCDE", -2)
        assert "".join(row) == "CDE.."

    def test_place_anchored_text_with_clamp(self):
        row = list("..........")
        place_anchored_text(
            row,
            "XYZ",
            anchor_pos=4,
            anchor=HAnchor.CENTER,
            clamp_left=4,
            clamp_right=6,
        )
        assert "".join(row) == "....XYZ..."

    def test_place_text_start_at_width_does_not_write(self):
        row = list("abc")
        place_text(row, "Z", len(row))
        assert "".join(row) == "abc"


class TestGeometry:
    def test_column_and_bar_bounds(self):
        assert column_bounds(prefix_len=2, column_width=10, column_index=1) == (12, 21)
        assert bar_bounds(
            prefix_len=2,
            column_width=10,
            bar_left_gutter=3,
            bar_width=4,
            column_index=1,
        ) == (15, 18)

    def test_row_width_and_axis_dash_count(self):
        assert total_row_width(prefix_len=2, column_width=10, count=3) == 32
        assert axis_dash_count(column_width=10, count=3, axis_trim=2) == 28
        assert axis_dash_count(column_width=10, count=1, axis_trim=99) == 0


class TestCompressionHelpers:
    def test_centered_pad(self):
        assert centered_pad(8, 2) == 3
        assert centered_pad(7, 3) == 2
        assert centered_pad(3, 5) == 0
        assert isinstance(centered_pad(8, 2), int)

    def test_compress_symbols_empty_or_zero_width(self):
        assert compress_symbols([], 0, "·") == ""
        assert compress_symbols([], 4, "·") == "····"
        assert compress_symbols(["A"], 1, ".") == "A"

    def test_compress_symbols_negative_width_raises(self):
        with pytest.raises(ValueError) as excinfo:
            compress_symbols([], -1, "·")
        assert str(excinfo.value) == "target_width must be non-negative"

    def test_compress_symbols_padding_when_short(self):
        assert compress_symbols(["A", "B"], 4, ".") == "AB.."

    def test_compress_symbols_padding_when_short_by_one(self):
        assert compress_symbols(["A", "B", "C"], 4, ".") == "ABC."

    def test_compress_symbols_bucket_sampling_when_long(self):
        # Buckets over seven symbols into three positions => picks first of each bucket.
        assert compress_symbols(list("ABCDEFG"), 3, ".") == "ACE"

    def test_compress_symbols_one_over_target_is_compressed(self):
        assert compress_symbols(list("ABCDE"), 4, ".") == "ABCD"

    def test_compress_symbols_equal_width_returns_original(self):
        assert compress_symbols(list("ABCD"), 4, ".") == "ABCD"

    def test_compress_symbols_non_integer_bucket_boundaries(self):
        assert compress_symbols(list("ABCDEFGH"), 3, ".") == "ACF"

    def test_compress_days_time_order_zero_width_and_empty_days(self):
        day = datetime.date(2025, 1, 1)
        assert compress_days_time_order([day], lambda _: True, 0, today=day) == ""
        assert compress_days_time_order([], lambda _: True, 3, today=day) == "···"

    def test_compress_days_time_order_negative_width_raises(self):
        day = datetime.date(2025, 1, 1)
        with pytest.raises(ValueError) as excinfo:
            compress_days_time_order([day], lambda _: True, -1, today=day)
        assert str(excinfo.value) == "target_width must be non-negative"

    def test_compress_days_time_order_total_one_day_replicates_across_buckets(self):
        day = datetime.date(2025, 1, 1)
        result = compress_days_time_order(
            [day],
            lambda _: True,
            3,
            today=day,
        )
        assert result == "███"

    def test_compress_days_time_order_partial_vs_full(self):
        days = [datetime.date(2025, 1, 1), datetime.date(2025, 1, 2)]

        def met_fn(day: datetime.date) -> bool:
            return day.day == 1

        assert (
            compress_days_time_order(
                days, met_fn, 1, allow_partial=False, today=days[1]
            )
            == "█"
        )
        assert (
            compress_days_time_order(days, met_fn, 1, allow_partial=True, today=days[1])
            == "░"
        )

    def test_compress_days_time_order_default_allow_partial_is_false(self):
        days = [datetime.date(2025, 1, 1), datetime.date(2025, 1, 2)]
        result = compress_days_time_order(
            days,
            lambda day: day.day == 1,
            1,
            today=days[1],
        )
        assert result == "█"

    def test_compress_days_time_order_today_override_excludes_future_days(self):
        days = [datetime.date(2025, 1, 1), datetime.date(2025, 1, 2)]
        assert compress_days_time_order(days, lambda _: True, 2, today=days[0]) == "█·"
        assert (
            compress_days_time_order(
                days, lambda _: True, 2, today=days[0] - datetime.timedelta(days=1)
            )
            == "··"
        )

    def test_compress_activity_time_order_forces_binary_semantics(self):
        days = [datetime.date(2025, 1, 1), datetime.date(2025, 1, 2)]
        result = compress_activity_time_order(
            days,
            lambda d: d.day == 1,
            1,
            fill_char="X",
            empty_char="-",
            today=days[1],
        )
        assert result == "X"

    def test_compress_activity_time_order_delegates_expected_kwargs(self, monkeypatch):
        captured: dict[str, object] = {}

        def fake_compress_days_time_order(
            days,
            has_activity_fn,
            target_width,
            *,
            allow_partial,
            fill_char,
            partial_char,
            empty_char,
            today,
        ):
            captured["days"] = days
            captured["target_width"] = target_width
            captured["allow_partial"] = allow_partial
            captured["fill_char"] = fill_char
            captured["partial_char"] = partial_char
            captured["empty_char"] = empty_char
            captured["today"] = today
            return "SENTINEL"

        monkeypatch.setattr(
            layout_module,
            "compress_days_time_order",
            fake_compress_days_time_order,
        )

        today = datetime.date(2025, 1, 3)
        days = [datetime.date(2025, 1, 1), datetime.date(2025, 1, 2)]
        result = compress_activity_time_order(
            days,
            lambda _: True,
            2,
            fill_char="F",
            empty_char="E",
            today=today,
        )

        assert result == "SENTINEL"
        assert captured["days"] == days
        assert captured["target_width"] == 2
        assert captured["allow_partial"] is False
        assert captured["fill_char"] == "F"
        assert captured["partial_char"] == "F"
        assert captured["empty_char"] == "E"
        assert captured["today"] == today
