"""Snapshot guards for markdown rendering invariance."""

from __future__ import annotations

from tests.support.render_baseline_generator import (
    SNAPSHOT_DIR,
    RenderBaselineArtifact,
    artifact_text,
    generate_render_baseline_index,
)

_ARTIFACTS = generate_render_baseline_index()


def _artifact(name: str) -> RenderBaselineArtifact:
    artifact = _ARTIFACTS.get(name)
    assert artifact is not None, f"Missing baseline artifact generator for {name}"
    return artifact


def _assert_snapshot(artifact: RenderBaselineArtifact) -> None:
    path = SNAPSHOT_DIR / artifact.name
    expected_raw = path.read_text(encoding="utf-8")
    assert expected_raw.endswith("\n"), f"Snapshot must end with newline: {path}"

    actual_raw = artifact_text(artifact)
    assert actual_raw == expected_raw, f"Content mismatch for snapshot {path}"


def test_weekly_metrics_snapshot() -> None:
    artifact = _artifact("weekly_metrics.txt")
    _assert_snapshot(artifact)


def test_monthly_metrics_snapshot() -> None:
    artifact = _artifact("monthly_metrics.txt")
    _assert_snapshot(artifact)


def test_quarterly_metrics_snapshot() -> None:
    artifact = _artifact("quarterly_metrics.txt")
    _assert_snapshot(artifact)


def test_yearly_metrics_snapshot() -> None:
    artifact = _artifact("yearly_metrics.txt")
    _assert_snapshot(artifact)


def test_goal_lines_snapshot() -> None:
    _assert_snapshot(_artifact("goal_lines.txt"))


def test_goals_block_snapshot() -> None:
    _assert_snapshot(_artifact("goals_block.txt"))
