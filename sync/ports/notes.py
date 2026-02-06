"""Note store port."""

from __future__ import annotations

from typing import Protocol


class NoteStore(Protocol):
    """Read/write abstraction around markdown note files."""

    def read(self, path: str) -> list[str] | None:
        """Read note lines, returning None when missing/unreadable."""

    def read_or_create(self, path: str, template_path: str) -> list[str]:
        """Read note lines, creating from template when missing."""

    def write(self, path: str, lines: list[str]) -> None:
        """Atomically persist note lines."""
