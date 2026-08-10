"""Markdown note storage adapter."""

from __future__ import annotations

import os
from contextlib import AbstractContextManager

from sync.constants import NOTE_LOCK_DIR
from sync.contracts.notes import NotePublication
from sync.io import atomic_write_note, safe_read_file
from sync.notes.locking import locked_path
from sync.ports.notes import NoteStore, NoteUpdater


class MarkdownNoteStore(NoteStore):
    """Filesystem-backed markdown note store."""

    def __init__(
        self,
        *,
        lock_root: str | None = None,
        lock_timeout: float = 2.0,
        lock_poll: float = 0.1,
    ) -> None:
        self.lock_root = lock_root or NOTE_LOCK_DIR
        self.lock_timeout = lock_timeout
        self.lock_poll = lock_poll

    def read_or_create(self, path: str, template_path: str) -> list[str]:
        """Read note lines, atomically creating from a template when missing."""
        with self._locked(path):
            current = safe_read_file(path)
            if current is not None:
                return current
            template = safe_read_file(template_path)
            if template is None:
                return []
            self._write(path, template)
            return _canonical_lines(template)

    def publish(
        self,
        path: str,
        lines: list[str],
        *,
        expected: list[str] | None,
    ) -> NotePublication:
        """Publish only when the locked current content matches expected."""
        with self._locked(path):
            current = safe_read_file(path)
            if current != expected:
                return NotePublication(
                    status="conflict",
                    lines=tuple(current) if current is not None else None,
                )
            return self._publish_locked(path, current, lines)

    def update(
        self,
        path: str,
        updater: NoteUpdater,
        *,
        template_path: str | None = None,
    ) -> NotePublication:
        """Transform and publish current content within one note lock."""
        with self._locked(path):
            current = safe_read_file(path)
            base = current
            if base is None and template_path is not None:
                base = safe_read_file(template_path) or []
            updated = updater(list(base) if base is not None else None)
            if updated is None:
                return NotePublication(
                    status="unchanged",
                    lines=tuple(current) if current is not None else None,
                )
            return self._publish_locked(path, current, updated)

    def _locked(self, path: str) -> AbstractContextManager[None]:
        return locked_path(
            path,
            lock_root=self.lock_root,
            timeout=self.lock_timeout,
            poll=self.lock_poll,
        )

    @staticmethod
    def _publish_locked(
        path: str,
        current: list[str] | None,
        updated: list[str],
    ) -> NotePublication:
        if current is not None and _same_content(current, updated):
            return NotePublication(status="unchanged", lines=tuple(current))
        MarkdownNoteStore._write(path, updated)
        return NotePublication(status="updated", lines=tuple(_canonical_lines(updated)))

    @staticmethod
    def _write(path: str, lines: list[str]) -> None:
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        atomic_write_note(path, lines)


def _canonical_lines(lines: list[str]) -> list[str]:
    """Return the lines persisted by atomic_write_note."""
    return ("\n".join(lines).rstrip() + "\n").splitlines()


def _same_content(current: list[str], updated: list[str]) -> bool:
    return _canonical_lines(current) == _canonical_lines(updated)
