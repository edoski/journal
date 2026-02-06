"""
Tests for sync.periods.cleanup module.
"""

from __future__ import annotations

import subprocess

import sync.periods.cleanup as period_cleanup


def test_resync_if_marker_returns_false_for_missing_note(tmp_path):
    missing = tmp_path / "missing.md"
    result = period_cleanup.resync_if_marker(
        str(missing), "sync.periods.weekly", ["--date", "2025-01-01", "--no-cleanup"]
    )
    assert result is False


def test_resync_if_marker_returns_false_without_marker(tmp_path, monkeypatch):
    note = tmp_path / "prev.md"
    note.write_text("No arrow marker here")

    called = False

    def _fake_run(*_args, **_kwargs):
        nonlocal called
        called = True
        return None

    monkeypatch.setattr(period_cleanup.subprocess, "run", _fake_run)

    result = period_cleanup.resync_if_marker(
        str(note), "sync.periods.weekly", ["--date", "2025-01-01", "--no-cleanup"]
    )
    assert result is False
    assert called is False


def test_resync_if_marker_runs_command_when_marker_present(tmp_path, monkeypatch):
    note = tmp_path / "prev.md"
    note.write_text("Needs cleanup ↓")

    captured: dict[str, object] = {}

    def _fake_run(cmd, cwd, check):
        captured["cmd"] = cmd
        captured["cwd"] = cwd
        captured["check"] = check
        return None

    monkeypatch.setattr(period_cleanup.subprocess, "run", _fake_run)
    monkeypatch.setattr(period_cleanup, "_repo_root", lambda: "/tmp/repo")

    result = period_cleanup.resync_if_marker(
        str(note), "sync.periods.monthly", ["--month", "2025-01", "--no-cleanup"]
    )
    assert result is True
    assert captured["cmd"] == [
        period_cleanup.sys.executable,
        "-m",
        "sync.periods.monthly",
        "--month",
        "2025-01",
        "--no-cleanup",
    ]
    assert captured["cwd"] == "/tmp/repo"
    assert captured["check"] is False


def test_resync_if_marker_handles_subprocess_error(tmp_path, monkeypatch):
    note = tmp_path / "prev.md"
    note.write_text("Needs cleanup ↓")

    monkeypatch.setattr(period_cleanup, "_repo_root", lambda: "/tmp/repo")
    monkeypatch.setattr(
        period_cleanup.subprocess,
        "run",
        lambda *_a, **_kw: (_ for _ in ()).throw(subprocess.SubprocessError("boom")),
    )

    result = period_cleanup.resync_if_marker(
        str(note), "sync.periods.weekly", ["--date", "2025-01-01", "--no-cleanup"]
    )
    assert result is False
