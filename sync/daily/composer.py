"""Daily note composition over typed daily inputs."""

from __future__ import annotations

import datetime
from collections.abc import Callable
from dataclasses import dataclass

from sync.contracts.deviation import DailyDeviationData
from sync.contracts.reminders import ReminderRule
from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.status import SleepPayload, TrainingEntryPayload, TrainingStatus
from sync.contracts.study import StudySessionRecord
from sync.daily.orchestrator.frontmatter import update_frontmatter
from sync.daily.orchestrator.note_io import ensure_daily_sections, find_yaml_end
from sync.daily.screen_time import build_procrastination_section
from sync.daily.sleep import build_sleep_section
from sync.daily.training import build_training_section
from sync.formatting import format_minutes
from sync.notes.markdown_tables import split_markdown_row
from sync.notes.sections import (
    extract_block,
    find_header_idx,
    replace_metrics_block,
    section_bounds,
)
from sync.ports.cache import DailyTrainingCacheStore
from sync.ports.status import DailyStatusSource
from sync.study.section import build_study_section
from sync.target_policy import effective_study_minutes

_REFLECTIONS_HEADER_TITLE = "Reflections"
_REFLECTIONS_TABLE_HEADER = "| TIME | ENTRY |"
_REFLECTIONS_TABLE_DIVIDER = "| ---- | ----- |"

DailyGoalSync = Callable[
    [list[str], datetime.date, str, int, list[ReminderRule]],
    list[str],
]


@dataclass(frozen=True)
class DailyComposeResult:
    """Composed daily note lines plus frontmatter changes."""

    updated_lines: list[str]
    fm_changes: dict[str, str]


@dataclass(frozen=True)
class _MetricsSectionResult:
    updated_lines: list[str]
    workout_done: bool
    stretch_done: bool
    meditate_done: bool
    sleep_data: SleepPayload | None


@dataclass(frozen=True)
class DailyNoteComposer:
    """Compose daily-note markdown from loaded daily inputs."""

    status_source: DailyStatusSource
    training_cache_store: DailyTrainingCacheStore
    load_reminder_rules: Callable[[], list[ReminderRule]]
    sync_goals: DailyGoalSync

    def compose(
        self,
        lines: list[str],
        *,
        day: datetime.date,
        sessions: list[StudySessionRecord],
        day_schedule: DayScheduleProfile,
        file_path: str,
    ) -> DailyComposeResult:
        working_lines = list(lines)
        new_table_lines, study_str = self._build_study_data(
            sessions,
        )

        yaml_end_idx = find_yaml_end(working_lines)
        ensure_daily_sections(working_lines, yaml_end_idx)
        lines_with_goals = self._apply_goals_section(
            working_lines,
            day,
            file_path,
            yaml_end_idx,
        )
        metrics_result = self._apply_metrics_block(
            lines_with_goals,
            sessions,
            day,
            day_schedule,
            new_table_lines,
        )

        updated_lines, fm_changes = update_frontmatter(
            metrics_result.updated_lines,
            study_str,
            metrics_result.workout_done,
            metrics_result.stretch_done,
            metrics_result.meditate_done,
            metrics_result.sleep_data,
        )
        updated_lines = normalize_reflections_table_header(updated_lines)
        return DailyComposeResult(updated_lines=updated_lines, fm_changes=fm_changes)

    @staticmethod
    def _build_study_data(
        sessions: list[StudySessionRecord],
    ) -> tuple[list[str], str]:
        new_table_lines, total_focus_minutes = build_study_section(sessions)
        study_str = format_minutes(total_focus_minutes, always_show_both=True)
        return new_table_lines, study_str

    def _apply_goals_section(
        self,
        lines: list[str],
        day: datetime.date,
        file_path: str,
        yaml_end_idx: int,
    ) -> list[str]:
        return self.sync_goals(
            lines,
            day,
            file_path,
            yaml_end_idx,
            self.load_reminder_rules(),
        )

    def _apply_metrics_block(
        self,
        lines: list[str],
        sessions: list[StudySessionRecord],
        day: datetime.date,
        day_schedule: DayScheduleProfile,
        new_table_lines: list[str],
    ) -> _MetricsSectionResult:
        metrics_idx = find_header_idx(lines, "Metrics")
        metrics_divider_idx = metrics_idx + 1 if metrics_idx != -1 else -1
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

        training_status = self.status_source.load_training(day)
        sleep_data = self.status_source.load_sleep(day)
        existing_training_block = extract_block(metrics_body, "### **training**")
        existing_sleep_block = extract_block(metrics_body, "### **sleep**")

        study_lines = ["### **STUDY**", ""]
        if new_table_lines:
            study_lines.extend(new_table_lines)
        else:
            study_lines.append("_No study sessions available._")

        training_lines, _ = build_training_section(
            training_status,
            existing_training_block,
            day.isoformat(),
            training_cache_store=self.training_cache_store,
        )
        sleep_lines = build_sleep_section(sleep_data, existing_sleep_block)
        screen_time_data = self.status_source.load_screen_time(day)
        deviation_data = build_deviation_data(
            day,
            day_schedule,
            sessions,
            training_status,
        )
        procrastination_lines = build_procrastination_section(
            screen_time_data,
            deviation_data,
            max_total_minutes=float(effective_study_minutes(day_schedule)),
        )

        metrics_lines: list[str] = []
        for section in [
            study_lines,
            training_lines,
            procrastination_lines,
            sleep_lines,
        ]:
            if not section:
                continue
            if metrics_lines:
                metrics_lines.append("")
            metrics_lines.extend(section)

        return _MetricsSectionResult(
            updated_lines=replace_metrics_block(lines, metrics_lines),
            workout_done=training_status.workout_done,
            stretch_done=training_status.stretch_done,
            meditate_done=training_status.meditate_done,
            sleep_data=sleep_data,
        )


