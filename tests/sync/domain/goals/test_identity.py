"""Tests for goal identity and canonicalization."""

from __future__ import annotations

from sync.goals.identity import generate_goal_id, generate_goal_id_for
from sync.models.goals import canonical_goal_text as canonical_goal


class TestCanonicalGoal:
    def test_strips_checkbox(self):
        assert canonical_goal("- [x] Complete task") == "complete task"
        assert canonical_goal("- [ ] Incomplete task") == "incomplete task"
        assert canonical_goal("* [x] Star checkbox") == "star checkbox"

    def test_strips_goal_id(self):
        assert canonical_goal("- [x] Task ^gid-mabc123456") == "task"
        assert canonical_goal("- [ ] Task ^gid-r123456789") == "task"
        assert canonical_goal("- [x] Task ^gid-MABCDEF123") == "task"

    def test_preserves_invalid_goal_id_shapes(self):
        assert canonical_goal("- [x] Task ^gid-abc12") == "task ^gid-abc12"
        assert canonical_goal("- [x] Task ^gid-xyzxyz") == "task ^gid-xyzxyz"

    def test_strips_wiki_links(self):
        assert canonical_goal("- [x] Read [[Book Name]]") == "read book name"
        assert (
            canonical_goal("Review [[Note]] and [[Other]]") == "review note and other"
        )

    def test_strips_checkbox_variants(self):
        assert canonical_goal("- [✓] Done task") == "done task"
        assert canonical_goal("- [-] Skipped task") == "skipped task"

    def test_collapses_whitespace(self):
        assert canonical_goal("- [x] Task   with   spaces") == "task with spaces"

    def test_trims_punctuation(self):
        assert canonical_goal("- [x] Complete task.") == "complete task"
        assert canonical_goal("- [x] Complete task,") == "complete task"
        assert canonical_goal("- [x] Complete task:") == "complete task"

    def test_strips_backticks(self):
        assert canonical_goal("- [x] `Complete task`") == "complete task"

    def test_lowercase(self):
        assert canonical_goal("- [x] Complete TASK") == "complete task"


class TestGenerateGoalId:
    def test_format(self):
        gid = generate_goal_id()
        assert gid.startswith("gid-")
        assert len(gid) == 14
        assert gid[4] == "m"

    def test_reminder_kind_format(self):
        gid = generate_goal_id("reminder")
        assert gid.startswith("gid-r")
        assert len(gid) == 14

    def test_uniqueness(self):
        ids = [generate_goal_id() for _ in range(100)]
        assert len(set(ids)) == 100


class TestGenerateGoalIdFor:
    def test_deterministic(self):
        id1 = generate_goal_id_for("manual", "weekly", "2025-W52", "complete task", 0)
        id2 = generate_goal_id_for("manual", "weekly", "2025-W52", "complete task", 0)
        assert id1 == id2

    def test_different_inputs_different_ids(self):
        id1 = generate_goal_id_for("manual", "weekly", "2025-W52", "task a", 0)
        id2 = generate_goal_id_for("manual", "weekly", "2025-W52", "task b", 0)
        assert id1 != id2

    def test_index_collision_prevention(self):
        id1 = generate_goal_id_for("manual", "weekly", "2025-W52", "task", 0)
        id2 = generate_goal_id_for("manual", "weekly", "2025-W52", "task", 1)
        assert id1 != id2

    def test_format(self):
        gid = generate_goal_id_for("manual", "weekly", "2025-W52", "task", 0)
        assert gid.startswith("gid-")
        assert len(gid) == 14
        assert gid[4] == "m"

    def test_reminder_kind_uses_r_prefix(self):
        gid = generate_goal_id_for("reminder", "daily", "2026-02-14", "task", 0)
        assert gid.startswith("gid-r")
        assert len(gid) == 14
