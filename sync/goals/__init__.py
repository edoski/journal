"""Goal-domain helpers: identity, carry-forward, reconciliation, and reminders."""

from __future__ import annotations

from .carry_forward import carry_forward_with_tombstones
from .identity import canonical_goal_text, generate_goal_id, generate_goal_id_for
from .reconcile import (
    load_quarterly_goals,
    merge_mirror_goals,
    process_pierced_goals,
    propagate_goal_status,
    reconcile_goal_lists,
)
from .reminders import (
    get_reminders_for_date,
    load_reminder_rules,
    render_reminder_rules_markdown,
    save_reminder_rules,
)
from .state import (
    empty_goal_sync_state,
    normalize_goal_sync_state,
    record_note_state,
    reconcile_pair,
    reconcile_pair_with_state,
)
from .tombstones import (
    cleanup_old_entries,
    get_carried_ids,
    get_deleted_ids,
    get_prior_period_key,
    prune_deleted_ids,
    record_carried_ids,
    record_deleted_ids,
    remove_deleted_ids,
)

__all__ = [
    "canonical_goal_text",
    "generate_goal_id",
    "generate_goal_id_for",
    "carry_forward_with_tombstones",
    "reconcile_goal_lists",
    "process_pierced_goals",
    "merge_mirror_goals",
    "propagate_goal_status",
    "load_quarterly_goals",
    "load_reminder_rules",
    "get_reminders_for_date",
    "render_reminder_rules_markdown",
    "save_reminder_rules",
    "empty_goal_sync_state",
    "normalize_goal_sync_state",
    "record_note_state",
    "reconcile_pair",
    "reconcile_pair_with_state",
    "get_carried_ids",
    "record_carried_ids",
    "cleanup_old_entries",
    "get_prior_period_key",
    "get_deleted_ids",
    "record_deleted_ids",
    "remove_deleted_ids",
    "prune_deleted_ids",
]
