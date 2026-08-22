"""Runtime bootstrap for canonical state and cache directory layout."""

from __future__ import annotations

import os

from sync.config import PATHS, PathConfig


def bootstrap_storage_layout(*, paths: PathConfig = PATHS) -> None:
    """Ensure canonical state, cache, and lock directories exist."""
    for path in (
        paths.application_support_dir,
        paths.state_dir,
        paths.media_cache_dir,
        paths.daily_state_dir,
        os.path.join(paths.daily_state_dir, "status", "pending"),
        os.path.join(paths.daily_state_dir, "status", "invalid"),
        paths.daily_training_state_dir,
        paths.lock_dir,
    ):
        os.makedirs(path, exist_ok=True)
