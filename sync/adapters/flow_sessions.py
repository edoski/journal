"""Flow DB-backed session source adapter."""

from __future__ import annotations

import datetime

from sync.contracts.study import StudySessionRecord
from sync.ports.sessions import StudySessionSource
from sync.study.db import get_sessions_for_day


class FlowStudySessionSource(StudySessionSource):
    """Load and enrich study sessions from the Flow database."""

    def load_sessions(self, day: datetime.date) -> list[StudySessionRecord]:
        """Return study sessions for the provided day."""
        return get_sessions_for_day(day)
