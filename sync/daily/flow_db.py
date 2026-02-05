"""
Flow database access and session fetching for daily sync.

Provides functions to connect to the Flow CoreData database, convert
timestamps, fetch today's sessions, and deduplicate overlapping entries.
"""

from __future__ import annotations

import datetime
import os
import subprocess
import sqlite3
from typing import Any

from sync.logging import get_logger

from .constants import (
    DB_PATH,
    CORE_DATA_EPOCH_OFFSET,
    BREAK_LINK_MAX_GAP_SECONDS,
    LUNCH_WINDOW_BASE,
    REGULAR_DAY_END,
)
from .breaks import (
    get_expected_break_minutes,
    _compute_dynamic_lunch_window,
    overlap_minutes_with_window,
    clamp_next_flow_within_day,
    anchor_lunch_window,
)

logger = get_logger()


# Type aliases for clarity
SessionDict = dict[str, Any]


def _read_break_defaults() -> dict[str, int | None]:
    """
    Read Flow's configured break lengths.
    Returns a dict with keys 'shortBreak' and 'longBreak' (ints or None).
    """
    result: dict[str, int | None] = {"shortBreak": None, "longBreak": None}
    for key in ("longBreak", "shortBreak"):
        try:
            out = subprocess.check_output(
                ["defaults", "read", "design.yugen.Flow", f"{key}.durationInMinutes"],
                text=True,
            )
            val = int(out.strip())
            if val > 0:
                result[key] = val
        except (subprocess.CalledProcessError, ValueError, FileNotFoundError):
            # Expected: defaults not set or command unavailable
            continue
        except (PermissionError, OSError) as e:
            logger.warning("Failed to read Flow defaults for %s: %s", key, e)
            continue
    return result


# Module-level cache of break defaults (read once at import time)
BREAK_DEFAULTS = _read_break_defaults()


def get_db_connection() -> sqlite3.Connection:
    """Get a read-only connection to the Flow database."""
    if not os.path.exists(DB_PATH):
        logger.error("Database not found at %s", DB_PATH)
        raise FileNotFoundError(f"Flow database not found at {DB_PATH}")
    # Open in read-only mode to avoid locking
    return sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)


def core_data_to_datetime(timestamp: float | None) -> datetime.datetime | None:
    """Convert a CoreData timestamp to a Python datetime."""
    if timestamp is None:
        return None
    return datetime.datetime.fromtimestamp(timestamp + CORE_DATA_EPOCH_OFFSET)


