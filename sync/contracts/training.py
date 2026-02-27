"""Training contracts."""

from __future__ import annotations

import datetime
from dataclasses import dataclass


@dataclass(frozen=True)
class TrainingEntry:
    """A single training session from the TRAINING table."""

    start: datetime.time | None
    end: datetime.time | None
    activity: str
    duration_minutes: float
    interrupt_minutes: float = 0.0
