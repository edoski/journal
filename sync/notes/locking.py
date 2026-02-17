"""
File-lock utilities for note read/write synchronization.
"""

from __future__ import annotations

import fcntl
import hashlib
import os
import time
from collections.abc import Iterator
from contextlib import contextmanager

from sync.constants import NOTE_LOCK_DIR

LOCK_RETENTION_DAYS = 14
_PRUNED_LOCK_ROOTS: set[str] = set()


def _lockfile_for(path: str, lock_root: str) -> str:
    """Return path to advisory lockfile for a given lock root and target path."""
    digest = hashlib.sha1(os.path.abspath(path).encode()).hexdigest()
    shard = digest[:2]
    lock_dir = os.path.join(lock_root, shard)
    os.makedirs(lock_dir, exist_ok=True)
    return os.path.join(lock_dir, f"{digest}.lock")


def _cleanup_old_locks(lock_root: str, max_age_days: int = LOCK_RETENTION_DAYS) -> None:
    """Remove lock files older than max_age_days under the provided lock root."""
    if not os.path.isdir(lock_root):
        return
    cutoff = time.time() - (max_age_days * 86400)
    try:
        for root, _, files in os.walk(lock_root):
            for fname in files:
                if not fname.endswith(".lock"):
                    continue
                fpath = os.path.join(root, fname)
                try:
                    if os.path.getmtime(fpath) < cutoff:
                        os.remove(fpath)
                except OSError:
                    pass
    except OSError:
        pass


@contextmanager
def locked_path(
    path: str,
    *,
    lock_root: str,
    timeout: float = 2.0,
    poll: float = 0.1,
) -> Iterator[None]:
    """
    Serialize access to a target path using a sharded advisory lock file.

    - Uses fcntl.flock (works on macOS) with non-blocking attempts.
    - Waits up to `timeout` seconds, polling every `poll` seconds.
    - Raises TimeoutError if the lock cannot be acquired in time.
    - Performs deterministic stale-lock cleanup once per process + lock root.
    """
    if lock_root not in _PRUNED_LOCK_ROOTS:
        _cleanup_old_locks(lock_root)
        _PRUNED_LOCK_ROOTS.add(lock_root)

    lock_path = _lockfile_for(path, lock_root)
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


@contextmanager
def locked_note(path: str, timeout: float = 2.0, poll: float = 0.1) -> Iterator[None]:
    """Serialize writes to a note using the configured notes lock root."""
    with locked_path(path, lock_root=NOTE_LOCK_DIR, timeout=timeout, poll=poll):
        yield
