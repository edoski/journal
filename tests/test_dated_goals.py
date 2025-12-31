"""
Tests for dated goals feature: date parsing, countdown formatting, and proximity filtering.
"""
import datetime
import pytest

from sync_utils.goals import (
    resolve_deadline,
    parse_goal_date,
    format_countdown,
    filter_by_proximity,
    parse_goal_tasks,
    render_goal_lines,
)


class TestResolveDeadline:
    """Tests for resolve_deadline() function."""

    def test_exact_date(self):
        result = resolve_deadline("2025-02-12")
        assert result == datetime.date(2025, 2, 12)

    def test_exact_date_leap_year(self):
        result = resolve_deadline("2024-02-29")
        assert result == datetime.date(2024, 2, 29)

    def test_exact_date_invalid(self):
        result = resolve_deadline("2025-02-30")
        assert result is None

    def test_week_format(self):
        # Week 6 of 2025 ends on Sunday Feb 9
        result = resolve_deadline("2025-W06")
        assert result == datetime.date(2025, 2, 9)

    def test_week_format_week_01(self):
        result = resolve_deadline("2025-W01")
        assert result == datetime.date(2025, 1, 5)

    def test_month_format(self):
        result = resolve_deadline("2025-02")
        assert result == datetime.date(2025, 2, 28)

    def test_month_format_leap_year(self):
        result = resolve_deadline("2024-02")
        assert result == datetime.date(2024, 2, 29)

    def test_month_format_december(self):
        result = resolve_deadline("2025-12")
        assert result == datetime.date(2025, 12, 31)

    def test_quarter_q1(self):
        result = resolve_deadline("2025-Q1")
        assert result == datetime.date(2025, 3, 31)

    def test_quarter_q2(self):
        result = resolve_deadline("2025-Q2")
        assert result == datetime.date(2025, 6, 30)

    def test_quarter_q3(self):
        result = resolve_deadline("2025-Q3")
        assert result == datetime.date(2025, 9, 30)

    def test_quarter_q4(self):
        result = resolve_deadline("2025-Q4")
        assert result == datetime.date(2025, 12, 31)

    def test_invalid_format(self):
        assert resolve_deadline("invalid") is None
        assert resolve_deadline("2025") is None
        assert resolve_deadline("2025-Q5") is None


class TestParseGoalDate:
    """Tests for parse_goal_date() function."""

    def test_exact_date(self):
        body, date_str, deadline, offset = parse_goal_date("`2025-02-12` Pass MIC exam")
        assert body == "Pass MIC exam"
        assert date_str == "2025-02-12"
        assert deadline == datetime.date(2025, 2, 12)
        assert offset == 0

    def test_date_at_end(self):
        body, date_str, deadline, offset = parse_goal_date("Pass MIC exam `2025-02-12`")
        assert body == "Pass MIC exam"
        assert date_str == "2025-02-12"
        assert deadline == datetime.date(2025, 2, 12)
        assert offset == 0

    def test_date_in_middle(self):
        body, date_str, deadline, offset = parse_goal_date("Pass `2025-02-12` MIC exam")
        assert body == "Pass MIC exam"
        assert date_str == "2025-02-12"
        assert deadline == datetime.date(2025, 2, 12)
        assert offset == 0

    def test_quarter_format(self):
        body, date_str, deadline, offset = parse_goal_date("`2025-Q2` Graduate")
        assert body == "Graduate"
        assert date_str == "2025-Q2"
        assert deadline == datetime.date(2025, 6, 30)
        assert offset == 0

    def test_month_format(self):
        body, date_str, deadline, offset = parse_goal_date("`2025-03` Submit thesis")
        assert body == "Submit thesis"
        assert date_str == "2025-03"
        assert deadline == datetime.date(2025, 3, 31)
        assert offset == 0

    def test_week_format(self):
        body, date_str, deadline, offset = parse_goal_date("`2025-W10` Complete review")
        assert body == "Complete review"
        assert date_str == "2025-W10"
        assert deadline is not None
        assert offset == 0

    def test_no_date(self):
        body, date_str, deadline, offset = parse_goal_date("Complete research")
        assert body == "Complete research"
        assert date_str is None
        assert deadline is None
        assert offset == 0

    def test_preserves_other_backticks(self):
        body, date_str, deadline, offset = parse_goal_date("`2025-02-12` Study `chapter 8`")
        assert body == "Study `chapter 8`"
        assert date_str == "2025-02-12"
        assert offset == 0

    # Reminder offset tests
    def test_reminder_offset_days(self):
        body, date_str, deadline, offset = parse_goal_date("`2025-02-12 !14d` Pass MIC exam")
        assert body == "Pass MIC exam"
        assert date_str == "2025-02-12"
        assert deadline == datetime.date(2025, 2, 12)
        assert offset == 14

    def test_reminder_offset_weeks(self):
        body, date_str, deadline, offset = parse_goal_date("`2025-02-12 !2w` Pass MIC exam")
        assert body == "Pass MIC exam"
        assert date_str == "2025-02-12"
        assert deadline == datetime.date(2025, 2, 12)
        assert offset == 14  # 2 weeks = 14 days

    def test_reminder_offset_months(self):
        body, date_str, deadline, offset = parse_goal_date("`2025-05-01 !1m` Graduate")
        assert body == "Graduate"
        assert date_str == "2025-05-01"
        assert offset == 30  # 1 month = 30 days

    def test_reminder_offset_quarters(self):
        body, date_str, deadline, offset = parse_goal_date("`2025-12-31 !1q` Year end review")
        assert body == "Year end review"
        assert date_str == "2025-12-31"
        assert offset == 90  # 1 quarter = 90 days

    def test_reminder_offset_with_quarter_date(self):
        body, date_str, deadline, offset = parse_goal_date("`2025-Q2 !2w` Graduate")
        assert body == "Graduate"
        assert date_str == "2025-Q2"
        assert deadline == datetime.date(2025, 6, 30)
        assert offset == 14


