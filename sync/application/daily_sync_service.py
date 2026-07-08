"""Port-driven daily note synchronization service."""

from __future__ import annotations

import datetime
import os

from sync.constants import JOURNAL_DIR
from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.study import StudySessionRecord
from sync.daily.composer import DailyNoteComposer
from sync.daily.constants import TEMPLATE_PATH
from sync.log import get_logger
from sync.notes.locking import locked_note
from sync.ports.cache import DailyTrainingCacheStore
from sync.ports.notes import NoteStore
from sync.ports.status import DailyStatusSource

logger = get_logger(__name__)


class DailySyncService:
    """Synchronize a single daily note using only port dependencies."""

    def __init__(
        self,
        *,
        note_store: NoteStore,
        status_source: DailyStatusSource,
        training_cache_store: DailyTrainingCacheStore,
        journal_dir: str = JOURNAL_DIR,
        template_path: str = TEMPLATE_PATH,
    ) -> None:
        self.note_store = note_store
        self.status_source = status_source
        self.training_cache_store = training_cache_store
        self.journal_dir = journal_dir
        self.template_path = template_path
        self.composer = DailyNoteComposer(
            status_source=status_source,
            training_cache_store=training_cache_store,
        )

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

        with locked_note(file_path):
            base_lines = self.note_store.read_or_create(file_path, self.template_path)
        if not base_lines:
            return None

        compose_result = self.composer.compose(
            base_lines,
            day=day,
            sessions=sessions,
            day_schedule=day_schedule,
        )
        updated_lines = compose_result.updated_lines

        with locked_note(file_path):
            current_lines = self.note_store.read(file_path) or []
            if current_lines != base_lines:
                logger.warning(
                    "Detected concurrent update while syncing %s; skipped write.",
                    file_path,
                )
                return False

            current_content = "\n".join(current_lines)
            new_content = "\n".join(updated_lines)
            if new_content.strip() == current_content.strip():
                return False
            self.note_store.write(file_path, updated_lines)

        self._log_frontmatter_changes(today_str, compose_result.fm_changes)
        return True

    @staticmethod
    def _log_frontmatter_changes(today_str: str, fm_changes: dict[str, str]) -> None:
        if fm_changes:
            parts: list[str] = []
            for key in ("study", "workout", "stretch", "sleep"):
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
