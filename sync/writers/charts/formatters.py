"""Chart-specific label formatting policies."""

from __future__ import annotations

from dataclasses import dataclass

from sync.formatting import format_minutes


@dataclass(frozen=True)
class TimeLabelStandard:
    """Standard time label style (e.g., 0h00m, 2h02m, 15h44m)."""

    def format(self, total_minutes: float | None) -> str:
        if total_minutes is None:
            return ""
        return format_minutes(total_minutes, always_show_both=True)


@dataclass(frozen=True)
class TimeLabelMin2HourDigits:
    """Time label style with minimum two-digit hours (e.g., 00h35m, 02h02m)."""

    def format(self, total_minutes: float | None) -> str:
        if total_minutes is None:
            return ""
        label = format_minutes(total_minutes, always_show_both=True)
        if "h" not in label:
            return label
        hours, remainder = label.split("h", 1)
        return f"{hours.zfill(2)}h{remainder}"


TIME_LABEL_STANDARD = TimeLabelStandard()
TIME_LABEL_MIN2H = TimeLabelMin2HourDigits()
