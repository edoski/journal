"""Shared runtime helpers for period sync entrypoints."""

from __future__ import annotations

import os
from collections.abc import Callable

from sync.constants import JOURNAL_DIR
from sync.notes.sections import replace_metrics_block
from sync.periods.finances import TRANSACTIONS_DIR, transactions_note_name
from sync.ports.notes import NoteStore
from sync.periods.cleanup import resync_if_marker


def journal_path(filename: str) -> str:
    """Resolve a filename into the journal directory."""
    return os.path.join(JOURNAL_DIR, filename)


def transactions_note_path(year: int, month: int) -> str:
    """Resolve a month's transactions note inside the journal directory."""
    return os.path.join(
        JOURNAL_DIR, TRANSACTIONS_DIR, f"{transactions_note_name(year, month)}.md"
    )


def publish_whole_note(path: str, lines: list[str], note_store: NoteStore) -> bool:
    """Publish a fully generated note; the note store locks, compares and replaces."""
    return note_store.update(path, lambda _current: lines).changed


def publish_note_metrics(
    note_path: str,
    template_path: str,
    metrics_block: list[str],
    note_store: NoteStore,
) -> bool:
    """Replace metrics from locked current content and publish atomically."""
    publication = note_store.update(
        note_path,
        lambda lines: replace_metrics_block(lines or [], metrics_block),
        template_path=template_path,
    )
    return publication.changed


def maybe_cleanup_previous(
    *,
    enabled: bool,
    previous_note_path: str,
    rerun: Callable[[], None] | None,
) -> bool:
    """Run one-time previous-period cleanup when enabled."""
    if not enabled or rerun is None:
        return False
    return resync_if_marker(previous_note_path, rerun)
