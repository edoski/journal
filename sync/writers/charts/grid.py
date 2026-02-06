"""Shared grid row builder used by training and study coverage charts."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class GridRowBuilder:
    """
    Builder for grid visualization rows.

    Encapsulates the common logic for building symbol rows, separator rows,
    label rows, and delta rows used by training and study grids.
    """

    week_day_counts: list[int]
    week_width: int
    week_labels: list[str]
    col_gap: str = "   "
    row_prefix: str = "│ "

    def build_symbol_row(self, symbols: list[str]) -> str:
        """Build a row of day symbols grouped by week."""
        row = self.row_prefix
        idx = 0
        for pos, day_count in enumerate(self.week_day_counts):
            week = " ".join(symbols[idx : idx + day_count])
            row += week.ljust(self.week_width)
            idx += day_count
            if pos < len(self.week_day_counts) - 1:
                row += self.col_gap
        return row.rstrip()

    def build_separator_row(self) -> str:
        """Build a horizontal separator row."""
        row = self.row_prefix
        for pos in range(len(self.week_day_counts)):
            row += "─" * self.week_width
            if pos < len(self.week_day_counts) - 1:
                row += self.col_gap
        return row.rstrip()

    def build_label_row(self) -> str:
        """Build a centered week label row."""
        row = self.row_prefix
        for pos, label in enumerate(self.week_labels):
            left_pad = max((self.week_width - len(label)) // 2, 0)
            row += (
                " " * left_pad
                + label
                + " " * max(self.week_width - left_pad - len(label), 0)
            )
            if pos < len(self.week_labels) - 1:
                row += self.col_gap
        return row.rstrip()

    def build_delta_row(
        self, delta_labels: list[str] | None, prefix: str | None = None
    ) -> str | None:
        """Build a centered delta label row, or None if empty."""
        if not delta_labels:
            return None
        row = prefix if prefix is not None else self.row_prefix
        any_label = False
        for pos in range(len(self.week_day_counts)):
            label_str = (delta_labels[pos] if pos < len(delta_labels) else "") or ""
            if label_str:
                any_label = True
            left_pad = max((self.week_width - len(label_str)) // 2, 0)
            row += (
                " " * left_pad
                + label_str
                + " " * max(self.week_width - left_pad - len(label_str), 0)
            )
            if pos < len(self.week_day_counts) - 1:
                row += self.col_gap
        return row.rstrip() if any_label else None
