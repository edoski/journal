"""Runtime bootstrap for cache directory layout."""

from __future__ import annotations

import os

from sync.config import PATHS, PathConfig

_LEGACY_CACHE_FILES = (
    "carried_goals.json",
    "goal_sync_state.json",
    "media_dates.json",
    "training_entries.json",
    "screen_time_entries.json",
)


def bootstrap_cache_layout(
    *,
    paths: PathConfig = PATHS,
    remove_legacy: bool = True,
) -> None:
    """Ensure cache/lock directory layout exists, and optionally remove legacy files."""
    for path in (
        paths.journal_cache_dir,
        paths.goal_cache_dir,
        paths.media_cache_dir,
        paths.daily_cache_dir,
        paths.daily_training_cache_dir,
        paths.daily_screen_time_cache_dir,
        paths.lock_dir,
        paths.note_lock_dir,
        paths.state_lock_dir,
    ):
        os.makedirs(path, exist_ok=True)

    if not remove_legacy:
        return

    for filename in _LEGACY_CACHE_FILES:
        legacy_path = os.path.join(paths.journal_cache_dir, filename)
        try:
            if os.path.isfile(legacy_path):
                os.remove(legacy_path)
        except OSError:
            # Legacy cleanup is best-effort and must not interrupt sync runs.
            pass
