"""
Training entry models for the journal sync system.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass


@dataclass(frozen=True)
class TrainingEntry:
    """A single training session (workout or stretching) from the TRAINING table."""

    start: datetime.time | None
    end: datetime.time | None
    activity: str  # Actual workout type, e.g., "Traditional Strength Training"
    duration_minutes: float
    interrupt_minutes: float = 0.0  # Time elapsed beyond actual workout duration


@dataclass
class DailyTrainingData:
    """Container for training entries."""

    entries: list[TrainingEntry]

    @property
    def has_workout(self) -> bool:
        """True if any non-stretching workout was done."""
        return any(e.activity.lower() != "stretching" for e in self.entries)

    @property
    def has_stretch(self) -> bool:
        """True if any stretching was done."""
        return any(e.activity.lower() == "stretching" for e in self.entries)
