"""Session deduplication and break/lunch enrichment logic."""

from __future__ import annotations

import datetime
from collections.abc import Mapping

from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.study import StudySessionRecord
from sync.log import get_logger
from sync.study.breaks import (
    anchor_lunch_window,
    clamp_next_study_within_day,
    compute_dynamic_lunch_window,
    get_expected_break_minutes,
    overlap_minutes_with_window,
)
from sync.study.constants import (
    BREAK_LINK_MAX_GAP_SECONDS,
    FLOW_BREAK_PHASES,
    FLOW_PHASE_STUDY,
)

logger = get_logger(__name__)


def select_linked_break(
    break_sessions: list[StudySessionRecord],
    *,
    session_end: datetime.datetime,
    next_study_start: datetime.datetime | None,
) -> StudySessionRecord | None:
    """Choose the nearest relevant break row for a study session."""
    candidates: list[StudySessionRecord] = []
    for break_session in break_sessions:
        break_start = break_session["start"]
        gap_seconds = (break_start - session_end).total_seconds()
        if gap_seconds < 0:
            continue
        if gap_seconds > BREAK_LINK_MAX_GAP_SECONDS:
            break
        if next_study_start and break_start >= next_study_start:
            break
        if next_study_start and not break_session.get("completed_at"):
            continue
        candidates.append(break_session)

    if not candidates:
        return None
    for candidate in candidates:
        if candidate.get("completed_at"):
            return candidate
    return candidates[0]


def dedupe_sessions(
    sessions: list[StudySessionRecord],
    start_tolerance_seconds: int = 60,
) -> list[StudySessionRecord]:
    """Deduplicate sessions that represent the same work block."""

    def same_group(a: StudySessionRecord, b: StudySessionRecord) -> bool:
        if a["phase"] != b["phase"]:
            return False
        if (a["title"] or "").strip() != (b["title"] or "").strip():
            return False
        return abs((a["start"] - b["start"]).total_seconds()) <= start_tolerance_seconds

    groups: list[list[StudySessionRecord]] = []
    for session in sorted(sessions, key=lambda item: item["start"]):
        for group in groups:
            if same_group(group[0], session):
                group.append(session)
                break
        else:
            groups.append([session])

    merged: list[StudySessionRecord] = []
    for group in groups:

        def score(entry: StudySessionRecord) -> tuple[int, float, float, float]:
            completed = 1 if entry.get("completed_at") else 0
            actual = entry.get("actual_elapsed", 0) or 0
            end_ts = entry["end"].timestamp() if entry.get("end") else 0
            planned = entry.get("planned_duration", 0) or 0
            return completed, actual, end_ts, planned

        canonical = max(group, key=score)
        starts = [entry["start"] for entry in group if entry.get("start")]
        completed_entries = [entry for entry in group if entry.get("completed_at")]
        end_candidates = [
            entry["end"] for entry in (completed_entries or group) if entry.get("end")
        ]
        if completed_entries:
            completed_starts = [
                entry["start"] for entry in completed_entries if entry.get("start")
            ]
            merged_start = (
                min(completed_starts) if completed_starts else canonical["start"]
            )
        else:
            merged_start = min(starts) if starts else canonical["start"]

        merged_end = max(end_candidates) if end_candidates else canonical["end"]
        merged_entry = canonical.copy()
        merged_entry["start"] = merged_start
        merged_entry["end"] = merged_end
        merged_pks = [
            pk
            for entry in group
            for pk in entry.get("pks", [entry.get("pk")])
            if isinstance(pk, int)
        ]
        merged_entry["pks"] = sorted(set(merged_pks))
        merged_entry["interrupt_pks"] = (
            sorted(
                {
                    pk
                    for entry in completed_entries
                    for pk in entry.get("pks", [entry.get("pk")])
                    if isinstance(pk, int)
                }
            )
            if completed_entries
            else merged_entry["pks"]
        )
        merged_entry["pk"] = (
            merged_entry["pks"][0] if merged_entry["pks"] else canonical["pk"]
        )
        merged_entry["planned_duration"] = max(
            entry.get("planned_duration", 0) or 0 for entry in group
        )
        merged_entry["duration"] = merged_entry["planned_duration"]
        merged_entry["is_open"] = not bool(completed_entries)
        if merged_entry.get("end") and merged_entry.get("start"):
            merged_entry["actual_elapsed"] = max(
                0,
                (merged_entry["end"] - merged_entry["start"]).total_seconds() / 60,
            )
        merged.append(merged_entry)

    return merged


