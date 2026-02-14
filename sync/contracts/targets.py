"""Typed target contracts shared across rendering, querying, and tests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

PeriodType = Literal["day", "week", "month", "quarter", "year"]
TrainingTargetBucket = Literal["mindful", "workout", "stretch"]


@dataclass(frozen=True)
class TrainingTargets:
    """Scaled training targets and labels for a period."""

    mindful: int
    workout: int
    stretch: int
    mindful_label: str
    workout_label: str
    stretch_label: str


@dataclass(frozen=True)
class SummaryTargets:
    """Scaled summary target values and display labels for a period."""

    study_minutes: int
    sleep_minutes: int
    mood: float
    training: TrainingTargets
    study_label: str
    sleep_label: str
    mood_label: str
