from __future__ import annotations

import datetime
import fcntl
import hashlib
import math
import os
import re
import time
import uuid
from collections import OrderedDict
from contextlib import contextmanager
from typing import Any, Callable

JOURNAL_DIR = "/Users/edo/Documents/Obsidian/the-vault/journal"
VAULT_DIR = "/Users/edo/Documents/Obsidian/the-vault"

WEEKLY_TEMPLATE_PATH = "/Users/edo/Documents/Obsidian/the-vault/notes/templates/weekly.md"
MONTHLY_TEMPLATE_PATH = "/Users/edo/Documents/Obsidian/the-vault/notes/templates/monthly.md"
QUARTERLY_TEMPLATE_PATH = "/Users/edo/Documents/Obsidian/the-vault/notes/templates/quarterly.md"
YEARLY_TEMPLATE_PATH = "/Users/edo/Documents/Obsidian/the-vault/notes/templates/yearly.md"

DEFAULT_WEEKLY_DIR = os.environ.get("WEEKLY_DIR", JOURNAL_DIR)
DEFAULT_MONTHLY_DIR = os.environ.get("MONTHLY_DIR", JOURNAL_DIR)
DEFAULT_QUARTERLY_DIR = os.environ.get("QUARTERLY_DIR", JOURNAL_DIR)
DEFAULT_YEARLY_DIR = os.environ.get("YEARLY_DIR", JOURNAL_DIR)

LOCK_DIR = os.path.expanduser("~/.cache/journal_sync/locks")

DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

# Study intensity thresholds (minutes)
STUDY_TARGET_MIN = 360    # 4 pomodoros (4 * 90m) – daily target threshold

# Symbols for study intensity (binary default; yearly overrides with partial)
STUDY_SYMBOL_DEEP = "█"   # target met
STUDY_SYMBOL_NONE = "·"   # target not met or no study
STUDY_LEGEND_LINE = "1 POMODORO = 90m → █ ≥ 4 POM. | · < 4 POM."
YEARLY_STUDY_LEGEND_LINE = "1 POMODORO = 90m → █ all days ≥ 4 POM | ░ some days | · none"

# Chart dimension constants
CHART_HEIGHT_DEFAULT = 10
CHART_HEIGHT_QUARTERLY = 12
CHART_HEIGHT_YEARLY = 12
CHART_Y_MAX_WEEKLY_STUDY = 10       # 10 hours
CHART_Y_MAX_MONTHLY_STUDY = 40      # 40 hours per week
CHART_Y_MAX_QUARTERLY_STUDY = 240   # 240 hours per month
CHART_Y_MAX_YEARLY_STUDY = 720      # 720 hours per quarter


def _lockfile_for(path: str) -> str:
    os.makedirs(LOCK_DIR, exist_ok=True)
    digest = hashlib.sha1(os.path.abspath(path).encode()).hexdigest()
    return os.path.join(LOCK_DIR, f"{digest}.lock")


@contextmanager
def locked_note(path: str, timeout: float = 2.0, poll: float = 0.1):
    """
    Serialize writes to a note by taking an advisory lock stored in ~/.cache.

    - Uses fcntl.flock (works on macOS) with non-blocking attempts.
    - Waits up to `timeout` seconds, polling every `poll` seconds.
    - Raises TimeoutError if the lock cannot be acquired in time.
    """
    lock_path = _lockfile_for(path)
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR)
    start = time.time()
    acquired = False
    try:
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = True
                break
            except BlockingIOError:
                if time.time() - start >= timeout:
                    raise TimeoutError(f"lock timeout for {path}")
                time.sleep(poll)
        yield
    finally:
        if acquired:
            fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def parse_frontmatter(lines):
    data = OrderedDict()
    if not lines or lines[0].strip() != "---":
        return data
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return data
    for line in lines[1:end_idx]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        data[key.strip()] = value.strip()
    return data


def parse_duration_to_minutes(val):
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().strip("`")
    if not s:
        return None
    hours = 0.0
    minutes = 0.0
    seconds = 0.0
    match_h = re.search(r"(\d+(?:\.\d+)?)h", s)
    match_m = re.search(r"(\d+(?:\.\d+)?)m", s)
    match_s = re.search(r"(\d+(?:\.\d+)?)s", s)
    if match_h:
        hours = float(match_h.group(1))
    if match_m:
        minutes = float(match_m.group(1))
    if match_s:
        seconds = float(match_s.group(1))
    total = hours * 60 + minutes + (seconds / 60)
    return total


def format_minutes(total_minutes, always_show_both=False):
    """
    Format minutes as XhYm string.
    Always uses two-digit minutes when hours > 0 (e.g., 7h00m, 7h05m).
    If always_show_both=True, always shows both h and m (e.g., 0h00m for 0 minutes).
    """
    if total_minutes is None:
        return ""
    total_minutes = max(0, float(total_minutes))
    total_minutes = round_half_up(total_minutes)
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if hours > 0 or always_show_both:
        return f"{hours}h{minutes:02d}m"
    return f"{minutes}m"


def format_minutes_seconds(total_minutes_float: float) -> str:
    """
    Convert minute value (can be float) to XmYYs string.
    """
    if total_minutes_float is None:
        return ""
    mins = int(total_minutes_float)
    secs = round((total_minutes_float - mins) * 60)
    if secs == 60:
        mins += 1
        secs = 0
    if mins >= 60:
        hours = mins // 60
        rem_mins = mins % 60
        return f"{hours}h{rem_mins:02d}m" if secs == 0 else f"{hours}h{rem_mins:02d}m{secs:02d}s"
    if secs == 0:
        return f"{mins}m"
    return f"{mins}m{secs:02d}s"


def ceil_minutes(val: float) -> int:
    """
    Round minutes upward with a tiny tolerance to avoid float undercounts
    (e.g., 89.0000001 -> 90).
    """
    if val is None:
        return 0
    return int(math.ceil(val - 1e-6))


def round_half_up(val: float) -> int:
    """
    Round to nearest minute, half-up, with tiny tolerance to prevent float drift.
    """
    if val is None:
        return 0
    return int(math.floor(val + 0.5000001))


def parse_bool(val):
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    return str(val).strip().lower() == "true"


