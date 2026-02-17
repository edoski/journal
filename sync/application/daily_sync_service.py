"""Port-driven daily note synchronization service."""

from __future__ import annotations

import datetime
import os
import re
from dataclasses import dataclass
from typing import Callable

from sync.constants import JOURNAL_DIR
from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.study import StudySessionRecord
from sync.daily.constants import TEMPLATE_PATH
from sync.daily.context import format_context_cell
from sync.daily.orchestrator.frontmatter import update_frontmatter
from sync.daily.orchestrator.note_io import ensure_daily_sections, find_yaml_end
from sync.daily.screen_time import build_procrastination_section
from sync.daily.sleep import build_sleep_section
from sync.daily.training import build_training_section
from sync.formatting import format_minutes
from sync.log import get_logger
from sync.models.deviation import DailyDeviationData
from sync.notes.locking import locked_note
from sync.notes.markdown_tables import (
    escape_markdown_cell,
    render_markdown_row,
    split_markdown_row,
)
from sync.notes.sections import (
    extract_block,
    find_header_idx,
    replace_metrics_block,
    section_bounds,
)
from sync.models.status import (
    CanonicalSleepPayload,
    CanonicalTrainingEntry,
    CanonicalTrainingStatus,
)
from sync.ports.cache import DailyTrainingCacheStore
from sync.ports.context import ContextSource
from sync.ports.notes import NoteStore
from sync.ports.reminders import ReminderRuleStore
from sync.ports.status import DailyStatusSource
from sync.study.section import build_study_section, extract_existing_data

from .goal_sync_service import GoalSyncService

logger = get_logger(__name__)

MAX_REBASE_ATTEMPTS = 2
_REFLECTIONS_HEADER_TITLE = "Reflections"
_REFLECTIONS_TABLE_HEADER = "| TIME | ENTRY |"
_REFLECTIONS_TABLE_DIVIDER = "| ---- | ----- |"
_REFLECTIONS_DIVIDER_CELL_RE = re.compile(r"^:?-{3,}:?$")
_REFLECTIONS_TIME_FULL_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
_REFLECTIONS_TIME_SHORT_HOUR_RE = re.compile(r"^\d:[0-5]\d$")
_REFLECTIONS_TIME_PARTIAL_MIN_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]$")
_REFLECTIONS_TIME_PREFIX_RE = re.compile(
    r"^`?((?:[01]\d|2[0-3]):[0-5]\d|\d:[0-5]\d|(?:[01]\d|2[0-3]):[0-5])`?\s+(.*)$"
)


@dataclass(frozen=True)
class _MetricsSectionResult:
    updated_lines: list[str]
    workout_done: bool
    stretch_done: bool
    meditate_done: bool
    sleep_data: CanonicalSleepPayload | None


@dataclass(frozen=True)
class _ComposeResult:
    updated_lines: list[str]
    fm_changes: dict[str, str]


