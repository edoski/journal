"""
Goal management utilities for the journal sync system.

Provides functions for parsing, normalizing, rendering, and managing
goal checkbox tasks with unique IDs, including optional deadline dates.
"""
from __future__ import annotations

import calendar
import datetime
import hashlib
import re
import uuid


# ---------------------------------------------------------------------------
# Date parsing and countdown utilities
# ---------------------------------------------------------------------------

# Regex patterns for date formats in goals
DATE_EXACT_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")  # YYYY-MM-DD
DATE_WEEK_RE = re.compile(r"^(\d{4})-W(\d{2})$")  # YYYY-Wnn
DATE_MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")  # YYYY-MM
DATE_QUARTER_RE = re.compile(r"^(\d{4})-Q([1-4])$")  # YYYY-Qn

# Regex to find backtick-wrapped date (with optional reminder offset) in goal body
# Matches: `2025-02-12`, `2025-02-12 !14d`, `2025-Q1 !2w`, etc.
GOAL_DATE_RE = re.compile(
    r"`(\d{4}(?:-(?:W\d{2}|\d{2}(?:-\d{2})?|Q[1-4])))"
    r"(?:\s*!(\d+)([dwmq]))?`"
)

# Reminder offset units in days
REMINDER_UNIT_DAYS = {
    "d": 1,      # days
    "w": 7,      # weeks
    "m": 30,     # months (approximate)
    "q": 90,     # quarters (approximate)
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
            # ISO week starts Monday (1), ends Sunday (7)
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
        # Q1 ends Mar 31, Q2 ends Jun 30, Q3 ends Sep 30, Q4 ends Dec 31
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
        - reminder_offset_days: How many days early to start showing the goal (0 if not specified)
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
    body_without_date = body[:match.start()] + body[match.end():]
    # Clean up extra whitespace
    body_without_date = re.sub(r"\s+", " ", body_without_date).strip()

    return body_without_date, date_str, deadline, reminder_offset


def format_countdown(
    deadline: datetime.date | None,
    today: datetime.date,
    is_done: bool,
) -> str:
    """
    Format countdown string for a goal.

    Args:
        deadline: The goal's deadline date (or None if no deadline)
        today: Current date for comparison
        is_done: Whether the goal is completed

    Returns:
        Formatted countdown string like "— `43d`", "— `TODAY`", "— `LATE +5d`"
        Returns empty string if no deadline or goal is done.
    """
    if deadline is None or is_done:
        return ""

    days_left = (deadline - today).days

    if days_left > 0:
        return f"— `{days_left}d`"
    elif days_left == 0:
        return "— `TODAY`"
    else:
        return f"— `LATE +{-days_left}d`"


def filter_by_proximity(
    tasks: list[dict],
    max_days: int,
    today: datetime.date,
) -> list[dict]:
    """
    Filter tasks to include only those with deadlines within max_days.

    Tasks without deadlines are always included.
    Completed tasks with deadlines are excluded from filtering (always shown).
    Tasks with reminder_offset have their effective deadline shifted earlier.

    Args:
        tasks: List of task dicts with optional 'deadline' and 'reminder_offset' fields
        max_days: Maximum days away to include (inclusive)
        today: Current date for comparison

    Returns:
        Filtered list of tasks
    """
    result = []
    for task in tasks:
        deadline = task.get("deadline")
        if deadline is None:
            # No deadline: always include
            result.append(task)
        elif task.get("done"):
            # Completed: always include
            result.append(task)
        else:
            # Apply reminder offset to make goals appear earlier
            reminder_offset = task.get("reminder_offset", 0)
            effective_deadline = deadline - datetime.timedelta(days=reminder_offset)
            days_left = (effective_deadline - today).days
            # Include if within threshold (also include overdue)
            if days_left <= max_days:
                result.append(task)
    return result


def _normalize_header(line: str) -> str:
    """
    Normalize markdown headers for matching, ignoring emphasis markers.
    This allows matching "### STUDY" with "### **STUDY**", etc.
    """
    stripped = line.strip()
    cleaned = re.sub(r"\*+", "", stripped)
    cleaned = re.sub(r"_+", "", cleaned)
    return cleaned.lower()


def canonical_goal(text: str) -> str:
    """Normalize a goal line for idempotent matching.

    - Strips leading checkbox/bullet markers.
    - Strips wiki links ([[foo]] -> foo) to avoid false mismatches.
    - Collapses whitespace and trims trailing punctuation.
    - Strips trailing goal block IDs like ^gid-abcdef1234.
    """
    cleaned = re.sub(r"^\s*[-*]\s*\[[^\]]?\]\s*", "", text)
    cleaned = re.sub(r"(\s+\^gid-[0-9a-fA-F]{1,32})+\s*$", "", cleaned)
    cleaned = re.sub(r"\[\[(.*?)\]\]", r"\1", cleaned)
    cleaned = cleaned.strip(" `")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.rstrip(".,;:-—– ")
    return cleaned.lower()


def generate_goal_id() -> str:
    """Return a short goal id (gid-xxxxxxxxxx)."""
    return f"gid-{uuid.uuid4().hex[:10]}"


def generate_goal_id_for(horizon_key: str, period_key: str, canonical: str, index: int = 0) -> str:
    """
    Deterministic goal id for a horizon + period + canonical text + occurrence index.
    Prevents collision when the same canonical text appears multiple times.
    """
    base = f"{horizon_key}|{period_key}|{canonical}|{index}"
    digest = hashlib.sha1(base.encode()).hexdigest()[:10]
    return f"gid-{digest}"


def extract_goal_id(line: str) -> str | None:
    """Extract a gid-... block ID from a line, if present."""
    if not line:
        return None
    m = re.search(r"\^gid-([0-9a-fA-F]{6,32})\s*$", line)
    if m:
        return f"gid-{m.group(1).lower()}"
    return None


def parse_goal_tasks(lines: list[str]) -> list[dict]:
    """Extract checkbox task lines into a list of dicts.

    Each dict contains:
    - line: original line
    - body: text after checkbox (with date removed if present)
    - done: bool
    - canonical: normalized for comparisons
    - id: goal id
    - date_str: original date string if present (e.g., "2025-02-12")
    - deadline: resolved deadline date if present
    - reminder_offset: days early to show goal (0 if not specified)
    """
    pattern = re.compile(r"^\s*[-*]\s*\[(?P<state>[^\]]?)\]\s*(?P<body>.+)$")
    tasks = []
    for line in lines:
        match = pattern.match(line)
        if not match:
            continue
        state = (match.group("state") or "").strip()
        body = match.group("body").strip()
        done_state = state.lower() == "x" or state in {"✓", "✔", "-"}
        goal_id = extract_goal_id(line)
        # Strip trailing gid marker from body if present
        body = re.sub(r"(\s+\^gid-[0-9a-fA-F]{6,32})+\s*$", "", body).rstrip()
        # Strip any existing countdown suffix (for re-processing)
        body = re.sub(r"\s*—\s*`(?:TODAY|LATE \+\d+d|\d+d)`\s*$", "", body).rstrip()
        # Extract date and reminder offset if present
        body_clean, date_str, deadline, reminder_offset = parse_goal_date(body)
        tasks.append({
            "line": line,
            "body": body_clean,
            "done": done_state,
            "canonical": canonical_goal(line),
            "id": goal_id,
            "date_str": date_str,
            "deadline": deadline,
            "reminder_offset": reminder_offset,
        })
    return tasks


def render_goal_lines(
    tasks: list[dict],
    today: datetime.date | None = None,
) -> list[str]:
    """Render task dicts back to markdown checkbox lines.

    Args:
        tasks: List of task dicts from parse_goal_tasks()
        today: Current date for countdown calculation (if None, no countdowns)

    Returns:
        List of rendered markdown checkbox lines
    """
    rendered = []
    for task in tasks:
        mark = "x" if task.get("done") else " "
        body = task.get("body", "").strip()
        gid = task.get("id") or generate_goal_id()

        # Add countdown if today is provided and task has a deadline
        countdown = ""
        if today is not None:
            countdown = format_countdown(
                task.get("deadline"),
                today,
                task.get("done", False),
            )

        if countdown:
            rendered.append(f"- [{mark}] {body} {countdown} ^{gid}")
        else:
            rendered.append(f"- [{mark}] {body} ^{gid}")
    return rendered


def ensure_goal_ids(tasks: list[dict], horizon_key: str, period_key: str) -> list[dict]:
    """
    Ensure every task dict has an 'id'.
    Uses deterministic IDs for missing ones to avoid duplicates across runs.
    """
    counts = {}
    for t in tasks:
        canon = t.get("canonical") or ""
        if not t.get("id"):
            idx = counts.get(canon, 0)
            t["id"] = generate_goal_id_for(horizon_key, period_key, canon, idx)
        counts[canon] = counts.get(canon, 0) + 1
    return tasks


def build_goals_block(subsections: list[tuple[str, list[str]]]) -> list[str]:
    """Render a complete Goals block given ordered subsections.

    subsections: list of (title, tasks_lines) where tasks_lines are already
    rendered checkbox lines (not parsed tasks).
    """
    lines = ["## Goals", "---"]
    for idx, (title, task_lines) in enumerate(subsections):
        lines.append(f"### **{title}**")
        if task_lines:
            lines.extend(task_lines)
        if idx != len(subsections) - 1:
            lines.append("")
    # Ensure a blank line after the Goals block so following sections are separated.
    if lines and lines[-1].strip() != "":
        lines.append("")
    return lines


def find_subheader_idx(lines: list[str], title: str, start: int = 0, end: int | None = None, level: int = 3) -> int:
    """Find index of a subheader between start and end (defaults to full list)."""
    end = end if end is not None else len(lines)
    needle = _normalize_header(f"{'#'*level} {title}")
    for idx in range(start, end):
        if _normalize_header(lines[idx]) == needle:
            return idx
    return -1