def enrich_sessions(
    all_sessions: list[StudySessionRecord],
    *,
    day: datetime.date,
    day_schedule: DayScheduleProfile,
    interruption_totals: Mapping[int, tuple[int, float]],
    now: datetime.datetime,
    break_defaults: dict[str, int | None],
) -> list[StudySessionRecord]:
    """Apply interruption, break, lunch, and overrun enrichment to raw sessions."""
    study_sessions = [
        session for session in all_sessions if session["phase"] == FLOW_PHASE_STUDY
    ]
    break_sessions = [
        session for session in all_sessions if session["phase"] in FLOW_BREAK_PHASES
    ]

    study_sessions = dedupe_sessions(study_sessions)
    study_sessions.sort(key=lambda item: item["start"])

    break_sessions = dedupe_sessions(break_sessions)
    for break_session in break_sessions:
        completed_dt = (
            break_session["completed_at"] if break_session.get("completed_at") else None
        )
        end_dt = completed_dt or max(now, break_session["start"])
        break_session["actual_duration"] = max(
            0,
            (end_dt - break_session["start"]).total_seconds() / 60,
        )
        break_session["planned_duration"] = (
            break_session.get("planned_duration") or break_session.get("duration") or 0
        )
    break_sessions.sort(key=lambda item: item["start"])

    lunch_window = compute_dynamic_lunch_window(
        study_sessions,
        (day_schedule.lunch_start, day_schedule.lunch_end),
        reference_date=day,
    )
    lunch_duration_minutes = _lunch_duration_minutes(day, lunch_window)

    for idx, session in enumerate(study_sessions):
        next_study_start = (
            study_sessions[idx + 1]["start"] if idx + 1 < len(study_sessions) else None
        )
        session_pks = (
            session.get("interrupt_pks") or session.get("pks") or [session["pk"]]
        )
        totals = [interruption_totals.get(pk, (0, 0.0)) for pk in session_pks]
        total_count = sum(count for count, _duration in totals)
        total_duration = sum(duration for _count, duration in totals)
        session["interruptions_count"] = total_count
        session["interruptions_duration"] = total_duration

        best_break = select_linked_break(
            break_sessions,
            session_end=session["end"],
            next_study_start=next_study_start,
        )

        anchored = anchor_lunch_window(session["end"], lunch_window)
        if anchored:
            session["anchored_lunch_window"] = anchored
            session["break_expected"] = lunch_duration_minutes or 60
            session["break_duration"] = session["break_expected"]
            session["break_missing"] = False
            session["break_reason"] = "lunch"
            if best_break:
                session["linked_break_start"] = best_break["start"]
        elif best_break:
            session["break_expected"] = get_expected_break_minutes(
                best_break,
                break_defaults,
            )
            session["break_duration"] = session["break_expected"]
            session["linked_break_start"] = best_break["start"]
            session["break_missing"] = False
            session["break_reason"] = None
            session["anchored_lunch_window"] = None
        else:
            session["anchored_lunch_window"] = None
            session["break_expected"] = get_expected_break_minutes(None, break_defaults)
            session["break_duration"] = session["break_expected"]
            session["break_missing"] = True
            session["break_reason"] = None

        if next_study_start is None:
            session["break_overrun"] = 0
        else:
            effective_lunch_window = (
                session.get("anchored_lunch_window") or lunch_window
            )
            lunch_overlap = overlap_minutes_with_window(
                session["end"],
                next_study_start,
                effective_lunch_window,
            )
            if session.get("break_reason") == "lunch" and lunch_overlap < 30:
                session["break_reason"] = None
                session["anchored_lunch_window"] = None
                effective_lunch_window = lunch_window
                lunch_overlap = overlap_minutes_with_window(
                    session["end"],
                    next_study_start,
                    effective_lunch_window,
                )

            actual_break_minutes = (
                next_study_start - session["end"]
            ).total_seconds() / 60
            if actual_break_minutes < session.get("break_expected", 0):
                session["break_expected"] = max(0, int(actual_break_minutes + 0.5))
                session["break_duration"] = session["break_expected"]
            effective_next_start = clamp_next_study_within_day(
                session["end"],
                next_study_start,
                day_schedule.study_end,
            )
            if not effective_next_start or effective_next_start <= session["end"]:
                session["break_overrun"] = 0
            else:
                gap_minutes = (
                    effective_next_start - session["end"]
                ).total_seconds() / 60
                lunch_overlap = overlap_minutes_with_window(
                    session["end"],
                    effective_next_start,
                    effective_lunch_window,
                )
                expected_break = session.get(
                    "break_expected",
                    get_expected_break_minutes(best_break, break_defaults),
                )
                expected_excl_lunch = max(0.0, expected_break - lunch_overlap)
                overrun_minutes = max(
                    0.0,
                    gap_minutes - lunch_overlap - expected_excl_lunch,
                )
                session["break_overrun"] = int(overrun_minutes + 0.5)

    _apply_retroactive_lunch_detection(
        study_sessions,
        day=day,
        day_schedule=day_schedule,
        lunch_window=lunch_window,
        lunch_duration_minutes=lunch_duration_minutes,
    )
    return study_sessions


