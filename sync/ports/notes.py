"""Note store port."""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

from sync.contracts.notes import NotePublication

NoteUpdater = Callable[[list[str] | None], list[str] | None]


class NoteStore(Protocol):
    """Locked publication boundary around Markdown note files."""

    def read_or_create(self, path: str, template_path: str) -> list[str]:
        """Read note lines, atomically creating from a template when missing."""
        ...

    def publish(
        self,
        path: str,
        lines: list[str],
        *,
        expected: list[str] | None,
    ) -> NotePublication:
        """Publish only when the locked current content matches expected."""
        ...

    def update(
        self,
        path: str,
        updater: NoteUpdater,
        *,
        template_path: str | None = None,
    ) -> NotePublication:
        """Transform and publish current content within one note lock."""
        ...
