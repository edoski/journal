"""Study table parsing for the journal sync system."""

from __future__ import annotations

import re

from sync.models import StudySession
from .common import extract_block, parse_duration_to_minutes

_CANONICAL_STUDY_HEADER_RE = re.compile(
    r"^\|\s*TIME\s*\|\s*ACTIVITY\s*\|\s*DURATION\s*\|\s*INTERRUPT\s*\|\s*BREAK\s*\|\s*CONTEXT\s*\|\s*NOTES\s*\|$",
    re.IGNORECASE,
)

_NON_CANONICAL_STUDY_PREFIX_RE = re.compile(
    r"^\|\s*TIME\s*\|\s*ACTIVITY\s*\|\s*(FOCUS|DURATION)\s*\|\s*(PAUSE|INTERRUPT)\s*\|\s*BREAK\s*\|",
    re.IGNORECASE,
)


def parse_study_table(lines: list[str]) -> list[StudySession]:
    """Parse the canonical STUDY table from daily note lines."""
    block = extract_block(lines, "### **STUDY**")
    if not block:
        return []

    header_idx = -1
    for i, line in enumerate(block):
        stripped = line.strip()
        if _CANONICAL_STUDY_HEADER_RE.match(stripped):
            header_idx = i
            break
        if _NON_CANONICAL_STUDY_PREFIX_RE.match(stripped):
            raise ValueError(
                "Non-canonical STUDY table header. Expected "
                "'| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |'"
            )

    if header_idx == -1:
        return []

    sessions: list[StudySession] = []
    for line in block[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        if re.search(r"no study sessions", line, re.IGNORECASE):
            continue

        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 9:
            raise ValueError(
                "Invalid STUDY row: expected TIME/ACTIVITY/DURATION/"
                "INTERRUPT/BREAK/CONTEXT/NOTES columns"
            )

        time_raw = parts[1].strip("`").strip()
        start_time = ""
        end_time: str | None = None
        time_match = re.match(r"^(\d{2}:\d{2})(?:\s*-\s*(\d{2}:\d{2}))?$", time_raw)
        if time_match:
            start_time = time_match.group(1)
            end_time = time_match.group(2)

        activity = parts[2].strip("`")
        duration_min = parse_duration_to_minutes(parts[3]) or 0.0

        interrupt_min = 0.0
        interrupt_str = parts[4].strip("`").strip()
        interrupt_match = re.search(r"\+(\d+)m", interrupt_str)
        if interrupt_match:
            interrupt_min = float(interrupt_match.group(1))
        interrupt_match_h = re.search(r"\+(\d+)h(\d+)?m?", interrupt_str)
        if interrupt_match_h:
            hours = float(interrupt_match_h.group(1))
            minutes = float(interrupt_match_h.group(2) or 0)
            interrupt_min = hours * 60 + minutes

        break_str = parts[5].strip("`").strip()
        break_min = parse_duration_to_minutes(break_str.split("(", 1)[0].strip()) or 0.0
        overrun_min = 0.0
        overrun_match = re.search(r"\(\+([^)]+)\)", break_str)
        if overrun_match:
            overrun_min = parse_duration_to_minutes(overrun_match.group(1)) or 0.0

        context = parts[6].strip()
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
