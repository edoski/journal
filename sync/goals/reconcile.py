"""
Shared base patterns for periodic sync modules.

Provides common functionality used across weekly, monthly, quarterly, and yearly sync:
- Bidirectional goal status reconciliation between source/mirror notes
"""

from __future__ import annotations

import datetime
import os
from typing import TYPE_CHECKING

from sync.constants import JOURNAL_DIR
from sync.goals.state import (
    record_note_state,
    reconcile_pair_with_state,
)
from sync.io import safe_read_file
from sync.ports.cache import GoalReconcileCacheStore

if TYPE_CHECKING:
    from sync.models.goals import Goal


def propagate_goal_status(
    source_tasks: list[Goal],
    mirror_tasks: list[Goal],
) -> bool:
    """
    Propagate done=True from mirror to source.

    When a goal is marked done in a lower-level note (e.g., weekly mirror),
    propagate that status back to the source (e.g., monthly note).

    Args:
        source_tasks: Source of truth tasks (will be modified if status changed)
        mirror_tasks: Mirror tasks to check for done status

    Returns:
        True if any status was changed, False otherwise
    """
    mirror_lookup = {t.id: t for t in mirror_tasks if t.id}
    changed = False

    for i, task in enumerate(source_tasks):
        tid = task.id
        if not tid:
            continue
        mirror = mirror_lookup.get(tid)
        if mirror and mirror.done and not task.done:
            from dataclasses import replace

            source_tasks[i] = replace(task, done=True)
            changed = True

    return changed


def reconcile_goal_lists(
    source_tasks: list[Goal],
    mirror_tasks: list[Goal],
    source_path: str,
    mirror_path: str,
    *,
    reconcile_cache_store: GoalReconcileCacheStore,
) -> tuple[list[Goal], list[Goal], bool, bool]:
    """
    Reconcile done state for shared goal IDs between a source and mirror note.

    Uses cached snapshots plus file mtimes to support both:
    - mirror -> source completion propagation
    - source -> mirror reopening propagation

    Returns:
        (updated_source, updated_mirror, source_changed, mirror_changed)
    """
    from dataclasses import replace

    updated_source = list(source_tasks)
    updated_mirror = list(mirror_tasks)

    source_index: dict[str, int] = {}
    mirror_index: dict[str, int] = {}
    for i, goal in enumerate(updated_source):
        if goal.id and goal.id not in source_index:
            source_index[goal.id] = i
    for i, goal in enumerate(updated_mirror):
        if goal.id and goal.id not in mirror_index:
            mirror_index[goal.id] = i

    shared_ids = set(source_index) & set(mirror_index)
    source_changed = False
    mirror_changed = False

    with reconcile_cache_store.locked_state() as state:
        for gid in shared_ids:
            s_idx = source_index[gid]
            m_idx = mirror_index[gid]
            source_goal = updated_source[s_idx]
            mirror_goal = updated_mirror[m_idx]

            winner = reconcile_pair_with_state(
                state,
                gid,
                source_goal.done,
                mirror_goal.done,
                source_path,
                mirror_path,
            )

            if winner != source_goal.done:
                updated_source[s_idx] = replace(source_goal, done=winner)
                source_changed = True

            if winner != mirror_goal.done:
                updated_mirror[m_idx] = replace(mirror_goal, done=winner)
                mirror_changed = True

        # Keep snapshots warm for non-overlapping goals in each note.
        for goal in updated_source:
            if goal.id and goal.id not in shared_ids:
                record_note_state(state, goal.id, source_path, goal.done)
        for goal in updated_mirror:
            if goal.id and goal.id not in shared_ids:
                record_note_state(state, goal.id, mirror_path, goal.done)

    return updated_source, updated_mirror, source_changed, mirror_changed


def load_quarterly_goals(
    month_start: datetime.date,
) -> tuple[list[Goal], list[Goal], str, list[str]]:
    """
    Load quarterly note goals for the quarter containing month_start.

    Args:
        month_start: Any date within the target quarter

    Returns:
        Tuple of (yearly_mirror, quarterly_tasks, path, lines)
        - yearly_mirror: Goals from YEARLY section (mirror from yearly note)
        - quarterly_tasks: Goals from QUARTERLY section (source)
        - path: Path to quarterly note
        - lines: Raw lines of quarterly note
    """
    from sync.dates import quarter_of_date, quarter_id
    from sync.notes.sections import (
        ensure_note,
        goals_section_bounds,
        extract_subsection_tasks,
    )
    from sync.readers.goals import ensure_goal_ids
    from sync.constants import QUARTERLY_TEMPLATE_PATH

    q_year, q_num = quarter_of_date(month_start)
    quarter_key = quarter_id(q_year, q_num)
    filename = f"{quarter_key}.md"
    path = os.path.join(JOURNAL_DIR, filename)
    ensure_note(path, QUARTERLY_TEMPLATE_PATH)

    lines = safe_read_file(path)
    if lines is None:
        return [], [], path, []

    g_start, g_end = goals_section_bounds(lines)
    yearly_mirror = extract_subsection_tasks(lines, g_start, g_end, "YEARLY")
    quarterly_tasks = extract_subsection_tasks(lines, g_start, g_end, "QUARTERLY")
    yearly_mirror = ensure_goal_ids(yearly_mirror, "yearly", str(q_year))
    quarterly_tasks = ensure_goal_ids(quarterly_tasks, "quarterly", quarter_key)
    return yearly_mirror, quarterly_tasks, path, lines


