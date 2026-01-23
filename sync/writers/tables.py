"""
Table rendering for the journal sync system.
"""

from __future__ import annotations

from typing import Any

from sync.formatting import (
    format_minutes,
    format_training_ratio,
    format_mood_with_scale,
    format_ma_training_ratio,
    compute_percent_change,
    format_percent_change,
    format_progress_bar,
)
from sync.constants import IDEAL, RENDER


def render_sleep_stats_table(
    sleep_avg: float | None,
    avg_awake: float | None,
    avg_awakenings: float | None,
) -> list[str]:
    """
    Render the SLEEP statistics table with average metrics.

    Args:
        sleep_avg: Average sleep duration in minutes.
        avg_awake: Average awake time during sleep in minutes.
        avg_awakenings: Average number of awakenings per night.

    Returns:
        List of markdown table lines.
    """
    lines: list[str] = []
    lines.append("| ACTIVITY | AVERAGE |")
    lines.append("| -------- | ------- |")
    lines.append(
        f"| **SLEEP**      | `{format_minutes(sleep_avg)}` |"
        if sleep_avg is not None
        else "| **SLEEP**      | |"
    )
    lines.append(
        f"| **AWAKE**      | `{format_minutes(avg_awake)}` |"
        if avg_awake is not None
        else "| **AWAKE**      | |"
    )
    if avg_awakenings is not None:
        awaken_val = (
            f"{avg_awakenings:.1f}"
            if abs(avg_awakenings - round(avg_awakenings)) >= 0.05
            else str(int(round(avg_awakenings)))
        )
        lines.append(f"| **AWAKENINGS** | `{awaken_val}` |")
    else:
        lines.append("| **AWAKENINGS** | |")
    return lines


def render_activity_table(activity_totals: dict[str, float]) -> list[str]:
    """
    Render the ACTIVITY breakdown table with time and share percentages.

    Args:
        activity_totals: Dict mapping activity names to total minutes.

    Returns:
        List of markdown table lines sorted by time (descending).
    """
    lines: list[str] = []
    lines.append("| ACTIVITY | TIME | SHARE |")
    lines.append("| -------- | ---- | ----- |")
    total_activity = sum(activity_totals.values())
    if activity_totals:
        for activity, mins in sorted(
            activity_totals.items(), key=lambda x: x[1], reverse=True
        ):
            share = (
                f"{int(round((mins / total_activity) * 100))}%"
                if total_activity
                else "0%"
            )
            lines.append(f"| **{activity}** | `{format_minutes(mins)}` | `{share}` |")
    else:
        lines.append("|  |  |  |")
    return lines


def render_interrupts_table(avg_interrupts: float, avg_overruns: float) -> list[str]:
    """
    Render the INTERRUPTS/OVERRUNS metrics table.

    Args:
        avg_interrupts: Average interrupt minutes per study day.
        avg_overruns: Average overrun minutes per study day.

    Returns:
        List of markdown table lines.
    """
    lines: list[str] = []
    lines.append("| METRIC | AVERAGE |")
    lines.append("| ------ | ------- |")
    lines.append(
        f"| **INTERRUPTS** | `{format_minutes(avg_interrupts, always_show_both=True)}/day` |"
    )
    lines.append(
        f"| **OVERRUNS**   | `{format_minutes(avg_overruns, always_show_both=True)}/day` |"
    )
    return lines


