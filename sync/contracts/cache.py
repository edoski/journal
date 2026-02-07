"""Typed contracts for cache/state payloads."""

from __future__ import annotations

from typing import Any, TypeAlias, TypedDict

GoalDeletedBucket: TypeAlias = dict[str, dict[str, str]]
CarryForwardCacheState: TypeAlias = dict[str, Any]
GoalReconcileGoalState: TypeAlias = dict[str, Any]
GoalReconcileCacheState: TypeAlias = dict[str, Any]


class GoalReconcileNoteState(TypedDict):
    """Last observed goal state in a single note path."""

    done: bool


class MediaDateCacheState(TypedDict):
    """Date cache for media notes used to heal frontmatter corruption."""

    podcasts: dict[str, str]
    books: dict[str, str]


class DailyTrainingCacheEntry(TypedDict):
    """Per-day training cache payload."""

    date: str
    entries: list[dict[str, Any]]


class DailyScreenTimeCacheEntry(TypedDict):
    """Per-day screen-time cache payload."""

    date: str
    entries: dict[str, float]
