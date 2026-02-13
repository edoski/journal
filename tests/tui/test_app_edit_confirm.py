from __future__ import annotations

from tui.app import _handle_pending_confirmation, _stage_pending_change
from tui.state import AppState


def _stage(state: AppState, success_message: str = "Applied staged change") -> None:
    _stage_pending_change(
        state,
        title="Update test data",
        target_label="/tmp/test.md",
        before_lines=["old"],
        after_lines=["new"],
        success_message=success_message,
    )


def test_pending_change_blocks_other_mutating_keys_until_confirmed():
    state = AppState(screen="edit_daily")
    writes = 0

    def apply() -> None:
        nonlocal writes
        writes += 1

    _stage(state)
    consumed, pending_apply = _handle_pending_confirmation(state, ord("f"), apply)

    assert consumed is True
    assert writes == 0
    assert pending_apply is apply
    assert state.pending_preview is not None


def test_pending_change_confirm_writes_and_clears_preview():
    state = AppState(screen="edit_daily")
    writes = 0
    _stage(state, success_message="Updated frontmatter mood")

    def apply() -> None:
        nonlocal writes
        writes += 1

    consumed, pending_apply = _handle_pending_confirmation(state, 10, apply)

    assert consumed is True
    assert writes == 1
    assert pending_apply is None
    assert state.pending_preview is None
    assert state.message == "Updated frontmatter mood"


def test_pending_change_cancel_drops_staged_write():
    state = AppState(screen="edit_reminders")
    writes = 0

    def apply() -> None:
        nonlocal writes
        writes += 1

    _stage(state)
    consumed, pending_apply = _handle_pending_confirmation(state, ord("c"), apply)

    assert consumed is True
    assert writes == 0
    assert pending_apply is None
    assert state.pending_preview is None
    assert state.message == "Cancelled pending change."


def test_pending_change_q_cancels_before_navigation():
    state = AppState(screen="edit_reminders")
    writes = 0

    def apply() -> None:
        nonlocal writes
        writes += 1

    _stage(state)
    consumed, pending_apply = _handle_pending_confirmation(state, ord("q"), apply)

    assert consumed is True
    assert writes == 0
    assert pending_apply is None
    assert state.pending_preview is None
