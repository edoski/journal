"""Centralized path/config resolution with environment overrides."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class PathConfig:
    """Resolved filesystem paths used across sync and TUI layers."""

    journal_dir: str
    vault_dir: str
    books_dir: str
    podcasts_dir: str
    daily_template_path: str
    weekly_template_path: str
    monthly_template_path: str
    quarterly_template_path: str
    yearly_template_path: str
    reminders_path: str
    lock_dir: str
    carried_goals_path: str
    goal_sync_state_path: str
    media_cache_path: str
    training_cache_path: str
    screen_time_cache_path: str
    flow_db_path: str
    icloud_shortcuts_dir: str
    icloud_journalsync_dir: str


def _resolve_path(value: str) -> str:
    return os.path.expanduser(value)


def _env_path(name: str, default: str) -> str:
    return _resolve_path(os.environ.get(name, default))


def _build_paths() -> PathConfig:
    journal_dir = _env_path(
        "JOURNAL_DIR",
        "/Users/edo/Documents/Obsidian/the-vault/journal",
    )
    vault_dir = _env_path(
        "VAULT_DIR",
        "/Users/edo/Documents/Obsidian/the-vault",
    )

    return PathConfig(
        journal_dir=journal_dir,
        vault_dir=vault_dir,
        books_dir=_env_path(
            "BOOKS_DIR",
            "/Users/edo/Documents/Obsidian/the-vault/notes/books",
        ),
        podcasts_dir=_env_path(
            "PODCASTS_DIR",
            "/Users/edo/Documents/Obsidian/the-vault/notes/podcasts",
        ),
        daily_template_path=_env_path(
            "DAILY_TEMPLATE_PATH",
            "/Users/edo/Documents/Obsidian/the-vault/notes/templates/daily.md",
        ),
        weekly_template_path=_env_path(
            "WEEKLY_TEMPLATE_PATH",
            "/Users/edo/Documents/Obsidian/the-vault/notes/templates/weekly.md",
        ),
        monthly_template_path=_env_path(
            "MONTHLY_TEMPLATE_PATH",
            "/Users/edo/Documents/Obsidian/the-vault/notes/templates/monthly.md",
        ),
        quarterly_template_path=_env_path(
            "QUARTERLY_TEMPLATE_PATH",
            "/Users/edo/Documents/Obsidian/the-vault/notes/templates/quarterly.md",
        ),
        yearly_template_path=_env_path(
            "YEARLY_TEMPLATE_PATH",
            "/Users/edo/Documents/Obsidian/the-vault/notes/templates/yearly.md",
        ),
        reminders_path=_env_path(
            "REMINDERS_PATH",
            os.path.join(journal_dir, "REMINDERS.md"),
        ),
        lock_dir=_env_path("LOCK_DIR", "~/.cache/journal/locks"),
        carried_goals_path=_env_path(
            "CARRIED_GOALS_PATH",
            "~/.cache/journal/carried_goals.json",
        ),
        goal_sync_state_path=_env_path(
            "GOAL_SYNC_STATE_PATH",
            "~/.cache/journal/goal_sync_state.json",
        ),
        media_cache_path=_env_path(
            "MEDIA_CACHE_PATH",
            "~/.cache/journal/media_dates.json",
        ),
        training_cache_path=_env_path(
            "TRAINING_CACHE_PATH",
            "~/.cache/journal/training_entries.json",
        ),
        screen_time_cache_path=_env_path(
            "SCREEN_TIME_CACHE_PATH",
            "~/.cache/journal/screen_time_entries.json",
        ),
        flow_db_path=_env_path(
            "FLOW_DB_PATH",
            "/Users/edo/Library/Containers/design.yugen.Flow/Data/Library/Application Support/Flow/CoreData.sqlite",
        ),
        icloud_shortcuts_dir=_env_path(
            "ICLOUD_SHORTCUTS_DIR",
            "/Users/edo/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents",
        ),
        icloud_journalsync_dir=_env_path(
            "ICLOUD_JOURNALSYNC_DIR",
            "/Users/edo/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents/JournalSync",
        ),
    )


PATHS = _build_paths()
