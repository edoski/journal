"""Centralized target-scaling policy derived from production constants."""

from __future__ import annotations

import datetime
from collections.abc import Callable, Iterable

from sync.constants import IDEAL, STUDY_CADENCE, STUDY_TARGET_MIN
from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.targets import (
    PeriodType,
    SummaryTargets,
    TrainingTargetBucket,
    TrainingTargets,
)
from sync.formatting import format_minutes

_PERIOD_SUFFIX_BY_TYPE: dict[str, str] = {
    "week": "wk",
    "month": "mo",
    "quarter": "qtr",
    "year": "yr",
}

_TRAINING_WEEKLY_TARGET_BY_BUCKET: dict[TrainingTargetBucket, float] = {
    "mindful": float(IDEAL.mindful_days_weekly),
    "workout": float(IDEAL.workout_days_weekly),
    "stretch": float(IDEAL.stretch_days_weekly),
}


def _period_suffix(period_type: PeriodType) -> str:
    return _PERIOD_SUFFIX_BY_TYPE.get(period_type, "wk")


def _sleep_target_label(sleep_minutes: int) -> str:
    if sleep_minutes % 60 == 0:
        return f"{sleep_minutes // 60}h/night"
    return f"{format_minutes(sleep_minutes, always_show_both=True)}/night"


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


def study_target_label(
    period_type: PeriodType,
    study_target_minutes: int | None,
) -> str:
    """Format the schedule-derived study target label for summary table rendering."""
    if study_target_minutes is None:
        return "—"
    suffix = _period_suffix(period_type)
    if study_target_minutes % 60 == 0:
        return f"{study_target_minutes // 60}h/{suffix}"
    return f"{format_minutes(study_target_minutes, always_show_both=True)}/{suffix}"


def training_type_target(total_days: int, bucket: TrainingTargetBucket) -> int:
    """Resolve scaled training target for one training bucket."""
    weekly_target = _TRAINING_WEEKLY_TARGET_BY_BUCKET[bucket]
    return scaled_weekly_target(total_days, weekly_target)


def summary_targets(period_type: PeriodType, total_days: int) -> SummaryTargets:
    """Compute summary-table target values and labels for a period."""
    suffix = _period_suffix(period_type)
    study_minutes = IDEAL.study_minutes_daily * total_days
    sleep_minutes = IDEAL.sleep_minutes_nightly
    mood = IDEAL.mood_target

    mindful = training_type_target(total_days, "mindful")
    workout = training_type_target(total_days, "workout")
    stretch = training_type_target(total_days, "stretch")

    if period_type == "week":
        mindful_label = f"{mindful}/7"
        workout_label = f"{workout}/7"
        stretch_label = f"{stretch}/7"
    else:
        mindful_label = f"{mindful}/{suffix}"
        workout_label = f"{workout}/{suffix}"
        stretch_label = f"{stretch}/{suffix}"

    study_label = study_target_label(period_type, study_minutes)
    sleep_label = _sleep_target_label(sleep_minutes)
    mood_label = f"{mood:.1f}/10"

    return SummaryTargets(
        study_minutes=study_minutes,
        sleep_minutes=sleep_minutes,
        mood=mood,
        training=TrainingTargets(
            mindful=mindful,
            workout=workout,
            stretch=stretch,
            mindful_label=mindful_label,
            workout_label=workout_label,
            stretch_label=stretch_label,
        ),
        study_label=study_label,
        sleep_label=sleep_label,
        mood_label=mood_label,
    )


def target_for_metric(metric: str, days_total: int) -> float | None:
    """Resolve target values for query/explorer metric cards."""
    if metric == "study_minutes":
        return float(STUDY_TARGET_MIN * max(1, days_total))
    if metric == "sleep_minutes":
        return float(IDEAL.sleep_minutes_nightly)
    if metric == "mood":
        return float(IDEAL.mood_target)
    if metric == "workout_count":
        return float(training_type_target(days_total, "workout"))
    if metric == "stretch_count":
        return float(training_type_target(days_total, "stretch"))
    if metric == "mindful_count":
        return float(training_type_target(days_total, "mindful"))
    if metric in {"interrupt_minutes", "overrun_minutes"}:
        return 0.0
    return None