def _normalize_header(line: str) -> str:
    """
    Normalize markdown headers for matching, ignoring emphasis markers.
    This allows matching "### STUDY" with "### **STUDY**", etc.
    """
    if line is None:
        return ""
    normalized = line.strip().lower()
    normalized = re.sub(r"[*_`]", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


# --- Goal helpers ---------------------------------------------------------

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


def parse_goal_tasks(lines):
    """Extract checkbox task lines into a list of dicts.

    Each dict contains: line (original), body (after checkbox), done (bool),
    canonical (normalized for comparisons), id (goal id).
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
        tasks.append({
            "line": line,
            "body": body,
            "done": done_state,
            "canonical": canonical_goal(line),
            "id": goal_id,
        })
    return tasks


def render_goal_lines(tasks):
    """Render task dicts back to markdown checkbox lines."""
    rendered = []
    for task in tasks:
        mark = "x" if task.get("done") else " "
        body = task.get("body", "").strip()
        gid = task.get("id") or generate_goal_id()
        rendered.append(f"- [{mark}] {body} ^{gid}")
    return rendered


def find_subheader_idx(lines, title, start=0, end=None, level=3):
    """Find index of a subheader between start and end (defaults to full list)."""
    end = end if end is not None else len(lines)
    needle = _normalize_header(f"{'#'*level} {title}")
    for idx in range(start, end):
        if _normalize_header(lines[idx]) == needle:
            return idx
    return -1


def goals_section_bounds(lines):
    """Return (start, end) indices for the ## Goals section."""
    goals_idx = find_header_idx(lines, "Goals", level=2)
    if goals_idx == -1:
        return -1, -1
    _, end = section_bounds(lines, goals_idx, level=2)
    return goals_idx, end


def extract_subsection_tasks(lines, parent_start, parent_end, sub_title):
    """Extract checkbox tasks from a ### subsection within a parent block."""
    sub_idx = find_subheader_idx(lines, sub_title, start=parent_start, end=parent_end, level=3)
    if sub_idx == -1:
        return []
    sub_start, sub_end = subsection_bounds(lines, sub_idx, parent_end)
    body_start = sub_idx + 1
    while body_start < sub_end and lines[body_start].strip() == "":
        body_start += 1
    tasks = parse_goal_tasks(lines[body_start:sub_end])
    return tasks


def build_goals_block(subsections):
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


def extract_goal_id(line: str):
    """Extract a gid-... block ID from a line, if present."""
    if not line:
        return None
    m = re.search(r"\^gid-([0-9a-fA-F]{6,32})\s*$", line)
    if m:
        return f"gid-{m.group(1).lower()}"
    return None


def ensure_goal_ids(tasks, horizon_key: str, period_key: str):
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


def trim_blank_lines(lines):
    """Remove leading and trailing blank lines from a list."""
    while lines and lines[0].strip() == "":
        lines = lines[1:]
    while lines and lines[-1].strip() == "":
        lines = lines[:-1]
    return lines


def join_sections(sections):
    """Join multiple line-blocks with a single blank line between non-empty blocks."""
    out = []
    for sec in sections:
        if not sec:
            continue
        if out:
            out.append("")
        out.extend(sec)
    return out

def find_header_idx(lines, title, level=2, start=0):
    """Find the index of a markdown header like ## Title or ### Title.

    Returns -1 when not found. Matching is case-insensitive and ignores extra
    emphasis markers (handled via _normalize_header).
    """
    needle = _normalize_header(f"{'#'*level} {title}")
    for idx in range(start, len(lines)):
        if _normalize_header(lines[idx]) == needle:
            return idx
    return -1


def section_bounds(lines, header_idx, level=2):
    """Return (start, end) indices for a header block delimited by same-level headers."""
    if header_idx == -1:
        return -1, -1
    end_idx = len(lines)
    header_prefix = "#" * level + " "
    for idx in range(header_idx + 1, len(lines)):
        if lines[idx].strip().startswith(header_prefix) and _normalize_header(lines[idx]) != _normalize_header(lines[header_idx]):
            end_idx = idx
            break
    return header_idx, end_idx


def subsection_bounds(lines, subheader_idx, parent_end_idx):
    """Return (start, end) indices for a ### subsection up to next ### or parent end."""
    if subheader_idx == -1:
        return -1, -1
    end_idx = parent_end_idx
    for idx in range(subheader_idx + 1, parent_end_idx):
        if lines[idx].strip().startswith("### ") and _normalize_header(lines[idx]) != _normalize_header(lines[subheader_idx]):
            end_idx = idx
            break
    return subheader_idx, end_idx


def extract_block(lines, header):
    header_norm = _normalize_header(header)
    start = -1
    for idx, line in enumerate(lines):
        if _normalize_header(line) == header_norm:
            start = idx
            break
    if start == -1:
        return []
    end = len(lines)
    for idx in range(start + 1, len(lines)):
        stripped = lines[idx].strip()
        if stripped.startswith("### ") or stripped.startswith("## "):
            end = idx
            break
    while end > start and lines[end - 1].strip() == "":
        end -= 1
    return lines[start:end]


def ensure_section_with_divider(lines, title, level=2, insert_pos=None, create_if_missing=True):
    """Ensure a header exists and is immediately followed by a divider line.

    Returns (header_idx, divider_idx). If the header is absent and
    create_if_missing is False, returns (-1, -1).
    """
    header = f"{'#'*level} {title}"
    header_idx = find_header_idx(lines, title, level=level)

    if header_idx == -1:
        if not create_if_missing:
            return -1, -1
        insert_at = insert_pos if insert_pos is not None else len(lines)
        lines[insert_at:insert_at] = [header, "---"]
        return insert_at, insert_at + 1

    cursor = header_idx + 1
    while cursor < len(lines) and lines[cursor].strip() == "":
        cursor += 1

    if cursor < len(lines) and lines[cursor].strip() == "---":
        if cursor != header_idx + 1:
            del lines[header_idx + 1 : cursor]
        divider_idx = header_idx + 1
    else:
        lines.insert(header_idx + 1, "---")
        divider_idx = header_idx + 1

    return header_idx, divider_idx


def parse_study_table(lines):
    block = extract_block(lines, "### **STUDY**")
    if not block:
        return []
    header_idx = -1
    for i, line in enumerate(block):
        if re.search(r"\|\s*TIME\s*\|\s*ACTIVITY\s*\|\s*(DURATION|FOCUS)\s*\|", line, re.IGNORECASE):
            header_idx = i
            break
    if header_idx == -1:
        return []
    rows = []
    for line in block[header_idx + 2:]:
        if not line.strip().startswith("|"):
            break
        if re.search(r"no study sessions", line, re.IGNORECASE):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 6:
            continue
        activity = parts[2].strip("`")
        duration_min = parse_duration_to_minutes(parts[3])

        # Parse interrupt minutes from INTERRUPT column (format: `+XXm`)
        interrupt_min = 0
        if len(parts) > 4:
            interrupt_str = parts[4].strip("`").strip()
            interrupt_match = re.search(r"\+(\d+)m", interrupt_str)
            if interrupt_match:
                interrupt_min = int(interrupt_match.group(1))

        # Parse overrun minutes from BREAK column (format: `5m (+15m)` where (+15m) is the overrun)
        overrun_min = 0
        planned_break_min = 0
        if len(parts) > 5:
            break_str = parts[5].strip("`").strip()
            if break_str:
                planned_str = break_str.split("(", 1)[0].strip()
                planned_break_min = parse_duration_to_minutes(planned_str) or 0
            overrun_match = re.search(r"\(\+([^)]+)\)", break_str)
            if overrun_match:
                overrun_str = overrun_match.group(1)
                overrun_min = parse_duration_to_minutes(overrun_str) or 0

        if activity and duration_min:
            rows.append((activity, duration_min, interrupt_min, overrun_min, planned_break_min))
    return rows


def parse_sleep_table(lines):
    block = extract_block(lines, "### **SLEEP**")
    if not block:
        return []
    header_idx = -1
    for i, line in enumerate(block):
        if re.search(r"\|\s*TIME\s*\|\s*DURATION\s*\|\s*AWAKE\s*\|\s*AWAKENINGS\s*\|", line, re.IGNORECASE):
            header_idx = i
            break
    if header_idx == -1:
        return []
    rows = []
    for line in block[header_idx + 2:]:
        if not line.strip().startswith("|"):
            break
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 5:
            continue
        duration_min = parse_duration_to_minutes(parts[2])
        awake_min = parse_duration_to_minutes(parts[3])
        awakenings = None
        if parts[4]:
            try:
                awakenings = int(re.sub(r"[^0-9]", "", parts[4]))
            except Exception:
                awakenings = None
        rows.append((duration_min, awake_min, awakenings))
    return rows


def parse_daily_note(path):
    try:
        text = open(path, "r").read()
    except Exception:
        return None
    lines = text.splitlines()
    fm = parse_frontmatter(lines)

    study_rows = parse_study_table(lines)
    sleep_rows = parse_sleep_table(lines)

    # Sleep still uses frontmatter if available (user may adjust for naps, etc.)
    sleep_from_fm = parse_duration_to_minutes(fm.get("sleep"))
    sleep_total = sleep_from_fm if sleep_from_fm is not None else sum((r[0] or 0 for r in sleep_rows), 0)

    mood_val = None
    if fm.get("mood") not in (None, ""):
        try:
            mood_val = float(re.sub(r"[^0-9.\-]", "", fm.get("mood")))
        except Exception:
            mood_val = None

    workout = parse_bool(fm.get("workout"))
    stretch = parse_bool(fm.get("stretch"))

    awake_total = sum((r[1] or 0 for r in sleep_rows), 0) if sleep_rows else None
    awakenings_total = None
    if sleep_rows:
        awak_counts = [r[2] for r in sleep_rows if r[2] is not None]
        if awak_counts:
            awakenings_total = sum(awak_counts)

    activity_totals = {}
    interrupt_total = 0
    overrun_total = 0
    planned_break_total = 0
    for row in study_rows:
        activity, minutes = row[0], row[1]
        activity_totals[activity] = activity_totals.get(activity, 0) + minutes

        # Aggregate interrupts and overruns
        if len(row) > 2:
            interrupt_total += row[2]
        if len(row) > 3:
            overrun_total += row[3]
        if len(row) > 4:
            planned_break_total += row[4]

    # Study total always derived from table (activity_totals) for consistency
    # This ensures chart bars, SUM, SUMMARY avg, and percentages all match
    study_total = sum(activity_totals.values())

    return {
        "study_minutes": study_total,
        "sleep_minutes": sleep_total,
        "mood": mood_val,
        "workout": workout,
        "stretch": stretch,
        "awake_minutes": awake_total,
        "awakenings": awakenings_total,
        "activity_totals": activity_totals,
        "interrupt_minutes": interrupt_total,
        "overrun_minutes": overrun_total,
        "planned_break_minutes": planned_break_total,
    }


def daterange(start_date, end_date):
    current = start_date
    while current <= end_date:
        yield current
        current += datetime.timedelta(days=1)


def iso_week_range(date_obj):
    start = date_obj - datetime.timedelta(days=date_obj.isoweekday() - 1)
    end = start + datetime.timedelta(days=6)
    return start, end


def month_range(year, month):
    start = datetime.date(year, month, 1)
    if month == 12:
        end = datetime.date(year + 1, 1, 1) - datetime.timedelta(days=1)
    else:
        end = datetime.date(year, month + 1, 1) - datetime.timedelta(days=1)
    return start, end


def quarter_range(year, quarter):
    """
    Return (start_date, end_date) for a given quarter number (1-4).
    """
    if quarter < 1 or quarter > 4:
        raise ValueError("quarter must be in 1..4")
    start_month = 3 * (quarter - 1) + 1
    start = datetime.date(year, start_month, 1)
    end_month = start_month + 2
    _, end = month_range(year, end_month)
    return start, end


def quarter_months(year, quarter):
    """
    Return a list of (month_start, month_end) tuples for the quarter.
    """
    start_month = 3 * (quarter - 1) + 1
    months = []
    for m in range(start_month, start_month + 3):
        months.append(month_range(year, m))
    return months


def quarter_of_date(date_obj):
    """Return (year, quarter_number) for a given date."""
    q = (date_obj.month - 1) // 3 + 1
    return date_obj.year, q


def year_range(year: int):
    """Return (start_date, end_date) for a calendar year."""
    start = datetime.date(year, 1, 1)
    end = datetime.date(year, 12, 31)
    return start, end


def year_quarters(year: int):
    """Return list of (start, end) tuples for all four quarters of a year."""
    ranges = []
    for q in range(1, 5):
        ranges.append(quarter_range(year, q))
    return ranges


def month_week_ranges(year, month):
    month_start, month_end = month_range(year, month)
    weeks = OrderedDict()
    for day in daterange(month_start, month_end):
        week_start, week_end = iso_week_range(day)
        key = week_start
        if key not in weeks:
            weeks[key] = (week_start, week_end)
    ranges = []
    for week_start, week_end in weeks.values():
        start = max(week_start, month_start)
        end = min(week_end, month_end)
        ranges.append((start, end))
    return ranges


def format_week_label(start_date, end_date):
    month = MONTH_ABBR[start_date.month - 1]
    return f"{month} {start_date.day:02d}-{end_date.day:02d}"


def quarter_id(year, quarter_num):
    """Return quarter identifier like '2025-Q4'."""
    return f"{year}-Q{quarter_num}"


def load_daily_data(start_date, end_date):
    """Load parsed daily notes for a date range."""
    data = {}
    for day in daterange(start_date, end_date):
        path = os.path.join(JOURNAL_DIR, f"{day:%Y-%m-%d}.md")
        if not os.path.exists(path):
            continue
        parsed = parse_daily_note(path)
        if parsed:
            data[day] = parsed
    return data

def compute_period_metrics(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, dict[str, Any]],
) -> dict[str, Any]:
    """
    Compute aggregated metrics for a list of dates.

    Args:
        dates: List of date objects to aggregate.
        daily_data: Dict mapping dates to parsed daily note data.

    Returns:
        Dict with keys: study_total_minutes, sleep_avg_minutes, mood_avg,
        workout_count, stretch_count, total_days, days_up_to_today.
    """
    today = datetime.date.today()
    dates_up_to_today = [d for d in dates if d <= today]
    days_up_to_today = len(dates_up_to_today)

    study_minutes = [daily_data.get(d, {}).get("study_minutes") for d in dates]
    sleep_minutes = [daily_data.get(d, {}).get("sleep_minutes") for d in dates]
    mood_vals = [daily_data.get(d, {}).get("mood") for d in dates]

    study_total = sum((m for m in study_minutes if m is not None), 0)
    sleep_vals = [m for m in sleep_minutes if m is not None]
    sleep_avg = sum(sleep_vals) / len(sleep_vals) if sleep_vals else None
    mood_vals_clean = [m for m in mood_vals if m is not None]
    mood_avg = sum(mood_vals_clean) / len(mood_vals_clean) if mood_vals_clean else None

    workout_count = sum(1 for d in dates if daily_data.get(d, {}).get("workout"))
    stretch_count = sum(1 for d in dates if daily_data.get(d, {}).get("stretch"))

    return {
        "study_total_minutes": study_total,
        "sleep_avg_minutes": sleep_avg,
        "mood_avg": mood_avg,
        "workout_count": workout_count,
        "stretch_count": stretch_count,
        "total_days": len(dates),
        "days_up_to_today": days_up_to_today,
    }


