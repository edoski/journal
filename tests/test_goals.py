"""
Tests for goal utilities.

Covers goal parsing, normalization, ID generation, and rendering.
"""

from __future__ import annotations


from sync.models import Goal
from sync.goals.identity import generate_goal_id, generate_goal_id_for
from sync.models.goals import canonical_goal_text as canonical_goal
from sync.readers.goals import (
    _extract_goal_id as extract_goal_id,
    parse_goal_tasks,
    ensure_goal_ids,
)
from sync.writers.goals import (
    render_goal_lines,
    build_goals_block,
)
from sync.notes_sections import _find_subheader_idx as find_subheader_idx
from sync.readers.common import normalize_header as _normalize_header


class TestNormalizeHeader:
    """Tests for _normalize_header function."""

    def test_basic_header(self):
        assert _normalize_header("### STUDY") == "### study"

    def test_emphasis_removal(self):
        assert _normalize_header("### **STUDY**") == "### study"
        assert _normalize_header("### *STUDY*") == "### study"
        assert _normalize_header("### __STUDY__") == "### study"
        assert _normalize_header("### _STUDY_") == "### study"

    def test_mixed_emphasis(self):
        assert _normalize_header("### **_STUDY_**") == "### study"

    def test_case_insensitive(self):
        assert _normalize_header("### Study") == "### study"
        assert _normalize_header("### STUDY") == "### study"

    def test_preserves_spaces(self):
        # After stripping, internal spaces should remain
        result = _normalize_header("### My Goal")
        assert "my goal" in result


class TestCanonicalGoal:
    """Tests for canonical_goal function."""

    def test_strips_checkbox(self):
        assert canonical_goal("- [x] Complete task") == "complete task"
        assert canonical_goal("- [ ] Incomplete task") == "incomplete task"
        assert canonical_goal("* [x] Star checkbox") == "star checkbox"

    def test_strips_goal_id(self):
        assert canonical_goal("- [x] Task ^gid-abc1234567") == "task"
        assert canonical_goal("- [ ] Task ^gid-1234567890") == "task"

    def test_strips_wiki_links(self):
        assert canonical_goal("- [x] Read [[Book Name]]") == "read book name"
        assert (
            canonical_goal("Review [[Note]] and [[Other]]") == "review note and other"
        )

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
    """Tests for generate_goal_id function."""

    def test_format(self):
        gid = generate_goal_id()
        assert gid.startswith("gid-")
        assert len(gid) == 14  # "gid-" + 10 hex chars

    def test_uniqueness(self):
        ids = [generate_goal_id() for _ in range(100)]
        assert len(set(ids)) == 100


class TestGenerateGoalIdFor:
    """Tests for generate_goal_id_for function."""

    def test_deterministic(self):
        id1 = generate_goal_id_for("weekly", "2025-W52", "complete task", 0)
        id2 = generate_goal_id_for("weekly", "2025-W52", "complete task", 0)
        assert id1 == id2

    def test_different_inputs_different_ids(self):
        id1 = generate_goal_id_for("weekly", "2025-W52", "task a", 0)
        id2 = generate_goal_id_for("weekly", "2025-W52", "task b", 0)
        assert id1 != id2

    def test_index_collision_prevention(self):
        id1 = generate_goal_id_for("weekly", "2025-W52", "task", 0)
        id2 = generate_goal_id_for("weekly", "2025-W52", "task", 1)
        assert id1 != id2

    def test_format(self):
        gid = generate_goal_id_for("weekly", "2025-W52", "task", 0)
        assert gid.startswith("gid-")
        assert len(gid) == 14


class TestExtractGoalId:
    """Tests for extract_goal_id function."""

    def test_extracts_id(self):
        line = "- [x] Complete task ^gid-abc1234567"
        assert extract_goal_id(line) == "gid-abc1234567"

    def test_at_line_end(self):
        line = "- [x] Task ^gid-1234567890"
        result = extract_goal_id(line)
        assert result == "gid-1234567890"

    def test_no_id_returns_none(self):
        assert extract_goal_id("- [x] Task without id") is None
        assert extract_goal_id("- [x] Task with ^other-marker") is None

    def test_empty_line(self):
        assert extract_goal_id("") is None
        assert extract_goal_id(None) is None

    def test_lowercase_normalized(self):
        line = "- [x] Task ^gid-ABC1234567"
        result = extract_goal_id(line)
        assert result == "gid-abc1234567"


