"""Typed contracts for goal entities and section operations."""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field

from sync.goals.identity import canonical_goal_text


@dataclass(frozen=True)
class Goal:
    """A checkbox task with optional deadline."""

    id: str
    body: str
    done: bool
    date_str: str | None = None
    deadline: datetime.date | None = None
    reminder_offset: int = 0
    canonical: str = field(init=False, default="")

    def __post_init__(self) -> None:
        """Compute canonical form for deduplication."""
        object.__setattr__(self, "canonical", canonical_goal_text(self.body))


@dataclass(frozen=True)
class GoalSection:
    """Rendered markdown lines for a goals subsection."""

    section: str
    lines: list[str]
