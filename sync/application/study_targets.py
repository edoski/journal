"""Shared study-target resolution helpers for application services."""

from __future__ import annotations

import datetime
from collections.abc import Callable
import logging

from sync.contracts.schedule import DayScheduleProfile
from sync.target_policy import study_target_minutes_for_dates


def resolve_study_target_minutes(
    dates: list[datetime.date],
    *,
    schedule_resolver: Callable[[datetime.date], DayScheduleProfile],
    logger: logging.Logger,
) -> int | None:
    """Resolve study target minutes for a date span, swallowing schedule failures."""
    if not dates:
        return None
    try:
        return study_target_minutes_for_dates(dates, schedule_resolver)
    except Exception as exc:
        logger.warning(
            "Study target unavailable for %s -> %s: %s",
            dates[0].isoformat(),
            dates[-1].isoformat(),
            exc,
        )
        return None