class TestParseGoalTasks:
    """Tests for parse_goal_tasks function."""

    def test_parses_multiple_tasks(self):
        lines = [
            "- [x] Task one ^gid-abc1234567",
            "- [ ] Task two ^gid-def1234567",
            "- [-] Task skipped ^gid-ghi1234567",
        ]
        tasks = parse_goal_tasks(lines)
        assert len(tasks) == 3

    def test_done_detection(self):
        lines = [
            "- [x] Done task",
            "- [ ] Undone task",
            "- [-] Skipped task",
            "- [✓] Checkmark done",
        ]
        tasks = parse_goal_tasks(lines)
        assert tasks[0].done is True
        assert tasks[1].done is False
        assert tasks[2].done is True  # '-' is treated as done
        assert tasks[3].done is True

    def test_body_extraction(self):
        lines = ["- [x] Complete task ^gid-abc1234567"]
        tasks = parse_goal_tasks(lines)
        assert tasks[0].body == "Complete task"

    def test_id_extraction(self):
        lines = ["- [x] Task ^gid-abc1234567"]
        tasks = parse_goal_tasks(lines)
        assert tasks[0].id == "gid-abc1234567"

    def test_canonical_computed(self):
        lines = ["- [x] Complete [[Project]] task ^gid-abc1234567"]
        tasks = parse_goal_tasks(lines)
        assert tasks[0].canonical == "complete project task"

    def test_skips_non_checkbox_lines(self):
        lines = [
            "Some text",
            "- [x] Valid task",
            "",
            "### Header",
        ]
        tasks = parse_goal_tasks(lines)
        assert len(tasks) == 1

    def test_always_generates_id(self):
        """IDs are always generated even for goals without explicit ^gid-."""
        lines = ["- [x] Task without id"]
        tasks = parse_goal_tasks(lines)
        assert tasks[0].id is not None
        assert tasks[0].id.startswith("gid-")


class TestRenderGoalLines:
    """Tests for render_goal_lines function."""

    def test_renders_done_task(self):
        tasks = [Goal(id="gid-abc1234567", body="Complete task", done=True)]
        lines = render_goal_lines(tasks)
        assert lines == ["- [x] Complete task ^gid-abc1234567"]

    def test_renders_undone_task(self):
        tasks = [Goal(id="gid-def1234567", body="Pending task", done=False)]
        lines = render_goal_lines(tasks)
        assert lines == ["- [ ] Pending task ^gid-def1234567"]

    def test_uses_existing_id(self):
        tasks = [Goal(id="gid-existing123", body="Task with id", done=False)]
        lines = render_goal_lines(tasks)
        assert len(lines) == 1
        assert "^gid-existing123" in lines[0]

    def test_render_generates_id(self):
        """Rendering uses existing id."""
        tasks = [Goal(id="gid-test123456", body="Task with id", done=False)]
        lines = render_goal_lines(tasks)
        assert len(lines) == 1
        assert "^gid-test123456" in lines[0]

    def test_round_trip(self):
        """Parse and render should preserve content."""
        original = [
            "- [x] Task one ^gid-abc1234567",
            "- [ ] Task two ^gid-def1234567",
        ]
        tasks = parse_goal_tasks(original)
        rendered = render_goal_lines(tasks)
        assert rendered == original

    def test_round_trip_with_date(self):
        """Parse and render should preserve dated goals in source notes."""
        original = [
            "- [ ] `2025-02-12` Pass exam ^gid-abc1234567",
        ]
        expected = [
            "- [ ] Pass exam `2025-02-12` ^gid-abc1234567",
        ]
        tasks = parse_goal_tasks(original)
        # Source note: no today param -> shows date after body
        rendered = render_goal_lines(tasks)
        assert rendered == expected

    def test_round_trip_with_date_and_reminder(self):
        """Parse and render should preserve dated goals with reminder offset.

        Note: The reminder offset is normalized to shortest unit (14d -> 2w).
        """
        original = [
            "- [ ] `2025-02-12 !14d` Pass exam ^gid-abc1234567",
        ]
        expected = [
            "- [ ] Pass exam `2025-02-12 !2w` ^gid-abc1234567",
        ]
        tasks = parse_goal_tasks(original)
        # Source note: no today param -> shows date after body
        rendered = render_goal_lines(tasks)
        assert rendered == expected

    def test_mirror_note_shows_countdown_only(self):
        """Mirror notes (with today param) should show countdown, not date."""
        import datetime

        original = [
            "- [ ] `2025-02-12` Pass exam ^gid-abc1234567",
        ]
        tasks = parse_goal_tasks(original)
        # Mirror note: today param -> shows countdown only
        rendered = render_goal_lines(tasks, today=datetime.date(2025, 1, 6))
        assert rendered == ["- [ ] Pass exam — `37d` ^gid-abc1234567"]