def _lunch_duration_minutes(
    day: datetime.date,
    lunch_window: tuple[datetime.time, datetime.time] | None,
) -> int:
    if not lunch_window:
        return 0
    try:
        lunch_start_t, lunch_end_t = lunch_window
        lunch_start_dt = datetime.datetime.combine(day, lunch_start_t)
        lunch_end_dt = datetime.datetime.combine(day, lunch_end_t)
        if lunch_end_dt <= lunch_start_dt:
            lunch_end_dt += datetime.timedelta(days=1)
        return int(round((lunch_end_dt - lunch_start_dt).total_seconds() / 60.0))
    except (TypeError, ValueError) as exc:
        logger.debug("Failed to parse lunch window: %s", exc)
        return 0


def _apply_retroactive_lunch_detection(
    study_sessions: list[StudySessionRecord],
    *,
    day: datetime.date,
    day_schedule: DayScheduleProfile,
    lunch_window: tuple[datetime.time, datetime.time] | None,
    lunch_duration_minutes: int,
) -> None:
    if not lunch_window:
        return

    lunch_end_dt = datetime.datetime.combine(day, lunch_window[1])
    for idx in range(1, len(study_sessions)):
        current = study_sessions[idx]
        previous = study_sessions[idx - 1]
        if previous.get("break_reason") == "lunch":
            continue
        if current["start"] <= lunch_end_dt:
            continue

        gap_overlap = overlap_minutes_with_window(
            previous["end"],
            current["start"],
            lunch_window,
        )
        if gap_overlap < 30:
            continue

        previous["break_expected"] = lunch_duration_minutes or 60
        previous["break_duration"] = previous["break_expected"]
        previous["break_reason"] = "lunch"
        previous["break_missing"] = False
        effective_next_start = clamp_next_study_within_day(
            previous["end"],
            current["start"],
            day_schedule.study_end,
        )
        if effective_next_start and effective_next_start > previous["end"]:
            gap_minutes = (effective_next_start - previous["end"]).total_seconds() / 60
            previous["break_overrun"] = max(
                0,
                int(gap_minutes - previous["break_expected"] + 0.5),
            )
