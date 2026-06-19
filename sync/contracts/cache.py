"""Typed contracts for cache/state payloads."""

from __future__ import annotations

from typing import Literal, TypeAlias, TypedDict

GoalHorizon: TypeAlias = Literal["daily", "weekly", "monthly", "yearly"]
GoalIdsByPeriod: TypeAlias = dict[str, list[str]]
DeletedGoalIdsByPeriod: TypeAlias = dict[str, str]


class CarryForwardDeletedBuckets(TypedDict, total=False):
    """Deleted goal tombstones grouped by horizon."""

    daily: DeletedGoalIdsByPeriod
    weekly: DeletedGoalIdsByPeriod
    monthly: DeletedGoalIdsByPeriod
    yearly: DeletedGoalIdsByPeriod


class CarryForwardCacheState(TypedDict, total=False):
    """Carry-forward offer + tombstone cache payload."""

    daily: GoalIdsByPeriod
    weekly: GoalIdsByPeriod
    monthly: GoalIdsByPeriod
    yearly: GoalIdsByPeriod
    _deleted: CarryForwardDeletedBuckets


class GoalReconcileNoteState(TypedDict):
    """Last observed goal state in a single note path."""

    done: bool


class GoalReconcileGoalState(TypedDict):
    """Cached reconciliation state for one goal id."""

    last_value: bool
    last_updated_at: str
    last_updated_by: str
    notes: dict[str, GoalReconcileNoteState]


class GoalReconcileCacheState(TypedDict):
    """Root reconciliation cache payload."""

    goals: dict[str, GoalReconcileGoalState]


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
