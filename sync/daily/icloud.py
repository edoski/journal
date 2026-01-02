"""
iCloud status file handling for daily sync.

Provides resilient loading of status files from iCloud with retry logic,
file size stabilization, and fallback to .invalid copies.
"""
from __future__ import annotations

import datetime
import glob
import json
import os
import time

from .constants import ICLOUD_JOURNALSYNC_DIR


def _load_status_file(filename: str) -> tuple[bool, dict | None]:
    """
    Read and JSON-parse a status file dropped in iCloud by Shortcuts.

    Resilience features:
    - Wait for the file size to stabilize (to avoid half-synced reads).
    - Retry for up to ~60 seconds before giving up.
    - Only delete the file after a successful parse.
    - If parsing never succeeds, keep a `.invalid` copy for inspection
      and return (False, None) without touching frontmatter.

    Args:
        filename: Name of the status file (e.g., "workout_status.json")

    Returns:
        Tuple of (success, data) where success is True if data was loaded
    """
    path = os.path.join(ICLOUD_JOURNALSYNC_DIR, filename)

    def try_parse(target_path: str, delete_after: bool) -> tuple[bool, dict | None, Exception | None]:
        last_size: int | None = None
        stable_count = 0
        max_attempts = 60
        stable_needed = 2
        last_err: Exception | None = None

        for _ in range(max_attempts):
            try:
                size = os.path.getsize(target_path)
            except FileNotFoundError:
                last_err = FileNotFoundError("file disappeared while waiting")
                time.sleep(1.0)
                continue

            if size == 0:
                last_err = ValueError("empty file (likely still syncing)")
                stable_count = 0
                time.sleep(1.0)
                continue

            if last_size is not None and size == last_size:
                stable_count += 1
            else:
                stable_count = 0
                last_size = size

            if stable_count < stable_needed:
                time.sleep(1.0)
                continue

            try:
                with open(target_path, "r") as f:
                    raw = f.read()
                data = json.loads(raw)
                if delete_after:
                    try:
                        os.remove(target_path)
                    except Exception:
                        pass
                return True, data, None
            except Exception as e:
                last_err = e
                time.sleep(1.0)

        return False, None, last_err

    def cleanup_invalids(primary_path: str) -> None:
        invalids = glob.glob(primary_path + ".invalid") + glob.glob(primary_path + ".*.invalid")
        for inv in invalids:
            try:
                os.remove(inv)
            except Exception:
                pass

    # First try the primary path
    last_err: Exception | None = None
    if os.path.exists(path):
        success, data, last_err = try_parse(path, delete_after=True)
        if success:
            cleanup_invalids(path)
            return True, data
        # Promote the failed file to an .invalid copy for inspection/retry.
        backup_path = path + ".invalid"
        try:
            if os.path.exists(backup_path):
                ts = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
                backup_path = f"{path}.{ts}.invalid"
            os.replace(path, backup_path)
        except Exception:
            pass
    else:
        # Missing is expected most of the time; treat as no new data.
        return False, None

    # Fallback: reprocess any existing .invalid copies (most recent first)
    candidates = glob.glob(path + ".invalid") + glob.glob(path + ".*.invalid")
    candidates = sorted(set(candidates), key=lambda p: os.path.getmtime(p), reverse=True)
    for cand in candidates:
        success, data, _ = try_parse(cand, delete_after=False)
        if success:
            cleanup_invalids(path)
            return True, data

    if last_err:
        print(f"Failed to parse {os.path.basename(path)}: {last_err}")
    return False, None