def render_summary_table(
    current_metrics: dict[str, Any],
    previous_metrics: dict[str, Any],
    current_label: str,
    previous_label: str,
    ma_metrics: dict[str, Any] | None = None,
    ma_label: str | None = None,
    ma_training_unit: str = "7",
    period_type: str = "week",
    total_days: int = 7,
) -> list[str]:
    """
    Generate markdown summary table with averages, previous values, MA, % change, targets, and progress.

    Args:
        current_metrics: Dict with study_total_minutes, sleep_avg_minutes, mood_avg,
                         workout_count, stretch_count, total_days, days_up_to_today
        previous_metrics: Same structure as current_metrics
        current_label: Column header for current period
        previous_label: Column header (wiki link) for previous period
        ma_metrics: Optional dict with MA values (study_avg_minutes, sleep_avg_minutes,
                    mood_avg, workout_avg, stretch_avg)
        ma_label: Column header like "4-WK AVG"
        ma_training_unit: Unit for training MA ("7", "mo", "qtr", "yr")
        period_type: One of "week", "month", "quarter", "year"
        total_days: Number of days in the period for target scaling

    Returns:
        List of markdown lines for the SUMMARY section
    """
    lines = ["### **SUMMARY**", ""]

    show_ma = ma_metrics is not None and ma_label is not None

    # Period suffix for target labels
    period_suffix = {
        "week": "wk",
        "month": "mo",
        "quarter": "qtr",
        "year": "yr",
    }.get(period_type, "wk")

    # Calculate scaled targets
    study_target_minutes = IDEAL.study_minutes_daily * total_days
    sleep_target_minutes = IDEAL.sleep_minutes_nightly  # Always nightly avg
    weeks_in_period = total_days / 7
    workout_target = int(round(IDEAL.workout_days_weekly * weeks_in_period))
    stretch_target = int(round(IDEAL.stretch_days_weekly * weeks_in_period))
    mood_target = IDEAL.mood_target

    # Format target labels
    study_hours = int(study_target_minutes // 60)
    study_target_label = f"{study_hours}h/{period_suffix}"
    sleep_target_label = "8h/night"
    mood_target_label = f"{mood_target:.1f}/10"

    if period_type == "week":
        workout_target_label = f"{workout_target}/7"
        stretch_target_label = f"{stretch_target}/7"
    else:
        workout_target_label = f"{workout_target}/{period_suffix}"
        stretch_target_label = f"{stretch_target}/{period_suffix}"

    # Table header
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

    # STUDY row
    curr_study_total = current_metrics.get("study_total_minutes") or 0
    prev_study_total = previous_metrics.get("study_total_minutes") or 0
    curr_days_for_avg = current_metrics.get("days_up_to_today") or current_metrics.get(
        "total_days", 7
    )
    prev_days_for_avg = previous_metrics.get(
        "days_up_to_today"
    ) or previous_metrics.get("total_days", 7)
    prev_total_days = previous_metrics.get("total_days", 7)

    curr_study_avg_mins = curr_study_total / max(1, curr_days_for_avg)
    curr_study_avg = format_minutes(curr_study_avg_mins, always_show_both=True) + "/day"
    prev_study_avg_mins = prev_study_total / max(1, prev_days_for_avg)
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

    if curr_study_avg_mins > 0 or prev_study_avg_mins > 0:
        study_pct = compute_percent_change(curr_study_avg_mins, prev_study_avg_mins)
        study_pct_str = format_percent_change(study_pct)
    else:
        study_pct_str = "—"

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

    # SLEEP row
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

    if curr_sleep_avg > 0 or prev_sleep_avg > 0:
        sleep_pct = compute_percent_change(curr_sleep_avg, prev_sleep_avg)
        sleep_pct_str = format_percent_change(sleep_pct)
    else:
        sleep_pct_str = "—"

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

    # WORKOUT row — use elapsed days for current period (pace-based comparison)
    curr_workout_count = current_metrics.get("workout_count", 0)
    prev_workout_count = previous_metrics.get("workout_count", 0)
    # Current period uses elapsed days (for fair mid-period comparison)
    curr_workout = format_training_ratio(curr_workout_count, curr_days_for_avg)
    # Previous period uses total days (it's complete)
    prev_workout = format_training_ratio(prev_workout_count, prev_total_days)

    ma_workout_str = "—"
    if show_ma and ma_metrics is not None and ma_metrics.get("workout_avg") is not None:
        ma_workout_str = format_ma_training_ratio(
            ma_metrics["workout_avg"], ma_training_unit
        )

    # Compare completion rates (pace) instead of raw counts
    if curr_workout_count > 0 or prev_workout_count > 0:
        curr_workout_rate = curr_workout_count / max(1, curr_days_for_avg)
        prev_workout_rate = prev_workout_count / max(1, prev_days_for_avg)
        workout_pct = compute_percent_change(curr_workout_rate, prev_workout_rate)
        workout_pct_str = format_percent_change(workout_pct)
    else:
        workout_pct_str = "—"

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

    # STRETCH row — use elapsed days for current period (pace-based comparison)
    curr_stretch_count = current_metrics.get("stretch_count", 0)
    prev_stretch_count = previous_metrics.get("stretch_count", 0)
    # Current period uses elapsed days (for fair mid-period comparison)
    curr_stretch = format_training_ratio(curr_stretch_count, curr_days_for_avg)
    # Previous period uses total days (it's complete)
    prev_stretch = format_training_ratio(prev_stretch_count, prev_total_days)

    ma_stretch_str = "—"
    if show_ma and ma_metrics is not None and ma_metrics.get("stretch_avg") is not None:
        ma_stretch_str = format_ma_training_ratio(
            ma_metrics["stretch_avg"], ma_training_unit
        )

    # Compare completion rates (pace) instead of raw counts
    if curr_stretch_count > 0 or prev_stretch_count > 0:
        curr_stretch_rate = curr_stretch_count / max(1, curr_days_for_avg)
        prev_stretch_rate = prev_stretch_count / max(1, prev_days_for_avg)
        stretch_pct = compute_percent_change(curr_stretch_rate, prev_stretch_rate)
        stretch_pct_str = format_percent_change(stretch_pct)
    else:
        stretch_pct_str = "—"

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

    # MOOD row
    curr_mood_avg = current_metrics.get("mood_avg") or 0
    prev_mood_avg = previous_metrics.get("mood_avg") or 0
    curr_mood = format_mood_with_scale(curr_mood_avg)
    prev_mood = format_mood_with_scale(prev_mood_avg)

    ma_mood_str = "—"
    if show_ma and ma_metrics is not None and ma_metrics.get("mood_avg") is not None:
        ma_mood_str = format_mood_with_scale(ma_metrics["mood_avg"])

    if curr_mood_avg > 0 or prev_mood_avg > 0:
        mood_pct = compute_percent_change(curr_mood_avg, prev_mood_avg)
        mood_pct_str = format_percent_change(mood_pct)
    else:
        mood_pct_str = "—"

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
