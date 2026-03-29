"""Typed contracts for goal entities and section operations."""

from __future__ import annotations

import datetime
import re
from dataclasses import dataclass, field

from sync.contracts.cache import GoalHorizon


def _canonical_goal_text(text: str) -> str:
    """Normalize goal text for comparison and deduplication."""
    text = re.sub(
        r"^[-*]\s*\[[x \-✓✔]\]\s*",
        "",
        text.strip(),
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"(\s+\^gid-[mr][a-f0-9]{9})+\s*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    text = text.strip(" `")
    return text.rstrip(".,;:!?").lower()


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
        object.__setattr__(self, "canonical", _canonical_goal_text(self.body))


@dataclass(frozen=True)
class GoalSection:
    """Rendered markdown lines for a goals subsection."""

    section: str
    lines: list[str]


@dataclass(frozen=True)
class GoalWriteTarget:
    """Resolved note metadata for a goal write operation."""

    note_path: str
    template_path: str
    section: str
    horizon: GoalHorizon
    period_key: str


@dataclass(frozen=True)
class GoalAddResult:
    """Result of inserting a goal into a note."""

    updated_lines: list[str]
    goal_id: str | None
    duplicate: bool
