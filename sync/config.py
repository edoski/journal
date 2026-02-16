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
    schedule_path: str
    journal_cache_dir: str
    goal_cache_dir: str
    media_cache_dir: str
    daily_cache_dir: str
    daily_training_cache_dir: str
    daily_screen_time_cache_dir: str
    lock_dir: str
    note_lock_dir: str
    state_lock_dir: str
    flow_db_path: str
    icloud_shortcuts_dir: str
    icloud_journalsync_dir: str


@dataclass(frozen=True)
class LoggingConfig:
    """Resolved logging configuration used by sync and TUI entrypoints."""

    level: str
    format: str
    cap_bytes: int


def _resolve_path(value: str) -> str:
    return os.path.expanduser(value)


def _env_path(name: str, default: str) -> str:
    return _resolve_path(os.environ.get(name, default))


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _build_paths() -> PathConfig:
    home_dir = _resolve_path("~")
    default_vault_dir = os.path.join(home_dir, "Documents", "Obsidian", "the-vault")
    vault_dir = _env_path("VAULT_DIR", default_vault_dir)
    journal_dir = _env_path("JOURNAL_DIR", os.path.join(vault_dir, "journal"))
    notes_dir = os.path.join(vault_dir, "notes")
    templates_dir = os.path.join(notes_dir, "templates")
    flow_container_root = os.path.join(
        home_dir,
        "Library",
        "Containers",
        "design.yugen.Flow",
        "Data",
        "Library",
        "Application Support",
        "Flow",
    )
    shortcuts_documents_dir = os.path.join(
        home_dir,
        "Library",
        "Mobile Documents",
        "iCloud~is~workflow~my~workflows",
        "Documents",
    )

    journal_cache_dir = _env_path("JOURNAL_CACHE_DIR", "~/.cache/journal")
    lock_dir = _env_path("LOCK_DIR", os.path.join(journal_cache_dir, "locks"))

    return PathConfig(
        journal_dir=journal_dir,
        vault_dir=vault_dir,
        books_dir=_env_path(
            "BOOKS_DIR",
            os.path.join(notes_dir, "books"),
        ),
        podcasts_dir=_env_path(
            "PODCASTS_DIR",
            os.path.join(notes_dir, "podcasts"),
        ),
        daily_template_path=_env_path(
            "DAILY_TEMPLATE_PATH",
            os.path.join(templates_dir, "daily.md"),
        ),
        weekly_template_path=_env_path(
            "WEEKLY_TEMPLATE_PATH",
            os.path.join(templates_dir, "weekly.md"),
        ),
        monthly_template_path=_env_path(
            "MONTHLY_TEMPLATE_PATH",
            os.path.join(templates_dir, "monthly.md"),
        ),
        quarterly_template_path=_env_path(
            "QUARTERLY_TEMPLATE_PATH",
            os.path.join(templates_dir, "quarterly.md"),
        ),
        yearly_template_path=_env_path(
            "YEARLY_TEMPLATE_PATH",
            os.path.join(templates_dir, "yearly.md"),
        ),
        reminders_path=_env_path(
            "REMINDERS_PATH",
            os.path.join(journal_dir, "REMINDERS.md"),
        ),
        schedule_path=_env_path(
            "SCHEDULE_PATH",
            os.path.join(journal_dir, "PROTOCOL.md"),
        ),
        journal_cache_dir=journal_cache_dir,
        goal_cache_dir=_env_path(
            "GOAL_CACHE_DIR",
            os.path.join(journal_cache_dir, "goals"),
        ),
        media_cache_dir=_env_path(
            "MEDIA_CACHE_DIR",
            os.path.join(journal_cache_dir, "media"),
        ),
        daily_cache_dir=_env_path(
            "DAILY_CACHE_DIR",
            os.path.join(journal_cache_dir, "daily"),
        ),
        daily_training_cache_dir=_env_path(
            "TRAINING_CACHE_DIR",
            os.path.join(journal_cache_dir, "daily", "training"),
        ),
        daily_screen_time_cache_dir=_env_path(
            "SCREEN_TIME_CACHE_DIR",
            os.path.join(journal_cache_dir, "daily", "screen_time"),
        ),
        lock_dir=lock_dir,
        note_lock_dir=_env_path(
            "NOTE_LOCK_DIR",
            os.path.join(lock_dir, "notes"),
        ),
        state_lock_dir=_env_path(
            "STATE_LOCK_DIR",
            os.path.join(lock_dir, "state"),
        ),
        flow_db_path=_env_path(
            "FLOW_DB_PATH",
            os.path.join(flow_container_root, "CoreData.sqlite"),
        ),
        icloud_shortcuts_dir=_env_path(
            "ICLOUD_SHORTCUTS_DIR",
            shortcuts_documents_dir,
        ),
        icloud_journalsync_dir=_env_path(
            "ICLOUD_JOURNALSYNC_DIR",
            os.path.join(shortcuts_documents_dir, "JournalSync"),
        ),
    )


PATHS = _build_paths()


def _build_logging() -> LoggingConfig:
    return LoggingConfig(
        level=os.environ.get("JOURNAL_LOG_LEVEL", "INFO"),
        format=os.environ.get("JOURNAL_LOG_FORMAT", "text"),
        cap_bytes=_env_int("JOURNAL_LOG_CAP_BYTES", 262144),
    )


LOGGING = _build_logging()
