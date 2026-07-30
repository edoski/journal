"""Tests for sync.periods.cleanup module."""

from __future__ import annotations

import sync.periods.cleanup as period_cleanup


def test_resync_if_marker_returns_false_for_missing_note(tmp_path):
    missing = tmp_path / "missing.md"
    called = False

    def _rerun() -> None:
        nonlocal called
        called = True

    result = period_cleanup.resync_if_marker(str(missing), _rerun)
    assert result is False
    assert called is False


def test_resync_if_marker_returns_false_without_marker(tmp_path):
    note = tmp_path / "prev.md"
    note.write_text("No cleanup marker here")

    called = False

    def _rerun() -> None:
        nonlocal called
        called = True

    result = period_cleanup.resync_if_marker(str(note), _rerun)
    assert result is False
    assert called is False


def test_resync_if_marker_runs_callback_for_chart_down_arrow(tmp_path):
    note = tmp_path / "prev.md"
    note.write_text("┌                                      ↓")

    called = False

    def _rerun() -> None:
        nonlocal called
        called = True

    result = period_cleanup.resync_if_marker(str(note), _rerun)
    assert result is True
    assert called is True


def test_resync_if_marker_runs_callback_when_marker_present(tmp_path):
    note = tmp_path / "prev.md"
    note.write_text("Needs cleanup\n↓")

    called = False

    def _rerun() -> None:
        nonlocal called
        called = True

    result = period_cleanup.resync_if_marker(str(note), _rerun)
    assert result is True
    assert called is True


def test_resync_if_marker_handles_callback_error(tmp_path):
    note = tmp_path / "prev.md"
    note.write_text("Needs cleanup\n↓")

    def _rerun() -> None:
        raise RuntimeError("boom")

    result = period_cleanup.resync_if_marker(str(note), _rerun)
    assert result is False
