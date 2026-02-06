#!/usr/bin/env python3
"""
Entry point for running daily sync as a module.

Usage:
    python -m sync.daily
"""

from __future__ import annotations

from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.study.db import get_todays_sessions
from .orchestrator import update_markdown


def main() -> None:
    """Run the daily sync process."""
    sessions = get_todays_sessions()
    note_store = MarkdownNoteStore()
    changed = update_markdown(sessions, note_store)
    if changed is False:
        # Suppress noisy success logs on no-op runs.
        pass


if __name__ == "__main__":
    main()
