"""Shared goal orchestration helpers for period sync entrypoints."""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sync.goals.carry_forward import carry_forward_with_tombstones
from sync.goals.note_store import (
    empty_subsection_lines,
    extract_goals,
    render_goals_or_empty,
)
from sync.goals.reconcile import (
    merge_mirror_goals,
    process_pierced_goals,
    reconcile_goal_lists,
)
from sync.contracts.goals import Goal
from sync.ports.cache import GoalCarryForwardCacheStore, GoalReconcileCacheStore
from sync.writers.goals import render_goal_lines


@dataclass(frozen=True)
class CarryForwardConfig:
    """Configuration for source-section carry-forward loading."""

    section: str
    horizon: str
    period_key: str
    current_id_key: str
    previous_lines: list[str] | None = None
    previous_id_key: str | None = None


@dataclass(frozen=True)
class MirrorSyncConfig:
    """Configuration for source<->mirror goal synchronization."""

    mirror_section: str
    source_path: str
    mirror_path: str
    proximity_days: int


@dataclass(frozen=True)
class PiercingSyncConfig:
    """Configuration for piercing parent goals into a source section."""

    source_section: str
    note_path: str
    source_paths: tuple[str, ...]
    proximity_days: int


@dataclass(frozen=True)
class MirrorSyncResult:
    """Result of source<->mirror synchronization."""

    source_tasks: list[Goal]
    mirror_tasks: list[Goal]
    source_changed: bool
    mirror_lines: list[str]


@dataclass(frozen=True)
class PiercingSyncResult:
    """Result of source-section piercing synchronization."""

    source_lines: list[str]
    updated_source_lists: list[list[Goal]]
    source_changes: list[bool]


def load_source_tasks_with_carry_forward(
    lines: list[str],
    *,
    config: CarryForwardConfig,
    carry_cache_store: GoalCarryForwardCacheStore,
) -> list[Goal]:
    """
    Load source-section goals from current lines, then carry forward from previous note.
    """
    current_tasks = extract_goals(
        lines,
        config.section,
        horizon=config.horizon,
        period_key=config.current_id_key,
    )

    prev_tasks: list[Goal] = []
    if config.previous_lines is not None:
        prev_tasks = extract_goals(
            config.previous_lines,
            config.section,
            horizon=config.horizon,
            period_key=config.previous_id_key or config.current_id_key,
        )

    current_tasks, _ = carry_forward_with_tombstones(
        prev_tasks,
        current_tasks,
        config.period_key,
        config.horizon,
        cache_store=carry_cache_store,
    )
    return current_tasks


def sync_mirror_section(
    source_tasks: list[Goal],
    mirror_tasks: list[Goal],
    *,
    config: MirrorSyncConfig,
    today: datetime.date,
    reconcile_cache_store: GoalReconcileCacheStore,
) -> MirrorSyncResult:
    """Reconcile source<->mirror state and produce mirror render lines."""
    updated_source, updated_mirror, source_changed, _ = reconcile_goal_lists(
        source_tasks,
        mirror_tasks,
        config.source_path,
        config.mirror_path,
        reconcile_cache_store=reconcile_cache_store,
    )
    final_mirror = merge_mirror_goals(
        updated_mirror,
        updated_source,
        proximity_days=config.proximity_days,
        today=today,
        source_path=config.source_path,
        mirror_path=config.mirror_path,
        reconcile_cache_store=reconcile_cache_store,
    )
    mirror_lines = render_goals_or_empty(
        config.mirror_section,
        final_mirror,
        today=today,
    )
    return MirrorSyncResult(
        source_tasks=updated_source,
        mirror_tasks=updated_mirror,
        source_changed=source_changed,
        mirror_lines=mirror_lines,
    )


def sync_pierced_source_section(
    existing_tasks: list[Goal],
    source_goal_lists: list[list[Goal]],
    *,
    config: PiercingSyncConfig,
    today: datetime.date,
    reconcile_cache_store: GoalReconcileCacheStore,
) -> PiercingSyncResult:
    """Reconcile pierced goals and render source lines with countdown metadata."""
    original_tasks, final_pierced, updated_source_lists = process_pierced_goals(
        existing_tasks=existing_tasks,
        source_goal_lists=source_goal_lists,
        proximity_days=config.proximity_days,
        today=today,
        note_path=config.note_path,
        source_paths=list(config.source_paths),
        reconcile_cache_store=reconcile_cache_store,
    )

    source_lines = render_goal_lines(original_tasks)
    if final_pierced:
        source_lines = source_lines + render_goal_lines(final_pierced, today=today)
    if not source_lines:
        source_lines = empty_subsection_lines(config.source_section)

    source_changes = [
        updated != original
        for updated, original in zip(updated_source_lists, source_goal_lists)
    ]
    return PiercingSyncResult(
        source_lines=source_lines,
        updated_source_lists=updated_source_lists,
        source_changes=source_changes,
    )
