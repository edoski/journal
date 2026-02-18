"""Shared conversion helpers between CoreData and Python datetimes."""

from __future__ import annotations

import datetime

from sync.study.constants import CORE_DATA_EPOCH_OFFSET


def core_data_to_datetime(timestamp: float | None) -> datetime.datetime | None:
    """Convert a CoreData timestamp to a Python datetime."""
    if timestamp is None:
        return None
    return datetime.datetime.fromtimestamp(timestamp + CORE_DATA_EPOCH_OFFSET)


def datetime_to_core_data(value: datetime.datetime | None) -> float | None:
    """Convert a Python datetime to CoreData epoch timestamp."""
    if value is None:
        return None
    return value.timestamp() - CORE_DATA_EPOCH_OFFSET
