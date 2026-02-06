"""Markdown note storage adapter."""

from __future__ import annotations

import os

from sync.io import atomic_write_note, safe_read_file
from sync.notes.sections import ensure_note
from sync.ports.notes import NoteStore


class MarkdownNoteStore(NoteStore):
    """Filesystem-backed markdown note store."""

    def read(self, path: str) -> list[str] | None:
        """Read note lines, returning None when missing/unreadable."""
        return safe_read_file(path)

    def read_or_create(self, path: str, template_path: str) -> list[str]:
        """Read note lines, creating from template when missing."""
        ensure_note(path, template_path)
        return safe_read_file(path) or []

    def write(self, path: str, lines: list[str]) -> None:
        """Persist note lines atomically."""
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        atomic_write_note(path, lines)