def aggregate_activity_totals(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, dict[str, Any]],
) -> dict[str, float]:
    """
    Aggregate study activity totals across a date range.

    Args:
        dates: List of date objects to aggregate.
        daily_data: Dict mapping dates to parsed daily note data.

    Returns:
        Dict mapping activity names to total minutes.
    """
    activity_totals: dict[str, float] = {}
    for d in dates:
        daily = daily_data.get(d)
        if not daily:
            continue
        for activity, mins in daily.get("activity_totals", {}).items():
            activity_totals[activity] = activity_totals.get(activity, 0) + mins
    return activity_totals


def aggregate_interrupt_overrun(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, dict[str, Any]],
) -> tuple[float, float, int]:
    """
    Aggregate interrupt and overrun minutes across a date range.

    Args:
        dates: List of date objects to aggregate.
        daily_data: Dict mapping dates to parsed daily note data.

    Returns:
        Tuple of (total_interrupts, total_overruns, study_day_count).
        study_day_count is the number of days with any study (for averaging).
    """
    total_interrupts = 0.0
    total_overruns = 0.0
    study_day_count = 0
    for d in dates:
        daily = daily_data.get(d, {})
        total_interrupts += daily.get("interrupt_minutes", 0) or 0
        total_overruns += daily.get("overrun_minutes", 0) or 0
        study_minutes = daily.get("study_minutes") or 0
        if study_minutes > 0:
            study_day_count += 1
    return total_interrupts, total_overruns, study_day_count


