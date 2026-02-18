"""
Low-level file I/O utilities for the journal sync system.

This module provides safe, reusable file operations with proper error handling.
It sits at the bottom of the import hierarchy and has no dependencies on other
sync modules, allowing it to be imported anywhere without circular import issues.

Functions:
    safe_read_file: Read file lines with graceful error handling
    atomic_write_note: Write lines atomically via temp file + replace
    safe_load_json: Load JSON with fallback default on error
    safe_save_json: Save JSON with makedirs and error handling
    safe_load_dated_cache: Load date-validated cache entries
"""

from __future__ import annotations

import json
import os

from sync.log import get_logger

_logger = get_logger(__name__)


def safe_read_file(path: str) -> list[str] | None:
    """
    Read file lines safely, returning None if file doesn't exist or is inaccessible.

    Consolidates the repeated pattern of:
    - os.path.exists check
    - try/except FileNotFoundError
    - try/except PermissionError/OSError

    Args:
        path: Path to the file to read

    Returns:
        List of lines (splitlines), or None if file doesn't exist or can't be read
    """
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as f:
            return f.read().splitlines()
    except FileNotFoundError:
        return None
    except (PermissionError, OSError) as e:
        _logger.warning("Failed to read %s: %s", path, e)
        return None


def atomic_write_note(path: str, lines: list[str]) -> None:
    """
    Write lines to a note file atomically via temp file + replace.

    This ensures the file is never left in a partial/corrupt state:
    1. Write to a temporary file (path + ".tmp")
    2. Atomically replace the target file

    Args:
        path: Target file path
        lines: Lines to write (will be joined with newlines, trailing newline added)
    """
    tmp_path = path + ".tmp"
    with open(tmp_path, "w") as f:
        f.write("\n".join(lines).rstrip() + "\n")
    os.replace(tmp_path, path)


def safe_load_json(path: str, default: object = None) -> object:
    """
    Load JSON from a file with graceful error handling.

    Args:
        path: Path to the JSON file
        default: Value to return if file doesn't exist or can't be parsed

    Returns:
        Parsed JSON data, or default if file is missing/corrupt/inaccessible
    """
    try:
        with open(path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except json.JSONDecodeError as e:
        _logger.debug("Corrupt JSON in %s: %s", path, e)
        return default
    except (PermissionError, OSError) as e:
        _logger.warning("Failed to read %s: %s", path, e)
        return default


def safe_save_json(path: str, data: object, indent: int = 2) -> bool:
    """
    Save data as JSON with makedirs and error handling.

    Args:
        path: Target file path
        data: Data to serialize as JSON
        indent: JSON indentation level (default 2)

    Returns:
        True if save succeeded, False otherwise
    """
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, indent=indent)
        return True
    except (PermissionError, OSError) as e:
        _logger.warning("Failed to write %s: %s", path, e)
        return False


def safe_load_dated_cache(
    path: str,
    date_str: str,
    entries_type: type = list,
) -> object:
    """
    Load a date-validated cache file.

    This handles the common pattern used by training and screen_time caches:
    - Load JSON with {"date": "YYYY-MM-DD", "entries": ...} structure
    - Return entries only if the date matches the requested date_str
    - Return None if date doesn't match, file is missing, or entries are wrong type

    Args:
        path: Path to the cache JSON file
        date_str: Date string (YYYY-MM-DD) that must match cache date
        entries_type: Expected type of entries (list or dict)

    Returns:
        The entries value if date matches and type is correct, None otherwise
    """
    data = safe_load_json(path)
    if data is None:
        return None
    if not isinstance(data, dict):
        return None
    if data.get("date") != date_str:
        return None
    entries = data.get("entries")
    if not isinstance(entries, entries_type):
        return None
    return entries
