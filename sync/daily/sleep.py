"""
Sleep section building for daily sync.

Provides functions to build sleep tables and sections for daily notes.
"""

from __future__ import annotations

import datetime
from typing import Any

from sync.formatting import format_minutes_seconds


# Type alias for sleep data
SleepData = dict[str, Any]


def _build_sleep_table(data: SleepData | None) -> list[str]:
    """
    Build sleep table lines from status data.

    Args:
        data: Sleep data dict with keys like 'start', 'end', 'sleep_min', 'awake_min', 'awake_count'

    Returns:
        List of markdown table lines, or empty list if no valid data
    """
    if not data:
        return []
    try:

        def parse_time(raw: str | None) -> str:
            if not raw:
                return ""
            for fmt in (
                "%d %b %Y at %H:%M",
                "%Y-%m-%dT%H:%M:%S%z",
                "%Y-%m-%d %H:%M:%S",
            ):
                try:
                    dt = datetime.datetime.strptime(raw, fmt)
                    return dt.strftime("%H:%M")
                except Exception:
                    continue
            return raw

        start_raw = (
            data.get("start") or data.get("SleepBegin") or data.get("SleepStart")
        )
        end_raw = data.get("end") or data.get("SleepEnd")
        sleep_min = data.get("sleep_min") or data.get("SleepMinutes")
        awake_min = data.get("awake_min") or data.get("AwakeMinutes")
        awake_count = data.get("awake_count") or data.get("AwakeCount")

        start_fmt = parse_time(start_raw)
        end_fmt = parse_time(end_raw)
        time_cell = (
            f"`{start_fmt} - {end_fmt}`"
            if start_fmt and end_fmt
            else (f"`{start_fmt}`" if start_fmt else "")
        )
        duration_cell = (
            f"`{format_minutes_seconds(float(sleep_min))}`"
            if sleep_min is not None
            else ""
        )
        awake_cell = (
            f"`{int(round(float(awake_min)))}m`" if awake_min is not None else ""
        )
        wakes_cell = f"`{int(awake_count)} times`" if awake_count is not None else ""

        header = "| TIME | DURATION | AWAKE | AWAKENINGS |"
        separator = "| ---- | -------- | ----- | ---------- |"
        row = f"| {time_cell} | {duration_cell} | {awake_cell} | {wakes_cell} |"
        return [header, separator, row]
    except Exception:
        return []


def _build_sleep_section(
    sleep_data: SleepData | None,
    existing_block: list[str] | None,
) -> list[str]:
    """
    Build sleep section lines.

    Args:
        sleep_data: Sleep data dict from status file
        existing_block: Lines from existing sleep block in note

    Returns:
        List of markdown lines for sleep section
    """
    lines_out: list[str] = []
    sleep_table = _build_sleep_table(sleep_data)

    if sleep_table:
        lines_out.append("### **SLEEP**")
        lines_out.append("")  # spacer between header and table
        lines_out.extend(sleep_table)
    elif existing_block:
        lines_out.extend(existing_block)
    else:
        lines_out.extend(["### **SLEEP**", "", "_Sleep data not available._"])

    return lines_out
