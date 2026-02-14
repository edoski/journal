"""Centralized target-scaling policy derived from production constants."""

from __future__ import annotations

from sync.constants import IDEAL, STUDY_TARGET_MIN
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

    study_label = f"{study_minutes // 60}h/{suffix}"
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