@dataclass(frozen=True)
class _ReflectionsRowRepair:
    line: str
    repaired: bool
    reason: str | None


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
        day_schedule: DayScheduleProfile,
    ) -> bool | None:
        """Synchronize the daily note for a specific date."""
        today_str = day.isoformat()
        file_path = os.path.join(self.journal_dir, f"{today_str}.md")
        self.training_cache_store.prune(keep_days=14)

        vault_files = self.context_source.files_modified_on_date(day)

        def context_callback(
            session_start: datetime.datetime,
            session_end: datetime.datetime,
        ) -> str:
            wikilinks = self.context_source.links_for_window(
                vault_files, session_start, session_end
            )
            return format_context_cell(wikilinks)

        # External side effect runs once per sync call, outside rebase retries.
        self.status_source.write_study_times(day, sessions, day_schedule)

        for attempt in range(1, MAX_REBASE_ATTEMPTS + 1):
            with locked_note(file_path):
                base_lines = self.note_store.read_or_create(
                    file_path, self.template_path
                )
            if not base_lines:
                return None

            compose_result = self._compose_day_lines(
                base_lines,
                day=day,
                sessions=sessions,
                day_schedule=day_schedule,
                file_path=file_path,
                context_for_session=context_callback,
            )
            updated_lines = self._repair_reflections_tables(
                compose_result.updated_lines,
                note_path=file_path,
            )

            with locked_note(file_path):
                current_lines = self.note_store.read(file_path) or []
                if current_lines != base_lines:
                    if attempt < MAX_REBASE_ATTEMPTS:
                        logger.warning(
                            "Detected concurrent update while syncing %s "
                            "(attempt %d/%d); retrying with rebase.",
                            file_path,
                            attempt,
                            MAX_REBASE_ATTEMPTS,
                        )
                        continue
                    logger.warning(
                        "Detected persistent concurrent updates while syncing %s "
                        "after %d attempts; skipped write.",
                        file_path,
                        MAX_REBASE_ATTEMPTS,
                    )
                    return False

                current_content = "\n".join(current_lines)
                new_content = "\n".join(updated_lines)
                if new_content.strip() == current_content.strip():
                    return False
                self.note_store.write(file_path, updated_lines)

            self._log_frontmatter_changes(today_str, compose_result.fm_changes)
            return True

        return False

    def _compose_day_lines(
        self,
        lines: list[str],
        *,
        day: datetime.date,
        sessions: list[StudySessionRecord],
        day_schedule: DayScheduleProfile,
        file_path: str,
        context_for_session: Callable[[datetime.datetime, datetime.datetime], str],
    ) -> _ComposeResult:
        working_lines = list(lines)
        new_table_lines, study_str = self._build_study_data(
            working_lines,
            sessions,
            context_for_session,
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
        return _ComposeResult(updated_lines=updated_lines, fm_changes=fm_changes)

    @staticmethod
    def _log_frontmatter_changes(today_str: str, fm_changes: dict[str, str]) -> None:
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
            return
        logger.info("Updated %s", today_str + ".md")

    @staticmethod
    def _normalize_reflections_time(raw: str) -> str | None:
        cleaned = raw.strip().strip("`").strip()
        if not cleaned:
            return None
        if _REFLECTIONS_TIME_FULL_RE.fullmatch(cleaned):
            return cleaned
        if _REFLECTIONS_TIME_SHORT_HOUR_RE.fullmatch(cleaned):
            hour, minute = cleaned.split(":")
            return f"{int(hour):02d}:{minute}"
        if _REFLECTIONS_TIME_PARTIAL_MIN_RE.fullmatch(cleaned):
            hour, minute = cleaned.split(":")
            return f"{hour}:{minute}0"
        return None

    @classmethod
    def _extract_time_prefix(cls, value: str) -> tuple[str, str] | None:
        match = _REFLECTIONS_TIME_PREFIX_RE.match(value.strip())
        if not match:
            return None
        normalized = cls._normalize_reflections_time(match.group(1))
        if not normalized:
            return None
        remainder = match.group(2).strip()
        if not remainder:
            return None
        return normalized, remainder

    @staticmethod
    def _merge_cells(cells: list[str]) -> str:
        return " | ".join(cell for cell in cells if cell)

    @staticmethod
    def _is_reflections_divider_cell(cell: str) -> bool:
        return _REFLECTIONS_DIVIDER_CELL_RE.fullmatch(cell.strip()) is not None

    @classmethod
    def _classify_reflections_divider(
        cls,
        cells: list[str] | None,
    ) -> tuple[str, str | None]:
        if cells is None:
            return "missing", None
        if len(cells) >= 2 and all(
            cls._is_reflections_divider_cell(cell) for cell in cells[:2]
        ):
            if len(cells) == 2:
                return "divider", None
            recovered_entry = cls._merge_cells(cells[2:]).strip()
            return "merged_divider_and_row", recovered_entry or None
        return "not_divider", None

    @classmethod
    def _render_reflections_row(cls, time_cell: str, entry_cell: str) -> str:
        time_part = f"`{time_cell}`" if time_cell else ""
        escaped_entry = escape_markdown_cell(entry_cell.strip())
        return render_markdown_row([time_part, escaped_entry])

    @classmethod
    def _repair_reflections_row(cls, line: str) -> _ReflectionsRowRepair:
        cells = split_markdown_row(line)
        if cells is None:
            return _ReflectionsRowRepair(line=line, repaired=False, reason=None)

        original = line.strip()
        if len(cells) == 2:
            first_raw = cells[0].strip().strip("`").strip()
            first_time = cls._normalize_reflections_time(cells[0])
            if first_time is not None:
                rendered = cls._render_reflections_row(first_time, cells[1])
                if rendered == original:
                    return _ReflectionsRowRepair(
                        line=line,
                        repaired=False,
                        reason=None,
                    )
                reason = "canonicalized reflections row"
                if _REFLECTIONS_TIME_SHORT_HOUR_RE.fullmatch(first_raw):
                    reason = "normalized H:MM to HH:MM"
                elif _REFLECTIONS_TIME_PARTIAL_MIN_RE.fullmatch(first_raw):
                    reason = "normalized partial HH:M to HH:M0"
                return _ReflectionsRowRepair(
                    line=rendered, repaired=True, reason=reason
                )

            second_time = cls._normalize_reflections_time(cells[1])
            if second_time is not None:
                rendered = cls._render_reflections_row(second_time, cells[0])
                return _ReflectionsRowRepair(
                    line=rendered,
                    repaired=True,
                    reason="swapped misplaced TIME and ENTRY cells",
                )

            if not cells[1]:
                prefixed = cls._extract_time_prefix(cells[0])
                if prefixed:
                    prefixed_time, prefixed_entry = prefixed
                    rendered = cls._render_reflections_row(
                        prefixed_time,
                        prefixed_entry,
                    )
                    return _ReflectionsRowRepair(
                        line=rendered,
                        repaired=True,
                        reason="split collapsed TIME and ENTRY cell",
                    )

            entry = cls._merge_cells(cells)
            rendered = cls._render_reflections_row("", entry)
            if rendered == original:
                return _ReflectionsRowRepair(line=line, repaired=False, reason=None)
            return _ReflectionsRowRepair(
                line=rendered,
                repaired=True,
                reason="unable to recover TIME; preserved ENTRY with blank TIME",
            )

        first_time = cls._normalize_reflections_time(cells[0])
        if first_time is not None:
            merged_entry = " | ".join(cells[1:]).strip()
            rendered = cls._render_reflections_row(first_time, merged_entry)
            return _ReflectionsRowRepair(
                line=rendered,
                repaired=True,
                reason="merged overflow ENTRY columns",
            )

        entry = cls._merge_cells(cells)
        rendered = cls._render_reflections_row("", entry)
        return _ReflectionsRowRepair(
            line=rendered,
            repaired=True,
            reason="unable to recover TIME from overflow row; preserved ENTRY with blank TIME",
        )

    def _repair_reflections_tables(self, lines: list[str], note_path: str) -> list[str]:
        reflections_idx = find_header_idx(lines, _REFLECTIONS_HEADER_TITLE)
        if reflections_idx == -1:
            return lines

        _, reflections_end = section_bounds(lines, reflections_idx, level=2)
        updated = list(lines)
        abs_path = os.path.abspath(note_path)

        idx = reflections_idx + 1
        while idx < reflections_end:
            header_cells = split_markdown_row(updated[idx])
            if header_cells is None:
                idx += 1
                continue

            if len(header_cells) < 2 or header_cells[-1].strip().lower() != "entry":
                idx += 1
                continue

            if updated[idx].strip() != _REFLECTIONS_TABLE_HEADER:
                updated[idx] = _REFLECTIONS_TABLE_HEADER
                logger.warning(
                    "Repaired Reflections table header in %s:%d",
                    abs_path,
                    idx + 1,
                )

            divider_idx = idx + 1
            divider_cells = (
                split_markdown_row(updated[divider_idx])
                if divider_idx < reflections_end
                else None
            )
            divider_kind, recovered_entry = self._classify_reflections_divider(
                divider_cells
            )
            if divider_kind == "missing":
                updated.insert(divider_idx, _REFLECTIONS_TABLE_DIVIDER)
                reflections_end += 1
                logger.warning(
                    "Inserted Reflections table divider in %s:%d",
                    abs_path,
                    divider_idx + 1,
                )
            elif divider_kind == "divider":
                if updated[divider_idx].strip() != _REFLECTIONS_TABLE_DIVIDER:
                    updated[divider_idx] = _REFLECTIONS_TABLE_DIVIDER
                    logger.warning(
                        "Repaired Reflections table divider in %s:%d",
                        abs_path,
                        divider_idx + 1,
                    )
            elif divider_kind == "merged_divider_and_row":
                updated[divider_idx] = _REFLECTIONS_TABLE_DIVIDER
                logger.warning(
                    "Recovered Reflections table divider in %s:%d",
                    abs_path,
                    divider_idx + 1,
                )
                if recovered_entry:
                    recovered_line = self._render_reflections_row("", recovered_entry)
                    recovered_idx = divider_idx + 1
                    updated.insert(recovered_idx, recovered_line)
                    reflections_end += 1
                    logger.warning(
                        "Recovered Reflections table row from divider in %s:%d",
                        abs_path,
                        recovered_idx + 1,
                    )
            else:
                updated.insert(divider_idx, _REFLECTIONS_TABLE_DIVIDER)
                reflections_end += 1
                logger.warning(
                    "Inserted Reflections table divider before first row in %s:%d",
                    abs_path,
                    divider_idx + 1,
                )

            row_idx = divider_idx + 1
            while row_idx < reflections_end and updated[row_idx].lstrip().startswith(
                "|"
            ):
                repair_result = self._repair_reflections_row(updated[row_idx])
                if repair_result.repaired:
                    updated[row_idx] = repair_result.line
                    logger.warning(
                        "Repaired Reflections table row in %s:%d (%s)",
                        abs_path,
                        row_idx + 1,
                        repair_result.reason or "normalized row",
                    )
                row_idx += 1
            idx = row_idx

        return updated

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

        study_lines = ["### **STUDY**"]
        if new_table_lines:
            study_lines.append("")
            study_lines.extend(new_table_lines)
        else:
            study_lines.append("")
            study_lines.append("_No study sessions completed today._")

        training_lines, _ = build_training_section(
            training_status,
            existing_training_block,
            day.isoformat(),
            training_cache_store=self.training_cache_store,
        )
        sleep_lines = build_sleep_section(sleep_data, existing_sleep_block)
        screen_time_data = self.status_source.load_screen_time(day)
        deviation_data = self._build_deviation_data(
            day,
            day_schedule,
            sessions,
            training_status,
        )
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
            workout_done=training_status.workout_done,
            stretch_done=training_status.stretch_done,
            meditate_done=training_status.meditate_done,
            sleep_data=sleep_data,
        )

    @staticmethod
    def _build_deviation_data(
        day: datetime.date,
        day_schedule: DayScheduleProfile,
        sessions: list[StudySessionRecord],
        training_status: CanonicalTrainingStatus,
    ) -> DailyDeviationData:
        deviation_data = DailyDeviationData()

        day_study_start = datetime.datetime.combine(day, day_schedule.study_start)
        day_study_end = datetime.datetime.combine(day, day_schedule.study_end)
        study_window_minutes = 0.0
        if day_study_end > day_study_start:
            study_window_minutes = (
                day_study_end - day_study_start
            ).total_seconds() / 60

        if sessions:
            first_start = sessions[0]["start"]
            effective_first_start = min(first_start, day_study_end)
            if effective_first_start > day_study_start:
                deviation_data.late_study_start_minutes = (
                    effective_first_start - day_study_start
                ).total_seconds() / 60

            deviation_data.interrupt_minutes = sum(
                (session.get("interruptions_duration", 0) or 0) / 60
                for session in sessions
            )
            deviation_data.overrun_minutes = sum(
                session.get("break_overrun", 0) or 0 for session in sessions
            )
        else:
            deviation_data.late_study_start_minutes = study_window_minutes

        if training_status.workout_entries:
            workout_entries: tuple[CanonicalTrainingEntry, ...] = (
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
                    day_schedule.workout_start.hour * 60
                    + day_schedule.workout_start.minute
                )
                if earliest_workout_start > ideal_workout_minutes:
                    deviation_data.late_workout_start_minutes = (
                        earliest_workout_start - ideal_workout_minutes
                    )

        return deviation_data
