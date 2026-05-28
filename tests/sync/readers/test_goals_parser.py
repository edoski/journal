"""Tests for goal parsing and ID assignment."""

from __future__ import annotations

import datetime

from sync.goals.identity import generate_goal_id_for
from sync.contracts.goals import Goal
from sync.readers.goals import (
    _extract_goal_id as extract_goal_id,
    ensure_goal_ids,
    filter_by_proximity,
    parse_goal_date,
    parse_goal_tasks,
    resolve_deadline,
)


class TestExtractGoalId:
    def test_extracts_id(self):
        line = "- [x] Complete task ^gid-mabc123456"
        assert extract_goal_id(line) == "gid-mabc123456"

    def test_at_line_end(self):
        line = "- [x] Task ^gid-r123456789"
        result = extract_goal_id(line)
        assert result == "gid-r123456789"

    def test_no_id_returns_none(self):
        assert extract_goal_id("- [x] Task without id") is None
        assert extract_goal_id("- [x] Task with ^other-marker") is None

    def test_legacy_untyped_id_returns_none(self):
        assert extract_goal_id("- [x] Task ^gid-abc1234567") is None

    def test_empty_line(self):
        assert extract_goal_id("") is None
        assert extract_goal_id(None) is None

    def test_lowercase_normalized(self):
        line = "- [x] Task ^gid-MABC123456"
        result = extract_goal_id(line)
        assert result == "gid-mabc123456"


class TestParseGoalTasks:
    def test_parses_multiple_tasks(self):
        lines = [
            "- [x] Task one ^gid-mabc123456",
            "- [ ] Task two ^gid-mdef123456",
            "- [-] Task skipped ^gid-mfedcba987",
        ]
        tasks = parse_goal_tasks(lines)
        assert len(tasks) == 3

    def test_done_detection(self):
        lines = [
            "- [x] Done task",
            "- [ ] Undone task",
            "- [-] Skipped task",
            "- [✓] Checkmark done",
            "- [✔] Heavy checkmark done",
        ]
        tasks = parse_goal_tasks(lines)
        assert tasks[0].done is True
        assert tasks[1].done is False
        assert tasks[2].done is True
        assert tasks[3].done is True
        assert tasks[4].done is True

    def test_body_extraction(self):
        lines = ["- [x] Complete task ^gid-mabc123456"]
        tasks = parse_goal_tasks(lines)
        assert tasks[0].body == "Complete task"

    def test_id_extraction(self):
        lines = ["- [x] Task ^gid-mabc123456"]
        tasks = parse_goal_tasks(lines)
        assert tasks[0].id == "gid-mabc123456"

    def test_canonical_computed(self):
        lines = ["- [x] Complete [[Project]] task ^gid-mabc123456"]
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

    def test_missing_id_stays_empty(self):
        lines = ["- [x] Task without id"]
        tasks = parse_goal_tasks(lines)
        assert tasks[0].id == ""

    def test_parses_date_and_reminder_offset(self):
        lines = ["- [ ] Ship feature `2025-03-15 !2w` ^gid-mabc123456"]
        tasks = parse_goal_tasks(lines)
        assert len(tasks) == 1
        assert tasks[0].body == "Ship feature"
        assert tasks[0].date_str == "2025-03-15"
        assert tasks[0].deadline == datetime.date(2025, 3, 15)
        assert tasks[0].reminder_offset == 14

    def test_strips_countdown_suffix_from_body(self):
        lines = ["- [ ] Ship feature — `LATE +3d` ^gid-mabc123456"]
        tasks = parse_goal_tasks(lines)
        assert len(tasks) == 1
        assert tasks[0].body == "Ship feature"


class TestResolveDeadline:
    def test_exact_week_month_quarter_formats(self):
        assert resolve_deadline("2025-02-14") == datetime.date(2025, 2, 14)
        assert resolve_deadline("2025-W01") == datetime.date(2025, 1, 5)
        assert resolve_deadline("2024-02") == datetime.date(2024, 2, 29)
        assert resolve_deadline("2025-Q3") == datetime.date(2025, 9, 30)
        assert resolve_deadline("2025-Q4") == datetime.date(2025, 12, 31)

    def test_invalid_inputs_return_none(self):
        assert resolve_deadline("2025-13-01") is None
        assert resolve_deadline("2025-W99") is None
        assert resolve_deadline("2025-13") is None
        assert resolve_deadline("2025-Q9") is None
        assert resolve_deadline("not-a-date") is None


