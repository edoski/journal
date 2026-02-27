"""Markdown-configured reminder rule parsing and daily reminder generation."""

from __future__ import annotations

import datetime
from calendar import monthrange
from typing import TYPE_CHECKING

from sync.goals.identity import generate_goal_id_for
from sync.io import atomic_write_note, safe_read_file
from sync.notes.markdown_tables import (
    render_divider_row,
    render_markdown_row,
    split_markdown_row,
)
from sync.goals.reminder_codec import format_schedule, parse_schedule
from sync.contracts.reminders import (
    DailySchedule,
    MonthlyLastDaySchedule,
    ReminderRule,
    WeeklyEvenSchedule,
    WeeklyOddSchedule,
    WeeklySchedule,
    YearlySchedule,
)

if TYPE_CHECKING:
    from sync.contracts.goals import Goal

TABLE_HEADERS = ("SCHEDULE", "BODY")
WEEKDAY_INDEX = {
    "MON": 0,
    "TUE": 1,
    "WED": 2,
    "THU": 3,
    "FRI": 4,
    "SAT": 5,
    "SUN": 6,
}


def load_reminder_rules(path: str) -> list[ReminderRule]:
    """Load and validate reminder rules from REMINDERS.md."""
    lines = safe_read_file(path)
    if lines is None:
        raise FileNotFoundError(f"Required reminder config not found: {path}")

    header_idx = -1
    for idx, line in enumerate(lines):
        if not line.strip().startswith("|"):
            continue
        parsed = split_markdown_row(line)
        if parsed is None:
            continue
        cells = [c.upper() for c in parsed]
        if cells == list(TABLE_HEADERS):
            header_idx = idx
            break

    if header_idx == -1:
        raise ValueError(
            f"{path} must contain a markdown table header: | SCHEDULE | BODY |"
        )

    divider_idx = header_idx + 1
    if divider_idx >= len(lines) or not lines[divider_idx].strip().startswith("|"):
        raise ValueError(f"{path} is missing markdown table divider row")

    rules: list[ReminderRule] = []
    seen_keys: set[str] = set()

    for idx in range(divider_idx + 1, len(lines)):
        raw = lines[idx].strip()
        if not raw:
            break
        if not raw.startswith("|"):
            break

        row = split_markdown_row(lines[idx])
        if row is None:
            raise ValueError(f"REMINDERS.md line {idx + 1}: invalid markdown table row")
        line_no = idx + 1
        if len(row) != len(TABLE_HEADERS):
            raise ValueError(
                f"REMINDERS.md line {line_no}: expected {len(TABLE_HEADERS)} cells, got {len(row)}"
            )

        schedule_raw, body = row
        body = body.strip()

        if "|" in body:
            raise ValueError(
                f"REMINDERS.md line {line_no}: BODY cannot contain '|' in strict table mode"
            )

        try:
            schedule = parse_schedule(schedule_raw)
        except ValueError as exc:
            raise ValueError(f"REMINDERS.md line {line_no}: {exc}") from exc

        # Ensure uniqueness based on schedule+body
        unique_key = f"{format_schedule(schedule)}|{body}"
        if unique_key in seen_keys:
            raise ValueError(
                f"REMINDERS.md line {line_no}: duplicate rule (same schedule and body)"
            )
        seen_keys.add(unique_key)

        rules.append(
            ReminderRule(
                schedule=schedule,
                body=body,
            )
        )

    return rules


def _is_due_on(rule: ReminderRule, due_date: datetime.date) -> bool:
    schedule = rule.schedule

    if isinstance(schedule, DailySchedule):
        return True

    if isinstance(schedule, WeeklySchedule):
        return due_date.weekday() == WEEKDAY_INDEX[schedule.weekday]

    if isinstance(schedule, WeeklyOddSchedule):
        _, week_num, _ = due_date.isocalendar()
        return (
            due_date.weekday() == WEEKDAY_INDEX[schedule.weekday] and week_num % 2 == 1
        )

    if isinstance(schedule, WeeklyEvenSchedule):
        _, week_num, _ = due_date.isocalendar()
        return (
            due_date.weekday() == WEEKDAY_INDEX[schedule.weekday] and week_num % 2 == 0
        )

    if isinstance(schedule, MonthlyLastDaySchedule):
        _, last_day = monthrange(due_date.year, due_date.month)
        return due_date.day == last_day

    if isinstance(schedule, YearlySchedule):
        return due_date.month == schedule.month and due_date.day == schedule.day

    return False


def _render_body_template(body: str, due_date: datetime.date) -> str:
    """Render reminder body template tokens using the computed due date."""
    iso_year, iso_week, _ = due_date.isocalendar()
    quarter = ((due_date.month - 1) // 3) + 1
    replacements = {
        "{{date}}": due_date.isoformat(),
        "{{iso_week}}": f"{iso_year}-W{iso_week:02d}",
        "{{month}}": f"{due_date.year}-{due_date.month:02d}",
        "{{quarter}}": f"{due_date.year}-Q{quarter}",
        "{{year}}": str(due_date.year),
    }

    rendered = body
    for token, value in replacements.items():
        rendered = rendered.replace(token, value)
    return rendered


def _generate_rule_id(rule: ReminderRule) -> str:
    """Generate a deterministic ID for a reminder rule based on its schedule and body."""
    schedule = format_schedule(rule.schedule)
    return generate_goal_id_for("reminder", "reminder", schedule, rule.body, 0)


def get_reminders_for_date(
    date: datetime.date,
    rules: list[ReminderRule],
) -> list["Goal"]:
    """Evaluate configured rules and return reminder goals for this date."""
    from sync.contracts.goals import Goal

    reminders: list[Goal] = []

    for rule in rules:
        due_date = date
        if not _is_due_on(rule, due_date):
            continue

        rendered_body = _render_body_template(rule.body, due_date)
        rule_id = _generate_rule_id(rule)
        goal_id = generate_goal_id_for(
            "reminder",
            "reminder",
            f"{rule_id}:{due_date.isoformat()}",
            rendered_body,
            0,
        )

        reminders.append(
            Goal(
                id=goal_id,
                body=rendered_body,
                done=False,
                date_str=due_date.isoformat(),
                deadline=due_date,
                reminder_offset=0,
            )
        )

    return reminders


def render_reminder_rules_markdown(rules: list[ReminderRule]) -> list[str]:
    """Render reminder rules into canonical REMINDERS.md markdown lines."""
    lines = [
        render_markdown_row(TABLE_HEADERS),
        render_divider_row(len(TABLE_HEADERS), divider_cells=["--------", "----"]),
    ]
    for rule in rules:
        lines.append(render_markdown_row([format_schedule(rule.schedule), rule.body]))
    lines.append("")
    return lines


def save_reminder_rules(path: str, rules: list[ReminderRule]) -> None:
    """Persist reminder rules to REMINDERS.md atomically."""
    atomic_write_note(path, render_reminder_rules_markdown(rules))
