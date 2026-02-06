"""iCloud shortcut status source adapter."""

from __future__ import annotations

import datetime
from typing import cast

from sync.contracts.daily import SleepStatusPayload, TrainingStatusBundle
from sync.contracts.study import StudySessionRecord
from sync.daily.icloud import load_status_file, write_study_times_to_icloud
from sync.daily.screen_time import load_screen_time_data
from sync.models.screen_time import DailyScreenTimeData
from sync.ports.status import DailyStatusSource


class ICloudDailyStatusSource(DailyStatusSource):
    """Load daily shortcut payloads from iCloud drop files."""

    def load_training(self, day: datetime.date) -> TrainingStatusBundle:
        """Load workout/stretch/meditation payloads for the day."""
        workout_done, workout_payload = load_status_file("workout_status.json")
        stretch_done, stretch_payload = load_status_file("stretching_status.json")
        meditate_done, meditate_payload = load_status_file("meditation_status.json")
        return TrainingStatusBundle(
            workout_done=workout_done,
            stretch_done=stretch_done,
            meditate_done=meditate_done,
            workout_payload=workout_payload,
            stretch_payload=stretch_payload,
            meditate_payload=meditate_payload,
        )

    def load_sleep(self, day: datetime.date) -> SleepStatusPayload | None:
        """Load sleep payload for the day if available."""
        _success, sleep_payload = load_status_file("sleep_status.json")
        if isinstance(sleep_payload, dict):
            return cast(SleepStatusPayload, sleep_payload)
        return None

    def load_screen_time(self, day: datetime.date) -> DailyScreenTimeData | None:
        """Load grouped screen-time payload for the day."""
        return load_screen_time_data(day.isoformat())

    def write_study_times(
        self,
        day: datetime.date,
        sessions: list[StudySessionRecord],
    ) -> None:
        """Persist study times for iPad shortcut consumption."""
        write_study_times_to_icloud(sessions, day.isoformat())
