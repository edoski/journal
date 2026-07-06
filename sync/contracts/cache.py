"""Typed contracts for cache/state payloads."""

from __future__ import annotations

from typing import TypedDict


class MediaDateCacheState(TypedDict):
    """Date cache for media notes used to heal frontmatter corruption."""

    podcasts: dict[str, str]
    books: dict[str, str]


class DailyTrainingCacheEntry(TypedDict):
    """Per-day training cache payload."""

    date: str
    entries: list[DailyTrainingCacheRow]


class DailyTrainingCacheRow(TypedDict):
    """Canonical row stored in per-day training cache."""

    start: str | None
    end: str | None
    time_raw: str
    activity: str
    duration: str
    interrupt: float | str
