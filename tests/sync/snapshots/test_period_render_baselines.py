"""Snapshot guards for markdown rendering invariance."""

from __future__ import annotations

from tests.support.summary_assertions import assert_summary_targets_and_progress
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


def _assert_period_policy(artifact: RenderBaselineArtifact) -> None:
    assert artifact.period_type is not None, (
        f"Missing period_type metadata for {artifact.name}"
    )
    assert artifact.total_days is not None, (
        f"Missing total_days metadata for {artifact.name}"
    )
    assert artifact.current_metrics is not None, (
        f"Missing current_metrics metadata for {artifact.name}"
    )

    assert_summary_targets_and_progress(
        list(artifact.lines),
        period_type=artifact.period_type,
        total_days=artifact.total_days,
        current_metrics=artifact.current_metrics,
    )


def test_weekly_metrics_snapshot() -> None:
    artifact = _artifact("weekly_metrics.txt")
    _assert_period_policy(artifact)
    _assert_snapshot(artifact)


def test_monthly_metrics_snapshot() -> None:
    artifact = _artifact("monthly_metrics.txt")
    _assert_period_policy(artifact)
    _assert_snapshot(artifact)


def test_quarterly_metrics_snapshot() -> None:
    artifact = _artifact("quarterly_metrics.txt")
    _assert_period_policy(artifact)
    _assert_snapshot(artifact)


def test_yearly_metrics_snapshot() -> None:
    artifact = _artifact("yearly_metrics.txt")
    _assert_period_policy(artifact)
    _assert_snapshot(artifact)


def test_goal_lines_snapshot() -> None:
    _assert_snapshot(_artifact("goal_lines.txt"))


def test_goals_block_snapshot() -> None:
    _assert_snapshot(_artifact("goals_block.txt"))
