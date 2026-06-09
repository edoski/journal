"""Centralized target-scaling policy derived from production constants."""

from __future__ import annotations

import datetime
from collections.abc import Callable, Iterable

from sync.constants import IDEAL, STUDY_CADENCE, STUDY_TARGET_MIN
from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.targets import TrainingTargetBucket

_TRAINING_WEEKLY_TARGET_BY_BUCKET: dict[TrainingTargetBucket, float] = {
    "meditation": float(IDEAL.meditation_days_weekly),
    "workout": float(IDEAL.workout_days_weekly),
    "stretch": float(IDEAL.stretch_days_weekly),
}


def scaled_weekly_target(total_days: int, weekly_target: float) -> int:
    """Scale a weekly target across arbitrary period day counts."""
    return int(round(float(weekly_target) * (float(total_days) / 7.0)))


def effective_study_minutes(profile: DayScheduleProfile) -> int:
    """Resolve daily study target minutes from schedule and canonical study cadence."""
    if profile.is_off_day:
        return 0

    block_study_minutes = STUDY_CADENCE.study_block_min
    block_break_minutes = STUDY_CADENCE.break_min

    def _segment_study_minutes(segment_minutes: int) -> int:
        if segment_minutes <= 0:
            return 0
        sessions = (segment_minutes + block_break_minutes) // (
            block_study_minutes + block_break_minutes
        )
        return int(max(0, sessions) * block_study_minutes)

    study_start = profile.study_start.hour * 60 + profile.study_start.minute
    study_end = profile.study_end.hour * 60 + profile.study_end.minute
    lunch_start = profile.lunch_start.hour * 60 + profile.lunch_start.minute
    lunch_end = profile.lunch_end.hour * 60 + profile.lunch_end.minute

    overlap_start = max(study_start, lunch_start)
    overlap_end = min(study_end, lunch_end)
    if overlap_end <= overlap_start:
        return _segment_study_minutes(max(0, study_end - study_start))

    morning_minutes = max(0, overlap_start - study_start)
    afternoon_minutes = max(0, study_end - overlap_end)
    return _segment_study_minutes(morning_minutes) + _segment_study_minutes(
        afternoon_minutes
    )


def study_target_minutes_for_dates(
    dates: Iterable[datetime.date],
    resolve_day: Callable[[datetime.date], DayScheduleProfile],
) -> int:
    """Sum canonical schedule-derived study target minutes for all provided dates."""
    total = 0
    for day in dates:
        total += effective_study_minutes(resolve_day(day))
    return total


def training_type_target(total_days: int, bucket: TrainingTargetBucket) -> int:
    """Resolve scaled training target for one training bucket."""
    weekly_target = _TRAINING_WEEKLY_TARGET_BY_BUCKET[bucket]
    return scaled_weekly_target(total_days, weekly_target)


def target_for_metric(metric: str, days_total: int) -> float | None:
    """Resolve target values for query/explorer metric cards."""
    if metric == "study_minutes":
        return float(STUDY_TARGET_MIN * max(1, days_total))
    if metric == "sleep_minutes":
        return float(IDEAL.sleep_minutes_nightly)
    if metric == "workout_count":
        return float(training_type_target(days_total, "workout"))
    if metric == "stretch_count":
        return float(training_type_target(days_total, "stretch"))
    if metric == "meditation_count":
        return float(training_type_target(days_total, "meditation"))
    if metric in {"interrupt_minutes", "overrun_minutes"}:
        return 0.0
    return None
