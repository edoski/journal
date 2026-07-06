"""Runtime bootstrap for canonical cache directory layout."""

from __future__ import annotations

import os

from sync.config import PATHS, PathConfig


def bootstrap_cache_layout(*, paths: PathConfig = PATHS) -> None:
    """Ensure canonical cache and lock directories exist."""
    for path in (
        paths.journal_cache_dir,
        paths.media_cache_dir,
        paths.daily_cache_dir,
        os.path.join(paths.daily_cache_dir, "status", "pending"),
        os.path.join(paths.daily_cache_dir, "status", "invalid"),
        paths.daily_training_cache_dir,
        paths.lock_dir,
        paths.note_lock_dir,
        paths.state_lock_dir,
    ):
        os.makedirs(path, exist_ok=True)
