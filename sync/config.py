"""Centralized path resolution with environment overrides."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class PathConfig:
    """Resolved filesystem paths used across sync and CLI layers."""

    journal_dir: str
    vault_dir: str
    books_dir: str
    podcasts_dir: str
    daily_template_path: str
    weekly_template_path: str
    monthly_template_path: str
    yearly_template_path: str
    schedule_path: str
    bsc_grades_path: str
    msc_grades_path: str
    application_support_dir: str
    state_dir: str
    media_cache_dir: str
    daily_state_dir: str
    daily_training_state_dir: str
    lock_dir: str
    flow_db_path: str
    icloud_shortcuts_dir: str
    icloud_journalsync_dir: str


@dataclass(frozen=True)
class LoggingConfig:
    """Resolved logging configuration used by sync and CLI entrypoints."""

    level: str
    format: str


def _resolve_path(value: str) -> str:
    return os.path.expanduser(value)


def _env_path(name: str, default: str) -> str:
    return _resolve_path(os.environ.get(name, default))


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

    application_support_dir = _env_path(
        "JOURNAL_SUPPORT_DIR",
        "~/Library/Application Support/Journal",
    )
    state_dir = _env_path(
        "JOURNAL_STATE_DIR",
        os.path.join(application_support_dir, "state"),
    )

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
        yearly_template_path=_env_path(
            "YEARLY_TEMPLATE_PATH",
            os.path.join(templates_dir, "yearly.md"),
        ),
        schedule_path=_env_path(
            "SCHEDULE_PATH",
            os.path.join(journal_dir, "PROTOCOL.md"),
        ),
        bsc_grades_path=_env_path(
            "BSC_GRADES_PATH",
            os.path.join(vault_dir, "university", "bsc", "GRADES.md"),
        ),
        msc_grades_path=_env_path(
            "MSC_GRADES_PATH",
            os.path.join(vault_dir, "university", "msc", "GRADES.md"),
        ),
        application_support_dir=application_support_dir,
        state_dir=state_dir,
        media_cache_dir=_env_path(
            "MEDIA_CACHE_DIR",
            "~/Library/Caches/Journal/media",
        ),
        daily_state_dir=_env_path(
            "DAILY_STATE_DIR",
            os.path.join(state_dir, "daily"),
        ),
        daily_training_state_dir=_env_path(
            "TRAINING_STATE_DIR",
            os.path.join(state_dir, "daily", "training"),
        ),
        lock_dir=_env_path(
            "LOCK_DIR",
            os.path.join(application_support_dir, "locks"),
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
        level="INFO",
        format="text",
    )


LOGGING = _build_logging()