def compute_period_deltas(
    counts: list[tuple[int, int, datetime.date]],
    baseline: int | None,
    today: datetime.date | None = None,
) -> list[str]:
    """
    Compute percent change deltas for a sequence of period counts.

    This consolidates the repeated delta calculation pattern used in
    quarterly_sync.py and yearly_sync.py.

    Args:
        counts: List of (done, elapsed, start_date) tuples for each period.
        baseline: The count from the previous comparable period (e.g., last
                  quarter of previous year for Q1 comparison).
        today: Reference date for skipping future periods. Defaults to today.

    Returns:
        List of formatted delta strings (e.g., "+25%", "-10%", "—").
    """
    today = today or datetime.date.today()
    deltas: list[str] = []
    for idx, (done, _, start) in enumerate(counts):
        if start > today:
            deltas.append("")
            continue
        if idx == 0:
            prev_val = baseline
        else:
            prev_val = counts[idx - 1][0]
        delta = compute_percent_change(done, prev_val)
        deltas.append(format_percent_change(delta))
    return deltas


def render_sleep_stats_table(
    sleep_avg: float | None,
    avg_awake: float | None,
    avg_awakenings: float | None,
) -> list[str]:
    """
    Render the SLEEP statistics table with average metrics.

    Args:
        sleep_avg: Average sleep duration in minutes.
        avg_awake: Average awake time during sleep in minutes.
        avg_awakenings: Average number of awakenings per night.

    Returns:
        List of markdown table lines.
    """
    lines: list[str] = []
    lines.append("| ACTIVITY | AVERAGE |")
    lines.append("| -------- | ------- |")
    lines.append(f"| **SLEEP**      | `{format_minutes(sleep_avg)}` |" if sleep_avg is not None else "| **SLEEP**      | |")
    lines.append(f"| **AWAKE**      | `{format_minutes(avg_awake)}` |" if avg_awake is not None else "| **AWAKE**      | |")
    if avg_awakenings is not None:
        awaken_val = f"{avg_awakenings:.1f}" if abs(avg_awakenings - round(avg_awakenings)) >= 0.05 else str(int(round(avg_awakenings)))
        lines.append(f"| **AWAKENINGS** | `{awaken_val}` |")
    else:
        lines.append("| **AWAKENINGS** | |")
    return lines


def render_activity_table(activity_totals: dict[str, float]) -> list[str]:
    """
    Render the ACTIVITY breakdown table with time and share percentages.

    Args:
        activity_totals: Dict mapping activity names to total minutes.

    Returns:
        List of markdown table lines sorted by time (descending).
    """
    lines: list[str] = []
    lines.append("| ACTIVITY | TIME | SHARE |")
    lines.append("| -------- | ---- | ----- |")
    total_activity = sum(activity_totals.values())
    if activity_totals:
        for activity, mins in sorted(activity_totals.items(), key=lambda x: x[1], reverse=True):
            share = f"{int(round((mins / total_activity) * 100))}%" if total_activity else "0%"
            lines.append(f"| **{activity}** | `{format_minutes(mins)}` | `{share}` |")
    else:
        lines.append("|  |  |  |")
    return lines


def render_interrupts_table(avg_interrupts: float, avg_overruns: float) -> list[str]:
    """
    Render the INTERRUPTS/OVERRUNS metrics table.

    Args:
        avg_interrupts: Average interrupt minutes per study day.
        avg_overruns: Average overrun minutes per study day.

    Returns:
        List of markdown table lines.
    """
    lines: list[str] = []
    lines.append("| METRIC | AVERAGE |")
    lines.append("| ------ | ------- |")
    lines.append(f"| **INTERRUPTS** | `{format_minutes(avg_interrupts, always_show_both=True)}/day` |")
    lines.append(f"| **OVERRUNS**   | `{format_minutes(avg_overruns, always_show_both=True)}/day` |")
    return lines


def wrap_code_block(lines):
    return ["```"] + lines + ["```"]


def ensure_note(path, template_path):
    if os.path.exists(path):
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if template_path and os.path.exists(template_path):
        with open(template_path, "r") as tf:
            content = tf.read()
        with open(path, "w") as f:
            f.write(content)


def replace_metrics_block(lines, new_block_lines):
    metrics_idx = None
    for idx, line in enumerate(lines):
        if line.strip().lower() == "## metrics":
            metrics_idx = idx
            break
    if metrics_idx is None:
        return lines

    end_idx = len(lines)
    for idx in range(metrics_idx + 1, len(lines)):
        if lines[idx].strip().startswith("## ") and lines[idx].strip().lower() != "## metrics":
            end_idx = idx
            break

    new_lines = lines[:metrics_idx + 1]
    new_lines.append("---")

    # Insert new metrics content as-is (builders should control internal spacing)
    new_lines.extend(new_block_lines)

    remainder = lines[end_idx:]
    # Strip leading blank lines from remainder to avoid double spacing
    while remainder and remainder[0].strip() == "":
        remainder = remainder[1:]

    # Ensure a single blank line between Metrics and following content when remainder exists
    if remainder and (not new_lines or new_lines[-1].strip() != ""):
        new_lines.append("")

    new_lines.extend(remainder)
    return new_lines


def compute_percent_change(current, previous):
    """
    Compute percentage change from previous to current.

    - Returns None when previous is None or zero and current > 0 (avoids +∞%).
    - Returns 0 when both current and previous are zero (explicit 0%).
    """
    if current is None or previous is None:
        return None
    if previous == 0:
        return 0 if current == 0 else None
    return ((current - previous) / previous) * 100


def format_percent_change(pct):
    """
    Format percentage change as +X% or -X%.
    Uses an em dash when pct is None (e.g., baseline=0 with a nonzero current).
    """
    if pct is None:
        return "—"
    sign = "+" if pct >= 0 else ""
    return f"{sign}{round_half_up(pct)}%"


def format_training_ratio(count, total_days):
    """
    Format workout/stretch as count/total.
    Zero-pad count only for monthly notes (total_days > 7).
    """
    if total_days > 7:
        return f"{count:02d}/{total_days}"
    return f"{count}/{total_days}"


def format_mood_with_scale(val):
    """Format mood value with /10.0 suffix, always showing one decimal (e.g., 5.0/10.0)."""
    if val is None:
        return ""
    return f"{val:.1f}/10.0"


