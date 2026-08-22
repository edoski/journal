"""Typed contracts for durable application state."""

from __future__ import annotations

from typing import TypedDict


class DailyTrainingStateRow(TypedDict):
    """Canonical row stored in per-day training state."""

    start: str | None
    end: str | None
    time_raw: str
    activity: str
    duration: str
    interrupt: float | str
