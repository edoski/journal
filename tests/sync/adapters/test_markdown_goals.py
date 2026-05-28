"""Contract tests for MarkdownGoalStore adapter."""

from __future__ import annotations

from sync.adapters.markdown_goals import MarkdownGoalStore
from sync.contracts.goals import GoalSection


def _base_note_lines() -> list[str]:
    return [
        "## Goals",
        "---",
        "### **WEEKLY**",
        "",
        "- [ ] Weekly task ^gid-mabc123456",
        "",
        "### **DAILY**",
        "",
        "- [ ] Daily task ^gid-mdef456789",
        "",
        "## Metrics",
        "---",
    ]


def test_extract_reads_target_subsection():
    store = MarkdownGoalStore()
    goals = store.extract(_base_note_lines(), "DAILY")

    assert len(goals) == 1
    assert goals[0].body == "Daily task"
    assert goals[0].id == "gid-mdef456789"


def test_extract_assigns_stable_ids_when_period_context_is_available():
    store = MarkdownGoalStore()
    lines = [
        "## Goals",
        "---",
        "### **WEEKLY**",
        "- [ ] Task without id",
        "",
        "## Metrics",
        "---",
    ]

    first = store.extract(
        lines,
        "WEEKLY",
        horizon="weekly",
        period_key="2026-05-25",
    )
    second = store.extract(
        lines,
        "WEEKLY",
        horizon="weekly",
        period_key="2026-05-25",
    )

    assert first[0].id == second[0].id
    assert first[0].id.startswith("gid-m")


def test_apply_rebuilds_goals_block():
    store = MarkdownGoalStore()
    lines = _base_note_lines()
    updated = store.apply(
        lines,
        sections=[
            GoalSection(
                section="WEEKLY", lines=["", "- [ ] Weekly updated ^gid-maaa111111"]
            ),
            GoalSection(
                section="DAILY", lines=["", "- [ ] Daily updated ^gid-mbbb222222"]
            ),
        ],
    )

    assert any("Weekly updated" in line for line in updated)
    assert any("Daily updated" in line for line in updated)
    assert any(line.strip() == "## Metrics" for line in updated)


def test_write_persists_rebuilt_sections(tmp_path):
    store = MarkdownGoalStore()
    note_path = tmp_path / "goals.md"
    lines = _base_note_lines()
    note_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    written = store.write(
        str(note_path),
        lines,
        sections=[
            GoalSection(
                section="WEEKLY", lines=["", "- [ ] Weekly v2 ^gid-m111aaa111"]
            ),
            GoalSection(section="DAILY", lines=["", "- [ ] Daily v2 ^gid-m222bbb222"]),
        ],
    )

    content = note_path.read_text(encoding="utf-8")
    assert "Weekly v2" in content
    assert "Daily v2" in content
    assert any("Weekly v2" in line for line in written)


def test_apply_inserts_missing_goals_after_anchor():
    store = MarkdownGoalStore()
    lines = ["---", "date: 2026-02-14", "---", "## Metrics", "---"]

    updated = store.apply(
        lines,
        sections=[
            GoalSection(
                section="DAILY",
                lines=["- [ ] Daily task ^gid-mabc123456"],
            )
        ],
        insert_after_idx=2,
    )

    assert updated[:5] == [
        "---",
        "date: 2026-02-14",
        "---",
        "## Goals",
        "---",
    ]
