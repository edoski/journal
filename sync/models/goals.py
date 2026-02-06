"""
Goal model for the journal sync system.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field

from sync.goals.identity import canonical_goal_text


@dataclass
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
        self.canonical = canonical_goal_text(self.body)
