"""Goal store port."""

from __future__ import annotations

from typing import Protocol

from sync.contracts.goals import GoalSection
from sync.models.goals import Goal


class GoalStore(Protocol):
    """Canonical extraction and persistence API for goals sections."""

    def extract(
        self,
        lines: list[str],
        section: str,
        horizon: str | None = None,
        period_key: str | None = None,
    ) -> list[Goal]:
        """Extract goals from a section."""
        ...

    def apply(self, lines: list[str], sections: list[GoalSection]) -> list[str]:
        """Return lines with goals sections replaced."""
        ...

    def write(
        self,
        path: str,
        lines: list[str],
        sections: list[GoalSection],
    ) -> list[str]:
        """Persist and return updated lines."""
        ...
