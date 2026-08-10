"""Flow DB-backed session source adapter."""

from __future__ import annotations

import datetime
from collections.abc import Callable

from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.study import StudySessionRecord
from sync.ports.sessions import StudySessionSource
from sync.study.enrichment import enrich_sessions
from sync.study.repository import (
    FlowSessionRepository,
    read_break_defaults,
)

Clock = Callable[[], datetime.datetime]


class FlowStudySessionSource(StudySessionSource):
    """Own Flow session reads, stale-row repair, and domain enrichment."""

    def __init__(
        self,
        *,
        repository: FlowSessionRepository | None = None,
        break_defaults: dict[str, int | None] | None = None,
        clock: Clock = datetime.datetime.now,
    ) -> None:
        self._repository = repository or FlowSessionRepository()
        self._break_defaults = (
            read_break_defaults() if break_defaults is None else break_defaults
        )
        self._clock = clock

    def load_sessions(
        self,
        day: datetime.date,
        day_schedule: DayScheduleProfile,
    ) -> list[StudySessionRecord]:
        """Return canonical sessions, repairing superseded open Flow rows."""
        now = self._clock()
        loaded = self._repository.load_day_sessions(day, now=now)
        return enrich_sessions(
            loaded.sessions,
            day=day,
            day_schedule=day_schedule,
            interruption_totals=loaded.interruption_totals,
            now=now,
            break_defaults=self._break_defaults,
        )
