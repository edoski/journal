"""
Note file I/O and manipulation utilities for the journal sync system.

Provides functions for parsing daily notes, managing file locks,
finding/manipulating markdown sections, and updating note content.
"""

from __future__ import annotations

import fcntl
import hashlib
import os
import random
import re
import time
from contextlib import contextmanager

from .constants import LOCK_DIR
from sync.readers.frontmatter import parse_frontmatter


def _normalize_header(line: str) -> str:
    """Normalize markdown headers for matching, ignoring emphasis markers."""
    import re

    stripped = line.strip()
    cleaned = re.sub(r"\*+", "", stripped)
    cleaned = re.sub(r"_+", "", cleaned)
    return cleaned.lower()


def _parse_duration_to_minutes(val) -> float | None:
    """Parse duration string to minutes."""
    import re

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
    return hours * 60 + minutes + (seconds / 60)


def _parse_bool(val) -> bool:
    """Parse a value as boolean."""
    if isinstance(val, bool):
        return val
    if val is None:
        return False
    return str(val).strip().lower() == "true"


def _find_subheader_idx(
    lines: list[str], title: str, start: int = 0, end: int | None = None, level: int = 3
) -> int:
    """Find index of a subheader between start and end."""
    end = end if end is not None else len(lines)
    needle = _normalize_header(f"{'#' * level} {title}")
    for idx in range(start, end):
        if _normalize_header(lines[idx]) == needle:
            return idx
    return -1


def _lockfile_for(path: str) -> str:
    """Return path to advisory lockfile for a given note."""
    os.makedirs(LOCK_DIR, exist_ok=True)
    digest = hashlib.sha1(os.path.abspath(path).encode()).hexdigest()
    return os.path.join(LOCK_DIR, f"{digest}.lock")


def _cleanup_old_locks(max_age_days: int = 30) -> None:
    """Remove lock files older than max_age_days."""
    if not os.path.isdir(LOCK_DIR):
        return
    cutoff = time.time() - (max_age_days * 86400)
    try:
        for fname in os.listdir(LOCK_DIR):
            if not fname.endswith(".lock"):
                continue
            fpath = os.path.join(LOCK_DIR, fname)
            try:
                if os.path.getmtime(fpath) < cutoff:
                    os.remove(fpath)
            except OSError:
                pass  # File may have been removed by another process
    except OSError:
        pass  # Directory listing failed


@contextmanager
def locked_note(path: str, timeout: float = 2.0, poll: float = 0.1):
    """
    Serialize writes to a note by taking an advisory lock stored in ~/.cache.

    - Uses fcntl.flock (works on macOS) with non-blocking attempts.
    - Waits up to `timeout` seconds, polling every `poll` seconds.
    - Raises TimeoutError if the lock cannot be acquired in time.
    - Automatically cleans up old lock files (~1% of calls).
    """
    # Run cleanup ~1% of the time to avoid overhead
    if random.random() < 0.01:
        _cleanup_old_locks(30)

    lock_path = _lockfile_for(path)
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR)
    deadline = time.time() + timeout
    try:
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.time() >= deadline:
                    raise TimeoutError(f"Could not lock {path} within {timeout}s.")
                time.sleep(poll)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def find_header_idx(
    lines: list[str], title: str, level: int = 2, start: int = 0
) -> int:
    """Find the index of a markdown header like ## Title or ### Title.

    Returns -1 when not found. Matching is case-insensitive and ignores extra
    emphasis markers (handled via _normalize_header).
    """
    needle = _normalize_header(f"{'#' * level} {title}")
    for idx in range(start, len(lines)):
        if _normalize_header(lines[idx]) == needle:
            return idx
    return -1


def section_bounds(
    lines: list[str], header_idx: int, level: int = 2
) -> tuple[int, int]:
    """Return (start, end) indices for a header block delimited by same-level headers."""
    if header_idx == -1:
        return -1, -1
    end_idx = len(lines)
    header_prefix = "#" * level + " "
    for idx in range(header_idx + 1, len(lines)):
        if lines[idx].strip().startswith(header_prefix) and _normalize_header(
            lines[idx]
        ) != _normalize_header(lines[header_idx]):
            end_idx = idx
            break
    return header_idx, end_idx