def render_summary_table(current_metrics, previous_metrics, current_label, previous_label):
    """
    Generate markdown summary table with averages, previous values, and % change.
    
    current_metrics and previous_metrics are dicts with keys:
    - study_avg_minutes: daily average study in minutes
    - study_total_minutes: total study in minutes
    - sleep_avg_minutes: average sleep in minutes
    - mood_avg: average mood
    - workout_count: number of workout days
    - stretch_count: number of stretch days
    - total_days: number of days in period
    
    previous_label should be a wiki link like "[[2025-W50\\|LAST WEEK]]"
    Order: STUDY → SLEEP → WORKOUT → STRETCH → MOOD
    """
    lines = ["### **SUMMARY**", ""]
    
    # Table header
    lines.append(f"| METRIC | {current_label} | {previous_label} | CHANGE |")
    lines.append("| ------ | ----------- | ----------------------- | ------ |")
    
    # STUDY row (daily average)
    curr_study_total = current_metrics.get("study_total_minutes") or 0
    prev_study_total = previous_metrics.get("study_total_minutes") or 0
    # Use days_up_to_today for accurate daily average (not counting future days)
    curr_days_for_avg = current_metrics.get("days_up_to_today") or current_metrics.get("total_days", 7)
    prev_days_for_avg = previous_metrics.get("days_up_to_today") or previous_metrics.get("total_days", 7)
    curr_total_days = current_metrics.get("total_days", 7)
    prev_total_days = previous_metrics.get("total_days", 7)
    
    # Always show study average, even if zero
    curr_study_avg_mins = curr_study_total / max(1, curr_days_for_avg)
    curr_study_avg = format_minutes(curr_study_avg_mins, always_show_both=True) + "/day"
    
    prev_study_avg_mins = prev_study_total / max(1, prev_days_for_avg)
    prev_study_avg = format_minutes(prev_study_avg_mins, always_show_both=True) + "/day"
    
    # Compute percentage change (show dash only if both are zero)
    if curr_study_avg_mins > 0 or prev_study_avg_mins > 0:
        study_pct = compute_percent_change(curr_study_avg_mins, prev_study_avg_mins)
        study_pct_str = format_percent_change(study_pct)
    else:
        study_pct_str = "-"
    
    lines.append(f"| **STUDY** | `{curr_study_avg}` | `{prev_study_avg}` | `{study_pct_str}` |")
    
    # SLEEP row (with /night suffix)
    curr_sleep_avg = current_metrics.get("sleep_avg_minutes") or 0
    prev_sleep_avg = previous_metrics.get("sleep_avg_minutes") or 0
    
    # Always show sleep average, even if zero
    curr_sleep = format_minutes(curr_sleep_avg, always_show_both=True) + "/night"
    prev_sleep = format_minutes(prev_sleep_avg, always_show_both=True) + "/night"
    
    # Compute percentage change (show dash only if both are zero)
    if curr_sleep_avg > 0 or prev_sleep_avg > 0:
        sleep_pct = compute_percent_change(curr_sleep_avg, prev_sleep_avg)
        sleep_pct_str = format_percent_change(sleep_pct)
    else:
        sleep_pct_str = "-"
    
    lines.append(f"| **SLEEP** | `{curr_sleep}` | `{prev_sleep}` | `{sleep_pct_str}` |")
    
    # WORKOUT row
    curr_workout_count = current_metrics.get("workout_count", 0)
    prev_workout_count = previous_metrics.get("workout_count", 0)
    
    # Always show workout ratio, even if zero
    curr_workout = format_training_ratio(curr_workout_count, curr_total_days)
    prev_workout = format_training_ratio(prev_workout_count, prev_total_days)
    
    # Compute percentage change (show dash only if both are zero)
    if curr_workout_count > 0 or prev_workout_count > 0:
        workout_pct = compute_percent_change(curr_workout_count, prev_workout_count)
        workout_pct_str = format_percent_change(workout_pct)
    else:
        workout_pct_str = "-"
    
    lines.append(f"| **WORKOUT** | `{curr_workout}` | `{prev_workout}` | `{workout_pct_str}` |")
    
    # STRETCH row
    curr_stretch_count = current_metrics.get("stretch_count", 0)
    prev_stretch_count = previous_metrics.get("stretch_count", 0)
    
    # Always show stretch ratio, even if zero
    curr_stretch = format_training_ratio(curr_stretch_count, curr_total_days)
    prev_stretch = format_training_ratio(prev_stretch_count, prev_total_days)
    
    # Compute percentage change (show dash only if both are zero)
    if curr_stretch_count > 0 or prev_stretch_count > 0:
        stretch_pct = compute_percent_change(curr_stretch_count, prev_stretch_count)
        stretch_pct_str = format_percent_change(stretch_pct)
    else:
        stretch_pct_str = "-"
    
    lines.append(f"| **STRETCH** | `{curr_stretch}` | `{prev_stretch}` | `{stretch_pct_str}` |")
    
    # MOOD row (with /10.0 suffix)
    curr_mood_avg = current_metrics.get("mood_avg") or 0
    prev_mood_avg = previous_metrics.get("mood_avg") or 0
    
    # Always show mood value, even if zero
    curr_mood = format_mood_with_scale(curr_mood_avg)
    prev_mood = format_mood_with_scale(prev_mood_avg)
    
    # Compute percentage change (show dash only if both are zero)
    if curr_mood_avg > 0 or prev_mood_avg > 0:
        mood_pct = compute_percent_change(curr_mood_avg, prev_mood_avg)
        mood_pct_str = format_percent_change(mood_pct)
    else:
        mood_pct_str = "-"
    
    lines.append(f"| **MOOD** | `{curr_mood}` | `{prev_mood}` | `{mood_pct_str}` |")
    
    lines.append("")
    return lines


