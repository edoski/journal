"""Contract tests for centralized target policy."""

from __future__ import annotations

from sync.constants import IDEAL, STUDY_TARGET_MIN
from sync.target_policy import (
    summary_targets,
    target_for_metric,
    training_type_target,
)


def test_training_type_target_scales_from_weekly_constant():
    assert training_type_target(7, "workout") == IDEAL.workout_days_weekly
    assert training_type_target(7, "stretch") == IDEAL.stretch_days_weekly
    assert training_type_target(7, "mindful") == IDEAL.mindful_days_weekly

    # 31-day period should follow scaled-week math from production policy.
    expected_workout = round(IDEAL.workout_days_weekly * (31 / 7))
    assert training_type_target(31, "workout") == expected_workout


def test_summary_targets_expose_labels_from_policy():
    weekly = summary_targets("week", 7)
    assert weekly.study_label == f"{(IDEAL.study_minutes_daily * 7) // 60}h/wk"
    assert weekly.sleep_label == "8h/night"
    assert weekly.training.workout_label == f"{IDEAL.workout_days_weekly}/7"

    monthly_days = 31
    monthly = summary_targets("month", monthly_days)
    expected_workout = training_type_target(monthly_days, "workout")
    assert monthly.training.workout_label == f"{expected_workout}/mo"


def test_target_for_metric_uses_canonical_values():
    assert target_for_metric("study_minutes", 7) == float(STUDY_TARGET_MIN * 7)
    assert target_for_metric("sleep_minutes", 7) == float(IDEAL.sleep_minutes_nightly)
    assert target_for_metric("mood", 7) == float(IDEAL.mood_target)
    assert target_for_metric("workout_count", 7) == float(
        training_type_target(7, "workout")
    )
    assert target_for_metric("interrupt_minutes", 7) == 0.0
    assert target_for_metric("screen_time_total", 7) is None
