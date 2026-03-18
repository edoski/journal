"""Aggregation helpers for period metrics."""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field

from sync.contracts.metrics import (
    DailyAggregate,
    PeriodAggregate,
    TrainingTypeSessionStat,
)
from sync.contracts.targets import TrainingTargetBucket
from sync.target_policy import training_type_target


@dataclass
class _TrainingAccumulator:
    """Mutable accumulator for per-type/per-slot training aggregation."""

    display_type: str
    slot_index: int
    sessions: int = 0
    total_minutes: float = 0.0
    start_minutes: list[int] = field(default_factory=list)
    end_minutes: list[int] = field(default_factory=list)


_TRAINING_BUCKET_BY_LABEL: dict[str, TrainingTargetBucket] = {
    "meditation": "meditation",
    "mind & body": "meditation",
    "mind and body": "meditation",
    "stretch": "stretch",
    "stretching": "stretch",
    "cooldown": "stretch",
}


def compute_period_metrics(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
) -> PeriodAggregate:
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

    study_minutes: list[float | None] = []
    sleep_minutes: list[float | None] = []
    mood_vals: list[float | None] = []
    for day in dates:
        payload = daily_data.get(day)
        if payload is None:
            study_minutes.append(None)
            sleep_minutes.append(None)
            mood_vals.append(None)
            continue
        study_minutes.append(payload.get("study_minutes"))
        sleep_minutes.append(payload.get("sleep_minutes"))
        mood_vals.append(payload.get("mood"))

    study_total = sum((m for m in study_minutes if m is not None), 0)
    sleep_vals = [m for m in sleep_minutes if m is not None]
    sleep_avg = sum(sleep_vals) / len(sleep_vals) if sleep_vals else None
    mood_vals_clean = [m for m in mood_vals if m is not None]
    mood_avg = sum(mood_vals_clean) / len(mood_vals_clean) if mood_vals_clean else None

    def day_has_workout(day: datetime.date) -> bool:
        payload = daily_data.get(day)
        return bool(payload.get("workout")) if payload is not None else False

    def day_has_stretch(day: datetime.date) -> bool:
        payload = daily_data.get(day)
        return bool(payload.get("stretch")) if payload is not None else False

    def day_has_meditation(day: datetime.date) -> bool:
        payload = daily_data.get(day)
        return bool(payload.get("meditate")) if payload is not None else False

    workout_count = sum(1 for day in dates if day_has_workout(day))
    stretch_count = sum(1 for day in dates if day_has_stretch(day))
    meditation_count = sum(1 for day in dates if day_has_meditation(day))

    return PeriodAggregate(
        study_total_minutes=study_total,
        sleep_avg_minutes=sleep_avg,
        mood_avg=mood_avg,
        workout_count=workout_count,
        stretch_count=stretch_count,
        meditation_count=meditation_count,
        total_days=len(dates),
        days_up_to_today=days_up_to_today,
    )


