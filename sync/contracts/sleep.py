"""Sleep contracts."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SleepEntry:
    """A single sleep entry from the daily SLEEP table."""

    duration_minutes: float
    awake_minutes: float | None = None
    asleep_time: str | None = None
    awake_time: str | None = None
