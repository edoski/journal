"""
Context tracking for daily sync.

Provides functions to discover which vault files were modified during
study sessions, enabling automatic CONTEXT column population.
"""
from __future__ import annotations

import os
from datetime import datetime, date, timedelta
from typing import Any

from sync_utils import VAULT_DIR

from .constants import (
    CONTEXT_EXCLUDED_DIRS,
    CONTEXT_SESSION_BUFFER_MINUTES,
    CONTEXT_EXCLUDED_FILES,
)


# Type alias for file info dictionaries
FileInfo = dict[str, Any]


def get_vault_files_modified_on_date(
    target_date: date,
    vault_path: str = VAULT_DIR,
    extensions: tuple[str, ...] = (".md",),
) -> list[FileInfo]:
    """
    Find all files in the vault modified on a specific date.

    Args:
        target_date: Date to check for modifications
        vault_path: Root path of the Obsidian vault
        extensions: File extensions to include (default: .md only)

    Returns:
        List of dicts with 'path', 'basename', 'mtime' keys
    """
    modified_files: list[FileInfo] = []

    for root, dirs, files in os.walk(vault_path):
        # Skip excluded directories (modify dirs in-place to prevent descent)
        rel_root = os.path.relpath(root, vault_path)
        dirs[:] = [
            d for d in dirs
            if not any(
                rel_root.startswith(excl.rstrip("/")) or d == excl.rstrip("/")
                for excl in CONTEXT_EXCLUDED_DIRS
            )
        ]

        for fname in files:
            # Check extension
            if not any(fname.endswith(ext) for ext in extensions):
                continue

            fpath = os.path.join(root, fname)

            # Skip files in excluded directories (belt-and-suspenders check)
            rel_path = os.path.relpath(fpath, vault_path)
            if any(rel_path.startswith(excl) for excl in CONTEXT_EXCLUDED_DIRS):
                continue

            try:
                stat = os.stat(fpath)
                mtime = datetime.fromtimestamp(stat.st_mtime)
            except OSError:
                continue

            if mtime.date() == target_date:
                basename = os.path.splitext(fname)[0]
                # Skip excluded files (AI/meta files)
                if basename in CONTEXT_EXCLUDED_FILES:
                    continue
                modified_files.append({
                    "path": fpath,
                    "basename": basename,
                    "mtime": mtime,
                })

    return modified_files


def files_for_session(
    files: list[FileInfo],
    session_start: datetime,
    session_end: datetime,
    buffer_minutes: int = CONTEXT_SESSION_BUFFER_MINUTES,
) -> list[str]:
    """
    Return wikilink-formatted basenames of files modified during a session.

    Args:
        files: List of file info dicts from get_vault_files_modified_on_date
        session_start: Session start time
        session_end: Session end time
        buffer_minutes: Extra minutes after session end to include

    Returns:
        List of wikilink strings like "[[note-name]]"
    """
    end_with_buffer = session_end + timedelta(minutes=buffer_minutes)

    matched: list[str] = []
    for f in files:
        mtime = f["mtime"]
        if session_start <= mtime <= end_with_buffer:
            matched.append(f"[[{f['basename']}]]")

    return matched


def format_context_cell(wikilinks: list[str]) -> str:
    """
    Format a list of wikilinks for the CONTEXT table cell.

    Args:
        wikilinks: List of wikilink strings

    Returns:
        Comma-separated string of wikilinks, or em-dash if none
    """
    if not wikilinks:
        return "–"  # em-dash
    return "<br>".join(wikilinks)
