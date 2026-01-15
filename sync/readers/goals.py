"""
Goal parsing for the journal sync system.
"""

from __future__ import annotations

import calendar
import datetime
import hashlib
import re
import uuid

from sync.models import Goal


# Regex patterns for date formats in goals
DATE_EXACT_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")  # YYYY-MM-DD
DATE_WEEK_RE = re.compile(r"^(\d{4})-W(\d{2})$")  # YYYY-Wnn
DATE_MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")  # YYYY-MM
DATE_QUARTER_RE = re.compile(r"^(\d{4})-Q([1-4])$")  # YYYY-Qn

# Regex to find backtick-wrapped date (with optional reminder offset) in goal body
GOAL_DATE_RE = re.compile(
    r"`(\d{4}(?:-(?:W\d{2}|\d{2}(?:-\d{2})?|Q[1-4])))"
    r"(?:\s*!\s*(\d+)\s*([dwmq]))?`"
)

# Reminder offset units in days
REMINDER_UNIT_DAYS = {
    "d": 1,  # days
    "w": 7,  # weeks
    "m": 30,  # months (approximate)
    "q": 90,  # quarters (approximate)
}


def resolve_deadline(date_str: str) -> datetime.date | None:
    """
    Convert a date format string to its deadline date.

    Supports:
    - YYYY-MM-DD: exact date
    - YYYY-Wnn: end of ISO week (Sunday)
    - YYYY-MM: last day of month
    - YYYY-Qn: last day of quarter

    Returns None if format is not recognized.
    """
    # Exact date: YYYY-MM-DD
    m = DATE_EXACT_RE.match(date_str)
    if m:
        try:
            return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None

    # Week: YYYY-Wnn -> end of week (Sunday)
    m = DATE_WEEK_RE.match(date_str)
    if m:
        year, week = int(m.group(1)), int(m.group(2))
        try:
            return datetime.date.fromisocalendar(year, week, 7)
        except ValueError:
            return None

    # Month: YYYY-MM -> last day of month
    m = DATE_MONTH_RE.match(date_str)
    if m:
        year, month = int(m.group(1)), int(m.group(2))
        try:
            _, last_day = calendar.monthrange(year, month)
            return datetime.date(year, month, last_day)
        except ValueError:
            return None

    # Quarter: YYYY-Qn -> last day of quarter
    m = DATE_QUARTER_RE.match(date_str)
    if m:
        year, quarter = int(m.group(1)), int(m.group(2))
        end_months = {1: 3, 2: 6, 3: 9, 4: 12}
        month = end_months.get(quarter, 12)
        _, last_day = calendar.monthrange(year, month)
        return datetime.date(year, month, last_day)

    return None


def parse_goal_date(body: str) -> tuple[str, str | None, datetime.date | None, int]:
    """
    Extract backtick-wrapped date (and optional reminder offset) from goal body.

    Args:
        body: The goal body text (after checkbox, before ^gid-)

    Returns:
        Tuple of (body_without_date, original_date_str, resolved_deadline, reminder_offset_days)
        If no date found, returns (body, None, None, 0)
    """
    match = GOAL_DATE_RE.search(body)
    if not match:
        return body, None, None, 0

    date_str = match.group(1)
    deadline = resolve_deadline(date_str)

    # Parse reminder offset if present (e.g., !14d, !2w, !1m)
    reminder_offset = 0
    if match.group(2) and match.group(3):
        offset_value = int(match.group(2))
        offset_unit = match.group(3).lower()
        reminder_offset = offset_value * REMINDER_UNIT_DAYS.get(offset_unit, 1)

    # Remove the backtick-wrapped date from body
    body_without_date = body[: match.start()] + body[match.end() :]
    body_without_date = re.sub(r"\s+", " ", body_without_date).strip()

    return body_without_date, date_str, deadline, reminder_offset