def _is_reflections_divider_cell(cell: str) -> bool:
    marker = cell.strip()
    if marker.startswith(":"):
        marker = marker[1:]
    if marker.endswith(":"):
        marker = marker[:-1]
    return len(marker) >= 3 and set(marker) == {"-"}


def normalize_reflections_table_header(lines: list[str]) -> list[str]:
    """Normalize the Reflections table header without changing body rows."""
    reflections_idx = find_header_idx(lines, _REFLECTIONS_HEADER_TITLE)
    if reflections_idx == -1:
        return lines

    _, reflections_end = section_bounds(lines, reflections_idx, level=2)
    header_idx = -1
    for idx in range(reflections_idx + 1, reflections_end):
        cells = split_markdown_row(lines[idx])
        if cells is None or len(cells) < 2:
            continue
        if cells[1].strip().lower() == "entry":
            header_idx = idx
            break

    if header_idx == -1:
        return lines

    updated = list(lines)
    changed = False
    if updated[header_idx].strip() != _REFLECTIONS_TABLE_HEADER:
        updated[header_idx] = _REFLECTIONS_TABLE_HEADER
        changed = True

    divider_idx = header_idx + 1
    divider_cells = (
        split_markdown_row(updated[divider_idx])
        if divider_idx < reflections_end
        else None
    )
    has_divider = (
        divider_cells is not None
        and len(divider_cells) >= 2
        and all(_is_reflections_divider_cell(cell) for cell in divider_cells[:2])
    )
    if has_divider:
        if updated[divider_idx].strip() != _REFLECTIONS_TABLE_DIVIDER:
            updated[divider_idx] = _REFLECTIONS_TABLE_DIVIDER
            changed = True
    else:
        updated.insert(divider_idx, _REFLECTIONS_TABLE_DIVIDER)
        changed = True

    return updated if changed else lines


def build_deviation_data(
    day: datetime.date,
    day_schedule: DayScheduleProfile,
    sessions: list[StudySessionRecord],
    training_status: TrainingStatus,
) -> DailyDeviationData:
    """Build daily deviation data from schedule, sessions, and training status."""
    deviation_data = DailyDeviationData()

    study_window_minutes = 0.0
    day_study_start = datetime.datetime.combine(day, day_schedule.study_start)
    day_study_end = datetime.datetime.combine(day, day_schedule.study_end)
    if not day_schedule.is_off_day and day_study_end > day_study_start:
        study_window_minutes = (day_study_end - day_study_start).total_seconds() / 60

    if sessions:
        if not day_schedule.is_off_day:
            first_start = sessions[0]["start"]
            effective_first_start = min(first_start, day_study_end)
            if effective_first_start > day_study_start:
                deviation_data.late_study_start_minutes = (
                    effective_first_start - day_study_start
                ).total_seconds() / 60

        deviation_data.interrupt_minutes = sum(
            (session.get("interruptions_duration", 0) or 0) / 60 for session in sessions
        )
        deviation_data.overrun_minutes = sum(
            session.get("break_overrun", 0) or 0 for session in sessions
        )
    else:
        deviation_data.late_study_start_minutes = study_window_minutes

    if training_status.workout_entries:
        workout_entries: tuple[TrainingEntryPayload, ...] = (
            training_status.workout_entries
        )
        earliest_workout_start = None
        for entry in workout_entries:
            start_str = (entry.start or "").strip()
            if start_str and entry.type.lower() != "stretching":
                try:
                    h, m = map(int, start_str.split(":"))
                except (ValueError, AttributeError):
                    continue
                start_minutes = h * 60 + m
                if (
                    earliest_workout_start is None
                    or start_minutes < earliest_workout_start
                ):
                    earliest_workout_start = start_minutes
        if earliest_workout_start is not None:
            ideal_workout_minutes = (
                day_schedule.workout_start.hour * 60 + day_schedule.workout_start.minute
            )
            if earliest_workout_start > ideal_workout_minutes:
                deviation_data.late_workout_start_minutes = (
                    earliest_workout_start - ideal_workout_minutes
                )

    return deviation_data
