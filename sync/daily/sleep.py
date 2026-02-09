"""
Sleep section building for daily sync.

Consumes canonical sleep payload and renders the SLEEP table.
"""

from __future__ import annotations

import datetime

from sync.formatting import format_minutes_seconds
from sync.models.status import CanonicalSleepPayload


def _build_sleep_table(data: CanonicalSleepPayload | None) -> list[str]:
    """Build sleep table lines from canonical status data."""
    if data is None:
        return []

    def parse_time(raw: str) -> str:
        for fmt in (
            "%d %b %Y at %H:%M",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%d %H:%M:%S",
        ):
            try:
                dt = datetime.datetime.strptime(raw, fmt)
                return dt.strftime("%H:%M")
            except (ValueError, OverflowError):
                continue
        return raw

    start_fmt = parse_time(data.start)
    end_fmt = parse_time(data.end)
    time_cell = (
        f"`{start_fmt} - {end_fmt}`"
        if start_fmt and end_fmt
        else (f"`{start_fmt}`" if start_fmt else "")
    )
    duration_cell = f"`{format_minutes_seconds(data.sleep_min)}`"
    awake_cell = f"`{int(round(data.awake_min))}m`"
    wakes_cell = f"`{data.awake_count} times`"

    header = "| TIME | DURATION | AWAKE | AWAKENINGS |"
    separator = "| ---- | -------- | ----- | ---------- |"
    row = f"| {time_cell} | {duration_cell} | {awake_cell} | {wakes_cell} |"
    return [header, separator, row]


def build_sleep_section(
    sleep_data: CanonicalSleepPayload | None,
    existing_block: list[str] | None,
) -> list[str]:
    """Build SLEEP section lines."""
    sleep_table = _build_sleep_table(sleep_data)
    if sleep_table:
        return ["### **SLEEP**", "", *sleep_table]
    if existing_block:
        return existing_block
    return ["### **SLEEP**", "", "_Sleep data not available._"]
