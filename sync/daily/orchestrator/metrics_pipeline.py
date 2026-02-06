"""Metrics section pipeline for daily note orchestration."""

from __future__ import annotations

from dataclasses import dataclass

from sync.constants import IDEAL
from sync.contracts.study import StudySessionRecord
from sync.formatting import format_minutes
from sync.models.deviation import DailyDeviationData
from sync.notes.sections import extract_block, find_header_idx, replace_metrics_block
from sync.study.section import build_study_section, extract_existing_data

from ..icloud import load_status_file, write_study_times_to_icloud
from ..screen_time import build_procrastination_section, load_screen_time_data
from ..sleep import build_sleep_section
from ..training import build_training_section


@dataclass(frozen=True)
class MetricsSectionResult:
    """Result payload for metrics section update."""

    updated_lines: list[str]
    workout_done: bool
    stretch_done: bool
    meditate_done: bool
    sleep_data: dict | None


def build_study_data(
    lines: list[str],
    sessions: list[StudySessionRecord],
    context_for_session,
) -> tuple[list[str], str]:
    """Build STUDY table lines and formatted study frontmatter value."""
    existing_notes, existing_context = extract_existing_data(lines)
    new_table_lines, total_focus_minutes = build_study_section(
        sessions,
        existing_notes,
        context_for_session=context_for_session,
        existing_context=existing_context,
    )
    study_str = format_minutes(total_focus_minutes, always_show_both=True)
    return new_table_lines, study_str


def _build_deviation_data(
    sessions: list[StudySessionRecord],
    workout_data,
) -> DailyDeviationData:
    """Compute daily deviation signals from study sessions and workout starts."""
    deviation_data = DailyDeviationData()

    if sessions:
        # Late study start: first session vs ideal start hour
        first_start = sessions[0]["start"]
        ideal_study_start = first_start.replace(
            hour=IDEAL.study_start_hour, minute=0, second=0, microsecond=0
        )
        if first_start > ideal_study_start:
            deviation_data.late_study_start_minutes = (
                first_start - ideal_study_start
            ).total_seconds() / 60

        # Sum interrupts (stored in seconds) and overruns (stored in minutes)
        deviation_data.interrupt_minutes = sum(
            (s.get("interruptions_duration", 0) or 0) / 60 for s in sessions
        )
        deviation_data.overrun_minutes = sum(
            s.get("break_overrun", 0) or 0 for s in sessions
        )

    # Late workout start: first workout start vs 6:00 PM ideal
    if workout_data:
        workout_entries = (
            workout_data if isinstance(workout_data, list) else [workout_data]
        )
        # Find earliest workout start time
        earliest_workout_start = None
        for entry in workout_entries:
            start_str = (entry.get("start") or "").strip()
            if start_str and (entry.get("type") or "").lower() != "stretching":
                try:
                    h, m = map(int, start_str.split(":"))
                    start_minutes = h * 60 + m
                    if (
                        earliest_workout_start is None
                        or start_minutes < earliest_workout_start
                    ):
                        earliest_workout_start = start_minutes
                except (ValueError, AttributeError):
                    pass
        if earliest_workout_start is not None:
            ideal_workout_minutes = IDEAL.workout_start_hour * 60  # 6:00 PM = 18:00
            if earliest_workout_start > ideal_workout_minutes:
                deviation_data.late_workout_start_minutes = (
                    earliest_workout_start - ideal_workout_minutes
                )

    return deviation_data


def apply_metrics_block(
    lines: list[str],
    sessions: list[StudySessionRecord],
    today_str: str,
    new_table_lines: list[str],
) -> MetricsSectionResult:
    """Build and replace the Metrics section while preserving unrelated sections."""
    metrics_idx = find_header_idx(lines, "Metrics")

    # Recompute Metrics separator after Goals rewrite.
    metrics_divider_idx = metrics_idx + 1 if metrics_idx != -1 else -1

    # Identify current Metrics body (used for fallback blocks) without touching later sections.
    metrics_body_start = metrics_divider_idx + 1 if metrics_divider_idx != -1 else 0
    reflections_idx = find_header_idx(
        lines,
        "Reflections",
        start=metrics_body_start,
    )
    metrics_body = (
        lines[metrics_body_start:reflections_idx]
        if reflections_idx != -1
        else lines[metrics_body_start:]
    )

    # Load activity status files
    workout_done, workout_data = load_status_file("workout_status.json")
    stretch_done, stretch_data = load_status_file("stretching_status.json")
    meditate_done, meditation_data = load_status_file("meditation_status.json")
    _, sleep_data = load_status_file("sleep_status.json")

    # Extract existing blocks for fallback (using shared extract_block)
    existing_training_block = extract_block(metrics_body, "### **training**")
    existing_sleep_block = extract_block(metrics_body, "### **sleep**")

    # Build Metrics body lines
    study_lines = ["### **STUDY**"]
    if new_table_lines:
        study_lines.append("")
        study_lines.extend(new_table_lines)
    else:
        study_lines.append("")
        study_lines.append("_No study sessions completed today._")

    training_lines, _ = build_training_section(
        workout_data, stretch_data, meditation_data, existing_training_block, today_str
    )

    sleep_lines = build_sleep_section(sleep_data, existing_sleep_block)

    # Load screen time data and build procrastination section
    screen_time_data = load_screen_time_data(today_str)
    deviation_data = _build_deviation_data(sessions, workout_data)

    # Write study times to iCloud for iPad shortcut
    write_study_times_to_icloud(sessions, today_str)

    procrastination_lines = build_procrastination_section(
        screen_time_data, deviation_data
    )

    # Join metrics subsections with single blank between, none before first, none trailing
    sections = [study_lines, training_lines, procrastination_lines, sleep_lines]
    metrics_lines: list[str] = []
    for sec in sections:
        if not sec:
            continue
        if metrics_lines:
            metrics_lines.append("")
        metrics_lines.extend(sec)

    # Splice Metrics via shared helper (keeps content after Metrics intact)
    updated_lines = replace_metrics_block(lines, metrics_lines)

    return MetricsSectionResult(
        updated_lines=updated_lines,
        workout_done=workout_done,
        stretch_done=stretch_done,
        meditate_done=meditate_done,
        sleep_data=sleep_data,
    )
