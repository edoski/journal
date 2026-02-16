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
from sync.contracts.schedule import DayScheduleProfile
from sync.models.screen_time import DailyScreenTimeData
from sync.models.status import (
    CanonicalActivityPayload,
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
        self._anchor_day: datetime.date | None = None
        self._resolved_days: tuple[datetime.date, ...] = ()
        self._training_by_day: dict[
            datetime.date,
            dict[str, list[CanonicalTrainingEntry]],
        ] = {}
        self._sleep_by_day: dict[datetime.date, CanonicalSleepPayload] = {}
        self._activity_by_day: dict[datetime.date, CanonicalActivityPayload] = {}

    def target_days(self, anchor_day: datetime.date) -> tuple[datetime.date, ...]:
        """Resolve all shortcut-targeted days for this run."""
        if self._anchor_day == anchor_day:
            return self._resolved_days

        self._reset_staging(anchor_day)
        self.screen_time_cache_store.prune(keep_days=14)
        resolved_days: set[datetime.date] = {anchor_day}

        self._ingest_training_file(
            "workout_status.json",
            "workout",
            anchor_day=anchor_day,
            resolved_days=resolved_days,
        )
        self._ingest_training_file(
            "stretching_status.json",
            "stretching",
            anchor_day=anchor_day,
            resolved_days=resolved_days,
        )
        self._ingest_training_file(
            "meditation_status.json",
            "meditation",
            anchor_day=anchor_day,
            resolved_days=resolved_days,
        )
        self._ingest_sleep_file(anchor_day=anchor_day, resolved_days=resolved_days)
        self._ingest_activity_file(anchor_day=anchor_day, resolved_days=resolved_days)
        self._resolved_days = tuple(sorted(resolved_days))
        return self._resolved_days

    def _reset_staging(self, anchor_day: datetime.date) -> None:
        self._anchor_day = anchor_day
        self._resolved_days = (anchor_day,)
        self._training_by_day = {}
        self._sleep_by_day = {}
        self._activity_by_day = {}

    def _ensure_ingested(self, anchor_day: datetime.date) -> None:
        if self._anchor_day is None:
            self.target_days(anchor_day)

    @staticmethod
    def _validate_payload_day(
        date_str: str,
        *,
        filename: str,
        anchor_day: datetime.date,
    ) -> datetime.date:
        try:
            payload_day = datetime.date.fromisoformat(date_str)
        except ValueError as exc:
            raise ValueError(
                f"Invalid {filename} payload: date must be YYYY-MM-DD"
            ) from exc
        if payload_day > anchor_day:
            raise ValueError(
                "Invalid "
                f"{filename} payload: date '{date_str}' is in the future "
                f"relative to run day '{anchor_day.isoformat()}'"
            )
        return payload_day

    def _ingest_training_file(
        self,
        filename: str,
        source_kind: str,
        *,
        anchor_day: datetime.date,
        resolved_days: set[datetime.date],
    ) -> None:
        success, payload, parsed_path = read_status_file(filename)
        if not success or payload is None:
            return
        try:
            entries = parse_training_payload(payload, source_kind)
            for entry in entries:
                payload_day = self._validate_payload_day(
                    entry.date,
                    filename=filename,
                    anchor_day=anchor_day,
                )
                day_payload = self._training_by_day.setdefault(payload_day, {})
                source_payload = day_payload.setdefault(source_kind, [])
                source_payload.append(entry)
                resolved_days.add(payload_day)
        except ValueError as exc:
            logger.error("%s: %s", filename, exc)
            quarantine_status_file(filename, parsed_path)
            return

        finalize_status_file(filename, parsed_path)

    def _ingest_sleep_file(
        self,
        *,
        anchor_day: datetime.date,
        resolved_days: set[datetime.date],
    ) -> None:
        filename = "sleep_status.json"
        success, payload, parsed_path = read_status_file(filename)
        if not success or payload is None:
            return

        try:
            parsed = parse_sleep_payload(payload)
            payload_day = self._validate_payload_day(
                parsed.date,
                filename=filename,
                anchor_day=anchor_day,
            )
            self._sleep_by_day[payload_day] = parsed
            resolved_days.add(payload_day)
        except ValueError as exc:
            logger.error("%s: %s", filename, exc)
            quarantine_status_file(filename, parsed_path)
            return

        finalize_status_file(filename, parsed_path)

    def _ingest_activity_file(
        self,
        *,
        anchor_day: datetime.date,
        resolved_days: set[datetime.date],
    ) -> None:
        filename = "activity_status.json"
        success, payload, parsed_path = read_status_file(filename)
        if not success or payload is None:
            return

        try:
            parsed = parse_activity_payload(payload)
            payload_day = self._validate_payload_day(
                parsed.date,
                filename=filename,
                anchor_day=anchor_day,
            )
            self._activity_by_day[payload_day] = parsed
            resolved_days.add(payload_day)
        except ValueError as exc:
            logger.error("%s: %s", filename, exc)
            quarantine_status_file(filename, parsed_path)
            return

        finalize_status_file(filename, parsed_path)

    def load_training(self, day: datetime.date) -> CanonicalTrainingStatus:
        """Load workout/stretch/meditation payloads for the day."""
        self._ensure_ingested(day)
        day_entries = self._training_by_day.get(day, {})
        workout_entries = day_entries.get("workout", [])
        stretch_entries = day_entries.get("stretching", [])
        meditation_entries = day_entries.get("meditation", [])
        return CanonicalTrainingStatus(
            workout_entries=tuple(workout_entries),
            stretch_entries=tuple(stretch_entries),
            meditation_entries=tuple(meditation_entries),
        )

    def load_sleep(self, day: datetime.date) -> CanonicalSleepPayload | None:
        """Load sleep payload for the day if available."""
        self._ensure_ingested(day)
        return self._sleep_by_day.get(day)

    def load_screen_time(self, day: datetime.date) -> DailyScreenTimeData | None:
        """Load grouped screen-time payload for the day."""
        self._ensure_ingested(day)
        return load_screen_time_data(
            day.isoformat(),
            activity_payload=self._activity_by_day.get(day),
            screen_time_cache_store=self.screen_time_cache_store,
        )

    def write_study_times(
        self,
        day: datetime.date,
        sessions: list[StudySessionRecord],
        day_schedule: DayScheduleProfile,
    ) -> None:
        """Persist study times for iPad shortcut consumption."""
        write_study_times_to_icloud(sessions, day.isoformat(), day_schedule)