class TestFormatCountdown:
    """Tests for format_countdown() function."""

    def test_future_43_days(self):
        today = datetime.date(2025, 1, 1)
        deadline = datetime.date(2025, 2, 13)
        result = format_countdown(deadline, today, is_done=False)
        assert result == "— `43d`"

    def test_future_1_day(self):
        today = datetime.date(2025, 1, 1)
        deadline = datetime.date(2025, 1, 2)
        result = format_countdown(deadline, today, is_done=False)
        assert result == "— `1d`"

    def test_due_today(self):
        today = datetime.date(2025, 1, 1)
        deadline = datetime.date(2025, 1, 1)
        result = format_countdown(deadline, today, is_done=False)
        assert result == "— `TODAY`"

    def test_overdue_5_days(self):
        today = datetime.date(2025, 1, 6)
        deadline = datetime.date(2025, 1, 1)
        result = format_countdown(deadline, today, is_done=False)
        assert result == "— `LATE +5d`"

    def test_completed_no_countdown(self):
        today = datetime.date(2025, 1, 1)
        deadline = datetime.date(2025, 2, 1)
        result = format_countdown(deadline, today, is_done=True)
        assert result == ""

    def test_no_deadline_no_countdown(self):
        today = datetime.date(2025, 1, 1)
        result = format_countdown(None, today, is_done=False)
        assert result == ""


class TestFilterByProximity:
    """Tests for filter_by_proximity() function."""

    def test_includes_tasks_within_threshold(self):
        today = datetime.date(2025, 1, 1)
        tasks = [
            {"body": "Task 1", "deadline": datetime.date(2025, 1, 5), "done": False},
            {"body": "Task 2", "deadline": datetime.date(2025, 1, 10), "done": False},
        ]
        result = filter_by_proximity(tasks, 7, today)
        assert len(result) == 1
        assert result[0]["body"] == "Task 1"

    def test_includes_tasks_without_deadline(self):
        today = datetime.date(2025, 1, 1)
        tasks = [
            {"body": "Task 1", "deadline": None, "done": False},
            {"body": "Task 2", "deadline": datetime.date(2025, 3, 1), "done": False},
        ]
        result = filter_by_proximity(tasks, 7, today)
        assert len(result) == 1
        assert result[0]["body"] == "Task 1"

    def test_includes_completed_tasks_regardless_of_deadline(self):
        today = datetime.date(2025, 1, 1)
        tasks = [
            {"body": "Task far", "deadline": datetime.date(2025, 12, 31), "done": True},
        ]
        result = filter_by_proximity(tasks, 7, today)
        assert len(result) == 1

    def test_includes_overdue_tasks(self):
        today = datetime.date(2025, 1, 10)
        tasks = [
            {"body": "Overdue", "deadline": datetime.date(2025, 1, 5), "done": False},
        ]
        result = filter_by_proximity(tasks, 7, today)
        assert len(result) == 1

    def test_exact_threshold(self):
        today = datetime.date(2025, 1, 1)
        tasks = [
            {"body": "Exactly 7d", "deadline": datetime.date(2025, 1, 8), "done": False},
        ]
        result = filter_by_proximity(tasks, 7, today)
        assert len(result) == 1

    def test_reminder_offset_makes_task_appear_earlier(self):
        """Task 20 days away with 14-day reminder should appear in 7-day filter."""
        today = datetime.date(2025, 1, 1)
        tasks = [
            {
                "body": "Exam with reminder",
                "deadline": datetime.date(2025, 1, 21),  # 20 days away
                "done": False,
                "reminder_offset": 14,  # Start showing 14 days early
            },
        ]
        # Effective deadline is Jan 7 (21 - 14 = 7 days away), so should appear
        result = filter_by_proximity(tasks, 7, today)
        assert len(result) == 1

    def test_reminder_offset_without_offset_excluded(self):
        """Same task without reminder offset should NOT appear."""
        today = datetime.date(2025, 1, 1)
        tasks = [
            {
                "body": "Exam without reminder",
                "deadline": datetime.date(2025, 1, 21),  # 20 days away
                "done": False,
                "reminder_offset": 0,
            },
        ]
        result = filter_by_proximity(tasks, 7, today)
        assert len(result) == 0


