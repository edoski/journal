"""Stable cache store ports."""

from __future__ import annotations

from typing import Protocol

from sync.contracts.cache import (
    DailyTrainingCacheRow,
    MediaDateCacheState,
)


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
