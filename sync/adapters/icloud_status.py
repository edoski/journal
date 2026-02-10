"""iCloud shortcut status source adapter."""

from __future__ import annotations

import datetime

from sync.contracts.study import StudySessionRecord
from sync.daily.icloud import (
    finalize_status_file,
    quarantine_status_file,
    read_status_file,
    write_study_times_to_icloud,
)
from sync.daily.screen_time import load_screen_time_data
from sync.log import get_logger
from sync.models.screen_time import DailyScreenTimeData
from sync.models.status import (
    CanonicalSleepPayload,
    CanonicalTrainingEntry,
    CanonicalTrainingStatus,
)
from sync.ports.cache import DailyScreenTimeCacheStore
from sync.ports.status import DailyStatusSource

from .status_parsers import (
    parse_activity_payload,
    parse_sleep_payload,
    parse_training_payload,
)

logger = get_logger(__name__)


class ICloudDailyStatusSource(DailyStatusSource):
    """Load daily shortcut payloads from iCloud drop files."""

    def __init__(self, *, screen_time_cache_store: DailyScreenTimeCacheStore) -> None:
        self.screen_time_cache_store = screen_time_cache_store

    def load_training(self, day: datetime.date) -> CanonicalTrainingStatus:
        """Load workout/stretch/meditation payloads for the day."""
        workout_entries = self._load_training_entries(
            "workout_status.json",
            "workout",
            day,
        )
        stretch_entries = self._load_training_entries(
            "stretching_status.json",
            "stretching",
            day,
        )
        meditation_entries = self._load_training_entries(
            "meditation_status.json",
            "meditation",
            day,
        )
        return CanonicalTrainingStatus(
            workout_entries=tuple(workout_entries),
            stretch_entries=tuple(stretch_entries),
            meditation_entries=tuple(meditation_entries),
        )

    def _load_training_entries(
        self,
        filename: str,
        source_kind: str,
        day: datetime.date,
    ) -> list[CanonicalTrainingEntry]:
        success, payload, parsed_path = read_status_file(filename)
        if not success or payload is None:
            return []
        try:
            entries = parse_training_payload(payload, source_kind, day)
        except ValueError as exc:
            logger.error("%s: %s", filename, exc)
            quarantine_status_file(filename, parsed_path)
            return []

        finalize_status_file(filename, parsed_path)
        return entries

    def load_sleep(self, day: datetime.date) -> CanonicalSleepPayload | None:
        """Load sleep payload for the day if available."""
        filename = "sleep_status.json"
        success, payload, parsed_path = read_status_file(filename)
        if not success or payload is None:
            return None

        try:
            parsed = parse_sleep_payload(payload, day)
        except ValueError as exc:
            logger.error("%s: %s", filename, exc)
            quarantine_status_file(filename, parsed_path)
            return None

        finalize_status_file(filename, parsed_path)
        return parsed

    def load_screen_time(self, day: datetime.date) -> DailyScreenTimeData | None:
        """Load grouped screen-time payload for the day."""
        self.screen_time_cache_store.prune(keep_days=14)
        filename = "activity_status.json"
        success, payload, parsed_path = read_status_file(filename)
        parsed_activity = None
        if success and payload is not None:
            try:
                parsed_activity = parse_activity_payload(payload, day)
            except ValueError as exc:
                logger.error("%s: %s", filename, exc)
                quarantine_status_file(filename, parsed_path)
            else:
                finalize_status_file(filename, parsed_path)

        return load_screen_time_data(
            day.isoformat(),
            activity_payload=parsed_activity,
            screen_time_cache_store=self.screen_time_cache_store,
        )

    def write_study_times(
        self,
        day: datetime.date,
        sessions: list[StudySessionRecord],
    ) -> None:
        """Persist study times for iPad shortcut consumption."""
        write_study_times_to_icloud(sessions, day.isoformat())