class TestParseGoalDate:
    def test_extracts_date_and_normalizes_body_spacing(self):
        body, date_str, deadline, reminder_offset = parse_goal_date(
            "Finish   docs   `2025-06-30 !1m`   soon"
        )
        assert body == "Finish docs soon"
        assert date_str == "2025-06-30"
        assert deadline == datetime.date(2025, 6, 30)
        assert reminder_offset == 30

    def test_returns_original_when_no_valid_date(self):
        body, date_str, deadline, reminder_offset = parse_goal_date(
            "Task `2025-99-99 !2w`"
        )
        assert body == "Task `2025-99-99 !2w`"
        assert date_str is None
        assert deadline is None
        assert reminder_offset == 0

    def test_parses_uppercase_reminder_unit(self):
        body, date_str, deadline, reminder_offset = parse_goal_date(
            "Task `2025-06-30 !1Q`"
        )
        assert body == "Task"
        assert date_str == "2025-06-30"
        assert deadline == datetime.date(2025, 6, 30)
        assert reminder_offset == 90


class TestFilterByProximity:
    def test_filters_by_done_deadline_and_reminder_offset(self):
        today = datetime.date(2025, 2, 1)
        tasks = [
            Goal(
                id="gid-1", body="Done", done=True, deadline=datetime.date(2025, 2, 2)
            ),
            Goal(id="gid-2", body="Open no date", done=False, deadline=None),
            Goal(
                id="gid-3",
                body="Open close",
                done=False,
                deadline=datetime.date(2025, 2, 3),
            ),
            Goal(
                id="gid-4",
                body="Open far",
                done=False,
                deadline=datetime.date(2025, 3, 1),
            ),
            Goal(
                id="gid-5",
                body="Open with reminder",
                done=False,
                deadline=datetime.date(2025, 2, 20),
                reminder_offset=21,
            ),
        ]
        result = filter_by_proximity(tasks, max_days=7, today=today)
        ids = [task.id for task in result]
        assert ids == ["gid-2", "gid-3", "gid-5"]

    def test_zero_reminder_offset_is_not_treated_as_one_day(self):
        today = datetime.date(2025, 2, 1)
        tasks = [
            Goal(
                id="gid-boundary",
                body="Boundary",
                done=False,
                deadline=datetime.date(2025, 2, 9),
                reminder_offset=0,
            )
        ]
        assert filter_by_proximity(tasks, max_days=7, today=today) == []


class TestEnsureGoalIds:
    def test_assigns_deterministic_ids(self):
        tasks = [Goal(id="", body="Task", done=False)]
        result = ensure_goal_ids(tasks, "weekly", "2025-W52")
        expected = generate_goal_id_for("manual", "weekly", "2025-W52", "task", 0)
        assert result[0].id == expected

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
            Goal(id="", body="Task A", done=False),
        ]
        result = ensure_goal_ids(tasks, "weekly", "2025-W52")
        assert result[0].id == generate_goal_id_for(
            "manual", "weekly", "2025-W52", "task a", 0
        )
        assert result[1].id == generate_goal_id_for(
            "manual", "weekly", "2025-W52", "task a", 1
        )

    def test_returns_new_goal_objects_when_id_missing(self):
        task = Goal(id="", body="Task", done=False)
        result = ensure_goal_ids([task], "weekly", "2025-W52")
        assert result[0] is not task
        assert task.id == ""

    def test_keeps_object_when_id_present(self):
        task = Goal(id="gid-existing123", body="Task", done=False)
        result = ensure_goal_ids([task], "weekly", "2025-W52")
        assert result[0] is task

    def test_existing_ids_still_advance_canonical_index(self):
        tasks = [
            Goal(id="gid-existing123", body="Task", done=False),
            Goal(id="", body="Task", done=False),
        ]
        result = ensure_goal_ids(tasks, "weekly", "2025-W52")
        assert result[0].id == "gid-existing123"
        assert result[1].id == generate_goal_id_for(
            "manual", "weekly", "2025-W52", "task", 1
        )