def dedupe_sessions(
    sessions: list[SessionDict],
    start_tolerance_seconds: int = 60,
) -> list[SessionDict]:
    """
    Deduplicate sessions that represent the same work block.

    Flow can emit twin rows for the same block (paused/resumed or stuck timers).
    Group by phase/title within the tolerance and clamp the merged end to
    completed rows if any exist so open twins cannot stretch to "now".

    Args:
        sessions: List of session dictionaries to deduplicate
        start_tolerance_seconds: Max seconds between starts to consider same session

    Returns:
        Deduplicated list of sessions with merged metadata
    """

    def same_group(a: SessionDict, b: SessionDict) -> bool:
        if a["phase"] != b["phase"]:
            return False
        if (a["title"] or "").strip() != (b["title"] or "").strip():
            return False
        return abs((a["start"] - b["start"]).total_seconds()) <= start_tolerance_seconds

    groups: list[list[SessionDict]] = []
    for s in sorted(sessions, key=lambda x: x["start"]):
        placed = False
        for grp in groups:
            if same_group(grp[0], s):
                grp.append(s)
                placed = True
                break
        if not placed:
            groups.append([s])

    merged: list[SessionDict] = []
    for grp in groups:

        def score(entry: SessionDict) -> tuple:
            completed = 1 if entry.get("completed_at") else 0
            actual = entry.get("actual_elapsed", 0) or 0
            end_ts = entry["end"].timestamp() if entry.get("end") else 0
            planned = entry.get("planned_duration", 0) or 0
            return (completed, actual, end_ts, planned)

        canonical = max(grp, key=score)

        starts = [g["start"] for g in grp if g.get("start")]
        completed_entries = [g for g in grp if g.get("completed_at")]
        if completed_entries:
            end_candidates = [g["end"] for g in completed_entries if g.get("end")]
        else:
            end_candidates = [g["end"] for g in grp if g.get("end")]

        # If a completed twin exists, anchor the start to the earliest
        # completed row so cancelled/aborted open twins don't pull the
        # block earlier than the session the user actually finished.
        if completed_entries:
            completed_starts = [g["start"] for g in completed_entries if g.get("start")]
            merged_start = (
                min(completed_starts) if completed_starts else canonical.get("start")
            )
        else:
            merged_start = min(starts) if starts else canonical.get("start")

        merged_end = max(end_candidates) if end_candidates else canonical.get("end")

        merged_entry = canonical.copy()
        merged_entry["start"] = merged_start
        merged_entry["end"] = merged_end
        merged_entry["pks"] = sorted(
            set(sum([g.get("pks", [g.get("pk")]) for g in grp], []))
        )
        # Interruptions should come from the anchored (completed) twin when present
        if completed_entries:
            merged_entry["interrupt_pks"] = sorted(
                set(sum([g.get("pks", [g.get("pk")]) for g in completed_entries], []))
            )
        else:
            merged_entry["interrupt_pks"] = merged_entry["pks"]

        merged_entry["pk"] = (
            merged_entry["pks"][0] if merged_entry["pks"] else canonical.get("pk")
        )
        merged_entry["planned_duration"] = max(
            g.get("planned_duration", 0) or 0 for g in grp
        )
        merged_entry["duration"] = merged_entry["planned_duration"]
        merged_entry["is_open"] = not bool(completed_entries)
        if merged_entry.get("end") and merged_entry.get("start"):
            merged_entry["actual_elapsed"] = max(
                0, (merged_entry["end"] - merged_entry["start"]).total_seconds() / 60
            )
        merged.append(merged_entry)

    return merged