def process_pierced_goals(
    existing_tasks: list[Goal],
    source_goal_lists: list[list[Goal]],
    proximity_days: int,
    today: datetime.date,
    note_path: str,
    source_paths: list[str],
    *,
    reconcile_cache_store: GoalReconcileCacheStore,
) -> tuple[list[Goal], list[Goal], list[list[Goal]]]:
    """
    Process pierced goals with bidirectional source<->child done-state reconciliation.

    This consolidates the repeated goal-piercing logic found in daily/orchestrator.py,
    weekly.py, and monthly.py.

    Args:
        existing_tasks: Goals parsed from the current note (mix of original + pierced)
        source_goal_lists: List of source goal lists to pierce from (e.g., [monthly, quarterly, yearly])
        proximity_days: Number of days for proximity filtering (e.g., 7 for daily, 30 for weekly)
        today: Reference date for filtering
        note_path: Path to the current (child) note being rendered
        source_paths: Paths for source_goal_lists in matching order

    Returns:
        Tuple of:
        - original_tasks: Goals from existing_tasks that aren't pierced (original to this note)
        - final_pierced: Combined existing pierced (with restored deadlines) + new pierced goals
        - updated_source_lists: Source lists with reconciled done status
    """
    from dataclasses import replace
    from sync.readers.goals import filter_by_proximity

    if len(source_paths) != len(source_goal_lists):
        raise ValueError("source_paths must match source_goal_lists length")

    # Build set of all pierced IDs from source goal lists
    pierced_ids: set[str] = set()
    for source_list in source_goal_lists:
        for g in source_list:
            if g.id:
                pierced_ids.add(g.id)

    # Separate original from existing pierced goals
    original_tasks = [g for g in existing_tasks if g.id not in pierced_ids]
    existing_pierced = [g for g in existing_tasks if g.id in pierced_ids]
    existing_pierced_ids = {g.id for g in existing_pierced}
    existing_lookup = {g.id: g for g in existing_pierced if g.id}

    # Reconcile done status between each source and the current note's pierced copy.
    updated_source_lists: list[list[Goal]] = []
    all_updated_sources: list[Goal] = []

    with reconcile_cache_store.locked_state() as state:
        for source_list, source_path in zip(source_goal_lists, source_paths):
            updated_list: list[Goal] = []
            for g in source_list:
                if g.id and g.id in existing_lookup:
                    child_goal = existing_lookup[g.id]
                    winner = reconcile_pair_with_state(
                        state,
                        g.id,
                        g.done,
                        child_goal.done,
                        source_path,
                        note_path,
                    )
                    updated = replace(g, done=winner) if winner != g.done else g
                    updated_list.append(updated)
                    all_updated_sources.append(updated)
                else:
                    if g.id:
                        record_note_state(state, g.id, source_path, g.done)
                    updated_list.append(g)
                    all_updated_sources.append(g)
            updated_source_lists.append(updated_list)

        # Keep snapshots for current pierced copies that do not map back to sources.
        source_ids = {s.id for s in all_updated_sources if s.id}
        for g in existing_pierced:
            if g.id and g.id not in source_ids:
                record_note_state(state, g.id, note_path, g.done)

    # Get NEW pierced goals from each source (only those not already in note)
    new_pierced: list[Goal] = []
    for updated_list in updated_source_lists:
        filtered = filter_by_proximity(updated_list, proximity_days, today)
        for g in filtered:
            if g.deadline is not None and g.id not in existing_pierced_ids:
                new_pierced.append(g)

    # Restore deadline info to existing pierced goals from source
    source_goal_info = {g.id: g for g in all_updated_sources if g.id}
    restored_existing_pierced: list[Goal] = []
    for g in existing_pierced:
        if g.id in source_goal_info:
            src = source_goal_info[g.id]
            restored_existing_pierced.append(
                replace(
                    g,
                    done=src.done,
                    deadline=src.deadline,
                    date_str=src.date_str,
                    reminder_offset=src.reminder_offset,
                )
            )
        else:
            restored_existing_pierced.append(g)

    # Final pierced = existing (with restored deadlines) + new (from source)
    final_pierced = restored_existing_pierced + new_pierced

    return original_tasks, final_pierced, updated_source_lists


def merge_mirror_goals(
    existing_mirror: list[Goal],
    source_tasks: list[Goal],
    proximity_days: int,
    today: datetime.date,
    source_path: str | None = None,
    mirror_path: str | None = None,
    reconcile_cache_store: GoalReconcileCacheStore | None = None,
) -> list[Goal]:
    """
    Merge mirror goals with source goals while preserving countdown metadata.

    If source_path/mirror_path are provided, shared IDs are first reconciled via the
    goal sync cache so both completion and reopen actions can propagate. Deadline/
    date/reminder fields are always refreshed from source for stable countdown render.
    """
    from dataclasses import replace
    from sync.readers.goals import filter_by_proximity

    if source_path and mirror_path and reconcile_cache_store is not None:
        source_tasks, existing_mirror, _, _ = reconcile_goal_lists(
            source_tasks,
            existing_mirror,
            source_path,
            mirror_path,
            reconcile_cache_store=reconcile_cache_store,
        )

    existing_ids = {g.id for g in existing_mirror if g.id}
    new_goals = filter_by_proximity(source_tasks, proximity_days, today)
    new_goals = [g for g in new_goals if g.id not in existing_ids]

    source_lookup = {g.id: g for g in source_tasks if g.id}
    restored_existing: list[Goal] = []
    for goal in existing_mirror:
        source = source_lookup.get(goal.id)
        if source:
            restored_existing.append(
                replace(
                    goal,
                    done=source.done,
                    deadline=source.deadline,
                    date_str=source.date_str,
                    reminder_offset=source.reminder_offset,
                )
            )
        else:
            restored_existing.append(goal)

    return restored_existing + new_goals