def aggregate_activity_totals(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
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
    daily_data: dict[datetime.date, DailyAggregate],
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
        daily = daily_data.get(d)
        if daily is None:
            continue
        total_interrupts += daily.get("interrupt_minutes", 0) or 0
        total_overruns += daily.get("overrun_minutes", 0) or 0
        study_minutes = daily.get("study_minutes") or 0
        if study_minutes > 0:
            study_day_count += 1
    return total_interrupts, total_overruns, study_day_count


def aggregate_screen_time(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
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
        daily = daily_data.get(d)
        if daily is None:
            continue
        screen_time = daily.get("screen_time_totals", {})
        for app, minutes in screen_time.items():
            app_totals[app] = app_totals.get(app, 0) + minutes
    return app_totals


def _normalize_training_type_label(label: str) -> str:
    """Normalize a training type label for stable aggregation."""
    return " ".join(label.split()).strip().casefold()


def _target_bucket_for_training_type(
    normalized_label: str,
) -> TrainingTargetBucket:
    """Map a normalized training type label to target bucket."""
    return _TRAINING_BUCKET_BY_LABEL.get(normalized_label, "workout")


def _average_clock_minutes(samples: list[int]) -> int:
    """Average time-of-day samples with wrap-around handling."""
    if not samples:
        raise ValueError("Cannot average empty training schedule sample set")

    normalized = [int(sample) % (24 * 60) for sample in samples]
    anchor = normalized[0]
    aligned: list[int] = []
    for sample in normalized:
        aligned.append(
            min(
                (sample - 24 * 60, sample, sample + 24 * 60),
                key=lambda candidate: abs(candidate - anchor),
            )
        )
    return round(sum(aligned) / len(aligned)) % (24 * 60)


def _minutes_to_hhmm(minutes: int) -> str:
    """Convert minutes-since-midnight to canonical HH:MM."""
    value = minutes % (24 * 60)
    return f"{value // 60:02d}:{value % 60:02d}"


def _hhmm_to_minutes(value: str) -> int:
    """Convert canonical HH:MM to minutes-since-midnight."""
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


def aggregate_training_type_session_stats(
    dates: list[datetime.date],
    daily_data: dict[datetime.date, DailyAggregate],
) -> list[TrainingTypeSessionStat]:
    """
    Aggregate periodic training stats by activity type and daily slot.

    Returns row dicts with:
      - type: display label (first seen)
      - slot_index: zero-based daily slot index within the activity type
      - sessions: raw session count for the slot
      - target: scaled target denominator for period
      - average_minutes: average duration per slot session
      - average_start_time: average slot start (HH:MM)
      - average_end_time: average slot end (HH:MM)
    """
    per_type_slot: dict[tuple[str, int], _TrainingAccumulator] = {}

    for d in dates:
        daily = daily_data.get(d)
        if daily is None:
            continue
        try:
            minutes_map = daily["training_type_minutes"]
            sessions_map = daily["training_type_sessions"]
            duration_minutes_map = daily["training_type_duration_minutes"]
            start_minutes_map = daily["training_type_start_minutes"]
            end_minutes_map = daily["training_type_end_minutes"]
        except KeyError as exc:
            missing_key = str(exc).strip("'")
            raise ValueError(
                "Daily aggregate missing required training field "
                f"{missing_key!r} on {d.isoformat()}"
            ) from exc

        if (
            not minutes_map
            and not sessions_map
            and not duration_minutes_map
            and not start_minutes_map
            and not end_minutes_map
        ):
            continue

        keys = (
            set(minutes_map.keys())
            | set(sessions_map.keys())
            | set(duration_minutes_map.keys())
            | set(start_minutes_map.keys())
            | set(end_minutes_map.keys())
        )
        for raw_label in keys:
            label = (raw_label or "").strip()
            norm = _normalize_training_type_label(label)
            if not norm:
                continue

            sessions = int(sessions_map.get(raw_label, 0) or 0)
            total_minutes = float(minutes_map.get(raw_label, 0.0) or 0.0)
            if sessions <= 0 or total_minutes <= 0.0:
                continue

            start_samples = tuple(start_minutes_map.get(raw_label, ()))
            end_samples = tuple(end_minutes_map.get(raw_label, ()))
            duration_samples = tuple(duration_minutes_map.get(raw_label, ()))
            if (
                len(duration_samples) != sessions
                or len(start_samples) != sessions
                or len(end_samples) != sessions
            ):
                raise ValueError(
                    "Training schedule sample count mismatch for "
                    f"{label or norm!r} on {d.isoformat()}: "
                    f"sessions={sessions}, durations={len(duration_samples)}, "
                    f"starts={len(start_samples)}, "
                    f"ends={len(end_samples)}"
                )
            if abs(sum(duration_samples) - total_minutes) > 1e-6:
                raise ValueError(
                    "Training duration total mismatch for "
                    f"{label or norm!r} on {d.isoformat()}: "
                    f"total={total_minutes}, sum={sum(duration_samples)}"
                )

            ordered_samples = sorted(
                zip(start_samples, end_samples, duration_samples),
                key=lambda sample: (sample[0], sample[1], sample[2]),
            )
            for slot_index, (start, end, duration) in enumerate(ordered_samples):
                key = (norm, slot_index)
                entry = per_type_slot.setdefault(
                    key,
                    _TrainingAccumulator(
                        display_type=label,
                        slot_index=slot_index,
                    ),
                )
                # Preserve source-case display label from first observed non-empty entry.
                if not entry.display_type and label:
                    entry.display_type = label
                entry.sessions += 1
                entry.total_minutes += float(duration)
                entry.start_minutes.append(int(start))
                entry.end_minutes.append(int(end))

    total_days = len(dates)
    meditation_target = training_type_target(total_days, "meditation")
    workout_target = training_type_target(total_days, "workout")
    stretch_target = training_type_target(total_days, "stretch")

    stats: list[TrainingTypeSessionStat] = []
    for norm_slot, data in per_type_slot.items():
        norm, slot_index = norm_slot
        sessions = data.sessions
        total_minutes = data.total_minutes
        if sessions <= 0 or total_minutes <= 0:
            continue
        if len(data.start_minutes) != sessions or len(data.end_minutes) != sessions:
            raise ValueError(
                "Training schedule sample count mismatch for "
                f"{data.display_type or norm!r}: "
                f"sessions={sessions}, starts={len(data.start_minutes)}, "
                f"ends={len(data.end_minutes)}"
            )

        bucket = _target_bucket_for_training_type(norm)
        if bucket == "meditation":
            target = meditation_target
        elif bucket == "stretch":
            target = stretch_target
        else:
            target = workout_target

        average_start_time = _minutes_to_hhmm(
            _average_clock_minutes(data.start_minutes)
        )
        average_end_time = _minutes_to_hhmm(_average_clock_minutes(data.end_minutes))

        stats.append(
            TrainingTypeSessionStat(
                type=data.display_type or norm,
                slot_index=slot_index,
                sessions=sessions,
                target=target,
                average_minutes=total_minutes / sessions,
                average_start_time=average_start_time,
                average_end_time=average_end_time,
            )
        )

    stats.sort(
        key=lambda row: (
            _hhmm_to_minutes(row["average_start_time"]),
            _hhmm_to_minutes(row["average_end_time"]),
            row["type"].casefold(),
            row["slot_index"],
            -row["average_minutes"],
            -row["sessions"],
        )
    )
    return stats