def subsection_bounds(
    lines: list[str], subheader_idx: int, parent_end_idx: int
) -> tuple[int, int]:
    """Return (start, end) indices for a ### subsection up to next ### or parent end."""
    if subheader_idx == -1:
        return -1, -1
    end_idx = parent_end_idx
    for idx in range(subheader_idx + 1, parent_end_idx):
        if lines[idx].strip().startswith("### ") and _normalize_header(
            lines[idx]
        ) != _normalize_header(lines[subheader_idx]):
            end_idx = idx
            break
    return subheader_idx, end_idx


def extract_block(lines: list[str], header: str) -> list[str] | None:
    """Extract lines belonging to a markdown header section."""
    header_norm = _normalize_header(header)
    start = -1
    for idx, line in enumerate(lines):
        if _normalize_header(line) == header_norm:
            start = idx
            break
    if start == -1:
        return None
    level = len(header.split()[0]) if header.startswith("#") else 3
    end = len(lines)
    for idx in range(start + 1, len(lines)):
        stripped = lines[idx].strip()
        if (
            stripped.startswith("#" * level + " ")
            and _normalize_header(stripped) != header_norm
        ):
            end = idx
            break
    return lines[start:end]


def ensure_section_with_divider(
    lines: list[str],
    title: str,
    level: int = 2,
    insert_pos: int | None = None,
    create_if_missing: bool = True,
) -> tuple[int, int]:
    """Ensure a header exists and is immediately followed by a divider line.

    Returns (header_idx, divider_idx). If the header is absent and
    create_if_missing is False, returns (-1, -1).
    """
    header_idx = find_header_idx(lines, title, level=level)
    if header_idx == -1:
        if not create_if_missing:
            return -1, -1
        pos = insert_pos if insert_pos is not None else len(lines)
        if pos > 0 and lines[pos - 1].strip() != "":
            lines.insert(pos, "")
            pos += 1
        lines.insert(pos, f"{'#' * level} {title}")
        header_idx = pos
        lines.insert(header_idx + 1, "---")
        return header_idx, header_idx + 1

    # Header exists – make sure a divider follows it
    divider_idx = header_idx + 1
    if divider_idx >= len(lines) or lines[divider_idx].strip() != "---":
        lines.insert(divider_idx, "---")

    return header_idx, divider_idx


def goals_section_bounds(lines: list[str]) -> tuple[int, int]:
    """Return (start, end) indices for the ## Goals section."""
    goals_idx = find_header_idx(lines, "Goals", level=2)
    if goals_idx == -1:
        return -1, -1
    _, end = section_bounds(lines, goals_idx, level=2)
    return goals_idx, end


def extract_subsection_tasks(
    lines: list[str], parent_start: int, parent_end: int, sub_title: str
) -> list[dict]:
    """Extract checkbox tasks from a ### subsection within a parent block."""
    from sync.readers.goals import parse_goal_tasks

    sub_idx = _find_subheader_idx(
        lines, sub_title, start=parent_start, end=parent_end, level=3
    )
    if sub_idx == -1:
        return []
    sub_start, sub_end = subsection_bounds(lines, sub_idx, parent_end)
    body_start = sub_idx + 1
    while body_start < sub_end and lines[body_start].strip() == "":
        body_start += 1
    tasks = parse_goal_tasks(lines[body_start:sub_end])
    return tasks


def trim_blank_lines(lines: list[str]) -> list[str]:
    """Remove leading and trailing blank lines from a list."""
    while lines and lines[0].strip() == "":
        lines = lines[1:]
    while lines and lines[-1].strip() == "":
        lines = lines[:-1]
    return lines


def join_sections(sections: list[list[str]]) -> list[str]:
    """Join multiple line-blocks with a single blank line between non-empty blocks."""
    result = []
    for sec in sections:
        if not sec:
            continue
        if result and result[-1].strip() != "":
            result.append("")
        result.extend(sec)
    return result


