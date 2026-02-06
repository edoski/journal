"""Aggregation helpers for period metrics."""

from __future__ import annotations

import datetime
from typing import Any

from sync.constants import IDEAL


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
    mindful_count = sum(1 for d in dates if daily_data.get(d, {}).get("meditate"))

    return {
        "study_total_minutes": study_total,
        "sleep_avg_minutes": sleep_avg,
        "mood_avg": mood_avg,
        "workout_count": workout_count,
        "stretch_count": stretch_count,
        "mindful_count": mindful_count,
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


def aggregate_screen_time(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, dict[str, Any]],
) -> dict[str, float]:
    """
    Aggregate screen time totals across a date range.

    Args:
        dates: List of date objects to aggregate.
        daily_data: Dict mapping dates to parsed daily note data.

    Returns:
        Dict mapping app names to total minutes.
    """
    app_totals: dict[str, float] = {}
    for d in dates:
        daily = daily_data.get(d, {})
        screen_time = daily.get("screen_time_totals", {})
        for app, minutes in screen_time.items():
            app_totals[app] = app_totals.get(app, 0) + minutes
    return app_totals


def _normalize_training_type_label(label: str) -> str:
    """Normalize a training type label for stable aggregation."""
    return " ".join(label.split()).strip().casefold()


def _target_bucket_for_training_type(normalized_label: str) -> str:
    """Map a normalized training type label to target bucket."""
    if "meditat" in normalized_label:
        return "mindful"
    if "stretch" in normalized_label:
        return "stretch"
    return "workout"


def aggregate_training_type_session_stats(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Aggregate periodic training stats by activity type.

    Returns row dicts with:
      - type: display label (first seen)
      - sessions: raw session count
      - target: scaled target denominator for period
      - average_minutes: average duration per session
    """
    per_type: dict[str, dict[str, Any]] = {}

    for d in dates:
        daily = daily_data.get(d, {})
        minutes_map = daily.get("training_type_minutes", {})
        sessions_map = daily.get("training_type_sessions", {})
        if not minutes_map and not sessions_map:
            continue

        keys = set(minutes_map.keys()) | set(sessions_map.keys())
        for raw_label in keys:
            label = (raw_label or "").strip()
            norm = _normalize_training_type_label(label)
            if not norm:
                continue
            entry = per_type.setdefault(
                norm,
                {"type": label, "sessions": 0, "total_minutes": 0.0},
            )
            # Preserve source-case display label from first observed non-empty entry.
            if not entry.get("type") and label:
                entry["type"] = label
            entry["sessions"] += int(sessions_map.get(raw_label, 0) or 0)
            entry["total_minutes"] += float(minutes_map.get(raw_label, 0.0) or 0.0)

    total_days = len(dates)
    weeks_in_period = total_days / 7
    mindful_target = int(round(IDEAL.mindful_days_weekly * weeks_in_period))
    workout_target = int(round(IDEAL.workout_days_weekly * weeks_in_period))
    stretch_target = int(round(IDEAL.stretch_days_weekly * weeks_in_period))

    stats: list[dict[str, Any]] = []
    for norm, data in per_type.items():
        sessions = int(data.get("sessions", 0) or 0)
        total_minutes = float(data.get("total_minutes", 0.0) or 0.0)
        if sessions <= 0 or total_minutes <= 0:
            continue

        bucket = _target_bucket_for_training_type(norm)
        if bucket == "mindful":
            target = mindful_target
        elif bucket == "stretch":
            target = stretch_target
        else:
            target = workout_target

        stats.append(
            {
                "type": data.get("type") or norm,
                "sessions": sessions,
                "target": target,
                "average_minutes": total_minutes / sessions,
            }
        )

    stats.sort(
        key=lambda row: (
            -float(row.get("average_minutes") or 0.0),
            -int(row.get("sessions") or 0),
            str(row.get("type") or "").casefold(),
        )
    )
    return stats
