"""Port-driven daily note synchronization service."""

from __future__ import annotations

import datetime
import os
from dataclasses import dataclass

from sync.constants import IDEAL, JOURNAL_DIR
from sync.contracts.daily import SleepStatusPayload
from sync.contracts.study import StudySessionRecord
from sync.daily.constants import TEMPLATE_PATH
from sync.daily.context import format_context_cell
from sync.daily.orchestrator.frontmatter import update_frontmatter
from sync.daily.orchestrator.note_io import ensure_daily_sections, find_yaml_end
from sync.daily.screen_time import build_procrastination_section
from sync.daily.sleep import build_sleep_section
from sync.daily.training import build_training_section
from sync.formatting import format_minutes
from sync.logging import get_logger
from sync.models.deviation import DailyDeviationData
from sync.notes.locking import locked_note
from sync.notes.sections import extract_block, find_header_idx, replace_metrics_block
from sync.ports.cache import DailyTrainingCacheStore
from sync.ports.context import ContextSource
from sync.ports.notes import NoteStore
from sync.ports.reminders import ReminderRuleStore
from sync.ports.status import DailyStatusSource
from sync.study.section import build_study_section, extract_existing_data

from .goal_sync_service import GoalSyncService

logger = get_logger()


@dataclass(frozen=True)
class _MetricsSectionResult:
    updated_lines: list[str]
    workout_done: bool
    stretch_done: bool
    meditate_done: bool
    sleep_data: SleepStatusPayload | None


