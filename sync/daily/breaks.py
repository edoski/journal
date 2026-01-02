"""
Break linking and overrun calculation logic for daily sync.

Provides functions to compute expected break durations, handle lunch windows,
calculate time overlaps, and determine break overruns.
"""

from __future__ import annotations

import datetime
from typing import Any


# Type alias for session dictionaries
SessionDict = dict[str, Any]
BreakDefaults = dict[str, int | None]
TimeWindow = tuple[datetime.time, datetime.time]


def get_expected_break_minutes(
    break_session: SessionDict | None,
    break_defaults: BreakDefaults,
) -> int:
    """
    Choose expected break length for a session.

    - Prefer Flow defaults per break type.
    - If Flow only labels everything as shortBreak, upgrade to longBreak default
      when the actual duration matches or exceeds it (with 2m tolerance).
    - Fallback to the session's stored duration, then 30.

    Args:
        break_session: The break session dict (or None if no linked break)
        break_defaults: Dict with 'shortBreak' and 'longBreak' minute values

    Returns:
        Expected break duration in minutes
    """
    default_short = break_defaults.get("shortBreak")
    default_long = break_defaults.get("longBreak")
    tol_minutes = 2

    if break_session:
        phase = break_session.get("phase")
        dur = break_session.get("duration")
        dur_val = int(dur) if isinstance(dur, (int, float)) and dur > 0 else None

        # Direct phase mapping first
        if phase == "longBreak" and default_long:
            return default_long
        if phase == "shortBreak" and default_short:
            chosen = default_short
        else:
            chosen = None

        # If Flow labels everything as shortBreak but duration aligns with longBreak, upgrade
        if dur_val and default_long and default_short and default_long > default_short:
            if dur_val >= default_long - tol_minutes:
                return default_long
            if dur_val >= default_short - tol_minutes and chosen is None:
                return default_short

        if chosen:
            return chosen
        if dur_val:
            return dur_val

    # No session or no usable value; pick best available default
    for phase_key in ("longBreak", "shortBreak"):
        val = break_defaults.get(phase_key)
        if val:
            return val
    return 30


def _compute_dynamic_lunch_window(
    flow_sessions: list[SessionDict],
    base_window: TimeWindow | None,
    reference_date: datetime.date | None = None,
) -> TimeWindow | None:
    """
    Shift the lunch window later when a flow session straddles the nominal start.

    A session qualifies if it begins before the base start and ends after it;
    purely post-lunch sessions are ignored.

    Args:
        flow_sessions: List of flow session dicts with 'start' and 'end' datetimes
        base_window: Tuple of (start_time, end_time) for base lunch window
        reference_date: Date to use for combining times (defaults to today)

    Returns:
        Shifted (start_time, end_time) tuple, or original base_window if no shift needed
    """
    if not base_window or not flow_sessions:
        return base_window

    base_start_t, base_end_t = base_window
    ref_date = reference_date or datetime.date.today()
    base_start_dt = datetime.datetime.combine(ref_date, base_start_t)
    base_end_dt = datetime.datetime.combine(ref_date, base_end_t)
    if base_end_dt <= base_start_dt:
        base_end_dt += datetime.timedelta(days=1)
    window_duration = base_end_dt - base_start_dt

    eligible = sorted(
        (s for s in flow_sessions if s.get("end")), key=lambda s: s["end"]
    )
    shifted_start_dt = None
    for session in eligible:
        start_dt = session.get("start")
        end_dt = session["end"]
        if not start_dt:
            continue
        if start_dt <= base_start_dt < end_dt:
            shifted_start_dt = end_dt
            break

    if not shifted_start_dt:
        return base_window

    shifted_end_dt = shifted_start_dt + window_duration
    return (shifted_start_dt.time(), shifted_end_dt.time())


def overlap_minutes_with_window(
    start_dt: datetime.datetime,
    end_dt: datetime.datetime,
    window: TimeWindow | None,
) -> float:
    """
    Return minutes of [start_dt, end_dt) that overlap a given time window.

    Window times are interpreted on start_dt.date(). Handles windows that cross midnight.

    Args:
        start_dt: Start of the period to check
        end_dt: End of the period to check
        window: Tuple of (start_time, end_time) or None

    Returns:
        Minutes of overlap, or 0 if no overlap or invalid inputs
    """
    if not window or not end_dt or end_dt <= start_dt:
        return 0
    window_start_t, window_end_t = window
    window_start_dt = datetime.datetime.combine(start_dt.date(), window_start_t)
    window_end_dt = datetime.datetime.combine(start_dt.date(), window_end_t)
    if window_end_dt <= window_start_dt:
        window_end_dt += datetime.timedelta(days=1)
    latest_start = max(start_dt, window_start_dt)
    earliest_end = min(end_dt, window_end_dt)
    if earliest_end <= latest_start:
        return 0
    return (earliest_end - latest_start).total_seconds() / 60


def clamp_next_flow_within_day(
    session_end_dt: datetime.datetime,
    next_flow_start_dt: datetime.datetime,
    cutoff_time: datetime.time,
) -> datetime.datetime | None:
    """
    Limit overrun calculations to the regular study day.

    If the clamped next start is at or before the session end, returns None
    to indicate no overrun should be calculated.

    Args:
        session_end_dt: When the current session ended
        next_flow_start_dt: When the next session starts
        cutoff_time: End of regular study day (e.g., 18:00)

    Returns:
        Clamped next start datetime, or None if no overrun applies
    """
    cutoff_dt = datetime.datetime.combine(session_end_dt.date(), cutoff_time)
    effective_next = min(next_flow_start_dt, cutoff_dt)
    if effective_next <= session_end_dt:
        return None
    return effective_next


def anchor_lunch_window(
    end_dt: datetime.datetime | None,
    base_window: TimeWindow | None,
    lead_minutes: int = 15,
) -> TimeWindow | None:
    """
    Anchor the lunch window to a session end time if it falls within range.

    If end_dt falls within the base lunch window (with lead_minutes before),
    anchor the lunch start at end_dt and keep the same duration as base_window.

    Args:
        end_dt: Session end datetime
        base_window: Tuple of (start_time, end_time) for base lunch window
        lead_minutes: Minutes before window start to still consider anchoring

    Returns:
        Anchored (start_time, end_time) tuple, or None if not applicable
    """
    if not base_window or not end_dt:
        return None

    base_start_t, base_end_t = base_window
    base_start_dt = datetime.datetime.combine(end_dt.date(), base_start_t)
    base_end_dt = datetime.datetime.combine(end_dt.date(), base_end_t)
    if base_end_dt <= base_start_dt:
        base_end_dt += datetime.timedelta(days=1)
    window_duration = base_end_dt - base_start_dt

    anchor_start_dt = base_start_dt - datetime.timedelta(minutes=lead_minutes)
    anchor_end_dt = base_end_dt
    if not (anchor_start_dt <= end_dt <= anchor_end_dt):
        return None

    anchored_start_dt = end_dt
    anchored_end_dt = end_dt + window_duration
    return (anchored_start_dt.time(), anchored_end_dt.time())
