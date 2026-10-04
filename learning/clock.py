"""The learning calendar: today and now, optionally pinned for simulated sessions."""

from __future__ import annotations

from datetime import date, datetime, timezone
import os

TODAY_VARIABLE = "LEARNING_TODAY"


def today() -> date:
    """The local study day, or the YYYY-MM-DD day pinned by ``LEARNING_TODAY``."""
    pinned = os.environ.get(TODAY_VARIABLE)
    if not pinned:
        return date.today()
    try:
        return date.fromisoformat(pinned)
    except ValueError as error:
        raise ValueError(
            f"{TODAY_VARIABLE} must be a date in YYYY-MM-DD form"
        ) from error


def now() -> datetime:
    """The current UTC instant; when pinned, the current local time on the pinned day."""
    current = datetime.now(timezone.utc)
    if not os.environ.get(TODAY_VARIABLE):
        return current
    wall = current.astimezone().time()
    return datetime.combine(today(), wall).astimezone().astimezone(timezone.utc)


def local_day(timestamp: str) -> date:
    """The local calendar day of a stored ISO timestamp."""
    return datetime.fromisoformat(timestamp).astimezone().date()
