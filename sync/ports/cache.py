"""Stable cache store ports."""

from __future__ import annotations

from typing import ContextManager, Protocol

from sync.contracts.cache import (
    CarryForwardCacheState,
    DailyTrainingCacheRow,
    GoalReconcileCacheState,
    MediaDateCacheState,
)


class GoalCarryForwardCacheStore(Protocol):
    """Read/write API for carried-goal + tombstone cache state."""

    def load(self) -> CarryForwardCacheState:
        """Load carried-goal cache state."""
        ...

    def save(self, state: CarryForwardCacheState) -> None:
        """Persist carried-goal cache state."""
        ...

    def locked_state(self) -> ContextManager[CarryForwardCacheState]:
        """Open cache state under an advisory lock and persist on exit."""
        ...


class GoalReconcileCacheStore(Protocol):
    """Read/write API for goal reconciliation cache state."""

    def load(self) -> GoalReconcileCacheState:
        """Load reconcile cache state."""
        ...

    def save(self, state: GoalReconcileCacheState) -> None:
        """Persist reconcile cache state."""
        ...

    def locked_state(self) -> ContextManager[GoalReconcileCacheState]:
        """Open cache state under an advisory lock and persist on exit."""
        ...


class MediaDateCacheStore(Protocol):
    """Read/write API for media date cache."""

    def load(self) -> MediaDateCacheState:
        """Load media date cache."""
        ...

    def save(self, state: MediaDateCacheState) -> None:
        """Persist media date cache."""
        ...


class DailyTrainingCacheStore(Protocol):
    """Per-day training cache API."""

    def load_for_date(self, date_str: str) -> list[DailyTrainingCacheRow]:
        """Load training entries for a given day."""
        ...

    def save_for_date(
        self, date_str: str, entries: list[DailyTrainingCacheRow]
    ) -> None:
        """Persist training entries for a given day."""
        ...

    def prune(self, *, keep_days: int) -> None:
        """Prune old per-day cache files."""
        ...
