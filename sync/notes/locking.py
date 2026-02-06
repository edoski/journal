"""
File-lock utilities for note read/write synchronization.
"""

from __future__ import annotations

import fcntl
import hashlib
import os
import random
import time
from contextlib import contextmanager

from sync.constants import LOCK_DIR


def _lockfile_for(path: str) -> str:
    """Return path to advisory lockfile for a given note."""
    os.makedirs(LOCK_DIR, exist_ok=True)
    digest = hashlib.sha1(os.path.abspath(path).encode()).hexdigest()
    return os.path.join(LOCK_DIR, f"{digest}.lock")


def _cleanup_old_locks(max_age_days: int = 30) -> None:
    """Remove lock files older than max_age_days."""
    if not os.path.isdir(LOCK_DIR):
        return
    cutoff = time.time() - (max_age_days * 86400)
    try:
        for fname in os.listdir(LOCK_DIR):
            if not fname.endswith(".lock"):
                continue
            fpath = os.path.join(LOCK_DIR, fname)
            try:
                if os.path.getmtime(fpath) < cutoff:
                    os.remove(fpath)
            except OSError:
                pass
    except OSError:
        pass


@contextmanager
def locked_note(path: str, timeout: float = 2.0, poll: float = 0.1):
    """
    Serialize writes to a note by taking an advisory lock stored in ~/.cache.

    - Uses fcntl.flock (works on macOS) with non-blocking attempts.
    - Waits up to `timeout` seconds, polling every `poll` seconds.
    - Raises TimeoutError if the lock cannot be acquired in time.
    - Automatically cleans up old lock files (~1% of calls).
    """
    if random.random() < 0.01:
        _cleanup_old_locks(30)

    lock_path = _lockfile_for(path)
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR)
    deadline = time.time() + timeout
    try:
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.time() >= deadline:
                    raise TimeoutError(f"Could not lock {path} within {timeout}s.")
                time.sleep(poll)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)