def _canonical_goal(text: str) -> str:
    """Normalize a goal line for idempotent matching."""
    cleaned = re.sub(r"^\s*[-*]\s*\[[^\]]?\]\s*", "", text)
    cleaned = re.sub(r"(\s+\^gid-[0-9a-fA-F]{1,32})+\s*$", "", cleaned)
    cleaned = re.sub(r"\[\[(.*?)\]\]", r"\1", cleaned)
    cleaned = cleaned.strip(" `")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.rstrip(".,;:-—– ")
    return cleaned.lower()


def _extract_goal_id(line: str) -> str | None:
    """Extract a gid-... block ID from a line, if present."""
    if not line:
        return None
    m = re.search(r"\^gid-([0-9a-fA-F]{6,32})\s*$", line)
    if m:
        return f"gid-{m.group(1).lower()}"
    return None


def generate_goal_id() -> str:
    """Return a short goal id (gid-xxxxxxxxxx)."""
    return f"gid-{uuid.uuid4().hex[:10]}"


def generate_goal_id_for(
    horizon_key: str, period_key: str, canonical: str, index: int = 0
) -> str:
    """Deterministic goal id for a horizon + period + canonical text + occurrence index."""
    base = f"{horizon_key}|{period_key}|{canonical}|{index}"
    digest = hashlib.sha1(base.encode()).hexdigest()[:10]
    return f"gid-{digest}"


def parse_goal_tasks(lines: list[str]) -> list[Goal]:
    """
    Extract checkbox task lines into a list of Goal dataclasses.

    Args:
        lines: Lines from a goals section

    Returns:
        List of Goal dataclasses
    """
    pattern = re.compile(r"^\s*[-*]\s*\[(?P<state>[^\]]?)\]\s*(?P<body>.+)$")
    goals: list[Goal] = []

    for line in lines:
        match = pattern.match(line)
        if not match:
            continue

        state = (match.group("state") or "").strip()
        body = match.group("body").strip()
        done_state = state.lower() == "x" or state in {"✓", "✔", "-"}
        goal_id = _extract_goal_id(line) or generate_goal_id()

        # Strip trailing gid marker from body if present
        body = re.sub(r"(\s+\^gid-[0-9a-fA-F]{6,32})+\s*$", "", body).rstrip()
        # Strip any existing countdown suffix
        body = re.sub(r"\s*—\s*`(?:TODAY|LATE \+\d+d|\d+d)`\s*$", "", body).rstrip()
        # Extract date and reminder offset if present
        body_clean, date_str, deadline, reminder_offset = parse_goal_date(body)

        goals.append(
            Goal(
                id=goal_id,
                body=body_clean,
                done=done_state,
                date_str=date_str,
                deadline=deadline,
                reminder_offset=reminder_offset,
            )
        )

    return goals


def filter_by_proximity(
    tasks: list[Goal],
    max_days: int,
    today: datetime.date,
) -> list[Goal]:
    """
    Filter tasks to include only those with deadlines within max_days.

    Tasks without deadlines are always included.
    Completed tasks with deadlines are excluded from filtering (always shown).
    Tasks with reminder_offset have their effective deadline shifted earlier.
    """
    result = []
    for task in tasks:
        deadline = task.deadline
        if deadline is None:
            result.append(task)
        elif task.done:
            result.append(task)
        else:
            reminder_offset = task.reminder_offset or 0
            effective_deadline = deadline - datetime.timedelta(days=reminder_offset)
            days_left = (effective_deadline - today).days
            if days_left <= max_days:
                result.append(task)
    return result


def ensure_goal_ids(tasks: list[Goal], horizon_key: str, period_key: str) -> list[Goal]:
    """
    Ensure every Goal has a valid 'id'.
    Uses deterministic IDs for missing ones to avoid duplicates across runs.
    """
    counts: dict[str, int] = {}
    for t in tasks:
        canon = t.canonical or ""
        if not t.id:
            idx = counts.get(canon, 0)
            t.id = generate_goal_id_for(horizon_key, period_key, canon, idx)
        counts[canon] = counts.get(canon, 0) + 1
    return tasks
