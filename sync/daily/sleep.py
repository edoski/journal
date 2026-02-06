"""
Sleep section building for daily sync.

Provides functions to build sleep tables and sections for daily notes.
"""

from __future__ import annotations

import datetime
from typing import Any

from sync.contracts.daily import SleepStatusPayload
from sync.formatting import format_minutes_seconds
from sync.logging import get_logger

logger = get_logger()

_REQUIRED_SLEEP_KEYS = (
    "date",
    "start",
    "end",
    "sleep_min",
    "awake_min",
    "awake_count",
)
_LEGACY_SLEEP_KEYS = {
    "SleepBegin",
    "SleepStart",
    "SleepEnd",
    "SleepMinutes",
    "AwakeMinutes",
    "AwakeCount",
}


def _validated_sleep_payload(data: SleepStatusPayload) -> SleepStatusPayload:
    payload: dict[str, Any] = dict(data)

    legacy = sorted(key for key in _LEGACY_SLEEP_KEYS if key in payload)
    if legacy:
        raise ValueError(
            "Legacy sleep payload keys are not supported: " + ", ".join(legacy)
        )

    missing = [key for key in _REQUIRED_SLEEP_KEYS if key not in payload]
    if missing:
        raise ValueError("Invalid sleep payload: missing keys " + ", ".join(missing))

    date_str = payload["date"]
    start_str = payload["start"]
    end_str = payload["end"]
    if not isinstance(date_str, str) or not date_str.strip():
        raise ValueError("Invalid sleep payload: date must be a non-empty string")
    if not isinstance(start_str, str) or not start_str.strip():
        raise ValueError("Invalid sleep payload: start must be a non-empty string")
    if not isinstance(end_str, str) or not end_str.strip():
        raise ValueError("Invalid sleep payload: end must be a non-empty string")

    try:
        sleep_min = float(payload["sleep_min"])
        awake_min = float(payload["awake_min"])
        awake_count = int(float(payload["awake_count"]))
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Invalid sleep payload: sleep_min/awake_min/awake_count must be numeric"
        ) from exc

    return SleepStatusPayload(
        date=date_str,
        start=start_str,
        end=end_str,
        sleep_min=sleep_min,
        awake_min=awake_min,
        awake_count=awake_count,
    )


def _build_sleep_table(data: SleepStatusPayload | None) -> list[str]:
    """
    Build sleep table lines from status data.

    Args:
        data: Sleep data dict with keys like 'start', 'end', 'sleep_min', 'awake_min', 'awake_count'

    Returns:
        List of markdown table lines, or empty list if no valid data
    """
    if data is None:
        return []

    validated = _validated_sleep_payload(data)

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

    start_fmt = parse_time(validated["start"])
    end_fmt = parse_time(validated["end"])
    time_cell = (
        f"`{start_fmt} - {end_fmt}`"
        if start_fmt and end_fmt
        else (f"`{start_fmt}`" if start_fmt else "")
    )
    duration_cell = f"`{format_minutes_seconds(validated['sleep_min'])}`"
    awake_cell = f"`{int(round(validated['awake_min']))}m`"
    wakes_cell = f"`{validated['awake_count']} times`"

    header = "| TIME | DURATION | AWAKE | AWAKENINGS |"
    separator = "| ---- | -------- | ----- | ---------- |"
    row = f"| {time_cell} | {duration_cell} | {awake_cell} | {wakes_cell} |"
    return [header, separator, row]


def build_sleep_section(
    sleep_data: SleepStatusPayload | None,
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
    try:
        sleep_table = _build_sleep_table(sleep_data)
    except ValueError as exc:
        logger.error("Invalid sleep payload: %s", exc)
        raise

    if sleep_table:
        lines_out.append("### **SLEEP**")
        lines_out.append("")  # spacer between header and table
        lines_out.extend(sleep_table)
    elif existing_block:
        lines_out.extend(existing_block)
    else:
        lines_out.extend(["### **SLEEP**", "", "_Sleep data not available._"])

    return lines_out