class TestEnsureGoalIds:
    """Tests for ensure_goal_ids function."""

    def test_assigns_deterministic_ids(self):
        tasks = [Goal(id="", body="Task", done=False)]
        result = ensure_goal_ids(tasks, "weekly", "2025-W52")
        assert result[0].id is not None
        assert result[0].id.startswith("gid-")

    def test_preserves_existing_ids(self):
        original_id = "gid-existing123"
        tasks = [Goal(id=original_id, body="Task", done=False)]
        result = ensure_goal_ids(tasks, "weekly", "2025-W52")
        assert result[0].id == original_id

    def test_deterministic_same_run(self):
        tasks1 = [Goal(id="", body="Task", done=False)]
        tasks2 = [Goal(id="", body="Task", done=False)]
        result1 = ensure_goal_ids(tasks1, "weekly", "2025-W52")
        result2 = ensure_goal_ids(tasks2, "weekly", "2025-W52")
        assert result1[0].id == result2[0].id

    def test_handles_duplicate_canonicals(self):
        tasks = [
            Goal(id="", body="Task A", done=False),
            Goal(id="", body="Task A", done=False),  # Same body = same canonical
        ]
        result = ensure_goal_ids(tasks, "weekly", "2025-W52")
        assert result[0].id != result[1].id


class TestBuildGoalsBlock:
    """Tests for build_goals_block function."""

    def test_basic_structure(self):
        subsections = [
            ("STUDY", ["- [x] Read chapter ^gid-abc1234567"]),
            ("HEALTH", ["- [ ] Workout ^gid-def1234567"]),
        ]
        lines = build_goals_block(subsections)

        assert lines[0] == "## Goals"
        assert lines[1] == "---"
        assert "### **STUDY**" in lines
        assert "### **HEALTH**" in lines

    def test_trailing_blank_line(self):
        subsections = [("STUDY", ["- [x] Task ^gid-abc1234567"])]
        lines = build_goals_block(subsections)
        assert lines[-1] == ""

    def test_empty_subsection(self):
        subsections = [("STUDY", [])]
        lines = build_goals_block(subsections)
        assert "### **STUDY**" in lines

    def test_multiple_tasks_per_subsection(self):
        subsections = [
            (
                "STUDY",
                [
                    "- [x] Task 1 ^gid-abc1234567",
                    "- [ ] Task 2 ^gid-def1234567",
                ],
            ),
        ]
        lines = build_goals_block(subsections)
        assert "- [x] Task 1 ^gid-abc1234567" in lines
        assert "- [ ] Task 2 ^gid-def1234567" in lines


class TestFindSubheaderIdx:
    """Tests for find_subheader_idx function."""

    def test_finds_subheader(self):
        lines = [
            "## Goals",
            "---",
            "### **STUDY**",
            "- [x] Task",
        ]
        idx = find_subheader_idx(lines, "STUDY")
        assert idx == 2

    def test_emphasis_insensitive(self):
        lines = ["### **STUDY**", "### HEALTH"]
        assert find_subheader_idx(lines, "STUDY") == 0
        assert find_subheader_idx(lines, "HEALTH") == 1

    def test_case_insensitive(self):
        lines = ["### **Study**"]
        assert find_subheader_idx(lines, "STUDY") == 0
        assert find_subheader_idx(lines, "study") == 0

    def test_respects_bounds(self):
        lines = [
            "### BEFORE",
            "### TARGET",
            "### AFTER",
        ]
        # Only search from index 1 to 2
        assert find_subheader_idx(lines, "TARGET", start=1, end=2) == 1
        assert find_subheader_idx(lines, "BEFORE", start=1, end=3) == -1

    def test_returns_negative_when_not_found(self):
        lines = ["### OTHER"]
        assert find_subheader_idx(lines, "MISSING") == -1
