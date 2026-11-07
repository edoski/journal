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


def test_yearly_metrics_snapshot() -> None:
    artifact = _artifact("yearly_metrics.txt")
    _assert_snapshot(artifact)


def test_finance_snapshots() -> None:
    for name in (
        "weekly_finances_metrics.txt",
        "monthly_finances_metrics.txt",
        "yearly_finances_metrics.txt",
        "transactions_note.txt",
        "waterfall_edge_cases.txt",
    ):
        _assert_snapshot(_artifact(name))


def test_finance_adds_only_its_row_and_section_to_a_note() -> None:
    """With bank data a note gains the SPENT row and FINANCES; nothing else moves."""
    for period in ("weekly", "monthly", "yearly"):
        plain = list(_artifact(f"{period}_metrics.txt").lines)
        with_finance = list(_artifact(f"{period}_finances_metrics.txt").lines)
        spent = next(i for i, line in enumerate(with_finance) if "**SPENT**" in line)
        start = with_finance.index("### **FINANCES**")
        end = next(
            (
                i
                for i in range(start + 1, len(with_finance))
                if with_finance[i].startswith("### ")
            ),
            len(with_finance),
        )
        remaining = (
            with_finance[:spent] + with_finance[spent + 1 : start] + with_finance[end:]
        )
        assert remaining == plain, period
