"""Tests for goal writer rendering helpers."""

from __future__ import annotations

import datetime

from sync.contracts.goals import Goal
from sync.readers.goals import parse_goal_tasks
from sync.writers.goals import (
    _format_reminder_offset as format_reminder_offset,
    build_goals_block,
    format_countdown,
    render_goal_lines,
)


class TestRenderGoalLines:
    def test_renders_done_task(self):
        tasks = [Goal(id="gid-mabc123456", body="Complete task", done=True)]
        lines = render_goal_lines(tasks)
        assert lines == ["- [x] Complete task ^gid-mabc123456"]

    def test_renders_undone_task(self):
        tasks = [Goal(id="gid-mdef123456", body="Pending task", done=False)]
        lines = render_goal_lines(tasks)
        assert lines == ["- [ ] Pending task ^gid-mdef123456"]

    def test_uses_existing_id(self):
        tasks = [Goal(id="gid-existing123", body="Task with id", done=False)]
        lines = render_goal_lines(tasks)
        assert len(lines) == 1
        assert "^gid-existing123" in lines[0]

    def test_render_generates_id(self):
        tasks = [Goal(id="gid-test123456", body="Task with id", done=False)]
        lines = render_goal_lines(tasks)
        assert len(lines) == 1
        assert "^gid-test123456" in lines[0]

    def test_round_trip(self):
        original = [
            "- [x] Task one ^gid-mabc123456",
            "- [ ] Task two ^gid-mdef123456",
        ]
        tasks = parse_goal_tasks(original)
        rendered = render_goal_lines(tasks)
        assert rendered == original

    def test_round_trip_with_date(self):
        original = [
            "- [ ] `2025-02-12` Pass exam ^gid-mabc123456",
        ]
        expected = [
            "- [ ] Pass exam `2025-02-12` ^gid-mabc123456",
        ]
        tasks = parse_goal_tasks(original)
        rendered = render_goal_lines(tasks)
        assert rendered == expected

    def test_round_trip_with_date_and_reminder(self):
        original = [
            "- [ ] `2025-02-12 !14d` Pass exam ^gid-mabc123456",
        ]
        expected = [
            "- [ ] Pass exam `2025-02-12 !2w` ^gid-mabc123456",
        ]
        tasks = parse_goal_tasks(original)
        rendered = render_goal_lines(tasks)
        assert rendered == expected

    def test_mirror_note_shows_countdown_only(self):
        original = [
            "- [ ] `2025-02-12` Pass exam ^gid-mabc123456",
        ]
        tasks = parse_goal_tasks(original)
        rendered = render_goal_lines(tasks, today=datetime.date(2025, 1, 6))
        assert rendered == ["- [ ] Pass exam — `37d` ^gid-mabc123456"]


class TestCountdownFormatting:
    def test_countdown_future_today_late(self):
        today = datetime.date(2025, 1, 10)
        assert format_countdown(datetime.date(2025, 1, 15), today, False) == "— `5d`"
        assert format_countdown(datetime.date(2025, 1, 10), today, False) == "— `TODAY`"
        assert (
            format_countdown(datetime.date(2025, 1, 8), today, False) == "— `LATE +2d`"
        )

    def test_countdown_hidden_when_done_or_missing_deadline(self):
        today = datetime.date(2025, 1, 10)
        assert format_countdown(None, today, False) == ""
        assert format_countdown(datetime.date(2025, 1, 15), today, True) == ""


class TestReminderOffsetFormatting:
    def test_formats_quarter_month_week_day_units(self):
        assert format_reminder_offset(180) == "!2q"
        assert format_reminder_offset(90) == "!1q"
        assert format_reminder_offset(60) == "!2m"
        assert format_reminder_offset(30) == "!1m"
        assert format_reminder_offset(14) == "!2w"
        assert format_reminder_offset(7) == "!1w"
        assert format_reminder_offset(29) == "!29d"
        assert format_reminder_offset(1) == "!1d"
        assert format_reminder_offset(95) == "!95d"
        assert format_reminder_offset(31) == "!31d"


class TestBuildGoalsBlock:
    def test_basic_structure(self):
        subsections = [
            ("STUDY", ["- [x] Read chapter ^gid-mabc123456"]),
            ("HEALTH", ["- [ ] Workout ^gid-mdef123456"]),
        ]
        lines = build_goals_block(subsections)
        assert lines[0] == "## Goals"
        assert lines[1] == "---"
        assert "### **STUDY**" in lines
        assert "### **HEALTH**" in lines

    def test_trailing_blank_line(self):
        subsections = [("STUDY", ["- [x] Task ^gid-mabc123456"])]
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
                    "- [x] Task 1 ^gid-mabc123456",
                    "- [ ] Task 2 ^gid-mdef123456",
                ],
            ),
        ]
        lines = build_goals_block(subsections)
        assert "- [x] Task 1 ^gid-mabc123456" in lines
        assert "- [ ] Task 2 ^gid-mdef123456" in lines

    def test_exact_layout_two_subsections(self):
        lines = build_goals_block(
            [
                ("STUDY", ["- [x] Read chapter ^gid-mabc123456"]),
                ("HEALTH", ["- [ ] Workout ^gid-mdef123456"]),
            ]
        )
        assert lines == [
            "## Goals",
            "---",
            "### **STUDY**",
            "- [x] Read chapter ^gid-mabc123456",
            "",
            "### **HEALTH**",
            "- [ ] Workout ^gid-mdef123456",
            "",
        ]

    def test_exact_layout_empty_subsections(self):
        assert build_goals_block([]) == ["## Goals", "---", ""]