class DailySyncService:
    """Synchronize a single daily note using only port dependencies."""

    def __init__(
        self,
        *,
        note_store: NoteStore,
        status_source: DailyStatusSource,
        context_source: ContextSource,
        reminder_store: ReminderRuleStore,
        goal_sync_service: GoalSyncService,
        training_cache_store: DailyTrainingCacheStore,
        journal_dir: str = JOURNAL_DIR,
        template_path: str = TEMPLATE_PATH,
    ) -> None:
        self.note_store = note_store
        self.status_source = status_source
        self.context_source = context_source
        self.reminder_store = reminder_store
        self.goal_sync_service = goal_sync_service
        self.training_cache_store = training_cache_store
        self.journal_dir = journal_dir
        self.template_path = template_path

    def sync_day(
        self,
        day: datetime.date,
        sessions: list[StudySessionRecord],
    ) -> bool | None:
        """Synchronize the daily note for a specific date."""
        today_str = day.isoformat()
        file_path = os.path.join(self.journal_dir, f"{today_str}.md")
        self.training_cache_store.prune(keep_days=14)

        with locked_note(file_path):
            lines = self.note_store.read_or_create(file_path, self.template_path)
        if not lines:
            return None

        vault_files = self.context_source.files_modified_on_date(day)

        def context_callback(
            session_start: datetime.datetime,
            session_end: datetime.datetime,
        ) -> str:
            wikilinks = self.context_source.links_for_window(
                vault_files, session_start, session_end
            )
            return format_context_cell(wikilinks)

        new_table_lines, study_str = self._build_study_data(
            lines,
            sessions,
            context_callback,
        )

        yaml_end_idx = find_yaml_end(lines)
        ensure_daily_sections(lines, yaml_end_idx)
        lines = self._apply_goals_section(lines, day, file_path, yaml_end_idx)
        metrics_result = self._apply_metrics_block(
            lines, sessions, day, new_table_lines
        )

        updated_lines, fm_changes = update_frontmatter(
            metrics_result.updated_lines,
            study_str,
            metrics_result.workout_done,
            metrics_result.stretch_done,
            metrics_result.meditate_done,
            metrics_result.sleep_data,
        )

        with locked_note(file_path):
            current_lines = self.note_store.read(file_path) or []
            current_content = "\n".join(current_lines)
            new_content = "\n".join(updated_lines)
            if new_content.strip() == current_content.strip():
                return False
            self.note_store.write(file_path, updated_lines)

        if fm_changes:
            parts = []
            for key in ("study", "meditate", "workout", "stretch", "sleep"):
                if key not in fm_changes:
                    continue
                val = fm_changes[key]
                if val == "true":
                    parts.append(f"{key}=✓")
                elif val == "false":
                    continue
                else:
                    parts.append(f"{key}={val}")
            if parts:
                logger.info("Updated %s — %s", today_str + ".md", ", ".join(parts))
            else:
                logger.info("Updated %s", today_str + ".md")
        else:
            logger.info("Updated %s", today_str + ".md")

        return True

    def _build_study_data(
        self,
        lines: list[str],
        sessions: list[StudySessionRecord],
        context_for_session,
    ) -> tuple[list[str], str]:
        existing_notes, existing_context = extract_existing_data(lines)
        new_table_lines, total_focus_minutes = build_study_section(
            sessions,
            existing_notes,
            context_for_session=context_for_session,
            existing_context=existing_context,
        )
        study_str = format_minutes(total_focus_minutes, always_show_both=True)
        return new_table_lines, study_str

    def _apply_goals_section(
        self,
        lines: list[str],
        day: datetime.date,
        file_path: str,
        yaml_end_idx: int,
    ) -> list[str]:
        rules = self.reminder_store.load()
        return self.goal_sync_service.sync_daily_note(
            lines,
            day=day,
            note_path=file_path,
            yaml_end_idx=yaml_end_idx,
            reminder_rules=rules,
        )

    def _apply_metrics_block(
        self,
        lines: list[str],
        sessions: list[StudySessionRecord],
        day: datetime.date,
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

        training_bundle = self.status_source.load_training(day)
        sleep_data = self.status_source.load_sleep(day)
        existing_training_block = extract_block(metrics_body, "### **training**")
        existing_sleep_block = extract_block(metrics_body, "### **sleep**")

        study_lines = ["### **STUDY**"]
        if new_table_lines:
            study_lines.append("")
            study_lines.extend(new_table_lines)
        else:
            study_lines.append("")
            study_lines.append("_No study sessions completed today._")

        training_lines, _ = build_training_section(
            training_bundle.workout_payload,
            training_bundle.stretch_payload,
            training_bundle.meditate_payload,
            existing_training_block,
            day.isoformat(),
            training_cache_store=self.training_cache_store,
        )
        sleep_lines = build_sleep_section(sleep_data, existing_sleep_block)
        screen_time_data = self.status_source.load_screen_time(day)
        deviation_data = self._build_deviation_data(
            sessions, training_bundle.workout_payload
        )
        self.status_source.write_study_times(day, sessions)
        procrastination_lines = build_procrastination_section(
            screen_time_data,
            deviation_data,
        )

        sections = [study_lines, training_lines, procrastination_lines, sleep_lines]
        metrics_lines: list[str] = []
        for section in sections:
            if not section:
                continue
            if metrics_lines:
                metrics_lines.append("")
            metrics_lines.extend(section)

        updated_lines = replace_metrics_block(lines, metrics_lines)
        return _MetricsSectionResult(
            updated_lines=updated_lines,
            workout_done=training_bundle.workout_done,
            stretch_done=training_bundle.stretch_done,
            meditate_done=training_bundle.meditate_done,
            sleep_data=sleep_data,
        )

    @staticmethod
    def _build_deviation_data(
        sessions: list[StudySessionRecord],
        workout_data,
    ) -> DailyDeviationData:
        deviation_data = DailyDeviationData()

        if sessions:
            first_start = sessions[0]["start"]
            ideal_study_start = first_start.replace(
                hour=IDEAL.study_start_hour, minute=0, second=0, microsecond=0
            )
            if first_start > ideal_study_start:
                deviation_data.late_study_start_minutes = (
                    first_start - ideal_study_start
                ).total_seconds() / 60

            deviation_data.interrupt_minutes = sum(
                (session.get("interruptions_duration", 0) or 0) / 60
                for session in sessions
            )
            deviation_data.overrun_minutes = sum(
                session.get("break_overrun", 0) or 0 for session in sessions
            )

        if workout_data:
            workout_entries = (
                workout_data if isinstance(workout_data, list) else [workout_data]
            )
            earliest_workout_start = None
            for entry in workout_entries:
                start_str = (entry.get("start") or "").strip()
                if start_str and (entry.get("type") or "").lower() != "stretching":
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
                ideal_workout_minutes = IDEAL.workout_start_hour * 60
                if earliest_workout_start > ideal_workout_minutes:
                    deviation_data.late_workout_start_minutes = (
                        earliest_workout_start - ideal_workout_minutes
                    )

        return deviation_data
