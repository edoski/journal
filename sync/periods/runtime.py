"""Shared runtime helpers for period sync entrypoints."""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager

from sync.constants import JOURNAL_DIR
from sync.notes.locking import locked_note
from sync.notes.sections import replace_metrics_block
from sync.ports.notes import NoteStore
from sync.periods.cleanup import resync_if_marker


def resolve_note_path(filename: str, override_path: str | None = None) -> str:
    """Resolve note path from a filename and optional --file override."""
    return override_path or journal_path(filename)


def journal_path(filename: str) -> str:
    """Resolve a filename into the journal directory."""
    return os.path.join(JOURNAL_DIR, filename)


@contextmanager
def open_period_note(
    note_path: str,
    template_path: str,
    note_store: NoteStore,
) -> Iterator[list[str]]:
    """Open a period note under lock and yield mutable line content."""
    with locked_note(note_path):
        lines = note_store.read_or_create(note_path, template_path)
        yield lines


def write_note_metrics(
    note_path: str,
    lines: list[str],
    metrics_block: list[str],
    note_store: NoteStore,
) -> None:
    """Replace metrics block and atomically persist note content."""
    updated_lines = replace_metrics_block(lines, metrics_block)
    note_store.write(note_path, updated_lines)


def maybe_cleanup_previous(
    *,
    enabled: bool,
    previous_note_path: str,
    module_name: str,
    module_args: list[str],
) -> bool:
    """Run one-time previous-period cleanup when enabled."""
    if not enabled:
        return False
    return resync_if_marker(previous_note_path, module_name, module_args)
