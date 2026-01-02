"""
Study table parsing for the journal sync system.
"""

from __future__ import annotations

import re

from sync.models import StudySession


def _parse_duration_to_minutes(val: str | int | float | None) -> float | None:
    """Parse duration string (e.g., '1h30m', '90m', '1m30s') to minutes."""
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


def _normalize_header(line: str) -> str:
    """Normalize markdown headers for matching, ignoring emphasis markers."""
    stripped = line.strip()
    cleaned = re.sub(r"\*+", "", stripped)
    cleaned = re.sub(r"_+", "", cleaned)
    return cleaned.lower()


def _extract_block(lines: list[str], header: str) -> list[str] | None:
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


def parse_study_table(lines: list[str]) -> list[StudySession]:
    """
    Parse the STUDY table from daily note lines.

    Args:
        lines: All lines from a daily note

    Returns:
        List of StudySession dataclasses
    """
    block = _extract_block(lines, "### **STUDY**")
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

    sessions: list[StudySession] = []
    for line in block[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        if re.search(r"no study sessions", line, re.IGNORECASE):
            continue

        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 6:
            continue

        # Parse TIME column (e.g., "09:00 - 11:30" or "09:00")
        time_raw = parts[1].strip("`").strip()
        start_time = ""
        end_time: str | None = None
        time_match = re.match(r"^(\d{2}:\d{2})(?:\s*-\s*(\d{2}:\d{2}))?$", time_raw)
        if time_match:
            start_time = time_match.group(1)
            end_time = time_match.group(2)

        activity = parts[2].strip("`")
        duration_min = _parse_duration_to_minutes(parts[3]) or 0.0

        # Parse interrupt minutes from INTERRUPT column (format: `+XXm`)
        interrupt_min = 0.0
        if len(parts) > 4:
            interrupt_str = parts[4].strip("`").strip()
            interrupt_match = re.search(r"\+(\d+)m", interrupt_str)
            if interrupt_match:
                interrupt_min = float(interrupt_match.group(1))
            # Also handle hours+minutes format like +1h30m
            interrupt_match_h = re.search(r"\+(\d+)h(\d+)?m?", interrupt_str)
            if interrupt_match_h:
                h = float(interrupt_match_h.group(1))
                m = float(interrupt_match_h.group(2) or 0)
                interrupt_min = h * 60 + m

        # Parse break and overrun from BREAK column (format: `5m (+15m)`)
        break_min = 0.0
        overrun_min = 0.0
        if len(parts) > 5:
            break_str = parts[5].strip("`").strip()
            if break_str:
                planned_str = break_str.split("(", 1)[0].strip()
                break_min = _parse_duration_to_minutes(planned_str) or 0.0
            overrun_match = re.search(r"\(\+([^)]+)\)", break_str)
            if overrun_match:
                overrun_str = overrun_match.group(1)
                overrun_min = _parse_duration_to_minutes(overrun_str) or 0.0

        # Parse CONTEXT column (wikilinks)
        context = ""
        if len(parts) > 6:
            context = parts[6].strip()

        # Parse NOTES column
        notes = ""
        if len(parts) > 7:
            notes = parts[7].strip()

        if activity and duration_min:
            sessions.append(
                StudySession(
                    start_time=start_time,
                    end_time=end_time,
                    activity=activity,
                    duration_minutes=duration_min,
                    interrupt_minutes=interrupt_min,
                    break_minutes=break_min,
                    overrun_minutes=overrun_min,
                    context=context,
                    notes=notes,
                )
            )

    return sessions