def get_todays_sessions() -> list[SessionDict]:
    """
    Fetch and process today's Flow sessions from the database.

    Returns a list of enriched session dictionaries with:
    - Deduplicated flow sessions
    - Linked break information
    - Interruption counts and durations
    - Break overrun calculations
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Calculate start and end of today (local time) for filtering
    now = datetime.datetime.now()
    start_of_day = datetime.datetime(now.year, now.month, now.day, 0, 0, 0)
    end_of_day = datetime.datetime(now.year, now.month, now.day, 23, 59, 59)

    # Convert to CoreData timestamps
    cd_start = start_of_day.timestamp() - CORE_DATA_EPOCH_OFFSET
    cd_end = end_of_day.timestamp() - CORE_DATA_EPOCH_OFFSET

    # Fetch SESSIONS
    query = """
    SELECT Z_PK, ZSTARTEDAT, ZDURATION, ZPHASE, ZTITLE, ZCOMPLETEDAT
    FROM ZSESSION
    WHERE ZSTARTEDAT >= ? AND ZSTARTEDAT <= ?
    ORDER BY ZSTARTEDAT ASC
    """
    cursor.execute(query, (cd_start, cd_end))
    rows = cursor.fetchall()

    all_sessions: list[SessionDict] = []
    for row in rows:
        pk, started_at, duration_planned, phase, title, completed_at = row
        start_dt = core_data_to_datetime(started_at)
        if start_dt is None:
            continue  # Skip sessions without start time

        completed_dt = core_data_to_datetime(completed_at) if completed_at else None
        if completed_dt:
            end_dt = completed_dt
        else:
            # In-progress session: treat "now" as the end so timestamps stay current.
            end_dt = now
            if end_dt < start_dt:
                end_dt = start_dt

        actual_duration_min = max(0.0, (end_dt - start_dt).total_seconds() / 60)

        all_sessions.append(
            {
                "pk": pk,
                "pks": [pk],  # keep originals so we can merge duplicates safely
                "start": start_dt,
                "end": end_dt,
                "duration": duration_planned,  # planned focus duration
                "planned_duration": duration_planned,
                "actual_elapsed": actual_duration_min,
                "completed_at": completed_dt,
                "phase": phase,
                "title": title,
                "interruptions_count": 0,
                "interruptions_duration": 0,
                "break_duration": 0,
            }
        )

    # Process Sessions:
    # 1. Filter for FLOW sessions only.
    # 2. Enrich with Interruptions and Breaks.

    flow_sessions = [s for s in all_sessions if s["phase"] == "flow"]
    break_sessions = [
        s for s in all_sessions if s["phase"] in ["shortBreak", "longBreak"]
    ]

    flow_sessions = dedupe_sessions(flow_sessions)
    flow_sessions.sort(key=lambda x: x["start"])

    def enrich_break(b: SessionDict) -> SessionDict:
        completed_dt = b["completed_at"] if b.get("completed_at") else None
        if completed_dt:
            end_dt = completed_dt
        else:
            end_dt = now
            if end_dt < b["start"]:
                end_dt = b["start"]
        b["actual_duration"] = max(0, (end_dt - b["start"]).total_seconds() / 60)
        b["planned_duration"] = b.get("planned_duration") or b.get("duration")
        return b

    break_sessions = [enrich_break(b) for b in dedupe_sessions(break_sessions)]
    break_sessions.sort(key=lambda x: x["start"])

    lunch_window = _compute_dynamic_lunch_window(
        flow_sessions, LUNCH_WINDOW_BASE, reference_date=now.date()
    )
    lunch_duration_minutes = 0
    if lunch_window:
        try:
            lunch_start_t, lunch_end_t = lunch_window
            lunch_start_dt = datetime.datetime.combine(now.date(), lunch_start_t)
            lunch_end_dt = datetime.datetime.combine(now.date(), lunch_end_t)
            if lunch_end_dt <= lunch_start_dt:
                lunch_end_dt += datetime.timedelta(days=1)
            lunch_duration_minutes = int(
                round((lunch_end_dt - lunch_start_dt).total_seconds() / 60.0)
            )
        except (ValueError, TypeError) as e:
            logger.debug("Failed to parse lunch window: %s", e)
            lunch_duration_minutes = 0

    for idx, session in enumerate(flow_sessions):
        # Fetch Interruptions for this session
        pk_list = session.get("interrupt_pks") or session.get("pks") or [session["pk"]]
        total_count = 0
        total_duration = 0
        for pk in pk_list:
            cursor.execute(
                "SELECT count(*), sum(ZFINISHEDAT - ZSTARTEDAT) FROM ZINTERRUPTION WHERE ZSESSION = ?",
                (pk,),
            )
            int_row = cursor.fetchone()
            if not int_row:
                continue
            count_val = int_row[0] if int_row[0] else 0
            dur_val = int_row[1] if int_row[1] else 0
            total_duration += dur_val
            total_count += count_val

        session["interruptions_count"] = total_count
        session["interruptions_duration"] = total_duration

        # Find nearest subsequent break (first one after session end within gap cap)
        best_break: SessionDict | None = None
        for b in break_sessions:
            gap_seconds = (b["start"] - session["end"]).total_seconds()
            if gap_seconds < 0:
                continue
            if gap_seconds <= BREAK_LINK_MAX_GAP_SECONDS:
                best_break = b
            break

        anchored = anchor_lunch_window(session["end"], lunch_window)
        if anchored:
            # Lunch takes precedence for display/expectation even if Flow logged a shortBreak.
            session["anchored_lunch_window"] = anchored
            session["break_expected"] = lunch_duration_minutes or 60
            session["break_duration"] = session["break_expected"]
            session["break_missing"] = False
            session["break_reason"] = "lunch"
            if best_break:
                session["linked_break_start"] = best_break["start"]
        elif best_break:
            session["break_expected"] = get_expected_break_minutes(
                best_break, BREAK_DEFAULTS
            )
            session["break_duration"] = session["break_expected"]
            session["linked_break_start"] = best_break["start"]
            session["break_missing"] = False
            session["break_reason"] = None
            session["anchored_lunch_window"] = None
        else:
            session["anchored_lunch_window"] = None
            session["break_expected"] = get_expected_break_minutes(None, BREAK_DEFAULTS)
            session["break_duration"] = session["break_expected"]
            session["break_missing"] = True
            session["break_reason"] = None

        # Overrun calculation: gap until next flow (or end of day), less lunch, less expected break
        if idx == len(flow_sessions) - 1:
            # No future flow: do not accrue overrun past the final block
            session["break_overrun"] = 0
        else:
            next_flow_start = flow_sessions[idx + 1]["start"]
            # If actual break (gap) is less than expected, overwrite expected with actual
            actual_break_minutes = (
                next_flow_start - session["end"]
            ).total_seconds() / 60
            if actual_break_minutes < session.get("break_expected", 0):
                session["break_expected"] = int(actual_break_minutes + 0.5)
                session["break_duration"] = session["break_expected"]
            effective_next_start = clamp_next_flow_within_day(
                session["end"], next_flow_start, REGULAR_DAY_END
            )
            if not effective_next_start or effective_next_start <= session["end"]:
                session["break_overrun"] = 0
            else:
                gap_minutes = (
                    effective_next_start - session["end"]
                ).total_seconds() / 60
                effective_lunch_window = (
                    session.get("anchored_lunch_window") or lunch_window
                )
                lunch_overlap = overlap_minutes_with_window(
                    session["end"], effective_next_start, effective_lunch_window
                )
                expected_break = session.get(
                    "break_expected",
                    get_expected_break_minutes(best_break, BREAK_DEFAULTS),
                )
                # If lunch covers the gap, only count overrun beyond lunch plus any remaining expected break.
                expected_excl_lunch = max(0.0, expected_break - lunch_overlap)
                overrun_minutes = max(
                    0.0, gap_minutes - lunch_overlap - expected_excl_lunch
                )
                # Half-up to nearest minute to reflect intuitive lateness
                overrun = int(overrun_minutes + 0.5)
                session["break_overrun"] = overrun

    # Retroactive lunch detection: if session N starts after lunch window,
    # and session N-1 didn't get lunch but gap overlaps lunch significantly,
    # retroactively assign lunch to session N-1.
    if lunch_window:
        lunch_end_dt = datetime.datetime.combine(now.date(), lunch_window[1])
        for idx in range(1, len(flow_sessions)):
            current = flow_sessions[idx]
            prev = flow_sessions[idx - 1]

            # Skip if previous already has lunch
            if prev.get("break_reason") == "lunch":
                continue

            # Check if current session starts after lunch window ends
            if current["start"] <= lunch_end_dt:
                continue

            # Check if gap between prev end and current start overlaps lunch window
            gap_overlap = overlap_minutes_with_window(
                prev["end"], current["start"], lunch_window
            )
            if gap_overlap < 30:  # Require significant overlap
                continue

            # Retroactively assign lunch to previous session
            prev["break_expected"] = lunch_duration_minutes or 60
            prev["break_duration"] = prev["break_expected"]
            prev["break_reason"] = "lunch"
            prev["break_missing"] = False

            # Recalculate overrun for prev session
            effective_next_start = clamp_next_flow_within_day(
                prev["end"], current["start"], REGULAR_DAY_END
            )
            if effective_next_start and effective_next_start > prev["end"]:
                gap_minutes = (effective_next_start - prev["end"]).total_seconds() / 60
                overrun = max(0, int(gap_minutes - prev["break_expected"] + 0.5))
                prev["break_overrun"] = overrun

    conn.close()
    return flow_sessions
