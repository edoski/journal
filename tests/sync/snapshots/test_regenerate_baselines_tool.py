"""Behavior tests for tools/regenerate_baselines.py."""

from __future__ import annotations

from pathlib import Path

import tools.regenerate_baselines as regenerate_baselines
from tests.support.render_baseline_generator import (
    artifact_text,
    generate_render_baseline_index,
)

_ARTIFACTS = generate_render_baseline_index()


def _write_fixture(output_dir: Path, name: str) -> None:
    artifact = _ARTIFACTS[name]
    path = output_dir / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(artifact_text(artifact), encoding="utf-8")


def test_check_returns_zero_when_no_drift(tmp_path, monkeypatch, capsys) -> None:
    output_dir = tmp_path / "render_baseline"
    _write_fixture(output_dir, "weekly_metrics.txt")
    _write_fixture(output_dir, "goal_lines.txt")
    monkeypatch.setattr(regenerate_baselines, "SNAPSHOT_DIR", output_dir)

    exit_code = regenerate_baselines.main(
        [
            "--check",
            "--only",
            "weekly_metrics.txt",
            "--only",
            "goal_lines.txt",
        ]
    )
    captured = capsys.readouterr()

    assert exit_code == 0
    assert "UNCHANGED" in captured.out
    assert "weekly_metrics.txt" in captured.out
    assert "goal_lines.txt" in captured.out


def test_check_returns_non_zero_on_drift(tmp_path, monkeypatch, capsys) -> None:
    output_dir = tmp_path / "render_baseline"
    path = output_dir / "weekly_metrics.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("stale fixture\n", encoding="utf-8")
    monkeypatch.setattr(regenerate_baselines, "SNAPSHOT_DIR", output_dir)

    exit_code = regenerate_baselines.main(["--check", "--only", "weekly_metrics.txt"])
    captured = capsys.readouterr()

    assert exit_code == 1
    assert "DRIFT" in captured.out
    assert "weekly_metrics.txt" in captured.out
    assert path.read_text(encoding="utf-8") == "stale fixture\n"


def test_write_mode_updates_drifted_fixture(tmp_path, monkeypatch, capsys) -> None:
    output_dir = tmp_path / "render_baseline"
    path = output_dir / "weekly_metrics.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("stale fixture\n", encoding="utf-8")
    monkeypatch.setattr(regenerate_baselines, "SNAPSHOT_DIR", output_dir)

    exit_code = regenerate_baselines.main(["--only", "weekly_metrics.txt"])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert "UPDATED" in captured.out
    expected = artifact_text(_ARTIFACTS["weekly_metrics.txt"])
    actual = path.read_text(encoding="utf-8")
    assert actual == expected
    assert actual.endswith("\n")


def test_invalid_only_name_returns_error_code(tmp_path, monkeypatch, capsys) -> None:
    output_dir = tmp_path / "render_baseline"
    monkeypatch.setattr(regenerate_baselines, "SNAPSHOT_DIR", output_dir)

    exit_code = regenerate_baselines.main(["--only", "missing.txt"])
    captured = capsys.readouterr()

    assert exit_code == 2
    assert "Unknown artifact name(s): missing.txt" in captured.err
