"""Stable durable-state store ports."""

from __future__ import annotations

from typing import Protocol

from sync.contracts.state import DailyTrainingStateRow


class DailyTrainingStateStore(Protocol):
    """Per-day training state API."""

    def load_for_date(self, date_str: str) -> list[DailyTrainingStateRow]:
        """Load training entries for a given day."""
        ...

    def save_for_date(
        self, date_str: str, entries: list[DailyTrainingStateRow]
    ) -> None:
        """Persist training entries for a given day."""
        ...

    def prune(self, *, keep_days: int) -> None:
        """Prune old per-day state files."""
        ...
