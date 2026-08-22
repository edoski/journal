"""Daily note composition over typed daily inputs."""

from __future__ import annotations

import datetime
from dataclasses import dataclass

from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.status import SleepPayload
from sync.contracts.study import StudySessionRecord
from sync.daily.orchestrator.frontmatter import update_frontmatter
from sync.daily.orchestrator.note_io import ensure_metrics_section, find_yaml_end
from sync.daily.sleep import build_sleep_section
from sync.daily.training import build_training_section
from sync.formatting import format_minutes
from sync.notes.sections import (
    extract_block,
    find_header_idx,
    replace_metrics_block,
    section_bounds,
)
from sync.ports.state import DailyTrainingStateStore
from sync.ports.status import DailyStatusSource
from sync.study.section import build_study_section


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
    sleep_data: SleepPayload | None


@dataclass(frozen=True)
class DailyNoteComposer:
    """Compose daily-note markdown from loaded daily inputs."""

    status_source: DailyStatusSource
    training_state_store: DailyTrainingStateStore

    def compose(
        self,
        lines: list[str],
        *,
        day: datetime.date,
        sessions: list[StudySessionRecord],
        day_schedule: DayScheduleProfile,
    ) -> DailyComposeResult:
        working_lines = list(lines)
        new_table_lines, study_str = self._build_study_data(
            sessions,
        )

        yaml_end_idx = find_yaml_end(working_lines)
        ensure_metrics_section(working_lines, yaml_end_idx)
        metrics_result = self._apply_metrics_block(
            working_lines,
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
            metrics_result.sleep_data,
        )
        return DailyComposeResult(updated_lines=updated_lines, fm_changes=fm_changes)

    @staticmethod
    def _build_study_data(
        sessions: list[StudySessionRecord],
    ) -> tuple[list[str], str]:
        new_table_lines, total_focus_minutes = build_study_section(sessions)
        study_str = format_minutes(total_focus_minutes, always_show_both=True)
        return new_table_lines, study_str

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
        _, metrics_end = section_bounds(lines, metrics_idx, level=2)
        metrics_body = lines[metrics_body_start:metrics_end]

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
            training_state_store=self.training_state_store,
        )
        sleep_lines = build_sleep_section(sleep_data, existing_sleep_block)
        metrics_lines: list[str] = []
        for section in [
            study_lines,
            training_lines,
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
            sleep_data=sleep_data,
        )
