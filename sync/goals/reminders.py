"""Markdown-configured reminder rule parsing and daily reminder generation."""

from __future__ import annotations

import datetime
import re
from calendar import monthrange
from typing import TYPE_CHECKING, cast

from sync.goals.identity import generate_goal_id_for
from sync.io import atomic_write_note, safe_read_file
from sync.models.reminders import ReminderRule, ScheduleKind

if TYPE_CHECKING:
    from sync.models.goals import Goal

TABLE_HEADERS = ("ID", "ENABLED", "SCHEDULE", "BODY")
WEEKDAY_INDEX = {
    "MON": 0,
    "TUE": 1,
    "WED": 2,
    "THU": 3,
    "FRI": 4,
    "SAT": 5,
    "SUN": 6,
}


def _split_table_cells(line: str) -> list[str]:
    stripped = line.strip()
    if not stripped.startswith("|") or not stripped.endswith("|"):
        raise ValueError(f"Invalid markdown table row: {line!r}")
    return [cell.strip() for cell in stripped[1:-1].split("|")]


def _parse_bool(value: str, *, line_no: int) -> bool:
    normalized = value.strip().lower()
    if normalized in {"true", "1", "yes", "y"}:
        return True
    if normalized in {"false", "0", "no", "n"}:
        return False
    raise ValueError(
        f"REMINDERS.md line {line_no}: ENABLED must be true/false, got {value!r}"
    )


def _parse_schedule(schedule: str, *, line_no: int) -> tuple[str, str]:
    kind, sep, value = schedule.partition(":")
    if not sep:
        raise ValueError(
            f"REMINDERS.md line {line_no}: SCHEDULE must be KIND:VALUE, got {schedule!r}"
        )

    kind = kind.strip().upper()
    value = value.strip().upper()

    if kind in {"WEEKLY", "BIWEEKLY_ODD_ISO", "BIWEEKLY_EVEN_ISO"}:
        if value not in WEEKDAY_INDEX:
            raise ValueError(
                f"REMINDERS.md line {line_no}: invalid weekday {value!r} for {kind}"
            )
        return kind, value

    if kind == "MONTHLY":
        if value != "LAST_DAY":
            raise ValueError(
                f"REMINDERS.md line {line_no}: MONTHLY schedule must be MONTHLY:LAST_DAY"
            )
        return kind, value

    if kind == "YEARLY":
        if not re.fullmatch(r"\d{2}-\d{2}", value):
            raise ValueError(
                f"REMINDERS.md line {line_no}: YEARLY schedule must be YEARLY:MM-DD"
            )
        mm, dd = map(int, value.split("-"))
        try:
            datetime.date(2000, mm, dd)
        except ValueError as exc:
            raise ValueError(
                f"REMINDERS.md line {line_no}: invalid YEARLY date {value!r}"
            ) from exc
        return kind, value

    raise ValueError(f"REMINDERS.md line {line_no}: unsupported schedule kind {kind!r}")


def load_reminder_rules(path: str) -> list[ReminderRule]:
    """Load and validate reminder rules from REMINDERS.md."""
    lines = safe_read_file(path)
    if lines is None:
        raise FileNotFoundError(f"Required reminder config not found: {path}")

    header_idx = -1
    for idx, line in enumerate(lines):
        if not line.strip().startswith("|"):
            continue
        cells = [c.upper() for c in _split_table_cells(line)]
        if cells == list(TABLE_HEADERS):
            header_idx = idx
            break

    if header_idx == -1:
        raise ValueError(
            f"{path} must contain a markdown table header: "
            "| ID | ENABLED | SCHEDULE | BODY |"
        )

    divider_idx = header_idx + 1
    if divider_idx >= len(lines) or not lines[divider_idx].strip().startswith("|"):
        raise ValueError(f"{path} is missing markdown table divider row")

    rules: list[ReminderRule] = []
    ids: set[str] = set()

    for idx in range(divider_idx + 1, len(lines)):
        raw = lines[idx].strip()
        if not raw:
            break
        if not raw.startswith("|"):
            break

        row = _split_table_cells(lines[idx])
        line_no = idx + 1
        if len(row) != len(TABLE_HEADERS):
            raise ValueError(
                f"REMINDERS.md line {line_no}: expected {len(TABLE_HEADERS)} cells, got {len(row)}"
            )

        rule_id, enabled_raw, schedule_raw, body = row
        rule_id = rule_id.strip()
        body = body.strip()

        if not rule_id:
            raise ValueError(f"REMINDERS.md line {line_no}: ID is required")
        if rule_id in ids:
            raise ValueError(f"REMINDERS.md line {line_no}: duplicate ID {rule_id!r}")
        if "|" in body:
            raise ValueError(
                f"REMINDERS.md line {line_no}: BODY cannot contain '|' in strict table mode"
            )

        enabled = _parse_bool(enabled_raw, line_no=line_no)
        schedule_kind, schedule_value = _parse_schedule(schedule_raw, line_no=line_no)

        rules.append(
            ReminderRule(
                id=rule_id,
                enabled=enabled,
                schedule_kind=cast(ScheduleKind, schedule_kind),
                schedule_value=schedule_value,
                body=body,
            )
        )
        ids.add(rule_id)

    return rules


def _is_due_on(rule: ReminderRule, due_date: datetime.date) -> bool:
    if rule.schedule_kind == "WEEKLY":
        return due_date.weekday() == WEEKDAY_INDEX[rule.schedule_value]

    if rule.schedule_kind == "BIWEEKLY_ODD_ISO":
        _, week_num, _ = due_date.isocalendar()
        return (
            due_date.weekday() == WEEKDAY_INDEX[rule.schedule_value]
            and week_num % 2 == 1
        )

    if rule.schedule_kind == "BIWEEKLY_EVEN_ISO":
        _, week_num, _ = due_date.isocalendar()
        return (
            due_date.weekday() == WEEKDAY_INDEX[rule.schedule_value]
            and week_num % 2 == 0
        )

    if rule.schedule_kind == "MONTHLY":
        _, last_day = monthrange(due_date.year, due_date.month)
        return due_date.day == last_day

    if rule.schedule_kind == "YEARLY":
        mm, dd = map(int, rule.schedule_value.split("-"))
        return due_date.month == mm and due_date.day == dd

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


def get_reminders_for_date(
    date: datetime.date,
    rules: list[ReminderRule],
) -> list["Goal"]:
    """Evaluate configured rules and return reminder goals for this date."""
    from sync.models.goals import Goal

    reminders: list[Goal] = []

    for rule in rules:
        if not rule.enabled:
            continue

        due_date = date
        if not _is_due_on(rule, due_date):
            continue

        rendered_body = _render_body_template(rule.body, due_date)
        goal_id = generate_goal_id_for(
            "reminder",
            f"{rule.id}:{due_date.isoformat()}",
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
        "| ID | ENABLED | SCHEDULE | BODY |",
        "| -- | ------- | -------- | ---- |",
    ]
    for rule in rules:
        schedule = f"{rule.schedule_kind}:{rule.schedule_value}"
        enabled = "true" if rule.enabled else "false"
        lines.append(f"| {rule.id} | {enabled} | {schedule} | {rule.body} |")
    lines.append("")
    return lines


def save_reminder_rules(path: str, rules: list[ReminderRule]) -> None:
    """Persist reminder rules to REMINDERS.md atomically."""
    atomic_write_note(path, render_reminder_rules_markdown(rules))
