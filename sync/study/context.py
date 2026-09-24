"""Read-only study context from Journal's canonical daily notes."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

from sync.config import PATHS
from sync.constants import STUDY_SECTION_HEADER
from sync.contracts.schedule import DayScheduleProfile
from sync.notes.markdown import extract_block
from sync.notes.markdown_tables import split_markdown_row
from sync.readers.schedule import parse_schedule_rules
from sync.readers.study import parse_study_table

_STUDY_COLUMNS = ["TIME", "ACTIVITY", "DURATION", "INTERRUPT", "BREAK"]


def _scheduled_day(day: date, profile: DayScheduleProfile) -> dict[str, object]:
    windows = []
    if not profile.is_off_day:
        start, end = profile.study_start, profile.study_end
        lunch_start, lunch_end = profile.lunch_start, profile.lunch_end
        if lunch_end <= start or lunch_start >= end:
            windows.append(
                {"start": start.strftime("%H:%M"), "end": end.strftime("%H:%M")}
            )
        else:
            if start < lunch_start:
                windows.append(
                    {
                        "start": start.strftime("%H:%M"),
                        "end": lunch_start.strftime("%H:%M"),
                    }
                )
            if lunch_end < end:
                windows.append(
                    {"start": lunch_end.strftime("%H:%M"), "end": end.strftime("%H:%M")}
                )
    return {
        "date": day.isoformat(),
        "study_windows": windows,
        "is_off_day": profile.is_off_day,
        "workout_start": None
        if profile.is_off_day
        else profile.workout_start.strftime("%H:%M"),
    }


def journal_vault() -> Path:
    """The vault that holds the Journal notes, independent of any study workspace."""
    return Path(PATHS.vault_dir)


def journal_summary(
    vault: Path, days: int = 7, today: date | None = None, *, horizon: int = 7
) -> dict[str, object]:
    """Summarize recorded focus time, preserving missing days as unknown.

    Session counts refer to displayed study rows, which may merge Flow sessions.
    The current day is a snapshot and may include an unfinished session.
    """
    if type(days) is not int or not 1 <= days <= 366:
        raise ValueError("days must be between 1 and 366")
    if type(horizon) is not int or not 1 <= horizon <= 366:
        raise ValueError("horizon must be between 1 and 366")

    end = today or date.today()
    start = end - timedelta(days=days - 1)
    journal = vault / "journal"
    minutes: defaultdict[str, float] = defaultdict(float)
    counts: Counter[str] = Counter()
    daily: dict[str, dict[str, float | int] | None] = {}
    missing_dates: list[str] = []

    for offset in range(days):
        day = (start + timedelta(days=offset)).isoformat()
        path = journal / f"{day}.md"
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except FileNotFoundError:
            daily[day] = None
            missing_dates.append(day)
            continue

        try:
            sessions = parse_study_table(lines)
            block = extract_block(lines, STUDY_SECTION_HEADER) or []
            has_table = any(
                [cell.upper() for cell in row] == _STUDY_COLUMNS
                for line in block
                if (row := split_markdown_row(line)) is not None
            )
            if not has_table and not any(
                "no study sessions" in line.lower() for line in block
            ):
                raise ValueError("Missing canonical STUDY data")
        except ValueError as exc:
            raise ValueError(f"{path}: {exc}") from exc

        for session in sessions:
            minutes[session.activity] += session.duration_minutes
            counts[session.activity] += 1
        daily[day] = {
            "study_minutes": sum(session.duration_minutes for session in sessions),
            "session_count": len(sessions),
        }

    schedule: dict[str, object] | None = None
    upcoming: list[dict[str, object]] | None = None
    protocol = journal / "PROTOCOL.md"
    try:
        protocol_lines = protocol.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        pass
    else:
        try:
            rules = parse_schedule_rules(protocol_lines)
            profile = rules.resolve_day(end)
            upcoming = [
                _scheduled_day(day, rules.resolve_day(day))
                for offset in range(horizon)
                for day in [end + timedelta(days=offset)]
            ]
        except ValueError as exc:
            raise ValueError(f"{protocol}: {exc}") from exc
        schedule = {
            "date": end.isoformat(),
            "study_start": None
            if profile.is_off_day
            else profile.study_start.strftime("%H:%M"),
            "study_end": None
            if profile.is_off_day
            else profile.study_end.strftime("%H:%M"),
            "lunch_start": None
            if profile.is_off_day
            else profile.lunch_start.strftime("%H:%M"),
            "lunch_end": None
            if profile.is_off_day
            else profile.lunch_end.strftime("%H:%M"),
            "is_off_day": profile.is_off_day,
        }

    available = days - len(missing_dates)
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "available_day_count": available,
        "missing_day_count": len(missing_dates),
        "missing_dates": missing_dates,
        "total_study_minutes": sum(minutes.values()) if available else None,
        "by_activity": {
            activity: {
                "study_minutes": minutes[activity],
                "session_count": counts[activity],
            }
            for activity in sorted(minutes)
        },
        "daily": daily,
        "session_count_semantics": "displayed study rows; Flow sessions may be merged",
        "schedule": schedule,
        "upcoming_schedule": upcoming,
        "schedule_semantics": "scheduled study windows excluding lunch, not confirmed free time; today is not reduced by elapsed time or recorded study",
    }
