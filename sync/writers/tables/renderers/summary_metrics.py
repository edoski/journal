"""Renderer for period summary metrics table section."""

from __future__ import annotations

from sync.constants import RENDER
from sync.formatting import (
    compute_pace,
    format_ma_training_ratio,
    format_summary_change_label,
    format_minutes,
    format_mood_with_scale,
    format_progress_bar,
    format_training_ratio,
)
from sync.target_policy import summary_targets

from ..specs import SummaryMetricsTableSpec


def render_summary_metrics(spec: SummaryMetricsTableSpec) -> list[str]:
    """Render markdown summary section and table."""
    current_metrics = spec.current_metrics
    previous_metrics = spec.previous_metrics
    current_label = spec.current_label
    previous_label = spec.previous_label
    ma_metrics = spec.ma_metrics
    ma_label = spec.ma_label
    ma_training_unit = spec.ma_training_unit
    period_type = spec.period_type
    total_days = spec.total_days

    lines = ["### **SUMMARY**", ""]

    show_ma = ma_metrics is not None and ma_label is not None

    targets = summary_targets(period_type, total_days)
    study_target_minutes = targets.study_minutes
    sleep_target_minutes = targets.sleep_minutes
    mindful_target = targets.training.mindful
    workout_target = targets.training.workout
    stretch_target = targets.training.stretch
    mood_target = targets.mood

    study_target_label = targets.study_label
    sleep_target_label = targets.sleep_label
    mood_target_label = targets.mood_label
    mindful_target_label = targets.training.mindful_label
    workout_target_label = targets.training.workout_label
    stretch_target_label = targets.training.stretch_label

    if show_ma:
        lines.append(
            f"| METRIC | {current_label} | {previous_label} | CHANGE | {ma_label} | TARGET | PROGRESS |"
        )
        lines.append(
            "| ------ | ------------- | ----------------------- | ------ | ---------- | ------ | -------- |"
        )
    else:
        lines.append(
            f"| METRIC | {current_label} | {previous_label} | CHANGE | TARGET | PROGRESS |"
        )
        lines.append(
            "| ------ | ------------- | ----------------------- | ------ | ------ | -------- |"
        )

    curr_study_total = current_metrics.get("study_total_minutes") or 0
    prev_study_total = previous_metrics.get("study_total_minutes") or 0
    curr_days_for_avg = current_metrics.get("days_up_to_today") or current_metrics.get(
        "total_days", 7
    )
    prev_days_for_avg = previous_metrics.get(
        "days_up_to_today"
    ) or previous_metrics.get("total_days", 7)
    prev_total_days = previous_metrics.get("total_days", 7)

    curr_study_avg_mins = compute_pace(curr_study_total, curr_days_for_avg)
    curr_study_avg = format_minutes(curr_study_avg_mins, always_show_both=True) + "/day"
    prev_study_avg_mins = compute_pace(prev_study_total, prev_days_for_avg)
    prev_study_avg = format_minutes(prev_study_avg_mins, always_show_both=True) + "/day"

    ma_study_str = "—"
    if (
        show_ma
        and ma_metrics is not None
        and ma_metrics.get("study_avg_minutes") is not None
    ):
        ma_study_str = (
            format_minutes(ma_metrics["study_avg_minutes"], always_show_both=True)
            + "/day"
        )

    study_pct_str = format_summary_change_label(
        curr_study_avg_mins, prev_study_avg_mins
    )

    study_bar, study_progress_pct = format_progress_bar(
        curr_study_total,
        study_target_minutes,
        RENDER.progress_bar_width,
        RENDER.progress_filled,
        RENDER.progress_empty,
    )

    if show_ma:
        lines.append(
            f"| **STUDY** | `{curr_study_avg}` | `{prev_study_avg}` | `{study_pct_str}` | `{ma_study_str}` | `{study_target_label}` | `{study_bar}` `{study_progress_pct}%` |"
        )
    else:
        lines.append(
            f"| **STUDY** | `{curr_study_avg}` | `{prev_study_avg}` | `{study_pct_str}` | `{study_target_label}` | `{study_bar}` `{study_progress_pct}%` |"
        )

    curr_sleep_avg = current_metrics.get("sleep_avg_minutes") or 0
    prev_sleep_avg = previous_metrics.get("sleep_avg_minutes") or 0
    curr_sleep = format_minutes(curr_sleep_avg, always_show_both=True) + "/night"
    prev_sleep = format_minutes(prev_sleep_avg, always_show_both=True) + "/night"

    ma_sleep_str = "—"
    if (
        show_ma
        and ma_metrics is not None
        and ma_metrics.get("sleep_avg_minutes") is not None
    ):
        ma_sleep_str = (
            format_minutes(ma_metrics["sleep_avg_minutes"], always_show_both=True)
            + "/night"
        )

    sleep_pct_str = format_summary_change_label(curr_sleep_avg, prev_sleep_avg)

    sleep_bar, sleep_progress_pct = format_progress_bar(
        curr_sleep_avg,
        sleep_target_minutes,
        RENDER.progress_bar_width,
        RENDER.progress_filled,
        RENDER.progress_empty,
    )

    if show_ma:
        lines.append(
            f"| **SLEEP** | `{curr_sleep}` | `{prev_sleep}` | `{sleep_pct_str}` | `{ma_sleep_str}` | `{sleep_target_label}` | `{sleep_bar}` `{sleep_progress_pct}%` |"
        )
    else:
        lines.append(
            f"| **SLEEP** | `{curr_sleep}` | `{prev_sleep}` | `{sleep_pct_str}` | `{sleep_target_label}` | `{sleep_bar}` `{sleep_progress_pct}%` |"
        )

    curr_mindful_count = current_metrics.get("mindful_count", 0)
    prev_mindful_count = previous_metrics.get("mindful_count", 0)
    curr_mindful = format_training_ratio(curr_mindful_count, curr_days_for_avg)
    prev_mindful = format_training_ratio(prev_mindful_count, prev_total_days)

    ma_mindful_str = "—"
    if show_ma and ma_metrics is not None and ma_metrics.get("mindful_avg") is not None:
        ma_mindful_str = format_ma_training_ratio(
            ma_metrics["mindful_avg"], ma_training_unit
        )

    curr_mindful_rate = compute_pace(curr_mindful_count, curr_days_for_avg)
    prev_mindful_rate = compute_pace(prev_mindful_count, prev_days_for_avg)
    mindful_pct_str = format_summary_change_label(curr_mindful_rate, prev_mindful_rate)

    mindful_bar, mindful_progress_pct = format_progress_bar(
        curr_mindful_count,
        mindful_target,
        RENDER.progress_bar_width,
        RENDER.progress_filled,
        RENDER.progress_empty,
    )

    if show_ma:
        lines.append(
            f"| **MINDFUL** | `{curr_mindful}` | `{prev_mindful}` | `{mindful_pct_str}` | `{ma_mindful_str}` | `{mindful_target_label}` | `{mindful_bar}` `{mindful_progress_pct}%` |"
        )
    else:
        lines.append(
            f"| **MINDFUL** | `{curr_mindful}` | `{prev_mindful}` | `{mindful_pct_str}` | `{mindful_target_label}` | `{mindful_bar}` `{mindful_progress_pct}%` |"
        )

    curr_workout_count = current_metrics.get("workout_count", 0)
    prev_workout_count = previous_metrics.get("workout_count", 0)
    curr_workout = format_training_ratio(curr_workout_count, curr_days_for_avg)
    prev_workout = format_training_ratio(prev_workout_count, prev_total_days)

    ma_workout_str = "—"
    if show_ma and ma_metrics is not None and ma_metrics.get("workout_avg") is not None:
        ma_workout_str = format_ma_training_ratio(
            ma_metrics["workout_avg"], ma_training_unit
        )

    curr_workout_rate = compute_pace(curr_workout_count, curr_days_for_avg)
    prev_workout_rate = compute_pace(prev_workout_count, prev_days_for_avg)
    workout_pct_str = format_summary_change_label(curr_workout_rate, prev_workout_rate)

    workout_bar, workout_progress_pct = format_progress_bar(
        curr_workout_count,
        workout_target,
        RENDER.progress_bar_width,
        RENDER.progress_filled,
        RENDER.progress_empty,
    )

    if show_ma:
        lines.append(
            f"| **WORKOUT** | `{curr_workout}` | `{prev_workout}` | `{workout_pct_str}` | `{ma_workout_str}` | `{workout_target_label}` | `{workout_bar}` `{workout_progress_pct}%` |"
        )
    else:
        lines.append(
            f"| **WORKOUT** | `{curr_workout}` | `{prev_workout}` | `{workout_pct_str}` | `{workout_target_label}` | `{workout_bar}` `{workout_progress_pct}%` |"
        )

    curr_stretch_count = current_metrics.get("stretch_count", 0)
    prev_stretch_count = previous_metrics.get("stretch_count", 0)
    curr_stretch = format_training_ratio(curr_stretch_count, curr_days_for_avg)
    prev_stretch = format_training_ratio(prev_stretch_count, prev_total_days)

    ma_stretch_str = "—"
    if show_ma and ma_metrics is not None and ma_metrics.get("stretch_avg") is not None:
        ma_stretch_str = format_ma_training_ratio(
            ma_metrics["stretch_avg"], ma_training_unit
        )

    curr_stretch_rate = compute_pace(curr_stretch_count, curr_days_for_avg)
    prev_stretch_rate = compute_pace(prev_stretch_count, prev_days_for_avg)
    stretch_pct_str = format_summary_change_label(curr_stretch_rate, prev_stretch_rate)

    stretch_bar, stretch_progress_pct = format_progress_bar(
        curr_stretch_count,
        stretch_target,
        RENDER.progress_bar_width,
        RENDER.progress_filled,
        RENDER.progress_empty,
    )

    if show_ma:
        lines.append(
            f"| **STRETCH** | `{curr_stretch}` | `{prev_stretch}` | `{stretch_pct_str}` | `{ma_stretch_str}` | `{stretch_target_label}` | `{stretch_bar}` `{stretch_progress_pct}%` |"
        )
    else:
        lines.append(
            f"| **STRETCH** | `{curr_stretch}` | `{prev_stretch}` | `{stretch_pct_str}` | `{stretch_target_label}` | `{stretch_bar}` `{stretch_progress_pct}%` |"
        )

    curr_mood_avg = current_metrics.get("mood_avg") or 0
    prev_mood_avg = previous_metrics.get("mood_avg") or 0
    curr_mood = format_mood_with_scale(curr_mood_avg)
    prev_mood = format_mood_with_scale(prev_mood_avg)

    ma_mood_str = "—"
    if show_ma and ma_metrics is not None and ma_metrics.get("mood_avg") is not None:
        ma_mood_str = format_mood_with_scale(ma_metrics["mood_avg"])

    mood_pct_str = format_summary_change_label(curr_mood_avg, prev_mood_avg)

    mood_bar, mood_progress_pct = format_progress_bar(
        curr_mood_avg,
        mood_target,
        RENDER.progress_bar_width,
        RENDER.progress_filled,
        RENDER.progress_empty,
    )

    if show_ma:
        lines.append(
            f"| **MOOD** | `{curr_mood}` | `{prev_mood}` | `{mood_pct_str}` | `{ma_mood_str}` | `{mood_target_label}` | `{mood_bar}` `{mood_progress_pct}%` |"
        )
    else:
        lines.append(
            f"| **MOOD** | `{curr_mood}` | `{prev_mood}` | `{mood_pct_str}` | `{mood_target_label}` | `{mood_bar}` `{mood_progress_pct}%` |"
        )

    lines.append("")
    return lines
