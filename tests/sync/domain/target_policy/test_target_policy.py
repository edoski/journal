"""Contract tests for centralized target policy."""

from __future__ import annotations

import datetime

import sync.target_policy as target_policy_module
from sync.constants import IDEAL, STUDY_TARGET_MIN, StudyCadenceConfig
from sync.contracts.schedule import DayScheduleProfile
from sync.target_policy import (
    effective_study_minutes,
    summary_targets,
    study_target_label,
    study_target_minutes_for_dates,
    target_for_metric,
    training_type_target,
)


def test_training_type_target_scales_from_weekly_constant():
    assert training_type_target(7, "workout") == IDEAL.workout_days_weekly
    assert training_type_target(7, "stretch") == IDEAL.stretch_days_weekly
    assert training_type_target(7, "meditation") == IDEAL.meditation_days_weekly

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


def _profile(
    *,
    study_start: tuple[int, int],
    study_end: tuple[int, int],
    lunch_start: tuple[int, int],
    lunch_end: tuple[int, int],
) -> DayScheduleProfile:
    return DayScheduleProfile(
        study_start=datetime.time(*study_start),
        study_end=datetime.time(*study_end),
        lunch_start=datetime.time(*lunch_start),
        lunch_end=datetime.time(*lunch_end),
        workout_start=datetime.time(18, 0),
        is_off_day=False,
    )


def test_effective_study_minutes_with_no_lunch_overlap():
    profile = _profile(
        study_start=(8, 0),
        study_end=(18, 0),
        lunch_start=(19, 0),
        lunch_end=(20, 0),
    )
    assert effective_study_minutes(profile) == 450


def test_effective_study_minutes_with_partial_lunch_overlap():
    profile = _profile(
        study_start=(8, 0),
        study_end=(12, 0),
        lunch_start=(11, 30),
        lunch_end=(13, 0),
    )
    assert effective_study_minutes(profile) == 180


def test_effective_study_minutes_with_full_lunch_overlap():
    profile = _profile(
        study_start=(8, 0),
        study_end=(12, 0),
        lunch_start=(7, 0),
        lunch_end=(13, 0),
    )
    assert effective_study_minutes(profile) == 0


def test_effective_study_minutes_matches_5x90m_blocks_with_lunch_split():
    profile = _profile(
        study_start=(8, 0),
        study_end=(18, 0),
        lunch_start=(13, 30),
        lunch_end=(14, 30),
    )
    assert effective_study_minutes(profile) == 450


def test_effective_study_minutes_uses_configured_study_cadence(monkeypatch):
    monkeypatch.setattr(
        target_policy_module,
        "STUDY_CADENCE",
        StudyCadenceConfig(study_block_min=60, break_min=20),
    )
    profile = _profile(
        study_start=(8, 0),
        study_end=(12, 0),
        lunch_start=(13, 0),
        lunch_end=(14, 0),
    )
    assert effective_study_minutes(profile) == 180


def test_effective_study_minutes_for_off_day_is_zero():
    profile = DayScheduleProfile(
        study_start=datetime.time(8, 0),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(18, 0),
        is_off_day=True,
    )
    assert effective_study_minutes(profile) == 0


def test_effective_study_minutes_clamps_negative_to_zero():
    profile = _profile(
        study_start=(12, 0),
        study_end=(8, 0),
        lunch_start=(13, 0),
        lunch_end=(14, 0),
    )
    assert effective_study_minutes(profile) == 0


def test_study_target_minutes_for_dates_sums_resolved_profiles():
    by_day = {
        datetime.date(2026, 2, 23): _profile(
            study_start=(8, 0),
            study_end=(18, 0),
            lunch_start=(13, 0),
            lunch_end=(14, 0),
        ),
        datetime.date(2026, 2, 24): _profile(
            study_start=(9, 0),
            study_end=(17, 0),
            lunch_start=(12, 30),
            lunch_end=(13, 0),
        ),
    }

    result = study_target_minutes_for_dates(
        by_day.keys(),
        lambda day: by_day[day],
    )
    assert result == 720


def test_study_target_label_formats_whole_hour_values():
    assert study_target_label("week", 3120) == "52h/wk"


def test_study_target_label_formats_non_hour_values():
    assert study_target_label("month", 125) == "2h05m/mo"


def test_study_target_label_unavailable_is_emdash():
    assert study_target_label("week", None) == "—"
