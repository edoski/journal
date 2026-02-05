"""
Goal model for the journal sync system.
"""

from __future__ import annotations

import datetime
import re
from dataclasses import dataclass, field


def canonical_goal_text(text: str) -> str:
    """
    Normalize goal text for comparison and deduplication.

    - Strips checkbox markers
    - Strips wikilinks (keeps inner text)
    - Strips goal IDs
    - Strips backticks
    - Collapses whitespace
    - Lowercases and removes trailing punctuation
    """
    # Strip checkbox markers
    text = re.sub(r"^[-*]\s*\[[x ]\]\s*", "", text.strip(), flags=re.IGNORECASE)
    # Strip wikilinks but keep inner text
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    # Strip goal IDs
    text = re.sub(r"\^gid-[a-f0-9]+", "", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text)
    # Strip backticks
    text = text.strip(" `")
    # Lowercase and strip trailing punctuation
    return text.rstrip(".,;:!?").lower()


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