class TestParseGoalTasksWithDates:
    """Tests for parse_goal_tasks() with dated goals."""

    def test_parses_date_from_goal(self):
        lines = [
            "- [ ] `2025-02-12` Pass MIC exam ^gid-abc123",
        ]
        tasks = parse_goal_tasks(lines)
        assert len(tasks) == 1
        assert tasks[0]["body"] == "Pass MIC exam"
        assert tasks[0]["date_str"] == "2025-02-12"
        assert tasks[0]["deadline"] == datetime.date(2025, 2, 12)
        assert tasks[0]["reminder_offset"] == 0

    def test_parses_goal_without_date(self):
        lines = [
            "- [ ] Complete research ^gid-abc123",
        ]
        tasks = parse_goal_tasks(lines)
        assert len(tasks) == 1
        assert tasks[0]["body"] == "Complete research"
        assert tasks[0]["date_str"] is None
        assert tasks[0]["deadline"] is None
        assert tasks[0]["reminder_offset"] == 0

    def test_parses_reminder_offset(self):
        lines = [
            "- [ ] `2025-02-12 !14d` Pass MIC exam ^gid-abc123",
        ]
        tasks = parse_goal_tasks(lines)
        assert len(tasks) == 1
        assert tasks[0]["body"] == "Pass MIC exam"
        assert tasks[0]["deadline"] == datetime.date(2025, 2, 12)
        assert tasks[0]["reminder_offset"] == 14

    def test_strips_existing_countdown(self):
        """Ensure existing countdown suffixes are removed during re-parsing."""
        lines = [
            "- [ ] Pass MIC exam — `43d` ^gid-abc123",
        ]
        tasks = parse_goal_tasks(lines)
        assert len(tasks) == 1
        assert tasks[0]["body"] == "Pass MIC exam"
        assert "43d" not in tasks[0]["body"]

    def test_strips_today_countdown(self):
        lines = [
            "- [ ] Submit draft — `TODAY` ^gid-abc123",
        ]
        tasks = parse_goal_tasks(lines)
        assert tasks[0]["body"] == "Submit draft"

    def test_strips_late_countdown(self):
        lines = [
            "- [ ] Overdue task — `LATE +5d` ^gid-abc123",
        ]
        tasks = parse_goal_tasks(lines)
        assert tasks[0]["body"] == "Overdue task"


class TestRenderGoalLinesWithDates:
    """Tests for render_goal_lines() with countdown rendering."""

    def test_renders_countdown(self):
        today = datetime.date(2025, 1, 1)
        tasks = [
            {
                "body": "Pass MIC exam",
                "done": False,
                "id": "gid-abc123",
                "deadline": datetime.date(2025, 2, 13),
            },
        ]
        result = render_goal_lines(tasks, today=today)
        assert len(result) == 1
        assert "— `43d`" in result[0]
        assert "Pass MIC exam" in result[0]

    def test_no_countdown_without_today(self):
        tasks = [
            {
                "body": "Pass MIC exam",
                "done": False,
                "id": "gid-abc123",
                "deadline": datetime.date(2025, 2, 13),
            },
        ]
        result = render_goal_lines(tasks, today=None)
        assert len(result) == 1
        assert "— `" not in result[0]

    def test_no_countdown_when_done(self):
        today = datetime.date(2025, 1, 1)
        tasks = [
            {
                "body": "Completed task",
                "done": True,
                "id": "gid-abc123",
                "deadline": datetime.date(2025, 2, 13),
            },
        ]
        result = render_goal_lines(tasks, today=today)
        assert "— `" not in result[0]
        assert "[x]" in result[0]

    def test_no_countdown_without_deadline(self):
        today = datetime.date(2025, 1, 1)
        tasks = [
            {
                "body": "No deadline",
                "done": False,
                "id": "gid-abc123",
                "deadline": None,
            },
        ]
        result = render_goal_lines(tasks, today=today)
        assert "— `" not in result[0]

    def test_countdown_shows_actual_deadline_not_offset(self):
        """Verify countdown shows days to actual deadline, not effective deadline."""
        today = datetime.date(2025, 1, 1)
        tasks = [
            {
                "body": "Exam with reminder",
                "done": False,
                "id": "gid-abc123",
                "deadline": datetime.date(2025, 1, 15),  # 14 days away
                "reminder_offset": 7,  # but shown 7 days early
            },
        ]
        result = render_goal_lines(tasks, today=today)
        # Should show 14d (actual deadline), not 7d (effective)
        assert "— `14d`" in result[0]