def render_bar_chart(
    labels: list[str],
    values: list[float | None],
    value_labels: list[str],
    *,
    height: int = 10,
    y_max: float | None = None,
    bar_width: int = 5,
    col_spacing: int = 12,
    left_pad: int | None = None,
    label_prefix: str = " ",
    axis_trim: int | None = 3,
    center_labels_on_bars: bool = False,
    delta_labels: list[str] | None = None,
) -> list[str]:
    """
    Unified bar chart renderer for all time spans (weekly, monthly, quarterly, yearly).

    Args:
        labels: X-axis labels (e.g., ["MON", "TUE", ...] or ["DEC 01-07", ...])
        values: Numeric values for bar heights (None/0 = no bar)
        value_labels: Formatted strings to display above bars
        height: Number of visual rows for bars (default 10)
        y_max: Maximum value on Y-axis for scaling (default same as height)
        bar_width: Number of █ characters per bar (default 5)
        col_spacing: Spacing between column starts (default 12)
        left_pad: Spaces before bar in column (None = center bars)
        label_prefix: Prefix string for label/delta rows (default " ")
        axis_trim: Characters to trim from axis (None = dynamic to match widest row)
        center_labels_on_bars: If True, center value labels on bars (default False)
        delta_labels: Optional list of delta strings to show below x-axis labels

    Returns:
        List of strings representing the chart lines.
    """
    bar_char = "█"

    if y_max is None:
        y_max = height

    # Compute left_pad if not specified (center bars in column)
    if left_pad is None:
        computed_left_pad = (col_spacing - bar_width) // 2
    else:
        computed_left_pad = left_pad

    # Scale values to visual height
    scale = height / y_max if y_max > 0 else 1
    bar_heights: list[int] = []
    for val in values:
        if val is None or val == 0:
            bar_heights.append(0)
        else:
            bar_heights.append(min(height, max(0, round_half_up(val * scale))))

    lines: list[str] = []
    bar_rows: list[str] = []
    max_bar_row_len = 0

    # Check if any value is at max (needs overflow line for label)
    has_max_value = any(bar_h == height and bar_h > 0 for bar_h in bar_heights)
    if has_max_value:
        overflow_row = label_prefix
        for bar_h, label in zip(bar_heights, value_labels):
            if bar_h == height:
                label_str = str(label).strip('`') if label else ""
                if center_labels_on_bars and left_pad is None:
                    # Center label on bar when bars are centered
                    lbl_left_pad = computed_left_pad + (bar_width - len(label_str)) // 2
                else:
                    lbl_left_pad = computed_left_pad + (1 if center_labels_on_bars else 0)
                overflow_row += " " * lbl_left_pad + label_str + " " * (col_spacing - lbl_left_pad - len(label_str))
            else:
                overflow_row += " " * col_spacing
        lines.append(overflow_row.rstrip())

    # Y-axis and bars with value labels on top
    for level in range(height, 0, -1):
        row = "│"
        for bar_h, label in zip(bar_heights, value_labels):
            label_str = str(label).strip('`') if label else ""

            # Compute label padding
            if center_labels_on_bars and left_pad is None:
                # Center label on bar
                lbl_left_pad = computed_left_pad + (bar_width - len(label_str)) // 2
            elif center_labels_on_bars:
                lbl_left_pad = computed_left_pad + 1
            elif left_pad is None:
                # Center label in column
                lbl_left_pad = (col_spacing - len(label_str)) // 2
            else:
                lbl_left_pad = computed_left_pad

            if bar_h == 0 and level == 1:
                # Zero value - show label at level 1, no blocks
                row += " " * lbl_left_pad + label_str + " " * (col_spacing - lbl_left_pad - len(label_str))
            elif bar_h == height and level <= height:
                # Max value - blocks fill all levels (label on overflow line)
                row += " " * computed_left_pad + bar_char * bar_width + " " * (col_spacing - computed_left_pad - bar_width)
            elif bar_h > 0 and bar_h < height and level == bar_h + 1:
                # One level above top of bar (non-max) - show label
                row += " " * lbl_left_pad + label_str + " " * (col_spacing - lbl_left_pad - len(label_str))
            elif bar_h > 0 and level <= bar_h:
                # Bar level - show block
                row += " " * computed_left_pad + bar_char * bar_width + " " * (col_spacing - computed_left_pad - bar_width)
            else:
                # Empty space
                row += " " * col_spacing
        row = row.rstrip()
        max_bar_row_len = max(max_bar_row_len, len(row))
        bar_rows.append(row)

    # Axis row
    if axis_trim is None:
        # Dynamic: match widest bar row (original render_quarter_bar_chart behavior)
        # max_bar_row_len includes the │, so subtract 1 for dashes after └
        axis_dashes = max_bar_row_len - 1 if max_bar_row_len > 0 else col_spacing * len(labels)
    else:
        # Fixed trim: dashes = col_spacing * labels - axis_trim
        axis_dashes = col_spacing * len(labels) - axis_trim
    axis_row = "└" + "─" * max(0, axis_dashes)

    lines.extend(bar_rows)
    lines.append(axis_row)

    # X-axis labels row
    label_row = label_prefix
    for label in labels:
        label_str = str(label)
        label_row += label_str + " " * (col_spacing - len(label_str))
    lines.append(label_row.rstrip())

    # Delta labels row (if provided)
    if delta_labels:
        delta_row = label_prefix
        for idx, delta in enumerate(delta_labels):
            delta_str = str(delta) if delta is not None else ""
            label_len = len(str(labels[idx])) if idx < len(labels) else col_spacing
            delta_left_pad = max((label_len - len(delta_str)) // 2, 0)
            remaining = col_spacing - delta_left_pad - len(delta_str)
            if remaining < 0:
                remaining = 0
            delta_row += " " * delta_left_pad + delta_str + " " * remaining
        lines.append(delta_row.rstrip())

    return lines



def render_training_quarter_block(labels, counts, delta_labels=None, bar_width=30, bars_override=None, fill_char="■", empty_char="·"):
    """
    Render per-quarter training rows (no header/footer), aligned counts and deltas.
    counts: list of (done, elapsed) tuples.
    """
    lines = []
    max_label_len = max((len(l) for l in labels), default=0)
    count_strs = [f"({done:02d}/{elapsed:02d})" if elapsed else "(00/00)" for done, elapsed in counts] if counts else []
    max_count_len = max((len(s) for s in count_strs), default=0)

    for idx, (label, (done, elapsed)) in enumerate(zip(labels, counts)):
        if bars_override:
            bar = bars_override[idx]
            bar_len = len(bar)
        else:
            elapsed = max(elapsed, 0)
            done = max(0, min(done, elapsed))
            bar_len = round_half_up((done / elapsed) * bar_width) if elapsed > 0 else 0
            bar_len = min(bar_width, max(0, bar_len))
            bar = fill_char * bar_len + empty_char * (bar_width - bar_len)
        count_str = count_strs[idx].rjust(max_count_len) if count_strs else ""
        delta = delta_labels[idx] if delta_labels and idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""

        line = f"│ {label.ljust(max_label_len)} {bar}"
        if count_str:
            line += f" {count_str}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line.rstrip())

    return lines



def render_training_frequency_grid(
    week_ranges,
    daily_data,
    workout_count,
    stretch_count,
    days_in_period,
    workout_delta_labels=None,
    stretch_delta_labels=None,
    current_date=None,
):
    """
    Render the monthly training grid as two stacked blocks (WORKOUT, STRETCH)
    with per-week separators and deltas beneath the week labels.

    Example shape:
    ┌ WORKOUT
    │
    │ ■ · ■ ■ · ■ ■   …
    │ ─────────────   …
    │   DEC 01-07     …
    │       —         …

    ┌ STRETCH
    │
    │ · · · · · · ·   …
    │ ─────────────   …
    │   DEC 01-07     …
    │       —         …
    """
    lines = []

    workout_symbols = []
    stretch_symbols = []
    week_labels = []
    week_day_counts = []

    for start, end in week_ranges:
        week_days = list(daterange(start, end))
        week_day_counts.append(len(week_days))
        week_labels.append(format_week_label(start, end))

        for day in week_days:
            entry = daily_data.get(day, {})
            workout_symbols.append("■" if entry.get("workout") else "·")
            stretch_symbols.append("■" if entry.get("stretch") else "·")

    max_days = max(week_day_counts) if week_day_counts else 0
    week_width = max_days * 2 - 1 if max_days > 0 else 0

    def _build_symbol_row(symbols):
        row = "│ "
        idx = 0
        for pos, day_count in enumerate(week_day_counts):
            week = " ".join(symbols[idx:idx + day_count])
            row += week.ljust(week_width)
            idx += day_count
            if pos < len(week_day_counts) - 1:
                row += "   "
        return row.rstrip()

    def _build_separator_row():
        row = "│ "
        for pos in range(len(week_day_counts)):
            row += "─" * week_width
            if pos < len(week_day_counts) - 1:
                row += "   "
        return row.rstrip()

    def _build_label_row():
        row = "│ "
        for pos, label in enumerate(week_labels):
            left_pad = max((week_width - len(label)) // 2, 0)
            row += " " * left_pad + label + " " * max(week_width - left_pad - len(label), 0)
            if pos < len(week_labels) - 1:
                row += "   "
        return row.rstrip()

    def _build_delta_row(deltas, prefix="│ "):
        if not deltas:
            return None
        row = prefix
        any_label = False
        for pos in range(len(week_day_counts)):
            label_str = (deltas[pos] if pos < len(deltas) else "") or ""
            if label_str:
                any_label = True
            left_pad = max((week_width - len(label_str)) // 2, 0)
            row += " " * left_pad + label_str + " " * max(week_width - left_pad - len(label_str), 0)
            if pos < len(week_day_counts) - 1:
                row += "   "
        return row.rstrip() if any_label else None

    # Pre-compute arrow placement (shared by workout/stretch blocks)
    arrow_col = None
    if current_date:
        for w_idx, (start, end) in enumerate(week_ranges):
            if start <= current_date <= end:
                day_idx = (current_date - start).days
                day_idx = min(day_idx, max(week_day_counts[w_idx] - 1, 0))
                arrow_col = len("│ ") + w_idx * (week_width + 3) + day_idx * 2
                break

    def _build_activity_block(title, symbols, deltas):
        symbol_row = _build_symbol_row(symbols)
        separator_row = _build_separator_row()
        label_row = _build_label_row()
        delta_row = _build_delta_row(deltas, prefix="└ ")

        max_width = max(len(symbol_row), len(separator_row), len(label_row), len(delta_row) if delta_row else 0)

        block = [f"┌ {title}"]
        # Arrow line (or blank spacer) under the header
        if arrow_col is not None:
            arrow_line = [" "] * max_width
            arrow_line[0] = "│"
            if arrow_col < max_width:
                arrow_line[arrow_col] = "↓"
            block.append("".join(arrow_line).rstrip())
        else:
            block.append("│")

        block.append(symbol_row)
        block.append(separator_row)
        block.append(label_row)
        if delta_row:
            block.append(delta_row)
        return block

    lines.extend(_build_activity_block("WORKOUT", workout_symbols, workout_delta_labels))
    lines.append("")  # blank line between activity blocks
    lines.extend(_build_activity_block("STRETCH", stretch_symbols, stretch_delta_labels))

    return lines


def render_weekly_training_grid(dates, daily_data, workout_count, stretch_count, current_date=None):
    """
    Render a compact frequency grid showing workout/stretch activity for a single week.
    
    dates: list of 7 date objects (Monday-Sunday)
    daily_data: dict mapping date -> parsed daily note data
    workout_count: total number of workout days
    stretch_count: total number of stretch days
    
    Returns list of lines for the frequency grid visualization.
    
    Format:
    │ WORKOUT:  ███ ░░░ ███ ███ ░░░ ███ ███   (5/7)
    │ STRETCH:  ░░░ ███ ███ ░░░ ███ ░░░ ███   (4/7)
    │           ─── ─── ─── ─── ─── ─── ───
    │           MON TUE WED THU FRI SAT SUN
    """
    lines = []
    
    # Build workout and stretch symbols
    workout_symbols = []
    stretch_symbols = []
    
    for day in dates:
        entry = daily_data.get(day, {})
        has_workout = entry.get("workout", False)
        has_stretch = entry.get("stretch", False)
        
        workout_symbols.append("███" if has_workout else "░░░")
        stretch_symbols.append("███" if has_stretch else "░░░")
    
    prefix_workout = "│ WORKOUT:  "
    prefix_stretch = "│ STRETCH:  "

    # Build the two main rows (each day takes 4 chars: 3-char block + 1 space)
    workout_row = prefix_workout + " ".join(workout_symbols) + f"   ({workout_count}/7)"
    stretch_row = prefix_stretch + " ".join(stretch_symbols) + f"   ({stretch_count}/7)"

    # Arrow placement (only when current_date is within this week)
    arrow_line = None
    if current_date and dates[0] <= current_date <= dates[-1]:
        day_idx = (current_date - dates[0]).days
        day_idx = max(0, min(day_idx, 6))
        arrow_col = len(prefix_workout) + day_idx * 4 + 1  # center of 3-char block
        width = len(workout_row)
        if arrow_col >= width:
            width = arrow_col + 1
        arrow_chars = [" "] * width
        arrow_chars[0] = "┌"
        if arrow_col < len(arrow_chars):
            arrow_chars[arrow_col] = "↓"
        arrow_line = "".join(arrow_chars).rstrip()

    if arrow_line:
        lines.append(arrow_line)
    else:
        lines.append("┌")

    lines.append(workout_row)
    lines.append(stretch_row)

    # Build separator row (3 dashes per day)
    separator_row = "│           " + " ".join(["───"] * 7)
    lines.append(separator_row)

    # Build label row with day names (use bottom-left corner)
    label_row = "└           " + " ".join(DAYS)
    lines.append(label_row)

    return lines


def study_intensity_symbol(minutes):
    """Binary mapping: target met vs not met."""
    mins = minutes or 0
    return STUDY_SYMBOL_DEEP if mins >= STUDY_TARGET_MIN else STUDY_SYMBOL_NONE


def render_weekly_study_grid(dates, daily_data, current_date=None):
    """
    Weekly study coverage grid (single row, binary target).
    Uses training-style blocks: ███ (met), ░░░ (not met).
    """
    lines = []
    today = datetime.date.today()

    met_symbol = "███"
    none_symbol = "░░░"

    study_symbols = []
    for day in dates:
        minutes = daily_data.get(day, {}).get("study_minutes")
        if day > today:
            study_symbols.append(none_symbol)
        else:
            study_symbols.append(met_symbol if minutes and minutes >= STUDY_TARGET_MIN else none_symbol)

    study_done = sum(1 for sym in study_symbols if sym == met_symbol)
    study_total = len(dates)

    lines.append("┌ FULL STUDY DAYS")

    if current_date and dates[0] <= current_date <= dates[-1]:
        day_idx = (current_date - dates[0]).days
        day_idx = max(0, min(day_idx, len(dates) - 1))
        arrow_col = 3 + day_idx * 4  # center of 3-char block
        arrow_line = [" "] * (4 + len(study_symbols) * 4)
        arrow_line[0] = "│"
        if arrow_col < len(arrow_line):
            arrow_line[arrow_col] = "↓"
        lines.append("".join(arrow_line).rstrip())
    else:
        lines.append("│")

    lines.append("│ " + " ".join(study_symbols) + f"   ({study_done}/{study_total})")
    lines.append("│ " + " ".join(["───"] * 7))
    lines.append("└ " + " ".join(DAYS))
    lines.append("")
    lines.append(STUDY_LEGEND_LINE.replace("█", "███").replace("·", "░░░"))
    return lines


def render_monthly_study_grid(week_ranges, daily_data, current_date=None, delta_labels=None):
    """
    Monthly study coverage grid (single block, per-day symbols, per-week grouping).
    Mirrors the training monthly grid for spacing and arrow logic.
    """
    lines = []
    today = datetime.date.today()

    symbols = []
    week_labels = []
    week_day_counts = []
    total_done = 0
    total_elapsed = 0

    for start, end in week_ranges:
        week_days = list(daterange(start, end))
        week_day_counts.append(len(week_days))
        week_labels.append(format_week_label(start, end))

        for day in week_days:
            if day > today:
                symbols.append(STUDY_SYMBOL_NONE)
            else:
                symbol = study_intensity_symbol(daily_data.get(day, {}).get("study_minutes"))
                symbols.append(symbol)
                total_elapsed += 1
                if symbol == STUDY_SYMBOL_DEEP:
                    total_done += 1

    max_days = max(week_day_counts) if week_day_counts else 0
    week_width = max_days * 2 - 1 if max_days > 0 else 0

    def _build_symbol_row():
        row = "│ "
        idx = 0
        for pos, day_count in enumerate(week_day_counts):
            week = " ".join(symbols[idx:idx + day_count])
            row += week.ljust(week_width)
            idx += day_count
            if pos < len(week_day_counts) - 1:
                row += "   "
        return row.rstrip()

    def _build_separator_row():
        row = "│ "
        for pos in range(len(week_day_counts)):
            row += "─" * week_width
            if pos < len(week_day_counts) - 1:
                row += "   "
        return row.rstrip()

    def _build_label_row():
        row = "│ "
        for pos, label in enumerate(week_labels):
            left_pad = max((week_width - len(label)) // 2, 0)
            row += " " * left_pad + label + " " * max(week_width - left_pad - len(label), 0)
            if pos < len(week_labels) - 1:
                row += "   "
        return row.rstrip()

    def _build_delta_row():
        if not delta_labels:
            return None
        row = "│ "
        any_label = False
        for pos in range(len(week_day_counts)):
            label_str = (delta_labels[pos] if pos < len(delta_labels) else "") or ""
            if label_str:
                any_label = True
            left_pad = max((week_width - len(label_str)) // 2, 0)
            row += " " * left_pad + label_str + " " * max(week_width - left_pad - len(label_str), 0)
            if pos < len(week_day_counts) - 1:
                row += "   "
        return row.rstrip() if any_label else None

    arrow_col = None
    if current_date:
        for w_idx, (start, end) in enumerate(week_ranges):
            if start <= current_date <= end:
                day_idx = (current_date - start).days
                day_idx = min(day_idx, max(week_day_counts[w_idx] - 1, 0))
                arrow_col = len("│ ") + w_idx * (week_width + 3) + day_idx * 2
                break

    symbol_row = _build_symbol_row()
    separator_row = _build_separator_row()
    label_row = _build_label_row()
    delta_row = _build_delta_row()
    max_width = max(len(symbol_row), len(separator_row), len(label_row), len(delta_row) if delta_row else 0)

    header_suffix = f" ({total_done:02d}/{total_elapsed:02d})" if total_elapsed else " (00/00)"
    lines.append(f"┌ FULL STUDY DAYS{header_suffix}")
    if arrow_col is not None:
        arrow_line = [" "] * max_width
        arrow_line[0] = "│"
        if arrow_col < max_width:
            arrow_line[arrow_col] = "↓"
        lines.append("".join(arrow_line).rstrip())
    else:
        lines.append("│")

    lines.append(symbol_row)
    lines.append(separator_row)
    lines.append(label_row)
    if delta_row:
        # Match training layout: use bottom-left corner on delta row
        lines.append(delta_row.replace("│ ", "└ ", 1))
    else:
        lines.append("└")
    lines.append("")
    lines.append(STUDY_LEGEND_LINE)
    return lines


def _compress_symbols(symbols, target_width):
    """
    Compress a sequence of symbols into a fixed width by bucketing days.
    Chooses the highest-intensity symbol present in each bucket.
    """
    if target_width <= 0:
        return ""
    total = len(symbols)
    if total == 0:
        return STUDY_SYMBOL_NONE * target_width
    if total <= target_width:
        return "".join(symbols) + STUDY_SYMBOL_NONE * (target_width - total)

    # Use proportional mapping: each character covers (total / target_width) symbols
    # This ensures all characters represent actual days, no empty filler at end
    compressed = []
    for i in range(target_width):
        # Calculate which symbols fall into this bucket using float boundaries
        start_f = i * total / target_width
        end_f = (i + 1) * total / target_width
        start = int(start_f)
        end = int(end_f) if end_f == int(end_f) else int(end_f) + 1
        end = min(end, total)
        
        bucket = symbols[start:end]
        if not bucket:
            compressed.append(STUDY_SYMBOL_NONE)
            continue
        if STUDY_SYMBOL_DEEP in bucket:
            compressed.append(STUDY_SYMBOL_DEEP)
        else:
            compressed.append(STUDY_SYMBOL_NONE)
    return "".join(compressed)


def _compress_days_time_order(days, met_fn, target_width, *, allow_partial=False, fill_char="█", partial_char="░", empty_char="·", today=None):
    """
    Compress a time-ordered list of days into a fixed-width string.
    - days: list of date objects in chronological order
    - met_fn(day): returns True if the day meets the criterion
    - allow_partial: if True, use partial_char when some but not all observed days
      in the bucket meet the criterion
    - future days (day > today) are treated as not met and do not trigger partial
    """
    today = today or datetime.date.today()
    total = len(days)
    if target_width <= 0 or total == 0:
        return empty_char * max(target_width, 0)
    
    # Use proportional mapping: each character covers (total / target_width) days
    # This ensures all characters represent actual days, no empty filler at end
    symbols = []
    for i in range(target_width):
        # Calculate which days fall into this bucket using float boundaries
        start_f = i * total / target_width
        end_f = (i + 1) * total / target_width
        start = int(start_f)
        end = int(end_f) if end_f == int(end_f) else int(end_f) + 1
        end = min(end, total)
        
        bucket = days[start:end]
        if not bucket:
            symbols.append(empty_char)
            continue
        observed = [d for d in bucket if d <= today]
        if not observed:
            symbols.append(empty_char)
            continue
        hits = sum(1 for d in observed if met_fn(d))
        if hits == 0:
            symbols.append(empty_char)
        elif hits == len(observed):
            symbols.append(fill_char)
        else:
            symbols.append(partial_char if allow_partial else fill_char)
    return "".join(symbols)


def compress_activity_time_order(days, has_activity_fn, target_width, *, fill_char="■", empty_char="·", today=None):
    """
    Time-ordered compression for binary activity (workout/stretch).
    """
    return _compress_days_time_order(
        days,
        has_activity_fn,
        target_width,
        allow_partial=False,
        fill_char=fill_char,
        partial_char=fill_char,  # unused when allow_partial=False
        empty_char=empty_char,
        today=today,
    )


def render_quarterly_study_coverage(month_ranges, daily_data, today=None, delta_labels=None):
    """
    Per-month study coverage rows (intensity symbols + counts).
    Optional delta_labels mirrors training monthly deltas (per-month percent change).
    """
    today = today or datetime.date.today()
    lines = []
    bars = []
    counts = []
    max_bar_len = 0
    max_count_len = 0
    total_done = 0
    total_elapsed = 0

    for start, end in month_ranges:
        label = MONTH_ABBR[start.month - 1]
        days = list(daterange(start, end))
        bar_chars = []
        done = 0
        elapsed_days = 0
        for d in days:
            if d > today:
                bar_chars.append(STUDY_SYMBOL_NONE)
                continue
            symbol = study_intensity_symbol(daily_data.get(d, {}).get("study_minutes"))
            bar_chars.append(symbol)
            if symbol != STUDY_SYMBOL_NONE:
                done += 1
            elapsed_days += 1
        bar = "".join(bar_chars)
        bars.append((label, bar, done, elapsed_days))
        count_str = f"({done:02d}/{elapsed_days:02d})" if elapsed_days else "(00/00)"
        counts.append(count_str)
        max_bar_len = max(max_bar_len, len(bar))
        max_count_len = max(max_count_len, len(count_str))
        total_done += done
        total_elapsed += elapsed_days

    header = f"┌ FULL STUDY DAYS ({total_done:02d}/{total_elapsed:02d})" if total_elapsed else "┌ FULL STUDY DAYS (00/00)"
    lines.append(header)
    lines.append("│")

    for idx, ((label, bar, _, _), count_str) in enumerate(zip(bars, counts)):
        pad_between = (max_bar_len - len(bar)) + 1
        delta = delta_labels[idx] if delta_labels and idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""
        line = (
            f"│ {label} {bar}"
            f"{' ' * pad_between}"
            f"{count_str.rjust(max_count_len)}"
        )
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line.rstrip())
    lines.append("└")
    lines.append("")
    lines.append(STUDY_LEGEND_LINE)
    return lines


def render_yearly_study_coverage(quarter_ranges, daily_data, today=None, bar_width=30, delta_labels=None, bars_override=None, legend_line=STUDY_LEGEND_LINE):
    """
    Per-quarter study coverage rows (intensity symbols + counts).

    bar_width controls how many characters each quarter's bar occupies after
    compressing the days in that quarter. Higher values reduce quantization
    jitter while keeping the chart compact.
    delta_labels (optional) mirrors training bars: per-quarter percent-change
    strings aligned to the right of the counts.
    """
    today = today or datetime.date.today()
    lines = []
    bars = []
    counts = []
    max_bar_len = 0
    max_count_len = 0
    total_done = 0
    total_elapsed = 0

    for idx, (start, end) in enumerate(quarter_ranges):
        label = f"Q{idx + 1}"
        days = list(daterange(start, end))
        if bars_override:
            bar = bars_override[idx]
            elapsed_days = sum(1 for d in days if d <= today)
            done = sum(
                1
                for d in days
                if d <= today and study_intensity_symbol(daily_data.get(d, {}).get("study_minutes")) == STUDY_SYMBOL_DEEP
            )
        else:
            bar_chars = []
            done = 0
            elapsed_days = 0
            for d in days:
                if d > today:
                    bar_chars.append(STUDY_SYMBOL_NONE)
                    continue
                elapsed_days += 1
                symbol = study_intensity_symbol(daily_data.get(d, {}).get("study_minutes"))
                bar_chars.append(symbol)
                if symbol != STUDY_SYMBOL_NONE:
                    done += 1
            bar = _compress_symbols(bar_chars, bar_width)
        bars.append((label, bar, done, elapsed_days))
        count_str = f"({done:02d}/{elapsed_days:02d})" if elapsed_days else "(00/00)"
        counts.append(count_str)
        max_bar_len = max(max_bar_len, len(bar))
        max_count_len = max(max_count_len, len(count_str))
        total_done += done
        total_elapsed += elapsed_days

    header = f"┌ FULL STUDY DAYS ({total_done:02d}/{total_elapsed:02d})"
    lines.append(header)
    lines.append("│")

    for idx, ((label, bar, _, _), count_str) in enumerate(zip(bars, counts)):
        pad_between = (max_bar_len - len(bar)) + 1
        delta = delta_labels[idx] if delta_labels and idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""
        line = (
            f"│ {label} {bar}"
            f"{' ' * pad_between}"
            f"{count_str.rjust(max_count_len)}"
        )
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line.rstrip())
    lines.append("└")
    lines.append("")
    lines.append(STUDY_LEGEND_LINE)
    return lines
