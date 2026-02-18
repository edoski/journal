"""
Study ingestion domain: Flow DB access, break logic, and STUDY table rendering.
"""

from __future__ import annotations

from sync.contracts.study import StudySessionRecord

from .core_data_time import core_data_to_datetime
from .db import (
    dedupe_sessions,
    get_sessions_for_day,
    get_todays_sessions,
)

__all__ = [
    "StudySessionRecord",
    "core_data_to_datetime",
    "dedupe_sessions",
    "get_sessions_for_day",
    "get_todays_sessions",
]
