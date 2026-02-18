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


@dataclass(frozen=True)
class DailyTrainingData:
    """Container for training entries."""

    entries: list[TrainingEntry]

    @property
    def has_workout(self) -> bool:
        """True if any non-stretching workout was done."""
        return any(entry.activity.lower() != "stretching" for entry in self.entries)

    @property
    def has_stretch(self) -> bool:
        """True if any stretching was done."""
        return any(entry.activity.lower() == "stretching" for entry in self.entries)
