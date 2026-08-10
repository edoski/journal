"""Typed note-publication results."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

NotePublicationStatus = Literal["updated", "unchanged", "conflict"]


@dataclass(frozen=True)
class NotePublication:
    """Outcome and resulting content of one locked note publication."""

    status: NotePublicationStatus
    lines: tuple[str, ...] | None

    @property
    def changed(self) -> bool:
        """Return whether content was written."""
        return self.status == "updated"