def parse_study_table(lines: list[str]) -> list[tuple]:
    """Parse the STUDY table from daily note lines."""
    block = extract_block(lines, "### **STUDY**")
    if not block:
        return []
    header_idx = -1
    for i, line in enumerate(block):
        if re.search(
            r"\|\s*TIME\s*\|\s*ACTIVITY\s*\|\s*(DURATION|FOCUS)\s*\|",
            line,
            re.IGNORECASE,
        ):
            header_idx = i
            break
    if header_idx == -1:
        return []
    rows = []
    for line in block[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        if re.search(r"no study sessions", line, re.IGNORECASE):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 6:
            continue
        activity = parts[2].strip("`")
        duration_min = _parse_duration_to_minutes(parts[3])

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
                planned_break_min = _parse_duration_to_minutes(planned_str) or 0
            overrun_match = re.search(r"\(\+([^)]+)\)", break_str)
            if overrun_match:
                overrun_str = overrun_match.group(1)
                overrun_min = _parse_duration_to_minutes(overrun_str) or 0

        if activity and duration_min:
            rows.append(
                (activity, duration_min, interrupt_min, overrun_min, planned_break_min)
            )
    return rows


def parse_sleep_table(lines: list[str]) -> list[tuple]:
    """Parse the SLEEP table from daily note lines."""
    block = extract_block(lines, "### **SLEEP**")
    if not block:
        return []
    header_idx = -1
    for i, line in enumerate(block):
        if re.search(
            r"\|\s*TIME\s*\|\s*DURATION\s*\|\s*AWAKE\s*\|\s*AWAKENINGS\s*\|",
            line,
            re.IGNORECASE,
        ):
            header_idx = i
            break
    if header_idx == -1:
        return []
    rows = []
    for line in block[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 5:
            continue
        duration_min = _parse_duration_to_minutes(parts[2])
        awake_min = _parse_duration_to_minutes(parts[3])
        awakenings = None
        if parts[4]:
            try:
                awakenings = int(re.sub(r"[^0-9]", "", parts[4]))
            except Exception:
                awakenings = None
        rows.append((duration_min, awake_min, awakenings))
    return rows


def parse_daily_note(path: str) -> dict | None:
    """Parse a daily note file and return extracted metrics."""
    try:
        text = open(path, "r").read()
    except Exception:
        return None
    lines = text.splitlines()
    fm = parse_frontmatter(lines)

    study_rows = parse_study_table(lines)
    sleep_rows = parse_sleep_table(lines)

    # Sleep still uses frontmatter if available (user may adjust for naps, etc.)
    sleep_from_fm = _parse_duration_to_minutes(fm.get("sleep"))
    sleep_total = (
        sleep_from_fm
        if sleep_from_fm is not None
        else sum((r[0] or 0 for r in sleep_rows), 0)
    )

    mood_val = None
    if fm.get("mood") not in (None, ""):
        try:
            mood_val = float(re.sub(r"[^0-9.\-]", "", fm.get("mood")))
        except Exception:
            mood_val = None

    workout = _parse_bool(fm.get("workout"))
    stretch = _parse_bool(fm.get("stretch"))

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


def ensure_note(path: str, template_path: str) -> None:
    """Ensure a note file exists, creating from template if needed."""
    if os.path.exists(path):
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if template_path and os.path.exists(template_path):
        with open(template_path, "r") as tf:
            content = tf.read()
        with open(path, "w") as f:
            f.write(content)


def replace_metrics_block(lines: list[str], new_block_lines: list[str]) -> list[str]:
    """Replace the ## Metrics section content with new lines."""
    metrics_idx = None
    for idx, line in enumerate(lines):
        if line.strip().lower() == "## metrics":
            metrics_idx = idx
            break
    if metrics_idx is None:
        return lines

    end_idx = len(lines)
    for idx in range(metrics_idx + 1, len(lines)):
        if (
            lines[idx].strip().startswith("## ")
            and lines[idx].strip().lower() != "## metrics"
        ):
            end_idx = idx
            break

    new_lines = lines[: metrics_idx + 1]
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
